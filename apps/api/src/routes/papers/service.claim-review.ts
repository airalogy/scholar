import type { FastifyInstance } from 'fastify'
import type { Prisma } from '../../../prisma/generated/client'
import type { ReviewPaperBody } from './schema'
import type { ClaimRecord } from './service.shared'
import { getUserPlatformRole } from '../../utils/permissions'
import { decideReviewCase } from '../../review/service'
import { isPendingReviewStatus, normalizeReviewStatus } from './service.shared'
import { toClaimRecord } from './service.shared'
import { formatPaper, resolveSubmissionForClaim } from './service.paper'
import { refreshPaperSearchIndex } from './paper-index'
import { requireNormalizedDoi } from '../../utils/doi'
import { lockMutationScope } from '../../utils/advisory-lock'

const resolveCanonicalImportSnapshot = (
  value: Prisma.JsonValue | null,
): Record<string, unknown> | null => {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    return null
  }
  const snapshot = value as Record<string, unknown>
  return snapshot.source === 'institution_json_import' && snapshot.canonical_update_pending === true
    ? snapshot
    : null
}

const promoteCanonicalImportSnapshot = async (
  fastify: FastifyInstance,
  paperId: string,
  snapshot: Record<string, unknown>,
): Promise<void> => {
  const existing = await fastify.prisma.papers.findUnique({ where: { id: paperId } })
  if (!existing) {
    throw fastify.httpErrors.notFound('Paper not found')
  }

  const title = typeof snapshot.title === 'string' ? snapshot.title : existing.title
  const abstract =
    typeof snapshot.abstract === 'string' || snapshot.abstract === null
      ? snapshot.abstract
      : existing.abstract
  const publishDate =
    typeof snapshot.publish_date === 'string'
      ? new Date(`${snapshot.publish_date}T00:00:00.000Z`)
      : snapshot.publish_date === null
        ? null
        : existing.publish_date
  const normalizedDoi =
    typeof snapshot.doi === 'string' ? requireNormalizedDoi(snapshot.doi) : existing.normalized_doi

  await fastify.prisma.papers.update({
    where: { id: paperId },
    data: {
      title,
      abstract,
      doi: normalizedDoi,
      normalized_doi: normalizedDoi,
      journal_name:
        typeof snapshot.journal_name === 'string' || snapshot.journal_name === null
          ? snapshot.journal_name
          : existing.journal_name,
      publish_year:
        typeof snapshot.publish_year === 'number'
          ? snapshot.publish_year
          : snapshot.publish_year === null
            ? null
            : existing.publish_year,
      publish_date: publishDate,
      paper_type:
        typeof snapshot.paper_type === 'number'
          ? snapshot.paper_type
          : snapshot.paper_type === null
            ? null
            : existing.paper_type,
      language:
        typeof snapshot.language === 'number'
          ? snapshot.language
          : snapshot.language === null
            ? null
            : existing.language,
      citation_count:
        typeof snapshot.citation_count === 'number'
          ? snapshot.citation_count
          : snapshot.citation_count === null
            ? null
            : existing.citation_count,
      pages:
        typeof snapshot.pages === 'string' || snapshot.pages === null
          ? snapshot.pages
          : existing.pages,
      keywords: Array.isArray(snapshot.keywords)
        ? snapshot.keywords.filter((item): item is string => typeof item === 'string')
        : existing.keywords,
      link:
        typeof snapshot.link === 'string' || snapshot.link === null ? snapshot.link : existing.link,
      updatedAt: new Date(),
    },
  })

  if (existing.title !== title || existing.abstract !== abstract) {
    refreshPaperSearchIndex(fastify, paperId).catch((error) => {
      fastify.log.error(
        { err: error, paperId },
        'Failed to process paper embeddings after canonical import approval',
      )
    })
  }
}

export async function reviewPaper(
  fastify: FastifyInstance,
  id: string,
  body: ReviewPaperBody,
  reviewerId: string,
) {
  const claimWithReviewCase = await fastify.prisma.paper_claims.findUnique({
    where: { id },
    include: { review_case: true },
  })
  if (!claimWithReviewCase) {
    throw fastify.httpErrors.notFound('Paper claim not found')
  }
  const claim = toClaimRecord(claimWithReviewCase)

  const currentStatus = normalizeReviewStatus(claim.review_status)
  if (!isPendingReviewStatus(currentStatus)) {
    throw fastify.httpErrors.badRequest('Only papers awaiting review can be reviewed')
  }

  const pendingSubmission = claim.submissionId
    ? await fastify.prisma.paper_submissions.findUnique({
        where: { id: claim.submissionId },
      })
    : null
  const canonicalImportSnapshot = resolveCanonicalImportSnapshot(
    pendingSubmission?.metadata_snapshot ?? null,
  )
  if (body.decision === 'approve' && canonicalImportSnapshot) {
    const platformRole = await getUserPlatformRole(fastify, reviewerId)
    if (platformRole !== 'platform_admin') {
      throw fastify.httpErrors.forbidden(
        'Canonical metadata changes from institution imports require platform administrator approval',
      )
    }
  }

  await fastify.prisma.$transaction(async (tx) => {
    await lockMutationScope(tx, 'paper-claim', claim.id)
    await decideReviewCase(fastify, tx, {
      caseId: claim.reviewCaseId,
      actorId: reviewerId,
      decision: body.decision,
      notes: body.notes,
    })
  })
  const updatedClaimWithReviewCase = await fastify.prisma.paper_claims.findUnique({
    where: { id },
    include: { review_case: true },
  })
  const updatedClaim: ClaimRecord | null = updatedClaimWithReviewCase
    ? toClaimRecord(updatedClaimWithReviewCase)
    : null

  if (!updatedClaim) {
    throw fastify.httpErrors.notFound('Paper claim not found after review')
  }

  const paper = await fastify.prisma.papers.findUnique({ where: { id: updatedClaim.paperId } })
  if (!paper) {
    throw fastify.httpErrors.notFound('Paper not found')
  }

  if (
    body.decision === 'approve' &&
    updatedClaim.review_status === 'approved' &&
    canonicalImportSnapshot
  ) {
    await promoteCanonicalImportSnapshot(fastify, paper.id, canonicalImportSnapshot)
  }

  const submission = await resolveSubmissionForClaim(fastify, updatedClaim)
  const finalPaper =
    canonicalImportSnapshot && updatedClaim.review_status === 'approved'
      ? await fastify.prisma.papers.findUnique({ where: { id: paper.id } })
      : paper
  if (!finalPaper) {
    throw fastify.httpErrors.notFound('Paper not found')
  }

  refreshPaperSearchIndex(fastify, finalPaper.id).catch((error) => {
    fastify.log.error(
      { err: error, paperId: finalPaper.id },
      'Failed to refresh paper search index after claim review',
    )
  })
  return formatPaper(fastify, finalPaper, updatedClaim, reviewerId, submission)
}
