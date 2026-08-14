import type { FastifyInstance } from 'fastify'
import type {
  PaperImportBody,
  ScholarImportBody,
  ScholarImportItem,
  ReviewImportBody,
} from './schema'
import type { ImportItemResult, ImportKind, ImportRequestContext } from './service.shared'
import {
  assertImportAccess,
  buildRequestDigest,
  createPendingImportItem,
  createImportRecord,
  finalizeImportRecord,
  findIdempotentImport,
  formatImportItem,
  getFormattedImport,
  listFormattedImports,
  loadImportInstitution,
  updateImportItem,
} from './service.shared'
import { syncPaperImportItem } from './service.papers'
import { applyScholarImportItem, validateScholarImportItem } from './service.scholars'
import { assertPlatformAdmin } from '../../../utils/permissions'
import { normalizeDoi } from '../../../utils/doi'

const errorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : 'Import row failed'
}

const isUniqueConstraintError = (error: unknown): boolean => {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002'
}

const IMPORT_PROCESSING_LEASE_MS = 5 * 60 * 1000

const executeImport = async <T>(
  fastify: FastifyInstance,
  options: {
    slug: string
    kind: ImportKind
    idempotencyKey: string
    items: T[]
    context: ImportRequestContext
    requiredScope: 'papers:import' | 'scholars:import'
    resolveKey: (item: T) => string
    process: (item: T, importItemId: string) => Promise<Omit<ImportItemResult, 'index' | 'key'>>
  },
) => {
  const institution = await loadImportInstitution(fastify, options.slug)
  await assertImportAccess(fastify, options.context, institution.id, options.requiredScope)

  const requestDigest = buildRequestDigest(options.items)
  const existing = await findIdempotentImport(
    fastify,
    institution.id,
    options.kind,
    options.idempotencyKey,
    requestDigest,
  )
  let importRecord
  if (existing) {
    if (existing.status !== 'processing' && existing.status !== 'failed') {
      return {
        code: 0 as const,
        data: await getFormattedImport(fastify, institution.id, existing.id),
      }
    }

    const staleBefore = new Date(Date.now() - IMPORT_PROCESSING_LEASE_MS)
    const lease = await fastify.prisma.institution_data_imports.updateMany({
      where: {
        id: existing.id,
        OR:
          existing.status === 'failed'
            ? [{ status: 'failed' }]
            : [{ status: 'processing', updatedAt: { lte: staleBefore } }],
      },
      data: {
        status: 'processing',
        updatedAt: new Date(),
      },
    })
    if (lease.count === 0) {
      return {
        code: 0 as const,
        data: await getFormattedImport(fastify, institution.id, existing.id),
      }
    }

    importRecord = existing
  } else {
    try {
      importRecord = await createImportRecord(fastify, {
        institutionId: institution.id,
        kind: options.kind,
        idempotencyKey: options.idempotencyKey,
        requestDigest,
        totalRows: options.items.length,
        context: options.context,
      })
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error
      }
      const concurrentImport = await findIdempotentImport(
        fastify,
        institution.id,
        options.kind,
        options.idempotencyKey,
        requestDigest,
      )
      if (!concurrentImport) {
        throw error
      }
      return {
        code: 0 as const,
        data: await getFormattedImport(fastify, institution.id, concurrentImport.id),
      }
    }
  }

  const results: ImportItemResult[] = []
  const seenKeys = new Set<string>()
  const existingItems = await fastify.prisma.institution_data_import_items.findMany({
    where: { importId: importRecord.id },
    orderBy: { rowIndex: 'asc' },
  })
  const existingItemByIndex = new Map(existingItems.map((item) => [item.rowIndex, item]))

  try {
    for (const [index, item] of options.items.entries()) {
      const key = options.resolveKey(item)
      const existingItem = existingItemByIndex.get(index)
      let result: ImportItemResult
      let validationError: Error | null = null

      if (!key) {
        validationError = new Error('Import key must not be empty')
      } else if (seenKeys.has(key)) {
        validationError = new Error(`Duplicated import key "${key}"`)
      }
      if (key) {
        seenKeys.add(key)
      }

      if (existingItem && existingItem.status !== 'pending') {
        results.push(formatImportItem(existingItem))
        continue
      }

      const importItem =
        existingItem ??
        (await createPendingImportItem(fastify, importRecord.id, index, key || null, item))

      try {
        if (validationError) {
          throw validationError
        }
        result = {
          index,
          key,
          ...(await options.process(item, importItem.id)),
        }
      } catch (error) {
        result = {
          index,
          key: key || null,
          targetId: null,
          action: 'error',
          status: 'error',
          message: errorMessage(error),
        }
      }

      results.push(result)
      await updateImportItem(fastify, importItem.id, result)
      await fastify.prisma.institution_data_imports.update({
        where: { id: importRecord.id },
        data: { updatedAt: new Date() },
      })
    }

    await finalizeImportRecord(fastify, importRecord.id, results)
  } catch (error) {
    await fastify.prisma.institution_data_imports
      .update({
        where: { id: importRecord.id },
        data: {
          status: 'failed',
          updatedAt: new Date(),
        },
      })
      .catch((updateError) => {
        fastify.log.error(
          { err: updateError, importId: importRecord.id },
          'Failed to mark interrupted import as failed',
        )
      })
    throw error
  }

  return {
    code: 0 as const,
    data: await getFormattedImport(fastify, institution.id, importRecord.id),
  }
}

export const importPapers = async (
  fastify: FastifyInstance,
  slug: string,
  idempotencyKey: string,
  body: PaperImportBody,
  context: ImportRequestContext,
) => {
  const institution = await loadImportInstitution(fastify, slug)
  const isPrivateDeployment = fastify.deployment.mode === 'private'

  return executeImport(fastify, {
    slug,
    kind: 'papers',
    idempotencyKey,
    items: body.items,
    context,
    requiredScope: 'papers:import',
    resolveKey: (item) => normalizeDoi(item.doi),
    process: async (item, importItemId) => {
      const result = await syncPaperImportItem(
        fastify,
        institution.id,
        context.actor,
        item,
        isPrivateDeployment,
        importItemId,
      )
      return {
        targetId: result.targetId,
        action: result.action,
        status: result.status,
        message: result.message,
      }
    },
  })
}

export const importScholars = async (
  fastify: FastifyInstance,
  slug: string,
  idempotencyKey: string,
  body: ScholarImportBody,
  context: ImportRequestContext,
) => {
  const institution = await loadImportInstitution(fastify, slug)
  const isPrivateDeployment = fastify.deployment.mode === 'private'

  return executeImport(fastify, {
    slug,
    kind: 'scholars',
    idempotencyKey,
    items: body.items,
    context,
    requiredScope: 'scholars:import',
    resolveKey: (item) => item.external_id.trim(),
    process: async (item, importItemId) => {
      if (!isPrivateDeployment) {
        await validateScholarImportItem(fastify, item)
        return {
          targetId: null,
          action: 'pending' as const,
          status: 'pending' as const,
          message: 'Scholar changes are awaiting platform administrator review',
        }
      }

      const result = await applyScholarImportItem(
        fastify,
        institution.id,
        item,
        context.actor.type === 'user' ? context.actor.userId : null,
        importItemId,
      )
      return {
        targetId: result.targetId,
        action: result.action,
        status: 'completed' as const,
        message: result.message,
      }
    },
  })
}

const refreshPaperImportStatus = async (
  fastify: FastifyInstance,
  institutionId: string,
  importId: string,
): Promise<void> => {
  const pendingItems = await fastify.prisma.institution_data_import_items.findMany({
    where: {
      importId,
      status: 'pending',
      targetId: { not: null },
    },
  })
  if (pendingItems.length === 0) {
    return
  }

  const claims = await fastify.prisma.paper_claims.findMany({
    where: {
      id: {
        in: pendingItems
          .map((item) => item.targetId)
          .filter((value): value is string => value !== null),
      },
      institutionId,
    },
    include: { review_case: true },
  })
  const statusById = new Map(claims.map((claim) => [claim.id, claim.review_case.status]))
  const now = new Date()
  for (const item of pendingItems) {
    const claimStatus = item.targetId ? statusById.get(item.targetId) : null
    if (claimStatus === 'approved' || claimStatus === 'changes_requested') {
      await fastify.prisma.institution_data_import_items.update({
        where: { id: item.id },
        data: {
          status: claimStatus === 'approved' ? 'completed' : 'rejected',
          message:
            claimStatus === 'changes_requested' ? 'Paper claim requires changes' : item.message,
          updatedAt: now,
        },
      })
    }
  }

  const remainingPending = await fastify.prisma.institution_data_import_items.count({
    where: { importId, status: 'pending' },
  })
  if (remainingPending > 0) {
    return
  }
  const failed = await fastify.prisma.institution_data_import_items.count({
    where: {
      importId,
      status: { in: ['error', 'rejected'] },
    },
  })
  await fastify.prisma.institution_data_imports.update({
    where: { id: importId },
    data: {
      status: failed > 0 ? 'completed_with_errors' : 'completed',
      pendingCount: 0,
      errorCount: failed,
      updatedAt: now,
    },
  })
}

export const getImport = async (
  fastify: FastifyInstance,
  slug: string,
  importId: string,
  context: ImportRequestContext,
) => {
  const institution = await loadImportInstitution(fastify, slug)
  await assertImportAccess(fastify, context, institution.id, 'imports:read')

  const record = await fastify.prisma.institution_data_imports.findUnique({
    where: { id: importId },
  })
  if (!record || record.institutionId !== institution.id) {
    throw fastify.httpErrors.notFound('Import record not found')
  }
  if (record.kind === 'papers' && record.status === 'pending_review') {
    await refreshPaperImportStatus(fastify, institution.id, importId)
  }

  return {
    code: 0 as const,
    data: await getFormattedImport(fastify, institution.id, importId),
  }
}

export const listImports = async (
  fastify: FastifyInstance,
  slug: string,
  query: {
    limit?: number
    offset?: number
    kind?: ImportKind
  },
  context: ImportRequestContext,
) => {
  const institution = await loadImportInstitution(fastify, slug)
  await assertImportAccess(fastify, context, institution.id, 'imports:read')
  return {
    code: 0 as const,
    data: await listFormattedImports(fastify, institution.id, query),
  }
}

export const reviewScholarImport = async (
  fastify: FastifyInstance,
  slug: string,
  importId: string,
  reviewerId: string,
  body: ReviewImportBody,
) => {
  await assertPlatformAdmin(fastify, reviewerId)
  const institution = await loadImportInstitution(fastify, slug)
  const record = await fastify.prisma.institution_data_imports.findUnique({
    where: { id: importId },
  })
  if (!record || record.institutionId !== institution.id) {
    throw fastify.httpErrors.notFound('Import record not found')
  }
  if (record.kind !== 'scholars') {
    throw fastify.httpErrors.badRequest('Only pending scholar imports can be reviewed')
  }

  const staleBefore = new Date(Date.now() - IMPORT_PROCESSING_LEASE_MS)
  const lease = await fastify.prisma.institution_data_imports.updateMany({
    where: {
      id: importId,
      OR: [{ status: 'pending_review' }, { status: 'processing', updatedAt: { lte: staleBefore } }],
    },
    data: {
      status: 'processing',
      updatedAt: new Date(),
    },
  })
  if (lease.count === 0) {
    throw fastify.httpErrors.conflict('This scholar import is not awaiting review')
  }

  try {
    const items = await fastify.prisma.institution_data_import_items.findMany({
      where: {
        importId,
        status: 'pending',
      },
      orderBy: { rowIndex: 'asc' },
    })
    const now = new Date()
    if (body.status === 'rejected') {
      await fastify.prisma.$transaction([
        fastify.prisma.institution_data_import_items.updateMany({
          where: { importId, status: 'pending' },
          data: {
            status: 'rejected',
            message: body.notes ?? 'Scholar import was rejected',
            updatedAt: now,
          },
        }),
        fastify.prisma.institution_data_imports.update({
          where: { id: importId },
          data: {
            status: 'rejected',
            pendingCount: 0,
            reviewedBy: reviewerId,
            reviewNotes: body.notes ?? null,
            reviewedAt: now,
            updatedAt: now,
          },
        }),
      ])
    } else {
      for (const item of items) {
        try {
          const result = await applyScholarImportItem(
            fastify,
            institution.id,
            item.payload as ScholarImportItem,
            reviewerId,
          )
          await fastify.prisma.institution_data_import_items.update({
            where: { id: item.id },
            data: {
              targetId: result.targetId,
              action: result.action,
              status: 'completed',
              message: null,
              updatedAt: new Date(),
            },
          })
        } catch (error) {
          await fastify.prisma.institution_data_import_items.update({
            where: { id: item.id },
            data: {
              action: 'error',
              status: 'error',
              message: errorMessage(error),
              updatedAt: new Date(),
            },
          })
        }
        await fastify.prisma.institution_data_imports.update({
          where: { id: importId },
          data: { updatedAt: new Date() },
        })
      }

      const reviewedItems = await fastify.prisma.institution_data_import_items.findMany({
        where: { importId },
      })
      const results: ImportItemResult[] = reviewedItems.map((item) => ({
        index: item.rowIndex,
        key: item.externalKey,
        targetId: item.targetId,
        action:
          item.action === 'created' || item.action === 'updated' || item.action === 'unchanged'
            ? item.action
            : 'error',
        status: item.status === 'completed' ? 'completed' : 'error',
        message: item.message,
      }))
      await finalizeImportRecord(fastify, importId, results)
      await fastify.prisma.institution_data_imports.update({
        where: { id: importId },
        data: {
          reviewedBy: reviewerId,
          reviewNotes: body.notes ?? null,
          reviewedAt: now,
          updatedAt: now,
        },
      })
    }
  } catch (error) {
    await fastify.prisma.institution_data_imports
      .updateMany({
        where: { id: importId, status: 'processing' },
        data: { status: 'pending_review', updatedAt: new Date() },
      })
      .catch((updateError) => {
        fastify.log.error(
          { err: updateError, importId },
          'Failed to release scholar import review lease',
        )
      })
    throw error
  }

  return {
    code: 0 as const,
    data: await getFormattedImport(fastify, institution.id, importId),
  }
}
