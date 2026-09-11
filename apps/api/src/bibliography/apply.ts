import type { FastifyInstance } from 'fastify'
import type { Prisma } from '../../prisma/generated/client'
import { writePaperBibliography } from './write'
import type { PaperMetadataInput } from './schema'
import type { ImportActor } from '../utils/integration-auth'
import type { PaperScope } from '../routes/papers/service.shared'
import { ensureBibliographyClaim } from './claims'

export interface DirectPaperImportResult {
  paperId: string
  action: 'created' | 'updated' | 'unchanged'
  status: 'completed' | 'pending'
  targetId: string
  message: string | null
}

export interface BibliographyApplyOptions {
  source?: string
  expectedFingerprint?: string
  reviewRequired?: boolean
  claimSubmittedBy?: string
}

export const syncDirectPaperImportItem = async (
  fastify: FastifyInstance,
  institutionId: string,
  actor: ImportActor,
  item: PaperMetadataInput,
  scope: PaperScope,
  importItemId?: string,
): Promise<DirectPaperImportResult> =>
  fastify.prisma.$transaction(
    (tx) => applyPaperBibliography(tx, fastify, institutionId, actor, item, scope, importItemId),
    { timeout: 30000 },
  )

export const applyPaperBibliography = async (
  tx: Prisma.TransactionClient,
  fastify: FastifyInstance,
  institutionId: string,
  actor: ImportActor,
  item: PaperMetadataInput,
  scope: PaperScope,
  importItemId?: string,
  options: BibliographyApplyOptions = {},
): Promise<DirectPaperImportResult> => {
  const now = new Date()
  const write = await writePaperBibliography(tx, item, {
    institutionId,
    actorUserId: actor.userId,
    source: options.source ?? 'institution_json_import',
    expectedFingerprint: options.expectedFingerprint,
    importItemId,
  })
  const { claim, reviewPending } = await ensureBibliographyClaim(
    tx,
    {
      paperId: write.paperId,
      institutionId,
      userId: options.claimSubmittedBy ?? actor.userId,
      scope,
      snapshot: { ...item, source: options.source ?? 'institution_json_import' },
      reviewRequired: options.reviewRequired,
    },
    fastify,
  )
  // Existing claims (including pending/rejected ones) retain their submitter,
  // scope, primary PDF, review steps and decisions. A metadata refresh is not a
  // resubmission and cannot grant publication approval to previously held content.
  const result: DirectPaperImportResult = {
    paperId: write.paperId,
    action: write.action,
    status: reviewPending ? 'pending' : 'completed',
    targetId: claim.id,
    message: write.issues.length ? write.issues.map((issue) => issue.message).join('; ') : null,
  }
  if (importItemId) {
    await tx.institution_data_import_items.update({
      where: { id: importItemId },
      data: {
        action: result.action,
        status: result.status,
        targetId: result.targetId,
        message: result.message,
        resolvedPaperId: result.paperId,
        updatedAt: now,
      },
    })
    await tx.institution_data_import_issues.deleteMany({ where: { itemId: importItemId } })
    if (write.issues.length)
      await tx.institution_data_import_issues.createMany({
        data: write.issues.map((issue) => ({ itemId: importItemId, ...issue })),
      })
  }
  return result
}
