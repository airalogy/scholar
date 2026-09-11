import { Prisma } from '../../prisma/generated/client'
import { mergeCustomFieldPatch } from './custom-fields'
import { BibliographyConflict, resolveBibliographyIdentity } from './identity'
import { resolveBibliographyJournal, writeBibliometricObservations } from './journals'
import { writeBibliographyAuthorship } from './authorship'
import { loadBibliographySnapshot, type BibliographySnapshot } from './snapshot'
import {
  fingerprint,
  normalizePaperMetadata,
  stableStringify,
  type BibliographyIssue,
  type NormalizedPaperMetadata,
} from './normalize'
import type { CustomFieldValue } from './schema'
import { enqueuePaperIndex } from './index-queue'

export interface BibliographyWriteContext {
  institutionId: string
  actorUserId: string | null
  source: string
  importItemId?: string
  expectedFingerprint?: string
}

export interface BibliographyWriteResult {
  paperId: string
  existingPaperId: string | null
  baseFingerprint: string
  before: BibliographySnapshot | null
  after: BibliographySnapshot
  action: 'created' | 'updated' | 'unchanged'
  fingerprint: string
  issues: BibliographyIssue[]
}

const toJson = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(stableStringify(value)) as Prisma.InputJsonValue

const writeTitles = async (
  tx: Prisma.TransactionClient,
  paperId: string,
  item: NormalizedPaperMetadata,
  source: string,
): Promise<void> => {
  const current = await tx.paper_titles.findFirst({ where: { paperId, is_primary: true } })
  const titles = item.titles ?? [
    {
      title: item.title,
      language: current?.language ?? item.language_tags?.[0] ?? 'und',
      kind: current?.kind ?? 'original',
      is_primary: true,
      source,
    },
  ]
  await tx.paper_titles.updateMany({
    where: { paperId, is_primary: true },
    data: { is_primary: false },
  })
  for (const title of titles) {
    const key = { paperId, language: title.language, kind: title.kind ?? 'original' }
    const data = {
      title: title.title,
      is_primary: title.is_primary ?? false,
      source: title.source ?? source,
    }
    await tx.paper_titles.upsert({
      where: { paperId_language_kind: key },
      create: { ...key, ...data },
      update: data,
    })
  }
}

const writeInstitutionMetadata = async (
  tx: Prisma.TransactionClient,
  paperId: string,
  item: NormalizedPaperMetadata,
  context: BibliographyWriteContext,
): Promise<BibliographyIssue[]> => {
  const { institutionId, source } = context
  // Serialize configuration edits with validation of the final merged values.
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM institutions WHERE id = ${institutionId}::uuid FOR NO KEY UPDATE`,
  )
  const definitions = await tx.institution_paper_field_definitions.findMany({
    where: { institutionId },
  })
  const current = await tx.institution_paper_metadata.findUnique({
    where: { institutionId_paperId: { institutionId, paperId } },
  })
  const { custom_fields: patch, ...fields } = item.institution_metadata ?? {}
  const checked = mergeCustomFieldPatch(
    (current?.custom_fields ?? {}) as Record<string, CustomFieldValue>,
    patch ?? {},
    definitions,
  )
  if (checked.issues.some((issue) => issue.severity === 'error')) {
    const failure = new BibliographyConflict(
      'invalid_custom_fields',
      'institution_metadata.custom_fields',
      'Required institution fields are missing or invalid',
    )
    failure.issues.splice(0, failure.issues.length, ...checked.issues)
    throw failure
  }
  if (
    item.institution_metadata !== undefined ||
    definitions.some((definition) => definition.is_active && definition.is_required)
  ) {
    const data = { ...fields, custom_fields: checked.values as Prisma.InputJsonObject, source }
    await tx.institution_paper_metadata.upsert({
      where: { institutionId_paperId: { institutionId, paperId } },
      create: { institutionId, paperId, ...data },
      update: { ...data, updatedAt: new Date() },
    })
  }
  for (const input of item.sources ?? []) {
    const collectedOn = input.collected_on ? new Date(`${input.collected_on}T00:00:00Z`) : undefined
    const data = { external_id: input.external_id, collected_on: collectedOn }
    await tx.paper_sources.upsert({
      where: {
        institutionId_paperId_provider: { institutionId, paperId, provider: input.provider },
      },
      create: { institutionId, paperId, provider: input.provider, ...data },
      update: { ...data, last_seen_at: new Date() },
    })
  }
  return checked.issues
}

// Call only inside the caller's transaction, after institution authorization and
// any review decision. This never changes claims, files, users or review cases.
export const writePaperBibliography = async (
  tx: Prisma.TransactionClient,
  input: unknown,
  context: BibliographyWriteContext,
): Promise<BibliographyWriteResult> => {
  const checked = normalizePaperMetadata(input)
  if (!checked.item) {
    const failure = new BibliographyConflict('invalid_metadata', '', 'Invalid paper metadata')
    failure.issues.splice(0, failure.issues.length, ...checked.issues)
    throw failure
  }
  const item = checked.item
  const existingId = await resolveBibliographyIdentity(tx, item)
  const before = existingId
    ? await loadBibliographySnapshot(tx, existingId, context.institutionId)
    : null
  // A preview approves both the incoming facts and the institution's current
  // validation rules. Serialize with field edits and invalidate stale rules.
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM institutions WHERE id = ${context.institutionId}::uuid FOR NO KEY UPDATE`,
  )
  const fieldDefinitions = await tx.institution_paper_field_definitions.findMany({
    where: { institutionId: context.institutionId },
    orderBy: { key: 'asc' },
  })
  const baseFingerprint = fingerprint({ paper: before, fieldDefinitions })
  if (
    context.expectedFingerprint !== undefined &&
    context.expectedFingerprint !== baseFingerprint
  ) {
    throw new BibliographyConflict(
      'stale_preview',
      '',
      'The paper or institution field rules changed after preview; preview the import again',
    )
  }
  const journalId = item.journal
    ? await resolveBibliographyJournal(tx, item.journal)
    : (before?.journal_id ?? null)
  if (item.journal && journalId === null && before?.journal_id) {
    throw new BibliographyConflict(
      'journal_identity_required',
      'journal',
      'Changing a linked journal requires its stable journal ID or ISSN',
    )
  }
  const now = new Date()
  if (
    item.publish_year !== undefined &&
    item.publish_date === undefined &&
    before?.publish_date instanceof Date &&
    before.publish_date.getUTCFullYear() !== item.publish_year
  ) {
    throw new BibliographyConflict(
      'publication_date_conflict',
      'publish_year',
      'The supplied year conflicts with the stored publication date; provide the corrected date explicitly',
    )
  }
  const scalar = {
    title: item.title,
    abstract: item.abstract,
    doi: item.doi,
    normalized_doi: item.doi,
    journal_name: item.journal_name,
    journal_id: journalId,
    publish_year: item.publish_year,
    publish_date: item.publish_date ? new Date(`${item.publish_date}T00:00:00Z`) : undefined,
    paper_type: item.paper_type,
    document_type: item.document_type,
    publication_status: item.publication_status,
    language: item.language,
    language_tags: item.language_tags,
    citation_count: item.citation_count,
    pages: item.pages,
    link: item.link,
    keywords: item.keywords,
  }
  const paper = existingId
    ? await tx.papers.update({ where: { id: existingId }, data: scalar })
    : await tx.papers.create({ data: { ...scalar, createdAt: now, updatedAt: now } })
  await writeTitles(tx, paper.id, item, context.source)
  for (const id of item.identifiers) {
    await tx.paper_identifiers.upsert({
      where: { scheme_normalized_value: { scheme: id.scheme, normalized_value: id.value } },
      create: {
        paperId: paper.id,
        scheme: id.scheme,
        value: id.value,
        normalized_value: id.value,
        source: context.source,
      },
      update: {},
    })
  }
  await writeBibliographyAuthorship(tx, paper.id, item, context.source)
  for (const funding of item.funding ?? []) {
    const { source_key: suppliedKey, ...fields } = funding
    const sourceKey = suppliedKey ?? fingerprint(fields)
    await tx.paper_funding.upsert({
      where: { paperId_source_key: { paperId: paper.id, source_key: sourceKey } },
      create: { paperId: paper.id, source_key: sourceKey, ...fields, source: context.source },
      update: { ...fields, source: context.source },
    })
  }
  const issues = await writeInstitutionMetadata(tx, paper.id, item, context)
  await writeBibliometricObservations(tx, paper.id, journalId, item)
  const after = await loadBibliographySnapshot(tx, paper.id, context.institutionId)
  const changed = fingerprint(before) !== fingerprint(after)
  const action = before === null ? 'created' : changed ? 'updated' : 'unchanged'
  if (changed) {
    await tx.papers.update({
      where: { id: paper.id },
      data: { bibliography_revision: { increment: 1 }, updatedAt: now },
    })
    await tx.paper_metadata_events.create({
      data: {
        paperId: paper.id,
        actorUserId: context.actorUserId,
        importItemId: context.importItemId,
        action,
        source: context.source,
        before_snapshot: before === null ? Prisma.DbNull : toJson(before),
        after_snapshot: toJson(after),
      },
    })
    await enqueuePaperIndex(tx, paper.id)
  }
  return {
    paperId: paper.id,
    existingPaperId: existingId,
    baseFingerprint,
    before,
    after,
    action,
    fingerprint: fingerprint({ paper: after, fieldDefinitions }),
    issues,
  }
}
