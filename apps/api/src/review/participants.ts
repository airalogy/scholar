import type { FastifyInstance } from 'fastify'
import type { Prisma } from '../../prisma/generated/client'
import { requireIdentityAdmin } from '../identity/service'
import { normalizeInstitutionInternalId } from '../utils/institution-identifiers'
import { lockMutationScope } from '../utils/advisory-lock'
import { submitReviewCase } from './service'

export const participantCandidates = async (
  tx: Prisma.TransactionClient,
  reviewCase: {
    content_type: string
    subjectId: string
    institutionId: string
    currentVersionId: string | null
  },
): Promise<Array<{ id: string; name: string }>> => {
  if (reviewCase.content_type === 'change_request') {
    const change = await tx.content_review_changes.findUniqueOrThrow({
      where: { id: reviewCase.subjectId },
    })
    const before = change.beforeSnapshot as Prisma.JsonObject
    return participantCandidates(tx, {
      ...reviewCase,
      content_type: change.subjectType,
      subjectId: change.subjectId,
      currentVersionId: String(before.currentVersionId),
    })
  }
  if (reviewCase.content_type === 'paper') {
    const claim = await tx.paper_claims.findUniqueOrThrow({ where: { id: reviewCase.subjectId } })
    const bindings = await tx.institution_paper_author_bindings.findMany({
      where: { paperId: claim.paperId, institutionId: reviewCase.institutionId },
      include: { person: { select: { id: true, name: true } } },
    })
    return bindings.map((binding) => binding.person)
  }
  const version = reviewCase.currentVersionId
    ? await tx.degree_thesis_versions.findUnique({ where: { id: reviewCase.currentVersionId } })
    : null
  if (!version?.student_id) return []
  const identifier = await tx.institution_person_identifiers.findUnique({
    where: {
      institutionId_normalizedValue: {
        institutionId: reviewCase.institutionId,
        normalizedValue: normalizeInstitutionInternalId(version.student_id),
      },
    },
    include: { person: { select: { id: true, name: true } } },
  })
  return identifier && !identifier.revokedAt ? [identifier.person] : []
}

export const verifyReviewParticipants = async (
  fastify: FastifyInstance,
  slug: string,
  userId: string,
  caseId: string,
  input: { versionId: string; personIds: string[]; nodeIds: string[]; notes: string },
): Promise<void> => {
  const admin = await requireIdentityAdmin(fastify, slug, userId)
  // Match the submission/decision lock order before the institution identity lock.
  const initial = await fastify.prisma.content_review_cases.findFirst({
    where: { id: caseId, institutionId: admin.institutionId },
  })
  if (!initial) throw fastify.httpErrors.notFound('Review case not found')
  await fastify.prisma.$transaction(
    async (tx) => {
      await lockMutationScope(
        tx,
        initial.content_type === 'paper'
          ? 'paper-claim'
          : initial.content_type === 'change_request'
            ? 'review-change'
            : 'degree-thesis',
        initial.subjectId,
      )
      await lockMutationScope(tx, 'institution-identity', admin.institutionId)
      const current = await tx.content_review_cases.findUniqueOrThrow({ where: { id: caseId } })
      if (current.currentVersionId !== input.versionId || current.status !== 'pending_review')
        throw fastify.httpErrors.conflict('The review material is no longer current')
      const candidates = await participantCandidates(tx, current)
      const expected = new Set(candidates.map((person) => person.id))
      if (
        !expected.size ||
        input.personIds.length !== expected.size ||
        input.personIds.some((id) => !expected.has(id))
      )
        throw fastify.httpErrors.conflict(
          'Verify every institution author binding first; the submitter is not assumed to be the author',
        )
      const nodes = await tx.institution_org_nodes.count({
        where: { institutionId: admin.institutionId, id: { in: input.nodeIds }, is_active: true },
      })
      if (nodes !== input.nodeIds.length)
        throw fastify.httpErrors.badRequest('Publication units must belong to this institution')
      await tx.content_review_participant_scopes.upsert({
        where: { caseId_versionId: { caseId, versionId: input.versionId } },
        create: { ...input, caseId, verifiedBy: userId },
        update: { ...input, verifiedBy: userId, verifiedAt: new Date() },
      })
      // An altered approval audience is a new round, even when the PDF is unchanged.
      await tx.content_review_cases.update({
        where: { id: caseId },
        data: { status: 'changes_requested' },
      })
      await submitReviewCase(fastify, tx, { caseId, actorId: userId, versionId: input.versionId })
      await tx.institution_identity_events.create({
        data: {
          institutionId: admin.institutionId,
          actorUserId: userId,
          action: 'review_participants_verified',
          notes: `${caseId}: ${input.notes}`.slice(0, 2000),
        },
      })
    },
    { timeout: 30000 },
  )
}
