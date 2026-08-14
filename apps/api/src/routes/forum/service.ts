import type { FastifyInstance } from 'fastify'
import type { forum_posts as ForumPostRecord } from '../../../prisma/generated/client'
import type { CreatePostBody, CreateCommentBody, ForumListQuery } from './schema'

async function formatPost(fastify: FastifyInstance, post: ForumPostRecord, userId: string) {
  const like = await fastify.prisma.forum_likes.findUnique({
    where: { postId_userId: { postId: post.id, userId } },
  })
  return {
    id: post.id,
    paperId: post.paperId,
    userId: post.userId,
    title: post.title,
    content: post.content,
    like_count: post.like_count,
    comment_count: post.comment_count,
    liked: !!like,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  }
}

export async function listPosts(
  fastify: FastifyInstance,
  paperId: string,
  query: ForumListQuery,
  userId: string,
) {
  const limit = query.limit ?? 20
  const offset = query.offset ?? 0

  const [posts, total] = await Promise.all([
    fastify.prisma.forum_posts.findMany({
      where: { paperId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    fastify.prisma.forum_posts.count({ where: { paperId } }),
  ])

  return {
    items: await Promise.all(posts.map((p) => formatPost(fastify, p, userId))),
    total,
  }
}

export async function createPost(
  fastify: FastifyInstance,
  paperId: string,
  body: CreatePostBody,
  userId: string,
) {
  const paper = await fastify.prisma.papers.findUnique({ where: { id: paperId } })
  if (!paper) throw fastify.httpErrors.notFound('Paper not found')

  const now = new Date()
  const post = await fastify.prisma.forum_posts.create({
    data: {
      paperId,
      userId,
      title: body.title,
      content: body.content,
      like_count: 0,
      comment_count: 0,
      createdAt: now,
      updatedAt: now,
    },
  })
  return formatPost(fastify, post, userId)
}

export async function getPost(fastify: FastifyInstance, postId: string, userId: string) {
  const post = await fastify.prisma.forum_posts.findUnique({ where: { id: postId } })
  if (!post) throw fastify.httpErrors.notFound('Post not found')
  return formatPost(fastify, post, userId)
}

export async function deletePost(fastify: FastifyInstance, postId: string, userId: string) {
  const post = await fastify.prisma.forum_posts.findUnique({ where: { id: postId } })
  if (!post) throw fastify.httpErrors.notFound('Post not found')
  if (post.userId !== userId) throw fastify.httpErrors.forbidden('Not authorized')

  await fastify.prisma.forum_comments.deleteMany({ where: { postId } })
  await fastify.prisma.forum_likes.deleteMany({ where: { postId } })
  await fastify.prisma.forum_posts.delete({ where: { id: postId } })
  return { message: 'Post deleted' }
}

export async function toggleLike(fastify: FastifyInstance, postId: string, userId: string) {
  const post = await fastify.prisma.forum_posts.findUnique({ where: { id: postId } })
  if (!post) throw fastify.httpErrors.notFound('Post not found')

  const existing = await fastify.prisma.forum_likes.findUnique({
    where: { postId_userId: { postId, userId } },
  })

  if (existing) {
    await fastify.prisma.forum_likes.delete({ where: { postId_userId: { postId, userId } } })
    const updated = await fastify.prisma.forum_posts.update({
      where: { id: postId },
      data: { like_count: { decrement: 1 } },
    })
    return { liked: false, like_count: updated.like_count }
  } else {
    await fastify.prisma.forum_likes.create({
      data: { postId, userId, createdAt: new Date() },
    })
    const updated = await fastify.prisma.forum_posts.update({
      where: { id: postId },
      data: { like_count: { increment: 1 } },
    })
    return { liked: true, like_count: updated.like_count }
  }
}

export async function listComments(
  fastify: FastifyInstance,
  postId: string,
  query: ForumListQuery,
) {
  const limit = query.limit ?? 20
  const offset = query.offset ?? 0

  const [comments, total] = await Promise.all([
    fastify.prisma.forum_comments.findMany({
      where: { postId },
      orderBy: { createdAt: 'asc' },
      take: limit,
      skip: offset,
    }),
    fastify.prisma.forum_comments.count({ where: { postId } }),
  ])

  return {
    items: comments.map((c) => ({
      id: c.id,
      postId: c.postId,
      userId: c.userId,
      content: c.content,
      parentCommentId: c.parentCommentId ?? null,
      createdAt: c.createdAt.toISOString(),
    })),
    total,
  }
}

export async function createComment(
  fastify: FastifyInstance,
  postId: string,
  body: CreateCommentBody,
  userId: string,
) {
  const post = await fastify.prisma.forum_posts.findUnique({ where: { id: postId } })
  if (!post) throw fastify.httpErrors.notFound('Post not found')

  const comment = await fastify.prisma.forum_comments.create({
    data: {
      postId,
      userId,
      content: body.content,
      parentCommentId: body.parentCommentId ?? null,
      createdAt: new Date(),
    },
  })

  await fastify.prisma.forum_posts.update({
    where: { id: postId },
    data: { comment_count: { increment: 1 } },
  })

  return {
    id: comment.id,
    postId: comment.postId,
    userId: comment.userId,
    content: comment.content,
    parentCommentId: comment.parentCommentId ?? null,
    createdAt: comment.createdAt.toISOString(),
  }
}
