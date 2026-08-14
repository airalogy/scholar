import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { CreatePaperBody } from './schema'
import { ensureReviewCase, submitReviewCase } from '../../review/service'
import { requireNormalizedDoi } from '../../utils/doi'
import { lockMutationScope } from '../../utils/advisory-lock'
import { PROTECTED_FILE_SECURITY_PROFILE } from '../../utils/protected-files'
import { buildClaimScopeWhere, buildSubmissionSnapshot, toClaimRecord } from './service.shared'
import { formatPaper, resolvePaperScope } from './service.paper'

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

export async function createPaper(fastify: FastifyInstance, body: CreatePaperBody, userId: string) {
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
  const result = await fastify.prisma.$transaction(async (tx) => {
    await lockMutationScope(tx, 'paper-claim', `${institutionId}:${normalizedDoi}`)
    const paper = await tx.papers.upsert({
      where: { normalized_doi: normalizedDoi },
      update: {},
      create: {
        title: body.title,
        abstract: body.abstract,
        doi: normalizedDoi,
        normalized_doi: normalizedDoi,
        journal_name: body.journal_name,
        publish_year: body.publish_year,
        publish_date: body.publish_date ? new Date(body.publish_date) : null,
        paper_type: body.paper_type,
        language: body.language,
        citation_count: body.citation_count,
        pages: body.pages,
        keywords: body.keywords ?? [],
        link: body.link ?? null,
        createdAt: now,
        updatedAt: now,
      },
    })

    const existingClaim = await tx.paper_claims.findFirst({
      where: buildClaimScopeWhere(paper.id, scope),
    })
    const submission = await tx.paper_submissions.create({
      data: {
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
