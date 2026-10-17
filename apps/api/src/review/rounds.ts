import { createHash } from 'node:crypto'
import type { Prisma, content_review_cases } from '../../prisma/generated/client'

export const snapshotJson = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue

export const createReviewRound = async (
  tx: Prisma.TransactionClient,
  reviewCase: content_review_cases,
  versionId: string,
  workflow: unknown,
): Promise<number> => {
  const prior = await tx.content_review_rounds.aggregate({
    where: { caseId: reviewCase.id },
    _max: { number: true },
  })
  const number = (prior._max.number ?? 0) + 1
  const material =
    reviewCase.content_type === 'change_request'
      ? await tx.content_review_changes.findUnique({ where: { id: versionId } })
      : reviewCase.content_type === 'degree_thesis'
        ? await tx.degree_thesis_versions.findUnique({ where: { id: versionId } })
        : await tx.paper_submissions.findUnique({
            where: { id: versionId },
            include: { paper: true },
          })
  if (!material) throw new Error('Review material version not found')
  if ('caseId' in material && material.caseId !== reviewCase.id)
    throw new Error('Change proposal belongs to another review case')
  if ('thesisId' in material && material.thesisId !== reviewCase.subjectId)
    throw new Error('Thesis material belongs to another review case')
  if ('claimId' in material && material.claimId && material.claimId !== reviewCase.subjectId)
    throw new Error('Paper material belongs to another review case')
  const governed = Boolean(
    workflow &&
    typeof workflow === 'object' &&
    'steps' in workflow &&
    Array.isArray(workflow.steps) &&
    workflow.steps.some(
      (step) => step && typeof step === 'object' && step.resolver_type === 'governance',
    ),
  )
  const scope = governed
    ? await tx.content_review_participant_scopes.findUnique({
        where: { caseId_versionId: { caseId: reviewCase.id, versionId } },
      })
    : null
  const snapshot = snapshotJson({
    ...material,
    ...(governed
      ? {
          participants: scope
            ? {
                personIds: scope.personIds,
                nodeIds: scope.nodeIds,
                verifiedBy: scope.verifiedBy,
                verifiedAt: scope.verifiedAt,
              }
            : null,
        }
      : {}),
  })
  await tx.content_review_rounds.updateMany({
    where: { caseId: reviewCase.id, status: 'pending_review' },
    data: { status: 'superseded', completedAt: new Date() },
  })
  await tx.content_review_rounds.create({
    data: {
      caseId: reviewCase.id,
      number,
      versionId,
      materialSnapshot: snapshot,
      workflowSnapshot: snapshotJson(workflow ?? {}),
      materialDigest: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),
    },
  })
  return number
}

export const markReviewApplied = async (
  tx: Prisma.TransactionClient,
  caseId: string,
): Promise<void> => {
  const reviewCase = await tx.content_review_cases.findUniqueOrThrow({ where: { id: caseId } })
  if (reviewCase.status === 'approved')
    await tx.content_review_rounds.updateMany({
      where: { caseId, number: reviewCase.currentRound, status: 'approved' },
      data: { executionStatus: 'applied', completedAt: new Date() },
    })
}
