import type { FastifyInstance } from 'fastify'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { getAiRuntime } from '../client'
import { embedTexts } from '../embeddings'
import {
  SCHOLAR_RECOMMENDATION_EMPTY_RESPONSE,
  SCHOLAR_RECOMMENDATION_SYSTEM_PROMPT,
} from '../prompts/scholar-recommendation'
import type { AiMessage, AiModeHandler } from '../types'

export interface ScholarSearchResult {
  doi: string
  scholarIds: string[]
  scholarNames: string[]
  title: string | null
  abstract: string | null
  score: number
}

export const buildScholarRetrievalQuery = (messages: AiMessage[]): string => {
  return messages
    .filter((message) => message.role === 'user')
    .slice(-3)
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join(' ')
}

const formatScholarContext = (results: ScholarSearchResult[]): string => {
  return results
    .map((result, index) => {
      const scholars = result.scholarNames.filter(Boolean).join('、') || '未标注'
      const abstract = result.abstract?.trim()
      return [
        `【论文 ${index + 1}】`,
        `标题：${result.title?.trim() || '未命名论文'}`,
        `DOI：${result.doi}`,
        `相关学者：${scholars}`,
        abstract ? `摘要：${abstract.slice(0, 500)}` : null,
      ]
        .filter((line): line is string => Boolean(line))
        .join('\n')
    })
    .join('\n\n')
}

export const buildScholarRecommendationMessages = (
  messages: AiMessage[],
  results: ScholarSearchResult[],
): ChatCompletionMessageParam[] => {
  const conversation = messages.filter((message) => message.role !== 'system')
  let latestUserIndex = -1
  for (let index = conversation.length - 1; index >= 0; index -= 1) {
    if (conversation[index].role === 'user') {
      latestUserIndex = index
      break
    }
  }

  const scholarContext = formatScholarContext(results)
  const contextualMessages: ChatCompletionMessageParam[] = conversation.map((message, index) => {
    if (index !== latestUserIndex) {
      return message
    }

    return {
      role: 'user',
      content: `${message.content}\n\n以下是从 Scholar 数据库检索到的候选论文与学者：\n\n${scholarContext}`,
    }
  })

  return [{ role: 'system', content: SCHOLAR_RECOMMENDATION_SYSTEM_PROMPT }, ...contextualMessages]
}

export const searchScholarEmbeddings = async (
  fastify: FastifyInstance,
  query: string,
  limit = 5,
): Promise<ScholarSearchResult[]> => {
  if (!query.trim()) {
    return []
  }

  const [queryEmbedding] = await embedTexts(fastify, [query])
  if (!queryEmbedding) {
    return []
  }

  return searchScholarEmbeddingsByVector(fastify, queryEmbedding, limit)
}

export const searchScholarEmbeddingsByVector = async (
  fastify: FastifyInstance,
  queryEmbedding: number[],
  limit = 5,
): Promise<ScholarSearchResult[]> => {
  const vector = `[${queryEmbedding.join(',')}]`
  return fastify.prisma.$queryRawUnsafe<ScholarSearchResult[]>(
    `SELECT doi,
            scholar_ids AS "scholarIds",
            scholar_names AS "scholarNames",
            title,
            abstract,
            1 - (embedding <=> $1::vector) AS score
     FROM scholar_embeddings
     WHERE embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    vector,
    limit,
  )
}

const loadScholarResults = async (
  fastify: FastifyInstance,
  messages: AiMessage[],
): Promise<ScholarSearchResult[]> => {
  const query = buildScholarRetrievalQuery(messages)
  return searchScholarEmbeddings(fastify, query)
}

export const scholarRecommendationHandler: AiModeHandler = {
  complete: async (fastify, messages): Promise<string> => {
    const results = await loadScholarResults(fastify, messages)
    if (results.length === 0) {
      return SCHOLAR_RECOMMENDATION_EMPTY_RESPONSE
    }

    const runtime = getAiRuntime(fastify)
    const response = await runtime.client.chat.completions.create({
      model: runtime.chatModel,
      messages: buildScholarRecommendationMessages(messages, results),
    })
    return response.choices[0].message.content ?? SCHOLAR_RECOMMENDATION_EMPTY_RESPONSE
  },

  stream: async (fastify, messages, signal) => {
    const results = await loadScholarResults(fastify, messages)
    if (results.length === 0) {
      return {
        directContent: SCHOLAR_RECOMMENDATION_EMPTY_RESPONSE,
        stream: null,
      }
    }

    const runtime = getAiRuntime(fastify)
    const stream = await runtime.client.chat.completions.create(
      {
        model: runtime.chatModel,
        messages: buildScholarRecommendationMessages(messages, results),
        stream: true,
      },
      { signal },
    )
    return {
      directContent: null,
      stream,
    }
  },
}
