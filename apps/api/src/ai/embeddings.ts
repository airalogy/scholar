import type { FastifyInstance } from 'fastify'
import type { AiRuntime } from './client'
import { getAiRuntime, getEnvironmentAiRuntime } from './client'

const embedTextsWithRuntime = async (runtime: AiRuntime, texts: string[]): Promise<number[][]> => {
  if (texts.length === 0) {
    return []
  }

  const response = await runtime.client.embeddings.create({
    model: runtime.embeddingModel,
    input: texts,
  })

  return response.data.map((item) => item.embedding)
}

export const embedTexts = async (
  fastify: FastifyInstance,
  texts: string[],
): Promise<number[][]> => {
  return embedTextsWithRuntime(getAiRuntime(fastify), texts)
}

export const embedTextsFromEnvironment = async (texts: string[]): Promise<number[][]> => {
  return embedTextsWithRuntime(getEnvironmentAiRuntime(), texts)
}
