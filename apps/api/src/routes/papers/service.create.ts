import { randomUUID, createHash } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { CreatePaperBody } from './schema'
import { ensureReviewCase, submitReviewCase } from '../../review/service'
import { requireNormalizedDoi } from '../../utils/doi'
import { lockMutationScope } from '../../utils/advisory-lock'
import { PROTECTED_FILE_SECURITY_PROFILE } from '../../utils/protected-files'
import { buildClaimScopeWhere, buildSubmissionSnapshot, toClaimRecord } from './service.shared'
import { formatPaper, resolvePaperScope } from './service.paper'
import { ensureSubmittedPaper, legacyPaperMetadata } from '../../bibliography/legacy'
import { enqueuePaperIndex } from '../../bibliography/index-queue'
import { hasGovernedReview } from '../../review/configuration'
import { stableStringify } from '../../bibliography/normalize'

const assertCanUseUploadedFile = async (
  fastify: FastifyInstance,
  userId: string,
  ossFileId: string | null | undefined,
  institutionId: string | null,
): Promise<void> => {
  if (!ossFileId) {
    return
  }

  const ossFile = await fastify.prisma.oss_files.findUnique({
    where: { id: ossFileId },
    select: {
      id: true,
      userId: true,
      institutionId: true,
      security_profile: true,
      prefix: true,
    },
  })

  if (!ossFile) {
    throw fastify.httpErrors.notFound('Uploaded file not found')
  }

  if (ossFile.userId !== userId) {
    throw fastify.httpErrors.forbidden('You can only attach files uploaded by yourself')
  }

  if (
    ossFile.security_profile !== PROTECTED_FILE_SECURITY_PROFILE ||
    ossFile.prefix !== 'scholar/papers'
  ) {
    throw fastify.httpErrors.badRequest(
      'Paper attachments must use the paper prefix and institution document security profile',
    )
  }

  if (!institutionId || ossFile.institutionId !== institutionId) {
    throw fastify.httpErrors.badRequest(
      'The uploaded file does not belong to the selected institution',
    )
  }
}

export async function createPaper(
  fastify: FastifyInstance,
  body: CreatePaperBody,
  userId: string,
  idempotencyKey?: string,
) {
  const now = new Date()
  const normalizedDoi = requireNormalizedDoi(body.doi)
  const scope = await resolvePaperScope(
    fastify,
    userId,
    body.institution_id,
    body.lab_id,
    body.review_node_id,
  )
  await assertCanUseUploadedFile(fastify, userId, body.oss_file_id, scope.institutionId)
  if (!scope.institutionId) {
    throw fastify.httpErrors.badRequest('An institution is required for paper review')
  }
  const institutionId = scope.institutionId
  const requestDigest = createHash('sha256')
    .update(stableStringify({ ...body, doi: normalizedDoi }))
    .digest('hex')
  const result = await fastify.prisma.$transaction(async (tx) => {
    if (idempotencyKey) {
      await lockMutationScope(tx, 'paper-submission-request', `${userId}:${idempotencyKey}`)
      const previous = await tx.paper_submissions.findUnique({
        where: { userId_idempotencyKey: { userId, idempotencyKey } },
        include: { paper: true, claim: { include: { review_case: true } } },
      })
      if (previous) {
        if (previous.requestDigest !== requestDigest || !previous.claim)
          throw fastify.httpErrors.conflict(
            'Idempotency key was used with different submission data',
          )
        return { paper: previous.paper, claim: toClaimRecord(previous.claim), submission: previous }
      }
    }
    await lockMutationScope(tx, 'paper-claim', `${institutionId}:${normalizedDoi}`)
    const paper = await ensureSubmittedPaper(
      tx,
      legacyPaperMetadata({ ...body, doi: normalizedDoi }),
      {
        institutionId,
        actorUserId: userId,
        source: 'paper_submission',
      },
    )

    const existingClaim = await tx.paper_claims.findFirst({
      where: buildClaimScopeWhere(paper.id, scope),
      include: { review_case: true },
    })
    if (existingClaim && (await hasGovernedReview(tx, institutionId, 'paper'))) {
      if (['approved', 'archived'].includes(existingClaim.review_case.status))
        throw fastify.httpErrors.conflict(
          'Published or archived papers must be updated through a change request',
        )
      if (existingClaim.submittedBy !== userId)
        throw fastify.httpErrors.forbidden(
          'Only the original submitter can replace a pending submission',
        )
    }
    const submission = await tx.paper_submissions.create({
      data: {
        idempotencyKey,
        requestDigest: idempotencyKey ? requestDigest : null,
        paperId: paper.id,
        claimId: existingClaim?.id ?? null,
        userId,
        institutionId,
        labId: scope.labId,
        oss_file_id: body.oss_file_id ?? null,
        metadata_snapshot: buildSubmissionSnapshot({ ...body, doi: normalizedDoi }),
        notes: null,
        createdAt: now,
        updatedAt: now,
      },
    })

    const claimId = existingClaim?.id ?? randomUUID()
    const reviewCase = await ensureReviewCase(tx, {
      institutionId,
      contentType: 'paper',
      subjectId: claimId,
      currentVersionId: submission.id,
      submittedBy: userId,
      reviewNodeId: scope.reviewNodeId,
      initialStatus: 'draft',
    })

    if (existingClaim) {
      await tx.paper_claims.update({
        where: { id: existingClaim.id },
        data: {
          institutionId,
          labId: scope.labId,
          reviewNodeId: scope.reviewNodeId,
          submittedBy: userId,
          submissionId: submission.id,
          updatedAt: now,
        },
      })
    } else {
      await tx.paper_claims.create({
        data: {
          id: claimId,
          paperId: paper.id,
          institutionId,
          labId: scope.labId,
          reviewNodeId: scope.reviewNodeId,
          reviewCaseId: reviewCase.id,
          submittedBy: userId,
          submissionId: submission.id,
          createdAt: now,
          updatedAt: now,
        },
      })
    }

    await tx.paper_submissions.update({
      where: { id: submission.id },
      data: { claimId, updatedAt: now },
    })
    await submitReviewCase(fastify, tx, {
      caseId: reviewCase.id,
      actorId: userId,
      versionId: submission.id,
      reviewNodeId: scope.reviewNodeId,
    })
    await enqueuePaperIndex(tx, paper.id)
    const claimWithReviewCase = await tx.paper_claims.findUnique({
      where: { id: claimId },
      include: { review_case: true },
    })
    if (!claimWithReviewCase) {
      throw fastify.httpErrors.notFound('Paper claim not found after submission')
    }
    return { paper, claim: toClaimRecord(claimWithReviewCase), submission }
  })

  return formatPaper(fastify, result.paper, result.claim, userId, {
    ...result.submission,
    claimId: result.claim.id,
  })
}
