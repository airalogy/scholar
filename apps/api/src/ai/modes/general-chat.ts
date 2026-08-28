import type { FastifyInstance } from 'fastify'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { getAiRuntime } from '../client'
import { GENERAL_CHAT_SYSTEM_PROMPT } from '../prompts/general-chat'
import { resolvePaperSearchToolCalls, searchPaperContextPassages } from '../tools/paper-search'
import type { AiMessage, AiModeHandler } from '../types'

const PAPER_ID_PATTERN =
  /^\s*\u8bba\u6587ID\uff1a([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\s*$/imu

export const parsePaperContextId = (messages: AiMessage[]): string | null => {
  for (const message of messages) {
    if (message.role !== 'system') {
      continue
    }
    const match = PAPER_ID_PATTERN.exec(message.content)
    if (match) {
      return match[1]
    }
  }
  return null
}

const latestUserQuestion = (messages: AiMessage[]): string | null => {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message.role === 'user' && message.content.trim()) {
      return message.content.trim()
    }
  }
  return null
}

export const buildGeneralChatMessages = async (
  fastify: FastifyInstance,
  messages: AiMessage[],
): Promise<ChatCompletionMessageParam[]> => {
  const baseMessages: ChatCompletionMessageParam[] = [
    { role: 'system', content: GENERAL_CHAT_SYSTEM_PROMPT },
    ...messages,
  ]
  if (!fastify.config.ALLOW_APPROVED_PDF_MODEL_PROCESSING) {
    return baseMessages
  }

  const paperId = parsePaperContextId(messages)
  const question = latestUserQuestion(messages)
  if (!paperId || !question) {
    return baseMessages
  }

  const passages = await searchPaperContextPassages(fastify, paperId, question)
  const evidence = passages
    .map((passage, index) => `[Passage ${index + 1}]\n${passage.text}`)
    .join('\n\n')
  if (!evidence) {
    return baseMessages
  }

  return [
    { role: 'system', content: GENERAL_CHAT_SYSTEM_PROMPT },
    {
      role: 'system',
      content: `The following passages were retrieved from the institution-approved PDF of paper ${paperId}. Use them as the primary evidence for the user's paper-reading question. If the passages do not support a claim, say so rather than inventing details.\n\n${evidence}`,
    },
    ...messages,
  ]
}

export const generalChatHandler: AiModeHandler = {
  complete: async (fastify, messages): Promise<string> => {
    const runtime = getAiRuntime(fastify)
    const resolved = await resolvePaperSearchToolCalls(
      fastify,
      runtime,
      await buildGeneralChatMessages(fastify, messages),
    )

    if (resolved.finishReason !== 'tool_calls') {
      return resolved.content ?? ''
    }

    const finalResponse = await runtime.client.chat.completions.create({
      model: runtime.chatModel,
      messages: resolved.messages,
    })
    return finalResponse.choices[0].message.content ?? ''
  },

  stream: async (fastify, messages, signal) => {
    const runtime = getAiRuntime(fastify)
    const resolved = await resolvePaperSearchToolCalls(
      fastify,
      runtime,
      await buildGeneralChatMessages(fastify, messages),
      signal,
    )
    const stream = await runtime.client.chat.completions.create(
      {
        model: runtime.chatModel,
        messages: resolved.messages,
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
