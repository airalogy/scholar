import type { FastifyInstance } from 'fastify'
import type { BookmarkListQuery } from './schema'

export async function addBookmark(fastify: FastifyInstance, userId: string, paperId: string) {
  const paper = await fastify.prisma.papers.findUnique({ where: { id: paperId } })
  if (!paper) {
    throw fastify.httpErrors.notFound('Paper not found')
  }

  await fastify.prisma.user_bookmarks.upsert({
    where: { userId_paperId: { userId, paperId } },
    create: { userId, paperId, createdAt: new Date() },
    update: {},
  })

  return { bookmarked: true }
}

export async function removeBookmark(fastify: FastifyInstance, userId: string, paperId: string) {
  await fastify.prisma.user_bookmarks.deleteMany({ where: { userId, paperId } })
  return { bookmarked: false }
}

export async function getBookmarkStatus(fastify: FastifyInstance, userId: string, paperId: string) {
  const bookmark = await fastify.prisma.user_bookmarks.findUnique({
    where: { userId_paperId: { userId, paperId } },
  })
  return { bookmarked: !!bookmark }
}

export async function listBookmarks(
  fastify: FastifyInstance,
  userId: string,
  query: BookmarkListQuery,
) {
  const limit = query.limit ?? 20
  const offset = query.offset ?? 0

  const [bookmarks, total] = await Promise.all([
    fastify.prisma.user_bookmarks.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    fastify.prisma.user_bookmarks.count({ where: { userId } }),
  ])

  return { items: bookmarks, total }
}
