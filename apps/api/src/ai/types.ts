import type { FastifyInstance } from 'fastify'
import type { ChatCompletionChunk } from 'openai/resources/chat/completions'

export const AI_MODES = ['general', 'scholar_recommendation'] as const

export type AiMode = (typeof AI_MODES)[number]

export type AiMessageRole = 'user' | 'assistant' | 'system'

export interface AiMessage {
  role: AiMessageRole
  content: string
}

export interface AiGenerationInput {
  mode: AiMode
  messages: AiMessage[]
  signal?: AbortSignal
}

export interface AiStreamResult {
  directContent: string | null
  stream: AsyncIterable<ChatCompletionChunk> | null
}

export interface AiModeHandler {
  complete: (fastify: FastifyInstance, messages: AiMessage[]) => Promise<string>
  stream: (
    fastify: FastifyInstance,
    messages: AiMessage[],
    signal?: AbortSignal,
  ) => Promise<AiStreamResult>
}
