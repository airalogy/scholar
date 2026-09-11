import { Prisma } from '../../prisma/generated/client'
import type { NormalizedPaperMetadata } from './normalize'
import { normalizeBibliographicName } from './normalize'
import type { EditionInput } from './schema'
import { BibliographyConflict } from './identity'

export const resolveBibliographyJournal = async (
  tx: Prisma.TransactionClient,
  input: NonNullable<NormalizedPaperMetadata['journal']>,
): Promise<string | null> => {
  const identifiers = input.identifiers ?? []
  for (const key of identifiers.map((id) => `journal:${id.value}`).sort()) {
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`)
  }
  // ISSN and electronic ISSN are labels for the same ISSN namespace.
  const matches = identifiers.length
    ? await tx.journal_identifiers.findMany({
        where: { value: { in: identifiers.map((id) => id.value) } },
        select: { journalId: true },
      })
    : []
  const ids = new Set(matches.map((row) => row.journalId))
  if (input.id) {
    if (!(await tx.journals.findUnique({ where: { id: input.id }, select: { id: true } }))) {
      throw new BibliographyConflict(
        'journal_not_found',
        'journal.id',
        'The journal ID does not exist',
      )
    }
    ids.add(input.id)
  }
  if (ids.size > 1)
    throw new BibliographyConflict(
      'journal_identifier_conflict',
      'journal.identifiers',
      'Journal identifiers resolve to different journals',
    )
  // Names alone are not sufficiently reliable to merge journals.
  if (!ids.size && !identifiers.length) return null
  const id = [...ids][0] ?? (await tx.journals.create({ data: { name: input.name.trim() } })).id
  for (const identifier of identifiers) {
    await tx.journal_identifiers.upsert({
      where: { scheme_value: identifier },
      create: { journalId: id, ...identifier },
      update: {},
    })
  }
  const normalizedName = normalizeBibliographicName(input.name)
  await tx.journal_names.upsert({
    where: { journalId_normalized_name: { journalId: id, normalized_name: normalizedName } },
    create: { journalId: id, normalized_name: normalizedName, name: input.name.trim() },
    update: {},
  })
  return id
}

const isoDate = (value: string | undefined): Date | null =>
  value ? new Date(`${value}T00:00:00Z`) : null

const resolveEdition = async (
  tx: Prisma.TransactionClient,
  input: EditionInput,
): Promise<{ id: string; status: string }> => {
  const identity = { system: input.system, version: input.version, revision: input.revision ?? 1 }
  await tx.$queryRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`edition-family:${identity.system}:${identity.version}`}, 0))::text`,
  )
  const key = `edition:${identity.system}:${identity.version}:${identity.revision}`
  await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`)
  const existing = await tx.bibliometric_editions.findUnique({
    where: { system_version_revision: identity },
  })
  const data = {
    metric_year: input.metric_year ?? null,
    released_on: isoDate(input.released_on),
    observed_on: isoDate(input.observed_on),
    source: input.source,
    source_url: input.source_url ?? null,
  }
  if (existing) {
    for (const field of [
      'metric_year',
      'released_on',
      'observed_on',
      'source',
      'source_url',
    ] as const) {
      const expected = data[field] instanceof Date ? data[field].toISOString() : data[field]
      const stored =
        existing[field] instanceof Date ? existing[field].toISOString() : existing[field]
      if (expected !== stored)
        throw new BibliographyConflict(
          'edition_conflict',
          'edition',
          'Edition identity has different source or date metadata; use an explicit new revision',
        )
    }
    return existing
  }
  return tx.bibliometric_editions.create({ data: { ...identity, ...data } })
}

export const writeBibliometricObservations = async (
  tx: Prisma.TransactionClient,
  paperId: string,
  journalId: string | null,
  item: NormalizedPaperMetadata,
): Promise<void> => {
  if (item.rankings?.length && !journalId)
    throw new BibliographyConflict(
      'journal_identity_required',
      'rankings',
      'Journal rankings require a journal ID or verified ISSN',
    )
  // Stable ordering also avoids two papers deadlocking on multiple editions.
  const editions = [...(item.rankings ?? []), ...(item.indicators ?? [])].map((row) => row.edition)
  const resolved = new Map<string, { id: string; status: string }>()
  const keyOf = (input: EditionInput): string =>
    `${input.system}:${input.version}:${input.revision ?? 1}`
  for (const input of editions.sort((a, b) => keyOf(a).localeCompare(keyOf(b)))) {
    resolved.set(keyOf(input), await resolveEdition(tx, input))
  }
  for (const ranking of item.rankings ?? []) {
    const edition = resolved.get(keyOf(ranking.edition))!
    const identity = {
      journalId: journalId!,
      editionId: edition.id,
      category_level: ranking.category_level,
      category: ranking.category,
      metric: ranking.metric,
    }
    const existing = await tx.journal_rankings.findUnique({
      where: { journalId_editionId_category_level_category_metric: identity },
    })
    const data = {
      quartile: ranking.quartile ?? existing?.quartile ?? null,
      is_top: ranking.is_top ?? existing?.is_top ?? null,
      source: ranking.edition.source,
    }
    if (existing) {
      if (
        existing.quartile !== data.quartile ||
        existing.is_top !== data.is_top ||
        existing.source !== data.source
      ) {
        throw new BibliographyConflict(
          'ranking_conflict',
          'rankings',
          'This edition already contains a different ranking; resolve it in journal administration',
        )
      }
    } else {
      if (edition.status !== 'draft')
        throw new BibliographyConflict(
          'edition_immutable',
          'rankings',
          'Published editions cannot be extended; create a new revision',
        )
      await tx.journal_rankings.create({ data: { ...identity, ...data } })
    }
  }
  for (const indicator of item.indicators ?? []) {
    const edition = resolved.get(keyOf(indicator.edition))!
    const identity = {
      paperId,
      editionId: edition.id,
      kind: indicator.kind,
      category: indicator.category ?? '',
    }
    const existing = await tx.paper_indicators.findUnique({
      where: { paperId_editionId_kind_category: identity },
    })
    if (existing) {
      if (existing.value !== indicator.value)
        throw new BibliographyConflict(
          'indicator_conflict',
          'indicators',
          'This edition already contains a different paper indicator',
        )
    } else {
      if (edition.status !== 'draft')
        throw new BibliographyConflict(
          'edition_immutable',
          'indicators',
          'Published editions cannot be extended; create a new revision',
        )
      await tx.paper_indicators.create({
        data: { ...identity, value: indicator.value, source: indicator.edition.source },
      })
    }
  }
}
