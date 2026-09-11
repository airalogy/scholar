import type { FastifyInstance } from 'fastify'
import type { Prisma, institution_person_identifiers } from '../../prisma/generated/client'
import { getConfiguredInstitution } from '../utils/institution-scope'
import { getInstitutionAccessById } from '../utils/permissions'
import { lockMutationScope } from '../utils/advisory-lock'
import {
  assertInstitutionInternalId,
  normalizeInstitutionInternalId,
} from '../utils/institution-identifiers'
import type { Static } from 'typebox'
import type { IdentityPeopleResponse } from './schema'

export interface IdentityAdmin {
  institutionId: string
  userId: string
  isPlatformAdmin: boolean
}

export const requireIdentityAdmin = async (
  fastify: FastifyInstance,
  slug: string,
  userId: string,
): Promise<IdentityAdmin> => {
  const institution = await getConfiguredInstitution(fastify)
  if (slug !== institution.slug) throw fastify.httpErrors.notFound('Institution not found')
  const access = await getInstitutionAccessById(fastify, userId, institution.id)
  if (access.platform_role !== 'platform_admin' && access.institution_role !== 'owner') {
    throw fastify.httpErrors.forbidden(
      'Only institution owners and platform administrators can verify identities',
    )
  }
  return {
    institutionId: institution.id,
    userId,
    isPlatformAdmin: access.platform_role === 'platform_admin',
  }
}

export const requireIdentityPerson = async (
  fastify: FastifyInstance,
  tx: Prisma.TransactionClient,
  admin: IdentityAdmin,
  personId: string,
): Promise<
  Prisma.institution_peopleGetPayload<{ include: { user: { select: { platform_role: true } } } }>
> => {
  const person = await tx.institution_people.findFirst({
    where: { id: personId, institutionId: admin.institutionId },
    include: { user: { select: { platform_role: true } } },
  })
  if (!person) throw fastify.httpErrors.notFound('Institution person not found')
  if (!person.is_active) throw fastify.httpErrors.conflict('Institution person is inactive')
  if (person.user?.platform_role === 'platform_admin' && !admin.isPlatformAdmin) {
    throw fastify.httpErrors.forbidden(
      'Only platform administrators can change another platform identity',
    )
  }
  return person
}

export const verifyIdentifier = async (
  fastify: FastifyInstance,
  tx: Prisma.TransactionClient,
  admin: IdentityAdmin,
  input: { personId: string; value: string; notes: string; requestId?: string },
): Promise<institution_person_identifiers> => {
  const person = await requireIdentityPerson(fastify, tx, admin, input.personId)
  if (person.userId === admin.userId)
    throw fastify.httpErrors.forbidden('Another administrator must verify your own identity')
  const value = assertInstitutionInternalId(input.value)
  const normalizedValue = normalizeInstitutionInternalId(value)
  const existing = await tx.institution_person_identifiers.findUnique({
    where: {
      institutionId_normalizedValue: { institutionId: admin.institutionId, normalizedValue },
    },
  })
  if (existing && existing.personId !== person.id) {
    throw fastify.httpErrors.conflict(
      'This identifier is reserved for another person; accounts cannot be merged here',
    )
  }
  const external = await tx.user_external_identities.findUnique({
    where: {
      provider_externalId: {
        provider: fastify.deployment.institutionSso.providerId,
        externalId: normalizedValue,
      },
    },
  })
  if (external && external.userId !== person.userId) {
    throw fastify.httpErrors.conflict(
      'This SSO identity belongs to another account; manual investigation is required',
    )
  }
  if (existing && !existing.revokedAt) return existing
  const identifier = existing
    ? await tx.institution_person_identifiers.update({
        where: { id: existing.id },
        data: {
          revokedAt: null,
          version: { increment: 1 },
          updatedAt: new Date(),
          source: 'admin_verified',
        },
      })
    : await tx.institution_person_identifiers.create({
        data: {
          institutionId: admin.institutionId,
          personId: person.id,
          value,
          normalizedValue,
          source: 'admin_verified',
        },
      })
  await tx.institution_identity_events.create({
    data: {
      institutionId: admin.institutionId,
      personId: person.id,
      identifierId: identifier.id,
      requestId: input.requestId,
      actorUserId: admin.userId,
      action: existing ? 'identifier_restored' : 'identifier_verified',
      notes: input.notes.trim(),
    },
  })
  return identifier
}

export const addIdentityIdentifier = async (
  fastify: FastifyInstance,
  admin: IdentityAdmin,
  input: { personId: string; value: string; notes: string },
): Promise<institution_person_identifiers> => {
  return fastify.prisma.$transaction(async (tx) => {
    await lockMutationScope(tx, 'institution-identity', admin.institutionId)
    return verifyIdentifier(fastify, tx, admin, input)
  })
}

export const revokeIdentityIdentifier = async (
  fastify: FastifyInstance,
  admin: IdentityAdmin,
  personId: string,
  identifierId: string,
  notes: string,
): Promise<void> => {
  await fastify.prisma.$transaction(async (tx) => {
    await lockMutationScope(tx, 'institution-identity', admin.institutionId)
    await requireIdentityPerson(fastify, tx, admin, personId)
    const identifier = await tx.institution_person_identifiers.findFirst({
      where: { id: identifierId, personId, institutionId: admin.institutionId },
    })
    if (!identifier) throw fastify.httpErrors.notFound('Identifier not found')
    if (identifier.revokedAt) return
    await tx.institution_person_identifiers.update({
      where: { id: identifier.id },
      data: { revokedAt: new Date(), version: { increment: 1 }, updatedAt: new Date() },
    })
    await tx.institution_identity_events.create({
      data: {
        institutionId: admin.institutionId,
        personId,
        identifierId,
        actorUserId: admin.userId,
        action: 'identifier_revoked',
        notes: notes.trim(),
      },
    })
  })
}

export const findIdentityPeople = async (
  fastify: FastifyInstance,
  admin: IdentityAdmin,
  search: string,
  offset: number,
): Promise<Static<typeof IdentityPeopleResponse>['data']> => {
  const query = search.trim()
  const where: Prisma.institution_peopleWhereInput = {
    institutionId: admin.institutionId,
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { internalId: { contains: query, mode: 'insensitive' } },
            { email: { contains: query, mode: 'insensitive' } },
            {
              identifiers: {
                some: { normalizedValue: { contains: normalizeInstitutionInternalId(query) } },
              },
            },
          ],
        }
      : {}),
  }
  const [items, total] = await Promise.all([
    fastify.prisma.institution_people.findMany({
      where,
      skip: offset,
      take: 20,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        internalId: true,
        name: true,
        email: true,
        userId: true,
        is_active: true,
      },
    }),
    fastify.prisma.institution_people.count({ where }),
  ])
  return { items, total }
}
