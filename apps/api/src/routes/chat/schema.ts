import { Type, type Static } from 'typebox'
import { AI_MODES, type AiMode } from '../../ai/types'

export const ChatMessageSchema = Type.Object({
  role: Type.Union([Type.Literal('user'), Type.Literal('assistant'), Type.Literal('system')]),
  content: Type.String(),
})

export type ChatMessage = Static<typeof ChatMessageSchema>

export const ChatModeSchema = Type.Unsafe<AiMode>({
  type: 'string',
  enum: [...AI_MODES],
})

export type ChatMode = AiMode

export const ChatBodySchema = Type.Object({
  id: Type.Optional(Type.String({ format: 'uuid' })),
  messages: Type.Array(ChatMessageSchema, { minItems: 1 }),
  mode: Type.Optional(ChatModeSchema),
  stream: Type.Optional(Type.Boolean({ default: false })),
})

export type ChatBody = Static<typeof ChatBodySchema>

export const ChatResponseSchema = Type.Object({
  id: Type.String(),
  role: Type.Literal('assistant'),
  content: Type.String(),
})

export const ChatListQuerySchema = Type.Object({
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
  offset: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
  mode: Type.Optional(ChatModeSchema),
})

export type ChatListQuery = Static<typeof ChatListQuerySchema>

export const ChatListItemSchema = Type.Object({
  id: Type.String(),
  mode: ChatModeSchema,
  title: Type.String(),
  createdAt: Type.String(),
  updatedAt: Type.String(),
})

export const ChatListResponseSchema = Type.Object({
  items: Type.Array(ChatListItemSchema),
  total: Type.Integer(),
})

export const ChatParamsSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
})

export type ChatParams = Static<typeof ChatParamsSchema>

export const ChatDetailResponseSchema = Type.Object({
  id: Type.String(),
  mode: ChatModeSchema,
  messages: Type.Array(ChatMessageSchema),
  createdAt: Type.String(),
  updatedAt: Type.String(),
})
