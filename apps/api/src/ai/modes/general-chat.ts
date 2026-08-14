import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { getAiRuntime } from '../client'
import { GENERAL_CHAT_SYSTEM_PROMPT } from '../prompts/general-chat'
import { resolvePaperSearchToolCalls } from '../tools/paper-search'
import type { AiMessage, AiModeHandler } from '../types'

const buildGeneralChatMessages = (messages: AiMessage[]): ChatCompletionMessageParam[] => {
  return [{ role: 'system', content: GENERAL_CHAT_SYSTEM_PROMPT }, ...messages]
}

export const generalChatHandler: AiModeHandler = {
  complete: async (fastify, messages): Promise<string> => {
    const runtime = getAiRuntime(fastify)
    const resolved = await resolvePaperSearchToolCalls(
      fastify,
      runtime,
      buildGeneralChatMessages(messages),
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
      buildGeneralChatMessages(messages),
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
