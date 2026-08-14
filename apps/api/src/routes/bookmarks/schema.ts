import { Type, type Static } from 'typebox'

export const BookmarkParamsSchema = Type.Object({
  paperId: Type.String({ format: 'uuid' }),
})

export type BookmarkParams = Static<typeof BookmarkParamsSchema>

export const BookmarkStatusSchema = Type.Object({
  bookmarked: Type.Boolean(),
})

export const BookmarkListQuerySchema = Type.Object({
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
  offset: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
})

export type BookmarkListQuery = Static<typeof BookmarkListQuerySchema>
