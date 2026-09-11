import type { Prisma } from '../../prisma/generated/client'
import { normalizeBibliographicName, type NormalizedPaperMetadata } from './normalize'
import { BibliographyConflict } from './identity'

export const writeBibliographyAuthorship = async (
  tx: Prisma.TransactionClient,
  paperId: string,
  item: NormalizedPaperMetadata,
  source: string,
): Promise<void> => {
  for (const affiliation of item.affiliations ?? []) {
    const data = { ...affiliation, source }
    await tx.paper_affiliations.upsert({
      where: { paperId_source_key: { paperId, source_key: affiliation.source_key } },
      create: { paperId, ...data },
      update: data,
    })
  }
  if (item.authors === undefined) return
  const existing = await tx.paper_authors.findMany({
    where: { paperId },
    include: { author: true },
  })
  const used = new Set<number>()
  const plan = item.authors.map((input) => {
    let candidates = existing.filter((row) =>
      input.author_id
        ? row.authorId === input.author_id
        : input.source_key && row.source_key === input.source_key,
    )
    if (input.author_id && !candidates.length) {
      throw new BibliographyConflict(
        'authorship_conflict',
        'authors',
        'An author ID must identify an existing authorship of this paper',
      )
    }
    if (!candidates.length) {
      // This matches an occurrence within one paper, never a person across papers.
      candidates = existing.filter(
        (row) =>
          normalizeBibliographicName(row.display_name ?? row.author.name) ===
          normalizeBibliographicName(input.name),
      )
      if (candidates.length > 1) candidates = candidates.filter((row) => row.order === input.order)
    }
    if (candidates.length > 1 || (candidates[0] && used.has(candidates[0].id))) {
      throw new BibliographyConflict(
        'authorship_conflict',
        'authors',
        'Author occurrences are ambiguous; supply existing author IDs or stable source keys',
      )
    }
    const row = candidates[0] ?? null
    if (row) {
      used.add(row.id)
      if (input.source_key && row.source_key && input.source_key !== row.source_key) {
        throw new BibliographyConflict(
          'authorship_conflict',
          'authors',
          'An authorship source key cannot be reassigned by import',
        )
      }
      if (
        input.source_key &&
        existing.some((other) => other.id !== row.id && other.source_key === input.source_key)
      ) {
        throw new BibliographyConflict(
          'authorship_conflict',
          'authors',
          'The source key belongs to a different author occurrence',
        )
      }
    }
    return { input, row }
  })
  if (existing.some((row) => !used.has(row.id))) {
    throw new BibliographyConflict(
      'authorship_conflict',
      'authors',
      'The author list would remove existing author occurrences or person bindings; reconcile it before importing',
    )
  }
  const affiliations = await tx.paper_affiliations.findMany({
    where: { paperId },
    select: { id: true, source_key: true },
  })
  const affiliationIds = new Map(affiliations.map((row) => [row.source_key, row.id]))
  for (const { input, row } of plan) {
    const now = new Date()
    const authorId =
      row?.authorId ??
      (
        await tx.authors.create({
          data: { name: input.name.trim(), createdAt: now, updatedAt: now },
        })
      ).id
    const data = {
      display_name: input.name.trim(),
      source_key: input.source_key,
      source: 'bibliography_import',
      order: input.order,
      order_verified: true,
      corresponding: input.corresponding,
      equal_contribution: input.equal_contribution,
      contributor_type: input.contributor_type,
      orcid: input.orcid,
    }
    const authorship = row
      ? await tx.paper_authors.update({ where: { id: row.id }, data })
      : await tx.paper_authors.create({ data: { paperId, authorId, ...data } })
    if (input.affiliation_keys !== undefined) {
      await tx.paper_author_affiliations.deleteMany({ where: { authorshipId: authorship.id } })
      for (const key of input.affiliation_keys) {
        const affiliationId = affiliationIds.get(key)
        if (!affiliationId)
          throw new BibliographyConflict(
            'unknown_affiliation',
            'authors',
            'Unknown affiliation key',
          )
        await tx.paper_author_affiliations.create({
          data: { paperId, authorshipId: authorship.id, affiliationId },
        })
      }
    }
  }
}
