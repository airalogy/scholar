import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import {
  ForumPaperParamsSchema,
  ForumPostParamsSchema,
  ForumListQuerySchema,
  CreatePostBodySchema,
  CreateCommentBodySchema,
  PostResponseSchema,
  PostListResponseSchema,
  CommentResponseSchema,
  CommentListResponseSchema,
  LikeStatusSchema,
} from './schema'
import {
  listPosts,
  createPost,
  getPost,
  deletePost,
  toggleLike,
  listComments,
  createComment,
} from './service'
import { Type } from 'typebox'
import { assertFeatureEnabled } from '../../utils/deployment'

const forumRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.addHook('onRequest', async () => {
    assertFeatureEnabled(fastify, 'forum', 'Forum is not available in this deployment')
  })

  // 论文的讨论帖列表
  fastify.get(
    '/papers/:paperId/posts',
    {
      schema: {
        tags: ['forum'],
        params: ForumPaperParamsSchema,
        querystring: ForumListQuerySchema,
        response: { 200: PostListResponseSchema },
      },
    },
    async (request) =>
      listPosts(fastify, request.params.paperId, request.query, request.user.userId),
  )

  // 发表讨论帖
  fastify.post(
    '/papers/:paperId/posts',
    {
      schema: {
        tags: ['forum'],
        params: ForumPaperParamsSchema,
        body: CreatePostBodySchema,
        response: { 200: PostResponseSchema },
      },
    },
    async (request) =>
      createPost(fastify, request.params.paperId, request.body, request.user.userId),
  )

  // 获取单个帖子
  fastify.get(
    '/posts/:postId',
    {
      schema: {
        tags: ['forum'],
        params: ForumPostParamsSchema,
        response: { 200: PostResponseSchema },
      },
    },
    async (request) => getPost(fastify, request.params.postId, request.user.userId),
  )

  // 删除帖子
  fastify.delete(
    '/posts/:postId',
    {
      schema: {
        tags: ['forum'],
        params: ForumPostParamsSchema,
        response: { 200: Type.Object({ message: Type.String() }) },
      },
    },
    async (request) => deletePost(fastify, request.params.postId, request.user.userId),
  )

  // 点赞/取消点赞
  fastify.post(
    '/posts/:postId/like',
    {
      schema: {
        tags: ['forum'],
        params: ForumPostParamsSchema,
        response: { 200: LikeStatusSchema },
      },
    },
    async (request) => toggleLike(fastify, request.params.postId, request.user.userId),
  )

  // 评论列表
  fastify.get(
    '/posts/:postId/comments',
    {
      schema: {
        tags: ['forum'],
        params: ForumPostParamsSchema,
        querystring: ForumListQuerySchema,
        response: { 200: CommentListResponseSchema },
      },
    },
    async (request) => listComments(fastify, request.params.postId, request.query),
  )

  // 发表评论
  fastify.post(
    '/posts/:postId/comments',
    {
      schema: {
        tags: ['forum'],
        params: ForumPostParamsSchema,
        body: CreateCommentBodySchema,
        response: { 200: CommentResponseSchema },
      },
    },
    async (request) =>
      createComment(fastify, request.params.postId, request.body, request.user.userId),
  )
}

export default forumRoutes
