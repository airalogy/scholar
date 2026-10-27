import type { FastifyInstance } from 'fastify'
import type { Prisma } from '../../prisma/generated/client'
import { lockMutationScope } from '../utils/advisory-lock'
import { canActOnTask } from './authorization'
import { enqueueInboxEvent } from './tasks'

// Called under the institution identity lock, after legacy deletion permissions
// and the governed-review guard have been checked. Keep subjects and evidence.
export const archiveLegacyPaperReviews = async (
  tx: Prisma.TransactionClient,
  institutionId: string,
  claimIds: string[],
  actorId: string,
): Promise<void> => {
  const cases = await tx.content_review_cases.findMany({
    where: { institutionId, content_type: 'paper', subjectId: { in: claimIds } },
  })
  const now = new Date()
  for (const reviewCase of cases) {
    if (reviewCase.status === 'archived') continue
    const caseId = reviewCase.id
    const tasks = await tx.content_review_tasks.findMany({
      where: { step: { caseId }, status: { in: ['pending', 'queued', 'notified'] } },
    })
    for (const task of tasks) {
      await tx.content_review_tasks.update({
        where: { id: task.id },
        data: { status: 'cancelled' },
      })
      await enqueueInboxEvent(tx, task.id, 'cancelled')
    }
    await tx.content_review_step_instances.updateMany({
      where: { caseId, status: { in: ['pending', 'queued'] } },
      data: { status: 'cancelled', updatedAt: now },
    })
    // Completed decisions and immutable material/workflow snapshots stay intact.
    await tx.content_review_rounds.updateMany({
      where: { caseId, status: { in: ['pending_review', 'changes_requested'] } },
      data: { status: 'withdrawn', executionStatus: 'not_applicable', completedAt: now },
    })
    await tx.content_review_cases.update({
      where: { id: caseId },
      data: { status: 'archived', currentStep: null, updatedAt: now },
    })
    await tx.content_review_actions.create({
      data: {
        caseId,
        institutionId,
        actorId,
        roundNumber: reviewCase.currentRound,
        action: 'withdrawn',
        from_status: reviewCase.status,
        to_status: 'archived',
        versionId: reviewCase.currentVersionId,
        notes: 'Archived by a legacy paper deletion request; history retained',
      },
    })
  }
}

export const closeReviewCase = async (
  fastify: FastifyInstance,
  institutionId: string,
  userId: string,
  caseId: string,
  input: { versionId: string; outcome: 'withdrawn' | 'rejected'; notes: string; taskId?: string },
): Promise<void> => {
  const initial = await fastify.prisma.content_review_cases.findFirst({
    where: { id: caseId, institutionId },
  })
  if (!initial) throw fastify.httpErrors.notFound('Review case not found')
  await fastify.prisma.$transaction(async (tx) => {
    await lockMutationScope(
      tx,
      initial.content_type === 'paper'
        ? 'paper-claim'
        : initial.content_type === 'degree_thesis'
          ? 'degree-thesis'
          : 'review-change',
      initial.subjectId,
    )
    await lockMutationScope(tx, 'institution-identity', institutionId)
    const reviewCase = await tx.content_review_cases.findUniqueOrThrow({ where: { id: caseId } })
    if (
      reviewCase.currentVersionId !== input.versionId ||
      !['pending_review', 'changes_requested'].includes(reviewCase.status)
    )
      throw fastify.httpErrors.conflict('Application or material version is no longer current')
    if (input.outcome === 'withdrawn') {
      if (reviewCase.submittedBy !== userId)
        throw fastify.httpErrors.forbidden('Only the applicant can withdraw this application')
    } else {
      const task = input.taskId
        ? await tx.content_review_tasks.findFirst({
            where: {
              id: input.taskId,
              step: { caseId, roundNumber: reviewCase.currentRound, status: 'pending' },
            },
          })
        : null
      if (!task?.role || !(await canActOnTask(tx, institutionId, userId, task)))
        throw fastify.httpErrors.forbidden(
          'An active scoped reviewer task is required to reject an application',
        )
    }
    const tasks = await tx.content_review_tasks.findMany({
      where: {
        step: { caseId, roundNumber: reviewCase.currentRound },
        status: { in: ['pending', 'queued', 'notified'] },
      },
    })
    for (const task of tasks) {
      await tx.content_review_tasks.update({
        where: { id: task.id },
        data: { status: input.outcome },
      })
      await enqueueInboxEvent(tx, task.id, 'cancelled')
    }
    await tx.content_review_step_instances.updateMany({
      where: {
        caseId,
        roundNumber: reviewCase.currentRound,
        status: { in: ['pending', 'queued'] },
      },
      data: { status: 'cancelled', updatedAt: new Date() },
    })
    await tx.content_review_rounds.updateMany({
      where: { caseId, number: reviewCase.currentRound },
      data: { status: input.outcome, executionStatus: 'not_applicable', completedAt: new Date() },
    })
    // Keep the public legacy status contract, while rounds preserve the precise outcome.
    await tx.content_review_cases.update({
      where: { id: caseId },
      data: {
        status: 'archived',
        currentStep: null,
        decision_notes: input.notes,
        decidedBy: userId,
        decidedAt: new Date(),
        updatedAt: new Date(),
      },
    })
    await tx.content_review_actions.create({
      data: {
        caseId,
        institutionId,
        actorId: userId,
        taskId: input.outcome === 'rejected' ? input.taskId : undefined,
        roundNumber: reviewCase.currentRound,
        action: input.outcome,
        from_status: reviewCase.status,
        to_status: 'archived',
        versionId: input.versionId,
        notes: input.notes,
      },
    })
  })
}
