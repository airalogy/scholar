import type { FastifyInstance } from 'fastify'
import { generalChatHandler } from './modes/general-chat'
import { scholarRecommendationHandler } from './modes/scholar-recommendation'
import type { AiGenerationInput, AiMode, AiModeHandler, AiStreamResult } from './types'

export const DEFAULT_AI_MODE: AiMode = 'general'

const modeHandlers: Record<AiMode, AiModeHandler> = {
  general: generalChatHandler,
  scholar_recommendation: scholarRecommendationHandler,
}

export const generateAiResponse = async (
  fastify: FastifyInstance,
  input: AiGenerationInput,
): Promise<string> => {
  return modeHandlers[input.mode].complete(fastify, input.messages)
}

export const streamAiResponse = async (
  fastify: FastifyInstance,
  input: AiGenerationInput,
): Promise<AiStreamResult> => {
  return modeHandlers[input.mode].stream(fastify, input.messages, input.signal)
}

export type { AiMessage, AiMode, AiStreamResult } from './types'
export { AI_MODES } from './types'
