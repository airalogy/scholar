import type { FastifyInstance } from 'fastify'
import OpenAI from 'openai'

const DEFAULT_EMBEDDING_MODEL = 'text-embedding-v4'

export interface AiRuntime {
  client: OpenAI
  chatModel: string
  timelineModel: string
  embeddingModel: string
}

interface AiRuntimeConfig {
  baseURL: string
  apiKey: string
  chatModel: string
  timelineModel: string
  embeddingModel: string
}

const appRuntimes = new WeakMap<FastifyInstance, AiRuntime>()
let environmentRuntime: AiRuntime | null = null

const createAiRuntime = (config: AiRuntimeConfig): AiRuntime => {
  if (!config.baseURL) {
    throw new Error('OPENAI_BASE_URL environment variable is required')
  }

  if (!config.apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required')
  }

  return {
    client: new OpenAI({
      baseURL: config.baseURL,
      apiKey: config.apiKey,
    }),
    chatModel: config.chatModel,
    timelineModel: config.timelineModel || config.chatModel,
    embeddingModel: config.embeddingModel,
  }
}

export const getAiRuntime = (fastify: FastifyInstance): AiRuntime => {
  const existingRuntime = appRuntimes.get(fastify)
  if (existingRuntime) {
    return existingRuntime
  }

  const runtime = createAiRuntime({
    baseURL: fastify.config.OPENAI_BASE_URL,
    apiKey: fastify.config.OPENAI_API_KEY,
    chatModel: fastify.config.CHAT_MODEL,
    timelineModel: fastify.config.TIMELINE_MODEL,
    embeddingModel: fastify.config.OPENAI_EMBEDDING_MODEL,
  })
  appRuntimes.set(fastify, runtime)
  return runtime
}

export const getEnvironmentAiRuntime = (): AiRuntime => {
  if (environmentRuntime) {
    return environmentRuntime
  }

  environmentRuntime = createAiRuntime({
    baseURL: process.env.OPENAI_BASE_URL ?? '',
    apiKey: process.env.OPENAI_API_KEY ?? '',
    chatModel: process.env.CHAT_MODEL ?? '',
    timelineModel: process.env.TIMELINE_MODEL ?? '',
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL,
  })
  return environmentRuntime
}
