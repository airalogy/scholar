import type { papers, Prisma } from '../../prisma/generated/client'
import { BibliographyConflict, resolveBibliographyIdentity } from './identity'
import { normalizePaperMetadata } from './normalize'
import { writePaperBibliography, type BibliographyWriteContext } from './write'

// Legacy submission snapshots contain workflow fields and nullable placeholders.
// Select only the old bibliographic contract; an absent fact is not a request to
// clear newer structured data. No institution-specific column mapping belongs here.
export const legacyPaperMetadata = (value: Record<string, unknown>): Record<string, unknown> => {
  const fields = [
    'title',
    'abstract',
    'doi',
    'journal_name',
    'publish_year',
    'publish_date',
    'paper_type',
    'language',
    'citation_count',
    'pages',
    'keywords',
    'link',
  ]
  return Object.fromEntries(
    fields
      .filter((key) => value[key] !== undefined && value[key] !== null)
      .map((key) => [key, value[key]]),
  )
}

// A submission may reference existing global metadata, but cannot overwrite it
// before review. New records still use the canonical writer and durable index job.
export const ensureSubmittedPaper = async (
  tx: Prisma.TransactionClient,
  input: unknown,
  context: BibliographyWriteContext,
): Promise<papers> => {
  const checked = normalizePaperMetadata(input)
  if (!checked.item)
    throw new BibliographyConflict('invalid_metadata', '', 'Invalid paper metadata')
  const existingId = await resolveBibliographyIdentity(tx, checked.item)
  const id = existingId ?? (await writePaperBibliography(tx, input, context)).paperId
  return tx.papers.findUniqueOrThrow({ where: { id } })
}

export const lockLegacyPaperMetadata = async (
  tx: Prisma.TransactionClient,
  paperId: string,
  value: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const patch = legacyPaperMetadata(value)
  // Resolve and lock identity before reading omitted fields, so an unrelated edit
  // cannot restore a stale title. This placeholder is never persisted.
  const checked = normalizePaperMetadata({
    ...patch,
    paper_id: paperId,
    title: patch.title ?? 'Pending identity resolution',
  })
  if (!checked.item)
    throw new BibliographyConflict('invalid_metadata', '', 'Invalid paper metadata')
  await resolveBibliographyIdentity(tx, checked.item)
  const current = await tx.papers.findUniqueOrThrow({ where: { id: paperId } })
  return { ...patch, paper_id: paperId, title: patch.title ?? current.title }
}

export const updateLegacyPaperMetadata = async (
  tx: Prisma.TransactionClient,
  paperId: string,
  value: Record<string, unknown>,
  context: BibliographyWriteContext,
): Promise<void> => {
  await writePaperBibliography(tx, await lockLegacyPaperMetadata(tx, paperId, value), context)
}
