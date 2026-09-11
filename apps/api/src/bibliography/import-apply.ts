import type { FastifyInstance } from 'fastify'
import type { Prisma } from '../../prisma/generated/client'
import type { ApplyInput, ReviewInput, ImportView } from '../routes/v2/institutions/schema'
import type { ImportRequestContext } from '../routes/v1/institutions/service.shared'
import { assertPlatformAdmin } from '../utils/permissions'
import { resolvePaperImportScope } from '../routes/v1/institutions/service.papers'
import type { PaperMetadataInput } from './schema'
import { applyPaperBibliography } from './apply'
import {
  loadBibliographyImport,
  formatBibliographyImport,
  finishBibliographyImport,
  recordBibliographyFailure,
} from './import-records'
import {
  acquireBibliographyLease,
  assertBibliographyLease,
  releaseBibliographyLease,
} from './import-lease'

const recordDecision = async (
  tx: Prisma.TransactionClient,
  itemId: string,
  decision: string,
  notes: string | null,
  context: ImportRequestContext,
): Promise<void> => {
  await tx.institution_data_import_decisions.create({
    data: {
      itemId,
      decision,
      notes,
      actorType: context.actor.type,
      actorUserId: context.actor.userId,
      credentialId: context.actor.credentialId,
      actorScopes:
        context.actor.type === 'integration' ? context.actor.scopes : ['can_import_data'],
      sourceIp: context.sourceIp,
      userAgent: context.userAgent?.slice(0, 1000),
    },
  })
}

export const applyBibliographyImport = async (
  fastify: FastifyInstance,
  slug: string,
  importId: string,
  input: ApplyInput | ReviewInput,
  context: ImportRequestContext,
  reviewing = false,
): Promise<ImportView> => {
  if (reviewing) {
    if (context.actor.type !== 'user')
      throw fastify.httpErrors.forbidden('System credentials cannot review imports')
    await assertPlatformAdmin(fastify, context.actor.userId)
  }
  let record = await loadBibliographyImport(fastify, slug, importId, context, 'papers:import')
  if (record.status === 'previewing')
    throw fastify.httpErrors.conflict('The preview is not complete')
  const review = reviewing ? (input as ReviewInput) : null
  if (review && !review.notes.trim())
    throw fastify.httpErrors.badRequest('A review note is required')
  const requiredStatus = reviewing ? 'pending_review' : 'ready'
  const rows = await fastify.prisma.institution_data_import_items.findMany({
    where: {
      importId,
      ...(input.item_ids ? { id: { in: input.item_ids } } : { status: requiredStatus }),
    },
    include: { issues: true },
    orderBy: { rowIndex: 'asc' },
  })
  if (input.item_ids && rows.length !== input.item_ids.length)
    throw fastify.httpErrors.notFound('One or more import items do not belong to this import')
  if (
    rows.some(
      (row) =>
        row.status !== requiredStatus &&
        !['completed', 'rejected', 'pending_review'].includes(row.status),
    )
  )
    throw fastify.httpErrors.conflict('Only valid, unprocessed preview rows can be selected')
  const eligible = rows.filter((row) => row.status === requiredStatus)
  if (
    review?.decision !== 'reject' &&
    !input.acknowledge_warnings &&
    eligible.some((row) => row.issues.some((issue) => issue.severity === 'warning'))
  )
    throw fastify.httpErrors.conflict('Acknowledge the preview warnings before proceeding')
  if (!eligible.length) return formatBibliographyImport(fastify.prisma, record)
  if (!record.actorUserId && review?.decision !== 'reject')
    throw fastify.httpErrors.conflict('The original import submitter no longer exists')
  const scope =
    record.actorUserId && review?.decision !== 'reject'
      ? await resolvePaperImportScope(fastify, record.institutionId, {
          type: record.actorType === 'integration' ? 'integration' : 'user',
          userId: record.actorUserId,
          credentialId: record.credentialId,
          institutionId: record.institutionId,
          scopes: [],
        })
      : { institutionId: record.institutionId, labId: null, reviewNodeId: null }
  const token = await acquireBibliographyLease(fastify, importId)
  if (!token) throw fastify.httpErrors.conflict('This import is already being processed')
  const managed = fastify.deployment.managementMode !== 'self_hosted'
  try {
    for (const selected of eligible) {
      try {
        await fastify.prisma.$transaction(
          async (tx) => {
            await assertBibliographyLease(tx, importId, token)
            const row = await tx.institution_data_import_items.findUniqueOrThrow({
              where: { id: selected.id },
            })
            if (row.status !== requiredStatus) return
            const now = new Date()
            if (review?.decision === 'reject') {
              await recordDecision(tx, row.id, 'rejected', review.notes.trim(), context)
              await tx.institution_data_import_items.update({
                where: { id: row.id },
                data: {
                  status: 'rejected',
                  decision: 'rejected',
                  decisionNotes: review.notes.trim(),
                  decidedAt: now,
                  updatedAt: now,
                },
              })
              return
            }
            if (managed && !reviewing) {
              await recordDecision(tx, row.id, 'submitted', null, context)
              await tx.institution_data_import_items.update({
                where: { id: row.id },
                data: { status: 'pending_review', decision: 'submitted', updatedAt: now },
              })
              return
            }
            if (!row.baseFingerprint)
              throw fastify.httpErrors.conflict('This row needs a new preview')
            const result = await applyPaperBibliography(
              tx,
              fastify,
              record.institutionId,
              context.actor,
              row.payload as PaperMetadataInput,
              scope,
              row.id,
              {
                source: record.sourceName!,
                expectedFingerprint: row.baseFingerprint,
                reviewRequired: managed,
                // Claim ownership stays with the submitter; write/review audit stays with the operator.
                claimSubmittedBy: record.actorUserId!,
              },
            )
            await recordDecision(
              tx,
              row.id,
              result.status === 'pending' ? 'applied_pending_content_review' : 'applied',
              review?.notes.trim() ?? null,
              context,
            )
            await tx.institution_data_import_items.update({
              where: { id: row.id },
              data: {
                status: 'completed',
                decision:
                  result.status === 'pending' ? 'applied_pending_content_review' : 'applied',
                decisionNotes: review?.notes.trim(),
                decidedAt: now,
                updatedAt: now,
              },
            })
          },
          { timeout: 30000 },
        )
      } catch (error) {
        await recordBibliographyFailure(fastify, importId, token, selected.id, error)
      }
    }
    record = await finishBibliographyImport(fastify.prisma, importId, token)
    await fastify.prisma.$transaction(async (tx) => {
      await assertBibliographyLease(tx, importId, token)
      await tx.institution_data_imports.update({
        where: { id: importId },
        data: {
          appliedAt: !managed || reviewing ? new Date() : undefined,
          reviewedBy: reviewing ? context.actor.userId : undefined,
          reviewedAt: reviewing ? new Date() : undefined,
          reviewNotes: review?.notes.trim(),
        },
      })
    })
    return formatBibliographyImport(fastify.prisma, record)
  } finally {
    await releaseBibliographyLease(fastify.prisma, importId, token)
  }
}
