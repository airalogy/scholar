import type { FastifyInstance } from 'fastify'
import type { Prisma } from '../../prisma/generated/client'
import { writePaperBibliography } from './write'
import type { PaperMetadataInput } from './schema'
import type { ImportActor } from '../utils/integration-auth'
import type { PaperScope } from '../routes/papers/service.shared'
import { ensureBibliographyClaim } from './claims'
import { hasGovernedReview } from '../review/configuration'
import { normalizePaperMetadata, fingerprint } from './normalize'
import { resolveBibliographyIdentity } from './identity'
import { loadBibliographySnapshot } from './snapshot'
import { proposeImportedBibliography } from '../review/import-proposals'

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
  if (await hasGovernedReview(tx, institutionId, 'paper')) {
    const normalized = normalizePaperMetadata(item)
    if (!normalized.item) throw fastify.httpErrors.badRequest('Invalid bibliographic metadata')
    const existingId = await resolveBibliographyIdentity(tx, normalized.item)
    if (existingId) {
      const before = await loadBibliographySnapshot(tx, existingId, institutionId)
      const fieldDefinitions = await tx.institution_paper_field_definitions.findMany({
        where: { institutionId },
        orderBy: { key: 'asc' },
      })
      const expectedFingerprint = fingerprint({ paper: before, fieldDefinitions })
      if (options.expectedFingerprint && options.expectedFingerprint !== expectedFingerprint)
        throw fastify.httpErrors.conflict('Published data changed after import preview')
      const userId = options.claimSubmittedBy ?? actor.userId
      const { claim, created } = await ensureBibliographyClaim(
        tx,
        {
          paperId: existingId,
          institutionId,
          userId,
          scope,
          reviewRequired: true,
          snapshot: {
            source: 'governed_bibliography_import',
            metadata: { ...item },
            expectedFingerprint,
          },
        },
        fastify,
      )
      if (!created)
        await proposeImportedBibliography(fastify, tx, {
          institutionId,
          claimId: claim.id,
          userId,
          metadata: item,
          expectedFingerprint,
          key: `bibliography:${importItemId ?? fingerprint({ existingId, item })}`,
        })
      if (importItemId)
        await tx.institution_data_import_items.update({
          where: { id: importItemId },
          data: {
            action: 'updated',
            status: 'pending',
            targetId: claim.id,
            resolvedPaperId: existingId,
            message:
              'Submitted to the institutional review workflow; published metadata is unchanged',
            updatedAt: now,
          },
        })
      return {
        paperId: existingId,
        action: 'updated',
        status: 'pending',
        targetId: claim.id,
        message: 'Pending institutional review',
      }
    }
  }
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
