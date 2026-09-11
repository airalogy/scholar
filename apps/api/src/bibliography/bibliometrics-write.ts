import type { FastifyInstance } from 'fastify'
import { Prisma } from '../../prisma/generated/client'
import type {
  WithdrawInput,
  CreateInput,
  NoteInput,
  RankingInput,
  IndicatorInput,
  EditionOutput,
} from '../routes/v2/bibliometrics/schema'
import { isIsoDate, isSafeHttpUrl } from './normalize'
import { formatEdition, editionCounts } from './bibliometrics-read'

const note = (fastify: FastifyInstance, value: string): string => {
  if (!value.trim()) throw fastify.httpErrors.badRequest('A change note is required')
  return value.trim()
}
const editionResult = async (
  tx: Prisma.TransactionClient,
  id: string,
): Promise<{ code: 0; data: EditionOutput }> => ({
  code: 0,
  data: formatEdition(
    await tx.bibliometric_editions.findUniqueOrThrow({ where: { id }, include: editionCounts }),
  ),
})
const lockEdition = async (
  tx: Prisma.TransactionClient,
  fastify: FastifyInstance,
  id: string,
  expected: number,
) => {
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM bibliometric_editions WHERE id = ${id}::uuid FOR UPDATE`,
  )
  const edition = await tx.bibliometric_editions.findUnique({ where: { id } })
  if (!edition) throw fastify.httpErrors.notFound('Edition not found')
  if (edition.content_revision !== expected)
    throw fastify.httpErrors.conflict('Edition changed; reload before proceeding')
  return edition
}
export const createEdition = async (
  fastify: FastifyInstance,
  input: CreateInput,
  userId: string,
): Promise<{ code: 0; data: EditionOutput }> => {
  const notes = note(fastify, input.notes)
  if (
    !input.version.trim() ||
    !input.source.trim() ||
    (input.system === 'esi' && !input.observed_on) ||
    [input.released_on, input.observed_on].some((date) => date && !isIsoDate(date)) ||
    (input.source_url && !isSafeHttpUrl(input.source_url))
  )
    throw fastify.httpErrors.badRequest('Invalid edition metadata')
  const identity = {
    system: input.system,
    version: input.version.trim(),
    revision: input.revision ?? 1,
  }
  return fastify.prisma.$transaction(async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`edition-family:${identity.system}:${identity.version}`}, 0))::text`,
    )
    if (await tx.bibliometric_editions.findUnique({ where: { system_version_revision: identity } }))
      throw fastify.httpErrors.conflict('Edition already exists')
    const edition = await tx.bibliometric_editions.create({
      data: {
        ...identity,
        metric_year: input.metric_year,
        source: input.source.trim(),
        source_url: input.source_url,
        released_on: input.released_on ? new Date(`${input.released_on}T00:00:00Z`) : undefined,
        observed_on: input.observed_on ? new Date(`${input.observed_on}T00:00:00Z`) : undefined,
      },
    })
    await tx.bibliometric_edition_events.create({
      data: { editionId: edition.id, actorUserId: userId, action: 'created', notes },
    })
    return editionResult(tx, edition.id)
  })
}
export const changeRanking = async (
  fastify: FastifyInstance,
  id: string,
  input: RankingInput,
  userId: string,
): Promise<{ code: 0; data: EditionOutput }> => {
  const notes = note(fastify, input.notes)
  return fastify.prisma.$transaction(async (tx) => {
    const edition = await lockEdition(tx, fastify, id, input.expected_revision)
    if (edition.status !== 'draft')
      throw fastify.httpErrors.conflict('Published editions are immutable; create a revision')
    if (
      !input.category.trim() ||
      edition.system === 'esi' ||
      (edition.system === 'jcr' &&
        (input.category_level !== 'category' || !['jif', 'jci'].includes(input.metric))) ||
      (edition.system === 'cas' &&
        (input.category_level === 'category' || input.metric !== 'cas')) ||
      (edition.system === 'institution' && input.metric !== 'institution')
    )
      throw fastify.httpErrors.badRequest('Ranking does not match edition system')
    if (!(await tx.journals.findUnique({ where: { id: input.journal_id }, select: { id: true } })))
      throw fastify.httpErrors.notFound('Journal not found')
    const identity = {
      editionId: id,
      journalId: input.journal_id,
      category: input.category.trim(),
      category_level: input.category_level,
      metric: input.metric,
    }
    const before = await tx.journal_rankings.findUnique({
      where: { journalId_editionId_category_level_category_metric: identity },
    })
    const data = { quartile: input.quartile, is_top: input.is_top, source: edition.source }
    const after = await tx.journal_rankings.upsert({
      where: { journalId_editionId_category_level_category_metric: identity },
      create: { ...identity, ...data },
      update: data,
    })
    if (JSON.stringify(before) !== JSON.stringify(after))
      await tx.bibliometric_edition_events.create({
        data: {
          editionId: id,
          actorUserId: userId,
          action: 'ranking_updated',
          notes,
          changes: { before, after } as Prisma.InputJsonObject,
        },
      })
    return editionResult(tx, id)
  })
}
export const changeIndicator = async (
  fastify: FastifyInstance,
  id: string,
  input: IndicatorInput,
  userId: string,
): Promise<{ code: 0; data: EditionOutput }> => {
  const notes = note(fastify, input.notes)
  return fastify.prisma.$transaction(async (tx) => {
    const edition = await lockEdition(tx, fastify, id, input.expected_revision)
    if (edition.status !== 'draft')
      throw fastify.httpErrors.conflict('Published editions are immutable; create a revision')
    if (edition.system !== 'esi')
      throw fastify.httpErrors.badRequest('Paper indicators require ESI')
    if (!(await tx.papers.findUnique({ where: { id: input.paper_id }, select: { id: true } })))
      throw fastify.httpErrors.notFound('Paper not found')
    const identity = {
      editionId: id,
      paperId: input.paper_id,
      kind: input.kind,
      category: input.category.trim(),
    }
    const before = await tx.paper_indicators.findUnique({
      where: { paperId_editionId_kind_category: identity },
    })
    const data = { value: input.value, source: edition.source }
    const after = await tx.paper_indicators.upsert({
      where: { paperId_editionId_kind_category: identity },
      create: { ...identity, ...data },
      update: data,
    })
    if (JSON.stringify(before) !== JSON.stringify(after))
      await tx.bibliometric_edition_events.create({
        data: {
          editionId: id,
          actorUserId: userId,
          action: 'indicator_updated',
          notes,
          changes: { before, after } as Prisma.InputJsonObject,
        },
      })
    return editionResult(tx, id)
  })
}
export const publishEdition = async (
  fastify: FastifyInstance,
  id: string,
  input: NoteInput,
  userId: string,
): Promise<{ code: 0; data: EditionOutput }> => {
  const notes = note(fastify, input.notes)
  return fastify.prisma.$transaction(async (tx) => {
    const edition = await lockEdition(tx, fastify, id, input.expected_revision)
    if (edition.status === 'published') return editionResult(tx, id)
    const count =
      (await tx.journal_rankings.count({ where: { editionId: id } })) +
      (await tx.paper_indicators.count({ where: { editionId: id } }))
    if (!count) throw fastify.httpErrors.conflict('An empty edition cannot be published')
    await tx.bibliometric_editions.update({
      where: { id },
      data: { status: 'published', publishedAt: new Date() },
    })
    await tx.bibliometric_edition_events.create({
      data: { editionId: id, actorUserId: userId, action: 'published', notes },
    })
    return editionResult(tx, id)
  })
}
export const reviseEdition = async (
  fastify: FastifyInstance,
  id: string,
  input: NoteInput,
  userId: string,
): Promise<{ code: 0; data: EditionOutput }> => {
  const notes = note(fastify, input.notes)
  return fastify.prisma.$transaction(
    async (tx) => {
      const identity = await tx.bibliometric_editions.findUnique({ where: { id } })
      if (!identity) throw fastify.httpErrors.notFound('Edition not found')
      await tx.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`edition-family:${identity.system}:${identity.version}`}, 0))::text`,
      )
      const original = await lockEdition(tx, fastify, id, input.expected_revision)
      if (original.status !== 'published')
        throw fastify.httpErrors.conflict('Edit the existing draft before creating a revision')
      const latest = await tx.bibliometric_editions.aggregate({
        where: { system: original.system, version: original.version },
        _max: { revision: true },
      })
      const revision = (latest._max.revision ?? 0) + 1
      if (revision > 1000) throw fastify.httpErrors.conflict('Edition revision limit reached')
      const copy = await tx.bibliometric_editions.create({
        data: {
          system: original.system,
          version: original.version,
          revision,
          metric_year: original.metric_year,
          source: original.source,
          source_url: original.source_url,
          released_on: original.released_on,
          observed_on: original.observed_on,
        },
      })
      await tx.$executeRaw(Prisma.sql`INSERT INTO journal_rankings ("journalId", "editionId", category_level, category, metric, quartile, is_top, source)
      SELECT "journalId", ${copy.id}::uuid, category_level, category, metric, quartile, is_top, source FROM journal_rankings WHERE "editionId" = ${id}::uuid`)
      await tx.$executeRaw(Prisma.sql`INSERT INTO paper_indicators ("paperId", "editionId", kind, category, value, source)
      SELECT "paperId", ${copy.id}::uuid, kind, category, value, source FROM paper_indicators WHERE "editionId" = ${id}::uuid`)
      await tx.bibliometric_edition_events.create({
        data: {
          editionId: copy.id,
          actorUserId: userId,
          action: 'revised',
          notes,
          changes: { based_on: id },
        },
      })
      return editionResult(tx, copy.id)
    },
    { timeout: 60000 },
  )
}

export const withdrawObservation = async (
  fastify: FastifyInstance,
  id: string,
  input: WithdrawInput,
  userId: string,
): Promise<{ code: 0; data: EditionOutput }> => {
  const notes = note(fastify, input.notes)
  return fastify.prisma.$transaction(async (tx) => {
    const edition = await lockEdition(tx, fastify, id, input.expected_revision)
    if (edition.status !== 'draft')
      throw fastify.httpErrors.conflict(
        'Published observations cannot be withdrawn; create a revision',
      )
    const where = { id: input.observation_id, editionId: id }
    const row =
      input.observation_type === 'ranking'
        ? await tx.journal_rankings.findFirst({ where })
        : await tx.paper_indicators.findFirst({ where })
    if (!row) throw fastify.httpErrors.notFound('Observation not found in this edition')
    if (input.observation_type === 'ranking')
      await tx.journal_rankings.delete({ where: { id: row.id } })
    else await tx.paper_indicators.delete({ where: { id: row.id } })
    await tx.bibliometric_edition_events.create({
      data: {
        editionId: id,
        actorUserId: userId,
        action: 'withdrawn',
        notes,
        changes: { type: input.observation_type, before: row } as Prisma.InputJsonObject,
      },
    })
    return editionResult(tx, id)
  })
}
