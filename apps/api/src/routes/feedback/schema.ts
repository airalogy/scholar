import { Type, type Static } from 'typebox'

export const FeedbackTypeSchema = Type.Union([
  Type.Literal('bug_report'),
  Type.Literal('feature_request'),
])

export type FeedbackType = Static<typeof FeedbackTypeSchema>

export const FeedbackStatusSchema = Type.Union([Type.Literal('pending'), Type.Literal('processed')])

export type FeedbackStatus = Static<typeof FeedbackStatusSchema>

export const SubmitFeedbackBodySchema = Type.Object({
  title: Type.String({ minLength: 1, maxLength: 200 }),
  type: FeedbackTypeSchema,
  content: Type.String({ minLength: 1, maxLength: 5000 }),
  email: Type.Optional(Type.String({ format: 'email', maxLength: 100 })),
})

export type SubmitFeedbackBody = Static<typeof SubmitFeedbackBodySchema>

export const FeedbackListQuerySchema = Type.Object({
  status: Type.Optional(FeedbackStatusSchema),
  type: Type.Optional(FeedbackTypeSchema),
  q: Type.Optional(Type.String({ maxLength: 200 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
  offset: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
})

export type FeedbackListQuery = Static<typeof FeedbackListQuerySchema>

export const FeedbackParamsSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
})

export type FeedbackParams = Static<typeof FeedbackParamsSchema>

export const UpdateFeedbackStatusBodySchema = Type.Object({
  status: FeedbackStatusSchema,
})

export type UpdateFeedbackStatusBody = Static<typeof UpdateFeedbackStatusBodySchema>

export const FeedbackItemSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  userId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  userName: Type.Union([Type.String(), Type.Null()]),
  userEmail: Type.Union([Type.String(), Type.Null()]),
  email: Type.Union([Type.String(), Type.Null()]),
  title: Type.String(),
  type: FeedbackTypeSchema,
  content: Type.String(),
  status: FeedbackStatusSchema,
  handledBy: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  handledByName: Type.Union([Type.String(), Type.Null()]),
  handledAt: Type.Union([Type.String(), Type.Null()]),
  createdAt: Type.String(),
  updatedAt: Type.String(),
})

export const FeedbackStatusTotalsSchema = Type.Object({
  pending: Type.Integer(),
  processed: Type.Integer(),
})

export const FeedbackSubmitResponseSchema = Type.Object({
  code: Type.Literal(0),
  data: FeedbackItemSchema,
  message: Type.String(),
})

export const FeedbackListResponseSchema = Type.Object({
  code: Type.Literal(0),
  data: Type.Object({
    items: Type.Array(FeedbackItemSchema),
    total: Type.Integer(),
    statusTotals: FeedbackStatusTotalsSchema,
  }),
})

export const FeedbackStatusUpdateResponseSchema = Type.Object({
  code: Type.Literal(0),
  data: FeedbackItemSchema,
  message: Type.String(),
})
