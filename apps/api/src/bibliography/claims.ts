import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { Prisma, type paper_claims } from '../../prisma/generated/client'
import type { PaperScope } from '../routes/papers/service.shared'
import { submitReviewCase } from '../review/service'
import { enqueuePaperIndex } from './index-queue'

interface ClaimInput {
  paperId: string
  institutionId: string
  userId: string
  scope: PaperScope
  snapshot: Prisma.InputJsonObject
  reviewRequired?: boolean
}

// Imports create a claim only when the institution has none. Never replace an
// existing PDF, submitter, scope, workflow step, rejection or approval.
export const ensureBibliographyClaim = async (
  tx: Prisma.TransactionClient,
  input: ClaimInput,
  fastify?: FastifyInstance,
): Promise<{ claim: paper_claims; created: boolean; reviewPending: boolean }> => {
  const { paperId, institutionId, userId, scope, reviewRequired } = input
  if (reviewRequired && !fastify) throw new Error('A review application context is required')
  await tx.$queryRaw(Prisma.sql`SELECT id FROM papers WHERE id = ${paperId}::uuid FOR UPDATE`)
  const existing = await tx.paper_claims.findFirst({
    where: { paperId, institutionId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  if (existing) return { claim: existing, created: false, reviewPending: false }
  const now = new Date()
  const claimId = randomUUID()
  const submission = await tx.paper_submissions.create({
    data: {
      paperId,
      userId,
      institutionId,
      labId: scope.labId,
      metadata_snapshot: input.snapshot,
      createdAt: now,
      updatedAt: now,
    },
  })
  const review = await tx.content_review_cases.create({
    data: {
      institutionId,
      content_type: 'paper',
      subjectId: claimId,
      currentVersionId: submission.id,
      submittedBy: userId,
      reviewNodeId: scope.reviewNodeId,
      status: reviewRequired ? 'draft' : 'approved',
      decidedBy: reviewRequired ? null : userId,
      submittedAt: now,
      decidedAt: reviewRequired ? null : now,
    },
  })
  const claim = await tx.paper_claims.create({
    data: {
      id: claimId,
      paperId,
      institutionId,
      labId: scope.labId,
      reviewNodeId: scope.reviewNodeId,
      reviewCaseId: review.id,
      submittedBy: userId,
      submissionId: submission.id,
    },
  })
  await tx.paper_submissions.update({ where: { id: submission.id }, data: { claimId } })
  if (reviewRequired && fastify) {
    await submitReviewCase(fastify, tx, {
      caseId: review.id,
      actorId: userId,
      versionId: submission.id,
      reviewNodeId: scope.reviewNodeId,
    })
  } else {
    await tx.content_review_actions.create({
      data: {
        caseId: review.id,
        institutionId,
        actorId: userId,
        action: 'auto_approved',
        from_status: 'draft',
        to_status: 'approved',
        versionId: submission.id,
        notes: 'New claim approved by the self-hosted import policy.',
      },
    })
  }
  await enqueuePaperIndex(tx, paperId)
  return { claim, created: true, reviewPending: Boolean(reviewRequired) }
}
