import type { FastifyInstance } from 'fastify'
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions'
import type { AiRuntime } from '../client'
import {
  reciprocalRankFuse,
  searchPaperSegmentsByBm25,
  searchPaperSegmentsByVector,
  type PaperRetrievalResult,
} from '../../search/paper-retrieval'
import { buildPaperIndexText } from '../../utils/document'
import { getConfiguredInstitution } from '../../utils/institution-scope'

export interface PaperSearchResult {
  paperId: string
  text: string
  score: number
}

export const PAPER_SEARCH_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'recommend_papers',
    description:
      'Search the paper library and recommend relevant academic papers to the user. Call this tool whenever the conversation touches on research topics, scientific questions, methodologies, or any subject where citing related literature would be valuable. Extract key research terms from the conversation to form the query.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Key research terms or phrases extracted from the conversation, used to find and recommend relevant papers from the library',
        },
      },
      required: ['query'],
    },
  },
}

export const searchPaperEmbeddings = async (
  fastify: FastifyInstance,
  query: string,
  limit = 3,
): Promise<PaperSearchResult[]> => {
  const institution = await getConfiguredInstitution(fastify)
  const candidateLimit = Math.max(limit * 4, 12)
  const bm25Results = await searchPaperSegmentsByBm25(fastify, query, {
    institutionId: institution.id,
    limit: candidateLimit,
    distinctPapers: true,
  })
  let vectorResults: PaperRetrievalResult[] = []
  try {
    vectorResults = await searchPaperSegmentsByVector(fastify, query, {
      institutionId: institution.id,
      limit: candidateLimit,
      distinctPapers: true,
    })
  } catch (error) {
    fastify.log.warn({ err: error }, 'Vector retrieval failed; using BM25 paper ranking only')
  }

  const fused = reciprocalRankFuse([bm25Results, vectorResults], (result) => result.paperId, limit)
  if (fastify.config.ALLOW_APPROVED_PDF_MODEL_PROCESSING || fused.length === 0) {
    return fused
  }

  const papers = await fastify.prisma.papers.findMany({
    where: { id: { in: fused.map((result) => result.paperId) } },
    select: { id: true, title: true, abstract: true },
  })
  const paperById = new Map(papers.map((paper) => [paper.id, paper]))
  return fused.flatMap((result) => {
    const paper = paperById.get(result.paperId)
    const text = paper ? buildPaperIndexText(paper.title, paper.abstract) : null
    return text ? [{ ...result, text }] : []
  })
}

const loadPaperOpeningSegments = async (
  fastify: FastifyInstance,
  institutionId: string,
  paperId: string,
  limit: number,
): Promise<PaperRetrievalResult[]> => {
  return fastify.prisma.$queryRawUnsafe<PaperRetrievalResult[]>(
    `SELECT e."paperId", e."segmentIndex", e.text, 0::double precision AS score
     FROM embeddings e
     WHERE e."paperId" = $1::uuid
       AND EXISTS (
         SELECT 1
         FROM paper_claims claim
         JOIN content_review_cases review_case ON review_case.id = claim."reviewCaseId"
         WHERE claim."paperId" = e."paperId"
           AND claim."institutionId" = $2::uuid
           AND review_case.status = 'approved'
       )
     ORDER BY e."segmentIndex"
     LIMIT $3`,
    paperId,
    institutionId,
    limit,
  )
}

export const searchPaperContextPassages = async (
  fastify: FastifyInstance,
  paperId: string,
  query: string,
  limit = 4,
): Promise<PaperSearchResult[]> => {
  if (!fastify.config.ALLOW_APPROVED_PDF_MODEL_PROCESSING) {
    return []
  }

  const institution = await getConfiguredInstitution(fastify)
  const candidateLimit = Math.max(limit * 3, 12)
  const bm25Results = await searchPaperSegmentsByBm25(fastify, query, {
    institutionId: institution.id,
    paperId,
    limit: candidateLimit,
  })
  let vectorResults: PaperRetrievalResult[] = []
  try {
    vectorResults = await searchPaperSegmentsByVector(fastify, query, {
      institutionId: institution.id,
      paperId,
      limit: candidateLimit,
    })
  } catch (error) {
    fastify.log.warn(
      { err: error, paperId },
      'Vector retrieval failed; using BM25 paper passages only',
    )
  }

  const passages = reciprocalRankFuse(
    [bm25Results, vectorResults],
    (result) => `${result.paperId}:${result.segmentIndex}`,
    limit,
  )
  if (passages.length > 0) {
    return passages
  }

  return loadPaperOpeningSegments(fastify, institution.id, paperId, limit)
}

const formatPaperSearchResults = (results: PaperSearchResult[]): string => {
  if (results.length === 0) {
    return 'No relevant content found in the knowledge base.'
  }

  return results
    .map(
      (result, index) =>
        `[${index + 1}] (paperId: ${result.paperId}, score: ${Number(result.score).toFixed(4)})\n${result.text}`,
    )
    .join('\n\n')
}

const parsePaperSearchQuery = (argumentsJson: string): string => {
  const parsed = JSON.parse(argumentsJson) as { query?: unknown }
  return typeof parsed.query === 'string' ? parsed.query : ''
}

export interface PaperToolResolution {
  finishReason: string | null
  content: string | null
  messages: ChatCompletionMessageParam[]
}

export const resolvePaperSearchToolCalls = async (
  fastify: FastifyInstance,
  runtime: AiRuntime,
  messages: ChatCompletionMessageParam[],
  signal?: AbortSignal,
): Promise<PaperToolResolution> => {
  const response = await runtime.client.chat.completions.create(
    {
      model: runtime.chatModel,
      messages,
      tools: [PAPER_SEARCH_TOOL],
    },
    { signal },
  )
  const choice = response.choices[0]

  if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls) {
    messages.push(choice.message)

    for (const toolCall of choice.message.tool_calls) {
      if (toolCall.type !== 'function' || toolCall.function.name !== 'recommend_papers') {
        continue
      }

      const query = parsePaperSearchQuery(toolCall.function.arguments)
      const results = query.trim() ? await searchPaperEmbeddings(fastify, query) : []
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: formatPaperSearchResults(results),
      })
    }
  }

  return {
    finishReason: choice.finish_reason,
    content: choice.message.content,
    messages,
  }
}
