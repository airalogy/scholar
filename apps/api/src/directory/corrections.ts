import type { FastifyInstance } from 'fastify'
import type { Prisma } from '../../prisma/generated/client'
import { Type, type Static } from 'typebox'
import { requireIdentityAdmin } from '../identity/service'
import { lockMutationScope } from '../utils/advisory-lock'
import { assertPermissionManager, permissionContext } from '../administrators/access'

export const CorrectionSchema = Type.Object(
  {
    personId: Type.String({ format: 'uuid' }),
    field: Type.Union([Type.Literal('name'), Type.Literal('admission')]),
    value: Type.String({ minLength: 1, maxLength: 100, pattern: '\\S' }),
    expiresAt: Type.String({ format: 'date-time' }),
    reason: Type.String({ minLength: 1, maxLength: 2000, pattern: '\\S' }),
  },
  { additionalProperties: false },
)

export const reconcilePersonCorrections = async (
  tx: Prisma.TransactionClient,
  institutionId: string,
  personId: string,
): Promise<void> => {
  const person = await tx.institution_people.findFirst({
    where: { id: personId, institutionId },
    include: { directory_record: true },
  })
  if (!person?.directory_record) return
  const now = new Date()
  const sourceName = person.directory_record.sourceName ?? person.name
  let effectiveName = sourceName
  const corrections = await tx.institution_directory_corrections.findMany({
    where: { institutionId, personId, status: { in: ['active', 'requested'] } },
  })
  for (const correction of corrections) {
    const sourceValue = correction.field === 'name' ? sourceName : person.lifecycle_status
    const resolved =
      correction.field === 'name' ? sourceValue === correction.value : sourceValue === 'active'
    const status =
      correction.expiresAt <= now
        ? 'expired'
        : resolved
          ? 'resolved'
          : sourceValue !== correction.sourceValue
            ? 'conflicted'
            : null
    if (status) {
      await tx.institution_directory_corrections.update({
        where: { id: correction.id },
        data: { status, closedAt: now },
      })
      await tx.institution_identity_events.create({
        data: {
          institutionId,
          personId,
          action: `directory_correction_${status}`,
          notes: correction.id,
        },
      })
    } else if (correction.field === 'name' && correction.status === 'active')
      effectiveName = correction.value
  }
  if (effectiveName !== person.name)
    await tx.institution_people.update({
      where: { id: person.id },
      data: { name: effectiveName, updatedAt: now },
    })
}

export const requestCorrection = async (
  fastify: FastifyInstance,
  slug: string,
  userId: string,
  input: Static<typeof CorrectionSchema>,
): Promise<string> => {
  const admin = await requireIdentityAdmin(fastify, slug, userId)
  const expiresAt = new Date(input.expiresAt)
  const maxDays = input.field === 'admission' ? 7 : 30
  if (expiresAt <= new Date() || expiresAt.getTime() > Date.now() + maxDays * 86400000)
    throw fastify.httpErrors.badRequest(`Correction expiry must be within ${maxDays} days`)
  if (input.field === 'admission' && input.value !== 'allow')
    throw fastify.httpErrors.badRequest(
      'Admission corrections must use allow; use suspension to deny access',
    )
  return fastify.prisma.$transaction(async (tx) => {
    await lockMutationScope(tx, 'institution-identity', admin.institutionId)
    await assertPermissionManager(fastify, tx, admin.institutionId, userId)
    await permissionContext(tx, {
      actorUserId: userId,
      institutionId: admin.institutionId,
      source: 'correction_request',
      reason: input.reason.slice(0, 1000),
    })
    await reconcilePersonCorrections(tx, admin.institutionId, input.personId)
    const person = await tx.institution_people.findFirst({
      where: { id: input.personId, institutionId: admin.institutionId },
      include: { directory_record: true },
    })
    if (!person?.directory_record)
      throw fastify.httpErrors.conflict('A source-owned person is required')
    if (person.userId === userId)
      throw fastify.httpErrors.forbidden('Ask another administrator to request your correction')
    if (
      input.field === 'admission' &&
      (person.manually_suspended || person.lifecycle_status === 'active')
    )
      throw fastify.httpErrors.conflict(
        'Admission exception cannot lift manual suspension or replace normal admission',
      )
    if (
      await tx.institution_directory_corrections.count({
        where: { personId: person.id, field: input.field, status: { in: ['requested', 'active'] } },
      })
    )
      throw fastify.httpErrors.conflict('An open correction already exists for this field')
    const correction = await tx.institution_directory_corrections.create({
      data: {
        ...input,
        value: input.value.trim(),
        expiresAt,
        institutionId: admin.institutionId,
        sourceId: person.directory_record.sourceId,
        baselineSequence: person.directory_record.lastSeenSequence,
        sourceValue:
          input.field === 'name'
            ? (person.directory_record.sourceName ?? person.name)
            : person.lifecycle_status,
        requestedBy: userId,
      },
    })
    await tx.institution_identity_events.create({
      data: {
        institutionId: admin.institutionId,
        personId: person.id,
        actorUserId: userId,
        action: 'directory_correction_requested',
        notes: `${correction.id}: ${input.reason}`.slice(0, 2000),
      },
    })
    return correction.id
  })
}

export const decideCorrection = async (
  fastify: FastifyInstance,
  slug: string,
  userId: string,
  id: string,
  decision: 'approve' | 'reject' | 'revoke',
  notes: string,
): Promise<void> => {
  const admin = await requireIdentityAdmin(fastify, slug, userId)
  await fastify.prisma.$transaction(async (tx) => {
    await lockMutationScope(tx, 'institution-identity', admin.institutionId)
    await assertPermissionManager(fastify, tx, admin.institutionId, userId)
    await permissionContext(tx, {
      actorUserId: userId,
      institutionId: admin.institutionId,
      source: 'correction_decision',
      reason: notes.slice(0, 1000),
    })
    const correction = await tx.institution_directory_corrections.findFirst({
      where: { id, institutionId: admin.institutionId },
      include: { person: { include: { directory_record: true } } },
    })
    if (!correction) throw fastify.httpErrors.notFound('Correction not found')
    if (!['requested', 'active'].includes(correction.status) || correction.expiresAt <= new Date())
      throw fastify.httpErrors.conflict('Correction is no longer actionable')
    if (decision === 'approve') {
      if (
        correction.status !== 'requested' ||
        correction.requestedBy === userId ||
        correction.person.userId === userId
      )
        throw fastify.httpErrors.forbidden(
          'An independent administrator must approve the correction',
        )
      if (correction.person.directory_record?.lastSeenSequence !== correction.baselineSequence)
        throw fastify.httpErrors.conflict(
          'Source changed; reject and request a correction against the new baseline',
        )
      if (correction.field === 'admission' && correction.person.manually_suspended)
        throw fastify.httpErrors.conflict('Manual suspension takes precedence')
    }
    await tx.institution_directory_corrections.update({
      where: { id },
      data: {
        status: decision === 'approve' ? 'active' : decision === 'reject' ? 'rejected' : 'revoked',
        ...(decision === 'approve'
          ? { approvedBy: userId, approvedAt: new Date() }
          : { closedAt: new Date() }),
      },
    })
    await tx.institution_identity_events.create({
      data: {
        institutionId: admin.institutionId,
        personId: correction.personId,
        actorUserId: userId,
        action: `directory_correction_${decision}`,
        notes: `${id}: ${notes}`.slice(0, 2000),
      },
    })
    await reconcilePersonCorrections(tx, admin.institutionId, correction.personId)
  })
}

export const expireDirectoryCorrections = async (fastify: FastifyInstance): Promise<void> => {
  const rows = await fastify.prisma.institution_directory_corrections.findMany({
    where: { status: { in: ['active', 'requested'] }, expiresAt: { lte: new Date() } },
    take: 100,
    orderBy: { expiresAt: 'asc' },
    select: { institutionId: true, personId: true },
  })
  for (const row of rows)
    await fastify.prisma.$transaction(async (tx) => {
      await lockMutationScope(tx, 'institution-identity', row.institutionId)
      await reconcilePersonCorrections(tx, row.institutionId, row.personId)
    })
}
