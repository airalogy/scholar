import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { Prisma } from '../../prisma/generated/client'
import type { PaperMetadataInput } from '../bibliography/schema'
import { changeSubject, changeFingerprint } from './changes'
import { snapshotJson } from './rounds'
import { submitReviewCase } from './service'
import { lockMutationScope } from '../utils/advisory-lock'

export const proposeImportedBibliography = async (
  fastify: FastifyInstance,
  tx: Prisma.TransactionClient,
  input: {
    institutionId: string
    claimId: string
    userId: string
    key: string
    metadata: PaperMetadataInput
    expectedFingerprint: string
  },
): Promise<void> => {
  await lockMutationScope(tx, 'paper-claim', input.claimId)
  await lockMutationScope(tx, 'institution-identity', input.institutionId)
  const previous = await tx.content_review_changes.findUnique({
    where: {
      institutionId_submittedBy_idempotencyKey: {
        institutionId: input.institutionId,
        submittedBy: input.userId,
        idempotencyKey: input.key,
      },
    },
  })
  if (previous) return
  const before = await changeSubject(tx, input.institutionId, 'paper', input.claimId)
  if (before.status !== 'approved')
    throw fastify.httpErrors.conflict(
      'Finish or restore the existing paper review before proposing an imported update',
    )
  const id = randomUUID()
  const review = await tx.content_review_cases.create({
    data: {
      institutionId: input.institutionId,
      content_type: 'change_request',
      subjectId: id,
      currentVersionId: id,
      submittedBy: input.userId,
    },
  })
  await tx.content_review_changes.create({
    data: {
      id,
      caseId: review.id,
      institutionId: input.institutionId,
      submittedBy: input.userId,
      idempotencyKey: input.key,
      subjectType: 'paper',
      subjectId: input.claimId,
      kind: 'bibliography',
      payload: snapshotJson({
        kind: 'bibliography',
        metadata: input.metadata,
        expectedFingerprint: input.expectedFingerprint,
      }),
      beforeSnapshot: snapshotJson(before),
      baseFingerprint: changeFingerprint(before),
    },
  })
  await submitReviewCase(fastify, tx, { caseId: review.id, actorId: input.userId, versionId: id })
}
