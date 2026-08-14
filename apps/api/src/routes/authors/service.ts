import type { FastifyInstance } from 'fastify'
import type { AuthorSearchQuery } from './schema'

export async function searchAuthors(
  fastify: FastifyInstance,
  query: AuthorSearchQuery,
  includeEmail = true,
) {
  const limit = query.limit ?? 20
  const offset = query.offset ?? 0
  const q = query.q?.trim()

  const where = q ? { name: { contains: q } } : {}

  const [authors, total] = await Promise.all([
    fastify.prisma.authors.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: { name: 'asc' },
    }),
    fastify.prisma.authors.count({ where }),
  ])

  const authorIds = authors.map((a) => a.id)
  const counts: { authorId: string; count: bigint }[] =
    authorIds.length > 0
      ? await fastify.prisma.$queryRawUnsafe(
          `SELECT "authorId", COUNT(*) as count
           FROM paper_authors
           WHERE "authorId" = ANY($1::uuid[])
           GROUP BY "authorId"`,
          authorIds,
        )
      : []
  const countMap = new Map(counts.map((c) => [c.authorId, Number(c.count)]))

  return {
    items: authors.map((a) => ({
      id: a.id,
      name: a.name,
      email: includeEmail ? (a.email ?? null) : null,
      paperCount: countMap.get(a.id) ?? 0,
    })),
    total,
  }
}

export async function getAuthor(fastify: FastifyInstance, id: string, includeEmail = true) {
  const author = await fastify.prisma.authors.findUnique({ where: { id } })
  if (!author) {
    throw fastify.httpErrors.notFound('Author not found')
  }

  const count: { count: bigint }[] = await fastify.prisma.$queryRawUnsafe(
    `SELECT COUNT(*) as count FROM paper_authors WHERE "authorId" = $1::uuid`,
    id,
  )

  return {
    id: author.id,
    name: author.name,
    email: includeEmail ? (author.email ?? null) : null,
    paperCount: Number(count[0]?.count ?? 0),
  }
}
