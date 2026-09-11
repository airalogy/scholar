import crypto from 'node:crypto'
import type { Prisma } from '../../prisma/generated/client'
import {
  InstitutionPersonConflictError,
  InstitutionPersonInputError,
  assertInstitutionInternalId,
  normalizeInstitutionInternalId,
  resolveInstitutionIdentifier,
} from './institution-identifiers'

export {
  InstitutionPersonConflictError,
  InstitutionPersonInputError,
  assertInstitutionInternalId,
  normalizeInstitutionInternalId,
} from './institution-identifiers'

type InstitutionPersonClient = Pick<
  Prisma.TransactionClient,
  'institution_people' | 'institution_person_events' | 'institution_person_identifiers'
>

export interface InstitutionPersonReference {
  institutionPersonId?: string
  institutionInternalId?: string
  scholarId?: string
}

interface UpsertInstitutionPersonInput {
  institutionId: string
  internalId: string
  key?: string
  name: string
  email?: string | null
  userId?: string | null
  scholarId?: string | null
  provisionId?: string | null
  source: string
  actorUserId?: string | null
}

const buildPersonKey = (normalizedInternalId: string): string => {
  if (normalizedInternalId.length <= 93) {
    return `person:${normalizedInternalId}`
  }
  const digest = crypto.createHash('sha256').update(normalizedInternalId).digest('hex').slice(0, 12)
  return `person:${normalizedInternalId.slice(0, 80)}:${digest}`
}

export const resolveInstitutionPerson = async (
  prisma: InstitutionPersonClient,
  institutionId: string,
  reference: InstitutionPersonReference,
) => {
  const personId = reference.institutionPersonId?.trim()
  const internalId = reference.institutionInternalId?.trim()
  const scholarId = reference.scholarId?.trim()

  if ([personId, internalId, scholarId].filter(Boolean).length !== 1) {
    throw new InstitutionPersonInputError(
      'Provide exactly one institution person, institution internal, or Scholar identifier',
    )
  }

  if (personId) {
    return prisma.institution_people.findFirst({
      where: {
        id: personId,
        institutionId,
      },
    })
  }

  if (scholarId) {
    return prisma.institution_people.findFirst({
      where: {
        institutionId,
        scholarId,
      },
    })
  }

  return (
    (await resolveInstitutionIdentifier(prisma, institutionId, internalId as string))?.person ??
    null
  )
}

export const upsertInstitutionPerson = async (
  prisma: InstitutionPersonClient,
  input: UpsertInstitutionPersonInput,
) => {
  const now = new Date()
  const identifier = await resolveInstitutionIdentifier(
    prisma,
    input.institutionId,
    input.internalId,
  )
  // An alias locates a person; it must never replace that person's canonical ID.
  const internalId = identifier?.person.internalId ?? assertInstitutionInternalId(input.internalId)
  const normalizedInternalId = normalizeInstitutionInternalId(internalId)
  const key = input.key?.trim()
  const [byInternalId, byKey, byUser, byScholar, byProvision] = await Promise.all([
    prisma.institution_people.findUnique({
      where: {
        institutionId_normalizedInternalId: {
          institutionId: input.institutionId,
          normalizedInternalId,
        },
      },
    }),
    key
      ? prisma.institution_people.findFirst({
          where: { institutionId: input.institutionId, key },
        })
      : Promise.resolve(null),
    input.userId
      ? prisma.institution_people.findFirst({
          where: { institutionId: input.institutionId, userId: input.userId },
        })
      : Promise.resolve(null),
    input.scholarId
      ? prisma.institution_people.findFirst({
          where: { institutionId: input.institutionId, scholarId: input.scholarId },
        })
      : Promise.resolve(null),
    input.provisionId
      ? prisma.institution_people.findFirst({
          where: { institutionId: input.institutionId, provisionId: input.provisionId },
        })
      : Promise.resolve(null),
  ])

  const candidates = [byInternalId, byKey, byUser, byScholar, byProvision].filter(
    (person): person is NonNullable<typeof byInternalId> => Boolean(person),
  )
  if (new Set(candidates.map((person) => person.id)).size > 1) {
    throw new InstitutionPersonConflictError(
      'Provided identity anchors belong to different institution people',
    )
  }
  const existing = candidates[0] ?? null

  if (existing?.userId && existing.normalizedInternalId !== normalizedInternalId) {
    throw new InstitutionPersonConflictError(
      'An account-linked person requires an administrator-verified alias; its canonical ID cannot be replaced by an import',
    )
  }

  if (existing?.userId && input.userId && existing.userId !== input.userId) {
    throw new InstitutionPersonConflictError(
      'Institution internal ID is already linked to another user',
    )
  }
  if (existing?.scholarId && input.scholarId && existing.scholarId !== input.scholarId) {
    throw new InstitutionPersonConflictError(
      'Institution internal ID is already linked to another scholar',
    )
  }
  if (existing?.provisionId && input.provisionId && existing.provisionId !== input.provisionId) {
    throw new InstitutionPersonConflictError(
      'Institution internal ID is already linked to another provision',
    )
  }

  const person = await (async () => {
    try {
      return existing
        ? await prisma.institution_people.update({
            where: { id: existing.id },
            data: {
              key: key || existing.key,
              internalId,
              normalizedInternalId,
              name: input.name.trim(),
              email: input.email?.trim().toLowerCase() || existing.email,
              userId: input.userId ?? existing.userId,
              scholarId: input.scholarId ?? existing.scholarId,
              provisionId: input.provisionId ?? existing.provisionId,
              userLinkedAt: !existing.userId && input.userId ? now : existing.userLinkedAt,
              scholarLinkedAt:
                !existing.scholarId && input.scholarId ? now : existing.scholarLinkedAt,
              is_active: true,
              updatedAt: now,
            },
          })
        : await prisma.institution_people.create({
            data: {
              institutionId: input.institutionId,
              key: key || buildPersonKey(normalizedInternalId),
              internalId,
              normalizedInternalId,
              name: input.name.trim(),
              email: input.email?.trim().toLowerCase() || null,
              userId: input.userId ?? null,
              scholarId: input.scholarId ?? null,
              provisionId: input.provisionId ?? null,
              userLinkedAt: input.userId ? now : null,
              scholarLinkedAt: input.scholarId ? now : null,
              createdAt: now,
              updatedAt: now,
            },
          })
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw new InstitutionPersonConflictError(
          'Institution person identity changed concurrently; reload and try again',
        )
      }
      throw error
    }
  })()

  await prisma.institution_person_events.create({
    data: {
      institutionId: input.institutionId,
      personId: person.id,
      actorUserId: input.actorUserId ?? null,
      event_type: existing ? 'person_updated' : 'person_created',
      source: input.source,
      previousUserId: existing?.userId ?? null,
      nextUserId: person.userId,
      createdAt: now,
    },
  })

  return person
}

export const linkInstitutionPersonToUser = async (
  prisma: InstitutionPersonClient,
  input: {
    institutionId: string
    personId: string
    userId: string
    source: string
    actorUserId?: string | null
  },
) => {
  const person = await prisma.institution_people.findFirst({
    where: {
      id: input.personId,
      institutionId: input.institutionId,
    },
  })
  if (!person) {
    throw new InstitutionPersonInputError('Institution person not found')
  }
  if (person.userId && person.userId !== input.userId) {
    throw new InstitutionPersonConflictError('Institution person is already linked to another user')
  }

  const existingUserLink = await prisma.institution_people.findFirst({
    where: {
      institutionId: input.institutionId,
      userId: input.userId,
      id: { not: person.id },
    },
  })
  if (existingUserLink) {
    throw new InstitutionPersonConflictError('User is already linked to another institution person')
  }
  if (person.userId === input.userId) {
    return person
  }

  const now = new Date()
  const linked = await prisma.institution_people.update({
    where: { id: person.id },
    data: {
      userId: input.userId,
      userLinkedAt: now,
      updatedAt: now,
    },
  })
  await prisma.institution_person_events.create({
    data: {
      institutionId: input.institutionId,
      personId: person.id,
      actorUserId: input.actorUserId ?? input.userId,
      event_type: 'user_linked',
      source: input.source,
      previousUserId: null,
      nextUserId: input.userId,
      createdAt: now,
    },
  })
  return linked
}
