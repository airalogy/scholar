import { Type, type Static } from 'typebox'

export const AuthorSearchQuerySchema = Type.Object({
  q: Type.Optional(Type.String()),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
  offset: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
})

export type AuthorSearchQuery = Static<typeof AuthorSearchQuerySchema>

export const AuthorParamsSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
})

export type AuthorParams = Static<typeof AuthorParamsSchema>

export const AuthorResponseSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  email: Type.Union([Type.String(), Type.Null()]),
  paperCount: Type.Integer(),
})

export const AuthorListResponseSchema = Type.Object({
  items: Type.Array(AuthorResponseSchema),
  total: Type.Integer(),
})
