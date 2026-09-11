import { Prisma } from '../../prisma/generated/client'
import type { NormalizedPaperMetadata, BibliographyIssue } from './normalize'

export class BibliographyConflict extends Error {
  readonly statusCode = 409
  readonly issues: BibliographyIssue[]

  constructor(code: string, field: string, message: string) {
    super(message)
    this.name = 'BibliographyConflict'
    this.issues = [{ code, field, message, severity: 'error' }]
  }
}

// Acquire keys in a stable order so overlapping batches cannot create two papers
// for the same identity. The surrounding transaction also owns all later writes.
export const resolveBibliographyIdentity = async (
  tx: Prisma.TransactionClient,
  item: NormalizedPaperMetadata,
): Promise<string | null> => {
  const keys = item.identifiers.map((id) => `paper:${id.scheme}:${id.value}`)
  if (item.paper_id) keys.push(`paper:id:${item.paper_id}`)
  for (const key of [...new Set(keys)].sort()) {
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`)
  }
  const matches = item.identifiers.length
    ? await tx.paper_identifiers.findMany({
        where: {
          OR: item.identifiers.map((id) => ({ scheme: id.scheme, normalized_value: id.value })),
        },
        select: { paperId: true },
      })
    : []
  const ids = new Set(matches.map((match) => match.paperId))
  // Retain compatibility with papers written by the earlier DOI-only importer.
  if (item.doi) {
    const legacy = await tx.papers.findUnique({
      where: { normalized_doi: item.doi },
      select: { id: true },
    })
    if (legacy) ids.add(legacy.id)
  }
  if (item.paper_id) {
    const explicit = await tx.papers.findUnique({
      where: { id: item.paper_id },
      select: { id: true },
    })
    if (!explicit)
      throw new BibliographyConflict(
        'paper_not_found',
        'paper_id',
        'The Scholar paper ID does not exist',
      )
    ids.add(explicit.id)
  }
  if (ids.size > 1) {
    throw new BibliographyConflict(
      'identifier_conflict',
      'identifiers',
      'The supplied identifiers resolve to different papers; manual reconciliation is required',
    )
  }
  const id = [...ids][0] ?? null
  if (id) {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM papers WHERE id = ${id}::uuid FOR UPDATE`)
    if (item.doi) {
      const paper = await tx.papers.findUniqueOrThrow({
        where: { id },
        select: { normalized_doi: true },
      })
      if (paper.normalized_doi && paper.normalized_doi !== item.doi) {
        throw new BibliographyConflict(
          'doi_conflict',
          'doi',
          'An existing DOI cannot be replaced through a metadata import',
        )
      }
    }
  }
  return id
}
