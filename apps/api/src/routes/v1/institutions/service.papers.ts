import type { FastifyInstance } from 'fastify'
import type { PaperImportItem } from './schema'
import type { ImportAction, ImportItemStatus } from './service.shared'
import type { PaperScope } from '../../papers/service.shared'
import type { ImportActor } from '../../../utils/integration-auth'
import { resolvePaperScope } from '../../papers/service.paper'
import { syncDirectPaperImportItem } from '../../../bibliography/apply'
import { ensureSubmittedPaper } from '../../../bibliography/legacy'
import { ensureBibliographyClaim } from '../../../bibliography/claims'
import { previewPaperBibliography } from '../../../bibliography/preview'
import { bibliographySnapshotFingerprint } from '../../../bibliography/snapshot'
import { BibliographyConflict } from '../../../bibliography/identity'

interface PaperImportResult {
  action: ImportAction
  status: ImportItemStatus
  targetId: string
  message: string | null
}

export const resolvePaperImportScope = async (
  fastify: FastifyInstance,
  institutionId: string,
  actor: ImportActor,
): Promise<PaperScope> =>
  actor.type === 'integration'
    ? { institutionId, labId: null, reviewNodeId: null }
    : resolvePaperScope(fastify, actor.userId, institutionId, undefined, undefined)

export const syncPaperImportItem = async (
  fastify: FastifyInstance,
  institutionId: string,
  actor: ImportActor,
  item: PaperImportItem,
  appliesDirectly: boolean,
  importItemId?: string,
): Promise<PaperImportResult> => {
  const scope = await resolvePaperImportScope(fastify, institutionId, actor)
  if (appliesDirectly)
    return syncDirectPaperImportItem(fastify, institutionId, actor, item, scope, importItemId)
  const context = { institutionId, actorUserId: actor.userId, source: 'institution_json_import' }
  const preview = await previewPaperBibliography(fastify.prisma, item, context)
  return fastify.prisma.$transaction(
    async (tx) => {
      const paper = await ensureSubmittedPaper(tx, item, { ...context, importItemId })
      if (preview.existingPaperId) {
        const fingerprint = await bibliographySnapshotFingerprint(tx, paper.id, institutionId)
        if (fingerprint !== preview.baseFingerprint)
          throw new BibliographyConflict(
            'stale_preview',
            '',
            'Paper changed while preparing its submission; retry the import',
          )
      }
      const existingClaim = await tx.paper_claims.findFirst({
        where: { paperId: paper.id, institutionId },
      })
      const metadataPending = Boolean(preview.existingPaperId && preview.action !== 'unchanged')
      if (existingClaim && metadataPending && !importItemId)
        throw new BibliographyConflict(
          'import_record_required',
          '',
          'A metadata review requires a persisted import record',
        )
      const { claim } = await ensureBibliographyClaim(
        tx,
        {
          paperId: paper.id,
          institutionId,
          userId: actor.userId,
          scope,
          reviewRequired: true,
          snapshot: {
            ...item,
            source: context.source,
            canonical_update_pending: metadataPending,
            ...(metadataPending ? { bibliography_fingerprint: preview.baseFingerprint } : {}),
          },
        },
        fastify,
      )
      // Refreshing existing metadata creates an independent import review, not a
      // replacement of the institution's current claim, PDF or content-review case.
      const independentReview = Boolean(existingClaim && metadataPending)
      const result: PaperImportResult = {
        action: preview.action,
        targetId: claim.id,
        status: !existingClaim || independentReview ? 'pending' : 'completed',
        message: metadataPending
          ? 'Metadata differences await platform administrator review'
          : null,
      }
      if (importItemId)
        await tx.institution_data_import_items.update({
          where: { id: importItemId },
          data: {
            ...result,
            baseFingerprint: independentReview ? preview.baseFingerprint : null,
            resolvedPaperId: paper.id,
            decision: independentReview ? 'submitted' : null,
            updatedAt: new Date(),
          },
        })
      return result
    },
    { timeout: 30000 },
  )
}
