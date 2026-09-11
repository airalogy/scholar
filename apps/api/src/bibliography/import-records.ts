import type { FastifyInstance } from 'fastify'
import type {
  Prisma,
  institution_data_imports,
  institution_data_import_items,
} from '../../prisma/generated/client'
import type { ImportRequestContext } from '../routes/v1/institutions/service.shared'
import { loadImportInstitution, assertImportAccess } from '../routes/v1/institutions/service.shared'
import type {
  ImportView,
  ImportItemView,
  ImportSummaryView,
} from '../routes/v2/institutions/schema'
import { BibliographyConflict } from './identity'
import type { BibliographyIssue } from './normalize'
import type { PaperMetadataInput } from './schema'
import { assertBibliographyLease } from './import-lease'

export const loadBibliographyImport = async (
  fastify: FastifyInstance,
  slug: string,
  importId: string,
  context: ImportRequestContext,
  scope: 'papers:import' | 'imports:read' = 'imports:read',
): Promise<institution_data_imports> => {
  const institution = await loadImportInstitution(fastify, slug)
  await assertImportAccess(fastify, context, institution.id, scope)
  const record = await fastify.prisma.institution_data_imports.findUnique({
    where: { id: importId },
  })
  if (
    !record ||
    record.institutionId !== institution.id ||
    record.kind !== 'papers' ||
    record.schemaVersion !== 2
  )
    throw fastify.httpErrors.notFound('Import not found')
  return record
}

type ItemWithIssues = institution_data_import_items & { issues: BibliographyIssue[] }

export const formatBibliographyItem = (item: ItemWithIssues): ImportItemView => {
  const paper = item.payload as PaperMetadataInput
  return {
    id: item.id,
    index: item.rowIndex,
    source_row: item.sourceRow,
    title:
      paper.title ??
      paper.titles?.find((title) => title.is_primary)?.title ??
      paper.titles?.[0]?.title ??
      '',
    action: item.action,
    status: item.status,
    paper_id: item.resolvedPaperId,
    target_id: item.targetId,
    message: item.message,
    decision: item.decision,
    issues: item.issues.map(({ code, severity, field, message }) => ({
      code,
      severity,
      field,
      message,
    })),
  }
}

type StoredWithIssues = Prisma.institution_data_import_itemsGetPayload<{
  include: { issues: true }
}>

const asItem = (item: StoredWithIssues): ItemWithIssues => ({
  ...item,
  issues: item.issues.map((issue) => ({
    ...issue,
    severity: issue.severity === 'error' ? 'error' : 'warning',
    incoming_value: issue.incoming_value ?? undefined,
    existing_value: issue.existing_value ?? undefined,
  })),
})

export const summarizeBibliographyImport = (
  record: institution_data_imports,
  items: Array<{ status: string }>,
): ImportSummaryView => ({
  id: record.id,
  schema_version: 2,
  source: record.sourceName ?? '',
  status: record.status,
  institution_id: record.institutionId,
  created_at: record.createdAt.toISOString(),
  updated_at: record.updatedAt.toISOString(),
  summary: {
    total: items.length,
    ready: items.filter((item) => item.status === 'ready').length,
    pending_review: items.filter((item) => item.status === 'pending_review').length,
    completed: items.filter((item) => item.status === 'completed').length,
    errors: items.filter((item) => item.status === 'error').length,
    rejected: items.filter((item) => item.status === 'rejected').length,
  },
})

export const formatBibliographyImport = async (
  prisma: FastifyInstance['prisma'],
  record: institution_data_imports,
): Promise<ImportView> => {
  const items = await prisma.institution_data_import_items.findMany({
    where: { importId: record.id },
    include: { issues: true },
    orderBy: { rowIndex: 'asc' },
  })
  return {
    ...summarizeBibliographyImport(record, items),
    items: items.map((item) => formatBibliographyItem(asItem(item))),
  }
}

export const finishBibliographyImport = async (
  prisma: FastifyInstance['prisma'],
  importId: string,
  token: string,
): Promise<institution_data_imports> =>
  prisma.$transaction(async (tx) => {
    await assertBibliographyLease(tx, importId, token)
    const items = await tx.institution_data_import_items.findMany({
      where: { importId },
      select: { status: true, action: true },
    })
    const count = (status: string): number => items.filter((item) => item.status === status).length
    const status = count('pending')
      ? 'previewing'
      : count('ready')
        ? 'ready'
        : count('pending_review')
          ? 'pending_review'
          : count('error') || count('rejected')
            ? 'completed_with_errors'
            : 'completed'
    return tx.institution_data_imports.update({
      where: { id: importId },
      data: {
        status,
        createdCount: items.filter((item) => item.action === 'created').length,
        updatedCount: items.filter((item) => item.action === 'updated').length,
        unchangedCount: items.filter((item) => item.action === 'unchanged').length,
        pendingCount: count('pending_review'),
        errorCount: count('error') + count('rejected'),
        updatedAt: new Date(),
      },
    })
  })

export const importFailureIssues = (error: unknown): BibliographyIssue[] =>
  error instanceof BibliographyConflict
    ? error.issues
    : [
        {
          code: 'import_failed',
          field: '',
          severity: 'error',
          message: 'This row could not be processed. Retry or contact an administrator.',
        },
      ]

export const recordBibliographyFailure = async (
  fastify: FastifyInstance,
  importId: string,
  token: string,
  itemId: string,
  error: unknown,
): Promise<void> => {
  const issues = importFailureIssues(error)
  if (!(error instanceof BibliographyConflict))
    fastify.log.error({ err: error, itemId }, 'Bibliographic import row failed')
  await fastify.prisma.$transaction(async (tx) => {
    await assertBibliographyLease(tx, importId, token)
    await tx.institution_data_import_items.update({
      where: { id: itemId },
      data: {
        status: 'error',
        action: 'error',
        message: issues[0]?.message ?? null,
        updatedAt: new Date(),
      },
    })
    await tx.institution_data_import_issues.deleteMany({ where: { itemId } })
    await tx.institution_data_import_issues.createMany({
      data: issues.map((issue) => ({ itemId, ...issue })),
    })
  })
}
