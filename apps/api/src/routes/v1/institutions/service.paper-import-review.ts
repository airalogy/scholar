import type { FastifyInstance } from 'fastify'
import type { ReviewImportBody } from './schema'
import { writePaperBibliography } from '../../../bibliography/write'
import { BibliographyConflict } from '../../../bibliography/identity'
import { finalizeImportRecord, formatImportItem, getFormattedImport } from './service.shared'

// Only v1 metadata refreshes of an existing claim are reviewed here. Newly
// claimed papers continue through the ordinary content-review workflow.
export const reviewLegacyPaperImport = async (
  fastify: FastifyInstance,
  institutionId: string,
  importId: string,
  reviewerId: string,
  body: ReviewImportBody,
) => {
  if (!body.notes?.trim()) throw fastify.httpErrors.badRequest('A review note is required')
  await fastify.prisma.$transaction(
    async (tx) => {
      await tx.$queryRawUnsafe(
        'SELECT id FROM institution_data_imports WHERE id = $1::uuid FOR UPDATE',
        importId,
      )
      const record = await tx.institution_data_imports.findUniqueOrThrow({
        where: { id: importId },
      })
      if (
        record.schemaVersion !== 1 ||
        record.institutionId !== institutionId ||
        record.kind !== 'papers'
      )
        throw fastify.httpErrors.notFound('Import not found')
      const items = await tx.institution_data_import_items.findMany({
        where: { importId, status: 'pending', baseFingerprint: { not: null } },
        orderBy: { rowIndex: 'asc' },
      })
      if (!items.length)
        throw fastify.httpErrors.conflict(
          'No pending metadata refreshes; new paper claims use the content review workflow',
        )
      for (const item of items) {
        if (!item.resolvedPaperId || !item.baseFingerprint)
          throw fastify.httpErrors.conflict('Import identity is missing')
        if (body.status === 'approved') {
          try {
            await writePaperBibliography(tx, item.payload, {
              institutionId,
              actorUserId: reviewerId,
              importItemId: item.id,
              source: 'institution_json_import',
              expectedFingerprint: item.baseFingerprint,
            })
          } catch (error) {
            if (error instanceof BibliographyConflict)
              throw fastify.httpErrors.conflict(error.message)
            throw error
          }
        }
        const decision = body.status === 'approved' ? 'applied' : 'rejected'
        await tx.institution_data_import_items.update({
          where: { id: item.id },
          data: {
            status: body.status === 'approved' ? 'completed' : 'rejected',
            decision,
            decisionNotes: body.notes!.trim(),
            decidedAt: new Date(),
            updatedAt: new Date(),
          },
        })
        await tx.institution_data_import_decisions.create({
          data: {
            itemId: item.id,
            decision,
            notes: body.notes!.trim(),
            actorType: 'user',
            actorUserId: reviewerId,
            actorScopes: [],
          },
        })
      }
      await tx.institution_data_imports.update({
        where: { id: importId },
        data: {
          reviewedBy: reviewerId,
          reviewedAt: new Date(),
          reviewNotes: body.notes!.trim(),
          updatedAt: new Date(),
        },
      })
    },
    { timeout: 60000 },
  )
  const items = await fastify.prisma.institution_data_import_items.findMany({
    where: { importId },
    orderBy: { rowIndex: 'asc' },
  })
  await finalizeImportRecord(fastify, importId, items.map(formatImportItem))
  return { code: 0 as const, data: await getFormattedImport(fastify, institutionId, importId) }
}
