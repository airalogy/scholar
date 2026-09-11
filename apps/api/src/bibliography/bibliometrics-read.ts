import type { FastifyInstance } from 'fastify'
import type { Prisma, bibliometric_editions } from '../../prisma/generated/client'
import type { EditionFilter, EditionOutput, PageInput } from '../routes/v2/bibliometrics/schema'

type WithCounts = bibliometric_editions & { _count: { rankings: number; indicators: number } }
export const editionCounts = { _count: { select: { rankings: true, indicators: true } } } as const
export const formatEdition = (edition: WithCounts): EditionOutput => ({
  ...edition,
  released_on: edition.released_on?.toISOString().slice(0, 10) ?? null,
  observed_on: edition.observed_on?.toISOString().slice(0, 10) ?? null,
  createdAt: edition.createdAt.toISOString(),
  publishedAt: edition.publishedAt?.toISOString() ?? null,
  ranking_count: edition._count.rankings,
  indicator_count: edition._count.indicators,
})
export const listEditions = async (fastify: FastifyInstance, query: EditionFilter) => {
  const where: Prisma.bibliometric_editionsWhereInput = {
    system: query.system,
    status: query.status,
    ...(query.q?.trim()
      ? {
          OR: [
            { version: { contains: query.q.trim(), mode: 'insensitive' } },
            { source: { contains: query.q.trim(), mode: 'insensitive' } },
          ],
        }
      : {}),
  }
  const [items, total] = await fastify.prisma.$transaction([
    fastify.prisma.bibliometric_editions.findMany({
      where,
      take: query.limit ?? 20,
      skip: query.offset ?? 0,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: editionCounts,
    }),
    fastify.prisma.bibliometric_editions.count({ where }),
  ])
  return { code: 0 as const, data: { items: items.map(formatEdition), total } }
}
export const listJournals = async (fastify: FastifyInstance, query: PageInput) => {
  const q = query.q?.trim()
  const where: Prisma.journalsWhereInput = q
    ? {
        OR: [
          { name: { contains: q, mode: 'insensitive' as const } },
          { names: { some: { name: { contains: q, mode: 'insensitive' as const } } } },
          {
            identifiers: {
              some: {
                value: { contains: q.replace(/[^0-9x-]/giu, ''), mode: 'insensitive' as const },
              },
            },
          },
        ].filter((_, index) => index !== 2 || /[0-9]/u.test(q)),
      }
    : {}
  const [items, total] = await fastify.prisma.$transaction([
    fastify.prisma.journals.findMany({
      where,
      take: query.limit ?? 20,
      skip: query.offset ?? 0,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      include: {
        identifiers: { select: { scheme: true, value: true }, orderBy: { value: 'asc' } },
      },
    }),
    fastify.prisma.journals.count({ where }),
  ])
  return { code: 0 as const, data: { items, total } }
}
export const getEditionDetail = async (fastify: FastifyInstance, id: string, query: PageInput) => {
  const edition = await fastify.prisma.bibliometric_editions.findUnique({
    where: { id },
    include: editionCounts,
  })
  if (!edition) throw fastify.httpErrors.notFound('Edition not found')
  const page = { take: query.limit ?? 20, skip: query.offset ?? 0 }
  const [rankings, indicators, events] = await fastify.prisma.$transaction([
    fastify.prisma.journal_rankings.findMany({
      where: { editionId: id },
      ...page,
      orderBy: [{ journalId: 'asc' }, { category: 'asc' }, { id: 'asc' }],
      include: { journal: { select: { name: true } } },
    }),
    fastify.prisma.paper_indicators.findMany({
      where: { editionId: id },
      ...page,
      orderBy: [{ paperId: 'asc' }, { kind: 'asc' }, { id: 'asc' }],
      include: { paper: { select: { title: true } } },
    }),
    fastify.prisma.bibliometric_edition_events.findMany({
      where: { editionId: id },
      take: 50,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { actor: { select: { name: true } } },
    }),
  ])
  return {
    code: 0 as const,
    data: {
      edition: formatEdition(edition),
      rankings: rankings.map((row) => ({ ...row, journal_name: row.journal.name })),
      indicators: indicators.map((row) => ({ ...row, paper_title: row.paper.title })),
      events: events.map((row) => ({
        id: row.id,
        action: row.action,
        notes: row.notes,
        actor_name: row.actor?.name ?? null,
        created_at: row.createdAt.toISOString(),
      })),
    },
  }
}
