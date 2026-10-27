import type { FastifyInstance } from 'fastify'
import type { Prisma } from '../../../prisma/generated/client'
import type { ReviewPaperBody } from './schema'
import { getUserPlatformRole } from '../../utils/permissions'
import { decideReviewCase } from '../../review/service'
import { isPendingReviewStatus, normalizeReviewStatus, toClaimRecord } from './service.shared'
import { formatPaper, resolveSubmissionForClaim } from './service.paper'
import { lockMutationScope } from '../../utils/advisory-lock'
import { lockLegacyPaperMetadata } from '../../bibliography/legacy'
import { writePaperBibliography } from '../../bibliography/write'
import { enqueuePaperIndex } from '../../bibliography/index-queue'
import { markReviewApplied } from '../../review/rounds'
import { hasGovernedReview } from '../../review/configuration'

const resolveCanonicalImportSnapshot = (
  value: Prisma.JsonValue | null,
): Record<string, unknown> | null => {
  if (!value || Array.isArray(value) || typeof value !== 'object') return null
  return value.source === 'institution_json_import' && value.canonical_update_pending === true
    ? value
    : null
}

export const reviewPaper = async (
  fastify: FastifyInstance,
  id: string,
  body: ReviewPaperBody,
  reviewerId: string,
  audit: { sourceIp?: string; userAgent?: string } = {},
) => {
  const result = await fastify.prisma.$transaction(
    async (tx) => {
      await lockMutationScope(tx, 'paper-claim', id)
      const current = await tx.paper_claims.findUnique({
        where: { id },
        include: { review_case: true },
      })
      if (!current) throw fastify.httpErrors.notFound('Paper claim not found')
      const claim = toClaimRecord(current)
      if (!isPendingReviewStatus(normalizeReviewStatus(claim.review_status))) {
        throw fastify.httpErrors.badRequest('Only papers awaiting review can be reviewed')
      }
      const submission = claim.submissionId
        ? await tx.paper_submissions.findUnique({ where: { id: claim.submissionId } })
        : null
      const snapshot = resolveCanonicalImportSnapshot(submission?.metadata_snapshot ?? null)
      const staged = submission?.metadata_snapshot
      const imported =
        staged &&
        !Array.isArray(staged) &&
        typeof staged === 'object' &&
        staged.source === 'governed_bibliography_import'
          ? staged
          : null
      if (
        body.decision === 'approve' &&
        snapshot &&
        !(await hasGovernedReview(tx, claim.institutionId!, 'paper')) &&
        (await getUserPlatformRole(fastify, reviewerId)) !== 'platform_admin'
      ) {
        throw fastify.httpErrors.forbidden(
          'Canonical metadata changes from institution imports require platform administrator approval',
        )
      }
      // Match the canonical writer/index lock order (paper, then review records).
      const metadata = await lockLegacyPaperMetadata(
        tx,
        claim.paperId,
        body.decision === 'approve' ? (snapshot ?? {}) : {},
      )
      // A failed metadata promotion must also roll back the publication decision.
      await decideReviewCase(fastify, tx, {
        caseId: claim.reviewCaseId,
        actorId: reviewerId,
        decision: body.decision,
        notes: body.notes,
        taskId: body.taskId,
        expectedVersionId: body.expectedVersionId,
        ...audit,
      })
      const updated = await tx.paper_claims.findUniqueOrThrow({
        where: { id },
        include: { review_case: true },
      })
      if (body.decision === 'approve' && updated.review_case.status === 'approved' && snapshot) {
        if (!claim.institutionId)
          throw fastify.httpErrors.conflict('Institution scope is required for metadata review')
        await writePaperBibliography(tx, metadata, {
          institutionId: claim.institutionId,
          actorUserId: reviewerId,
          source: 'approved_legacy_import',
          expectedFingerprint:
            typeof snapshot.bibliography_fingerprint === 'string'
              ? snapshot.bibliography_fingerprint
              : undefined,
        })
      }
      if (body.decision === 'approve' && updated.review_case.status === 'approved' && imported) {
        await writePaperBibliography(tx, imported.metadata, {
          institutionId: claim.institutionId!,
          actorUserId: reviewerId,
          source: 'approved_import_submission',
          expectedFingerprint: String(imported.expectedFingerprint),
        })
      }
      await enqueuePaperIndex(tx, claim.paperId)
      await markReviewApplied(tx, claim.reviewCaseId)
      return {
        paper: await tx.papers.findUniqueOrThrow({ where: { id: claim.paperId } }),
        claim: toClaimRecord(updated),
      }
    },
    { timeout: 30000 },
  )
  const submission = await resolveSubmissionForClaim(fastify, result.claim)
  return formatPaper(fastify, result.paper, result.claim, reviewerId, submission)
}
