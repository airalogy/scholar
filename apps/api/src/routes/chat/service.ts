import type { FastifyInstance } from 'fastify'
import type { ChatBody, ChatMessage, ChatListQuery, ChatMode } from './schema'
import { DEFAULT_AI_MODE, generateAiResponse, streamAiResponse } from '../../ai'

const DEFAULT_CHAT_MODE: ChatMode = DEFAULT_AI_MODE

interface ChatContext {
  chatId: string
  historyMessages: ChatMessage[]
}

async function loadOrCreateChat(
  fastify: FastifyInstance,
  userId: string,
  mode: ChatMode,
  chatId?: string,
): Promise<ChatContext> {
  if (chatId) {
    const chat = await fastify.prisma.chats.findUnique({ where: { id: chatId } })
    if (!chat) {
      throw fastify.httpErrors.notFound('Chat not found')
    }
    if (chat.userId !== userId) {
      throw fastify.httpErrors.forbidden('Access denied')
    }
    if (chat.mode !== mode) {
      throw fastify.httpErrors.badRequest('Chat mode does not match the existing conversation')
    }
    const historyMessages = (chat.messages as ChatMessage[]) ?? []
    return { chatId: chat.id, historyMessages }
  }

  const chat = await fastify.prisma.chats.create({
    data: {
      userId,
      mode,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  })
  return { chatId: chat.id, historyMessages: [] }
}

async function saveMessages(
  fastify: FastifyInstance,
  chatId: string,
  messages: ChatMessage[],
): Promise<void> {
  await fastify.prisma.chats.update({
    where: { id: chatId },
    data: {
      messages: messages.map(({ role, content }) => ({ role, content })),
      updatedAt: new Date(),
    },
  })
}

export async function chat(fastify: FastifyInstance, body: ChatBody, userId: string) {
  const mode = body.mode ?? DEFAULT_CHAT_MODE
  const { chatId, historyMessages } = await loadOrCreateChat(fastify, userId, mode, body.id)
  const allUserMessages: ChatMessage[] = [...historyMessages, ...body.messages]
  await saveMessages(fastify, chatId, allUserMessages)
  const content = await generateAiResponse(fastify, {
    mode,
    messages: allUserMessages,
  })

  const updatedMessages: ChatMessage[] = [...allUserMessages, { role: 'assistant', content }]
  await saveMessages(fastify, chatId, updatedMessages)

  return {
    id: chatId,
    role: 'assistant' as const,
    content,
  }
}

export async function chatStream(
  fastify: FastifyInstance,
  body: ChatBody,
  userId: string,
  signal?: AbortSignal,
) {
  const mode = body.mode ?? DEFAULT_CHAT_MODE
  const { chatId, historyMessages } = await loadOrCreateChat(fastify, userId, mode, body.id)
  const allUserMessages: ChatMessage[] = [...historyMessages, ...body.messages]
  await saveMessages(fastify, chatId, allUserMessages)
  const result = await streamAiResponse(fastify, {
    mode,
    messages: allUserMessages,
    signal,
  })

  return {
    chatId,
    allUserMessages,
    ...result,
  }
}

export async function listChats(fastify: FastifyInstance, userId: string, query: ChatListQuery) {
  const limit = query.limit ?? 20
  const offset = query.offset ?? 0
  const mode = query.mode ?? DEFAULT_CHAT_MODE

  const [items, total] = await Promise.all([
    fastify.prisma.chats.findMany({
      where: { userId, mode },
      take: limit,
      skip: offset,
      orderBy: { updatedAt: 'desc' },
    }),
    fastify.prisma.chats.count({ where: { userId, mode } }),
  ])

  return {
    items: items.map((chat) => {
      const messages = (chat.messages as ChatMessage[]) ?? []
      const firstUserMsg = messages.find((m) => m.role === 'user')
      const title = firstUserMsg ? firstUserMsg.content.slice(0, 50) : 'New Chat'

      return {
        id: chat.id,
        mode: chat.mode as ChatMode,
        title,
        createdAt: chat.createdAt.toISOString(),
        updatedAt: chat.updatedAt.toISOString(),
      }
    }),
    total,
  }
}

export async function getChat(fastify: FastifyInstance, chatId: string, userId: string) {
  const chat = await fastify.prisma.chats.findUnique({ where: { id: chatId } })
  if (!chat) {
    throw fastify.httpErrors.notFound('Chat not found')
  }
  if (chat.userId !== userId) {
    throw fastify.httpErrors.forbidden('Access denied')
  }

  return {
    id: chat.id,
    mode: chat.mode as ChatMode,
    messages: (chat.messages as ChatMessage[]) ?? [],
    createdAt: chat.createdAt.toISOString(),
    updatedAt: chat.updatedAt.toISOString(),
  }
}

export async function deleteChat(fastify: FastifyInstance, chatId: string, userId: string) {
  const chat = await fastify.prisma.chats.findUnique({ where: { id: chatId } })
  if (!chat) throw fastify.httpErrors.notFound('Chat not found')
  if (chat.userId !== userId) throw fastify.httpErrors.forbidden('Access denied')
  await fastify.prisma.chats.delete({ where: { id: chatId } })
  return { message: 'Chat deleted' }
}

export { saveMessages }
