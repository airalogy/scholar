import type { FastifyInstance } from 'fastify'
import { Prisma } from '../../prisma/generated/client'
import type { PreviewInput, ImportView } from '../routes/v2/institutions/schema'
import {
  loadImportInstitution,
  assertImportAccess,
  type ImportRequestContext,
} from '../routes/v1/institutions/service.shared'
import { previewPaperBibliography, bibliographyChanges } from './preview'
import { fingerprint, normalizePaperMetadata, stableStringify } from './normalize'
import { BibliographyConflict } from './identity'
import {
  acquireBibliographyLease,
  assertBibliographyLease,
  releaseBibliographyLease,
} from './import-lease'
import {
  formatBibliographyImport,
  recordBibliographyFailure,
  finishBibliographyImport,
} from './import-records'

export const createBibliographyPreview = async (
  fastify: FastifyInstance,
  slug: string,
  key: string,
  input: PreviewInput,
  context: ImportRequestContext,
): Promise<ImportView> => {
  const institution = await loadImportInstitution(fastify, slug)
  await assertImportAccess(fastify, context, institution.id, 'papers:import')
  if (!input.source.trim()) throw fastify.httpErrors.badRequest('Source must not be blank')
  const identity = { institutionId: institution.id, kind: 'papers', idempotencyKey: key }
  const digest = fingerprint(input)
  let record = await fastify.prisma.institution_data_imports.findUnique({
    where: { institutionId_kind_idempotencyKey: identity },
  })
  if (!record) {
    try {
      record = await fastify.prisma.institution_data_imports.create({
        data: {
          ...identity,
          schemaVersion: 2,
          sourceName: input.source.trim(),
          status: 'previewing',
          requestDigest: digest,
          actorType: context.actor.type,
          actorUserId: context.actor.userId,
          actorScopes:
            context.actor.type === 'integration' ? context.actor.scopes : ['can_import_data'],
          credentialId: context.actor.credentialId,
          sourceIp: context.sourceIp,
          userAgent: context.userAgent?.slice(0, 1000),
          totalRows: input.items.length,
          items: {
            create: input.items.map((row, index) => ({
              rowIndex: index,
              sourceRow: row.source_row,
              payload: row.paper as Prisma.InputJsonValue,
            })),
          },
        },
      })
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
        throw error
      record = await fastify.prisma.institution_data_imports.findUniqueOrThrow({
        where: { institutionId_kind_idempotencyKey: identity },
      })
    }
  }
  if (record.schemaVersion !== 2 || record.requestDigest !== digest)
    throw fastify.httpErrors.conflict(
      'This Idempotency-Key was used with a different import request',
    )
  if (record.status !== 'previewing') return formatBibliographyImport(fastify.prisma, record)
  const token = await acquireBibliographyLease(fastify, record.id)
  if (!token) return formatBibliographyImport(fastify.prisma, record)
  const importId = record.id
  try {
    const rows = await fastify.prisma.institution_data_import_items.findMany({
      where: { importId: record.id },
      orderBy: { rowIndex: 'asc' },
    })
    const seen = new Set<string>()
    for (const row of rows) {
      const normalized = normalizePaperMetadata(row.payload)
      const identities = normalized.item
        ? [
            ...normalized.item.identifiers.map(
              (identifier) => `${identifier.scheme}:${identifier.value}`,
            ),
            ...(normalized.item.paper_id ? [`paper:${normalized.item.paper_id}`] : []),
          ]
        : []
      const duplicate = identities.some((id) => seen.has(id))
      identities.forEach((id) => seen.add(id))
      if (row.status !== 'pending') {
        if (row.resolvedPaperId) seen.add(`paper:${row.resolvedPaperId}`)
        continue
      }
      try {
        if (duplicate)
          throw new BibliographyConflict(
            'duplicate_batch_identity',
            'identifiers',
            'Another row in this batch already declares the same paper identity',
          )
        const preview = await previewPaperBibliography(fastify.prisma, row.payload, {
          institutionId: institution.id,
          actorUserId: context.actor.userId,
          source: record.sourceName!,
        })
        if (
          preview.existingPaperId &&
          !identities.includes(`paper:${preview.existingPaperId}`) &&
          seen.has(`paper:${preview.existingPaperId}`)
        ) {
          throw new BibliographyConflict(
            'duplicate_batch_identity',
            'identifiers',
            'Another row resolves to this same Scholar paper',
          )
        }
        if (preview.existingPaperId) seen.add(`paper:${preview.existingPaperId}`)
        await fastify.prisma.$transaction(async (tx) => {
          await assertBibliographyLease(tx, importId, token)
          await tx.institution_data_import_items.update({
            where: { id: row.id },
            data: {
              action: preview.action,
              status: 'ready',
              externalKey: fingerprint(identities.sort()),
              resolvedPaperId: preview.existingPaperId,
              baseFingerprint: preview.baseFingerprint,
              previewChanges: JSON.parse(
                stableStringify(bibliographyChanges(preview)),
              ) as Prisma.InputJsonValue,
              message: null,
              updatedAt: new Date(),
            },
          })
          await tx.institution_data_import_issues.deleteMany({ where: { itemId: row.id } })
          if (preview.issues.length)
            await tx.institution_data_import_issues.createMany({
              data: preview.issues.map((issue) => ({ itemId: row.id, ...issue })),
            })
        })
      } catch (error) {
        await recordBibliographyFailure(fastify, record.id, token, row.id, error)
      }
    }
    record = await finishBibliographyImport(fastify.prisma, record.id, token)
    return formatBibliographyImport(fastify.prisma, record)
  } finally {
    await releaseBibliographyLease(fastify.prisma, record.id, token)
  }
}
