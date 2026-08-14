import type { FastifyInstance } from 'fastify'
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions'
import type { AiRuntime } from '../client'
import { embedTexts } from '../embeddings'

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
  const [queryEmbedding] = await embedTexts(fastify, [query])
  const vector = `[${queryEmbedding.join(',')}]`

  return fastify.prisma.$queryRawUnsafe<PaperSearchResult[]>(
    `WITH ranked AS (
       SELECT e."paperId", e.text,
              1 - (e.embedding <=> $1::vector) AS score,
              row_number() OVER (
                PARTITION BY e."paperId"
                ORDER BY e.embedding <=> $1::vector
              ) AS row_number
       FROM embeddings e
       WHERE e.embedding IS NOT NULL
         AND EXISTS (
           SELECT 1
             FROM paper_claims claim
             JOIN content_review_cases review_case ON review_case.id = claim."reviewCaseId"
             WHERE claim."paperId" = e."paperId"
             AND review_case.status = 'approved'
         )
     )
     SELECT "paperId", text, score
     FROM ranked
     WHERE row_number = 1
     ORDER BY score DESC, "paperId"
     LIMIT $2`,
    vector,
    limit,
  )
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
