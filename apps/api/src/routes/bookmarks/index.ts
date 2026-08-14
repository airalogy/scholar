import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { Type } from 'typebox'
import { BookmarkParamsSchema, BookmarkStatusSchema, BookmarkListQuerySchema } from './schema'
import { addBookmark, removeBookmark, getBookmarkStatus, listBookmarks } from './service'

const bookmarkRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  // 获取收藏列表（包含 paperId）
  fastify.get(
    '/',
    {
      schema: {
        tags: ['bookmarks'],
        querystring: BookmarkListQuerySchema,
        response: {
          200: Type.Object({
            items: Type.Array(
              Type.Object({
                id: Type.String(),
                paperId: Type.String(),
                createdAt: Type.String(),
              }),
            ),
            total: Type.Integer(),
          }),
        },
      },
    },
    async (request) => {
      const result = await listBookmarks(fastify, request.user.userId, request.query)
      return {
        items: result.items.map((b) => ({
          id: b.id,
          paperId: b.paperId,
          createdAt: b.createdAt.toISOString(),
        })),
        total: result.total,
      }
    },
  )

  // 检查某篇论文是否已收藏
  fastify.get(
    '/:paperId',
    {
      schema: {
        tags: ['bookmarks'],
        params: BookmarkParamsSchema,
        response: { 200: BookmarkStatusSchema },
      },
    },
    async (request) => {
      return getBookmarkStatus(fastify, request.user.userId, request.params.paperId)
    },
  )

  // 收藏论文
  fastify.post(
    '/:paperId',
    {
      schema: {
        tags: ['bookmarks'],
        params: BookmarkParamsSchema,
        response: { 200: BookmarkStatusSchema },
      },
    },
    async (request) => {
      return addBookmark(fastify, request.user.userId, request.params.paperId)
    },
  )

  // 取消收藏
  fastify.delete(
    '/:paperId',
    {
      schema: {
        tags: ['bookmarks'],
        params: BookmarkParamsSchema,
        response: { 200: BookmarkStatusSchema },
      },
    },
    async (request) => {
      return removeBookmark(fastify, request.user.userId, request.params.paperId)
    },
  )
}

export default bookmarkRoutes
