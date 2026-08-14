import { Type, type Static } from 'typebox'

export const ForumPaperParamsSchema = Type.Object({
  paperId: Type.String({ format: 'uuid' }),
})

export const ForumPostParamsSchema = Type.Object({
  postId: Type.String({ format: 'uuid' }),
})

export const ForumListQuerySchema = Type.Object({
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50, default: 20 })),
  offset: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
})

export type ForumListQuery = Static<typeof ForumListQuerySchema>

export const CreatePostBodySchema = Type.Object({
  title: Type.String({ minLength: 1, maxLength: 200 }),
  content: Type.String({ minLength: 1 }),
})

export type CreatePostBody = Static<typeof CreatePostBodySchema>

export const CreateCommentBodySchema = Type.Object({
  content: Type.String({ minLength: 1 }),
  parentCommentId: Type.Optional(Type.String({ format: 'uuid' })),
})

export type CreateCommentBody = Static<typeof CreateCommentBodySchema>

export const PostResponseSchema = Type.Object({
  id: Type.String(),
  paperId: Type.String(),
  userId: Type.String(),
  title: Type.String(),
  content: Type.String(),
  like_count: Type.Integer(),
  comment_count: Type.Integer(),
  liked: Type.Boolean(),
  createdAt: Type.String(),
  updatedAt: Type.String(),
})

export const PostListResponseSchema = Type.Object({
  items: Type.Array(PostResponseSchema),
  total: Type.Integer(),
})

export const CommentResponseSchema = Type.Object({
  id: Type.String(),
  postId: Type.String(),
  userId: Type.String(),
  content: Type.String(),
  parentCommentId: Type.Union([Type.String(), Type.Null()]),
  createdAt: Type.String(),
})

export const CommentListResponseSchema = Type.Object({
  items: Type.Array(CommentResponseSchema),
  total: Type.Integer(),
})

export const LikeStatusSchema = Type.Object({
  liked: Type.Boolean(),
  like_count: Type.Integer(),
})
