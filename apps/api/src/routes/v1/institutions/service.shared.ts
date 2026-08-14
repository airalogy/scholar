import crypto from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { ImportActor, IntegrationScope } from '../../../utils/integration-auth'
import { assertImportActorAccess } from '../../../utils/integration-auth'

export type ImportKind = 'papers' | 'scholars'
export type ImportAction = 'created' | 'updated' | 'unchanged' | 'pending' | 'error'
export type ImportItemStatus = 'completed' | 'pending' | 'rejected' | 'error'
export type ImportStatus =
  | 'processing'
  | 'pending_review'
  | 'completed'
  | 'completed_with_errors'
  | 'rejected'
  | 'failed'

export interface ImportItemResult {
  index: number
  key: string | null
  targetId: string | null
  action: ImportAction
  status: ImportItemStatus
  message: string | null
}

export interface ImportRequestContext {
  actor: ImportActor
  sourceIp: string
  userAgent: string | null
}

interface InstitutionRecord {
  id: string
  slug: string
}

const normalizeImportKind = (value: string): ImportKind => {
  return value === 'scholars' ? 'scholars' : 'papers'
}

const normalizeImportStatus = (value: string): ImportStatus => {
  if (
    value === 'pending_review' ||
    value === 'completed' ||
    value === 'completed_with_errors' ||
    value === 'rejected' ||
    value === 'failed'
  ) {
    return value
  }
  return 'processing'
}

const normalizeItemAction = (value: string): ImportAction => {
  if (value === 'created' || value === 'updated' || value === 'unchanged' || value === 'error') {
    return value
  }
  return 'pending'
}

const normalizeItemStatus = (value: string): ImportItemStatus => {
  if (value === 'completed' || value === 'rejected' || value === 'error') {
    return value
  }
  return 'pending'
}

export const loadImportInstitution = async (
  fastify: FastifyInstance,
  slug: string,
): Promise<InstitutionRecord> => {
  if (
    fastify.deployment.paperLibrary.fixedInstitutionSlug &&
    fastify.deployment.paperLibrary.fixedInstitutionSlug !== slug
  ) {
    throw fastify.httpErrors.notFound('Institution not found')
  }

  const institution = await fastify.prisma.institutions.findUnique({
    where: { slug },
    select: { id: true, slug: true },
  })
  if (!institution) {
    throw fastify.httpErrors.notFound('Institution not found')
  }
  return institution
}

export const assertImportAccess = async (
  fastify: FastifyInstance,
  context: ImportRequestContext,
  institutionId: string,
  scope: IntegrationScope,
): Promise<void> => {
  await assertImportActorAccess(fastify, context.actor, institutionId, scope)
}

export const buildRequestDigest = (items: unknown[]): string => {
  return crypto.createHash('sha256').update(JSON.stringify(items)).digest('hex')
}

export const findIdempotentImport = async (
  fastify: FastifyInstance,
  institutionId: string,
  kind: ImportKind,
  idempotencyKey: string,
  requestDigest: string,
) => {
  const existing = await fastify.prisma.institution_data_imports.findUnique({
    where: {
      institutionId_kind_idempotencyKey: {
        institutionId,
        kind,
        idempotencyKey,
      },
    },
  })
  if (existing && existing.requestDigest !== requestDigest) {
    throw fastify.httpErrors.conflict(
      'The Idempotency-Key was already used with a different request payload',
    )
  }
  return existing
}

export const createImportRecord = async (
  fastify: FastifyInstance,
  options: {
    institutionId: string
    kind: ImportKind
    idempotencyKey: string
    requestDigest: string
    totalRows: number
    context: ImportRequestContext
  },
) => {
  const now = new Date()
  return fastify.prisma.institution_data_imports.create({
    data: {
      institutionId: options.institutionId,
      kind: options.kind,
      status: 'processing',
      idempotencyKey: options.idempotencyKey,
      requestDigest: options.requestDigest,
      actorType: options.context.actor.type,
      actorUserId: options.context.actor.userId,
      actorScopes:
        options.context.actor.type === 'integration'
          ? options.context.actor.scopes
          : ['can_import_data'],
      credentialId: options.context.actor.credentialId,
      sourceIp: options.context.sourceIp,
      userAgent: options.context.userAgent,
      totalRows: options.totalRows,
      createdAt: now,
      updatedAt: now,
    },
  })
}

export const createPendingImportItem = async (
  fastify: FastifyInstance,
  importId: string,
  index: number,
  key: string | null,
  payload: unknown,
): Promise<{ id: string }> => {
  return fastify.prisma.institution_data_import_items.create({
    data: {
      importId,
      rowIndex: index,
      externalKey: key,
      targetId: null,
      action: 'pending',
      status: 'pending',
      message: null,
      payload: payload as object,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  })
}

export const updateImportItem = async (
  fastify: FastifyInstance,
  itemId: string,
  result: ImportItemResult,
): Promise<void> => {
  await fastify.prisma.institution_data_import_items.update({
    where: { id: itemId },
    data: {
      externalKey: result.key,
      targetId: result.targetId,
      action: result.action,
      status: result.status,
      message: result.message,
      updatedAt: new Date(),
    },
  })
}

export const finalizeImportRecord = async (
  fastify: FastifyInstance,
  importId: string,
  results: ImportItemResult[],
): Promise<void> => {
  const createdCount = results.filter((item) => item.action === 'created').length
  const updatedCount = results.filter((item) => item.action === 'updated').length
  const unchangedCount = results.filter((item) => item.action === 'unchanged').length
  const pendingCount = results.filter((item) => item.status === 'pending').length
  const errorCount = results.filter((item) => item.status === 'error').length
  const status: ImportStatus =
    pendingCount > 0 ? 'pending_review' : errorCount > 0 ? 'completed_with_errors' : 'completed'

  await fastify.prisma.institution_data_imports.update({
    where: { id: importId },
    data: {
      status,
      createdCount,
      updatedCount,
      unchangedCount,
      pendingCount,
      errorCount,
      updatedAt: new Date(),
    },
  })
}

export const formatImportItem = (item: {
  rowIndex: number
  externalKey: string | null
  targetId: string | null
  action: string
  status: string
  message: string | null
}): ImportItemResult => ({
  index: item.rowIndex,
  key: item.externalKey,
  targetId: item.targetId,
  action: normalizeItemAction(item.action),
  status: normalizeItemStatus(item.status),
  message: item.message,
})

const formatImportBase = (record: {
  id: string
  institutionId: string
  kind: string
  status: string
  actorType: string
  totalRows: number
  createdCount: number
  updatedCount: number
  unchangedCount: number
  pendingCount: number
  errorCount: number
  reviewedBy: string | null
  reviewNotes: string | null
  reviewedAt: Date | null
  createdAt: Date
  updatedAt: Date
}) => ({
  id: record.id,
  institutionId: record.institutionId,
  kind: normalizeImportKind(record.kind),
  status: normalizeImportStatus(record.status),
  actorType: record.actorType === 'integration' ? ('integration' as const) : ('user' as const),
  summary: {
    total: record.totalRows,
    created: record.createdCount,
    updated: record.updatedCount,
    unchanged: record.unchangedCount,
    pending: record.pendingCount,
    errors: record.errorCount,
  },
  reviewedBy: record.reviewedBy,
  reviewNotes: record.reviewNotes,
  reviewedAt: record.reviewedAt?.toISOString() ?? null,
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
})

export const getFormattedImport = async (
  fastify: FastifyInstance,
  institutionId: string,
  importId: string,
) => {
  const record = await fastify.prisma.institution_data_imports.findUnique({
    where: { id: importId },
  })
  if (!record || record.institutionId !== institutionId) {
    throw fastify.httpErrors.notFound('Import record not found')
  }

  const items = await fastify.prisma.institution_data_import_items.findMany({
    where: { importId },
    orderBy: { rowIndex: 'asc' },
  })

  return {
    ...formatImportBase(record),
    items: items.map(formatImportItem),
  }
}

export const listFormattedImports = async (
  fastify: FastifyInstance,
  institutionId: string,
  query: {
    limit?: number
    offset?: number
    kind?: ImportKind
  },
) => {
  const where = {
    institutionId,
    ...(query.kind ? { kind: query.kind } : {}),
  }
  const [records, total] = await Promise.all([
    fastify.prisma.institution_data_imports.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit ?? 20,
      skip: query.offset ?? 0,
    }),
    fastify.prisma.institution_data_imports.count({ where }),
  ])

  return {
    items: records.map(formatImportBase),
    total,
  }
}
