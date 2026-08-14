import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import {
  ChatBodySchema,
  ChatResponseSchema,
  ChatListQuerySchema,
  ChatListResponseSchema,
  ChatParamsSchema,
  ChatDetailResponseSchema,
} from './schema'
import { chat, chatStream, listChats, getChat, deleteChat, saveMessages } from './service'
import type { ChatMessage } from './schema'
import { assertFeatureEnabled } from '../../utils/deployment'

const chatRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.addHook('onRequest', async () => {
    assertFeatureEnabled(fastify, 'aiChat', 'AI chat is not available in this deployment')
  })

  fastify.post(
    '/',
    {
      schema: {
        tags: ['chat'],
        body: ChatBodySchema,
        response: {
          200: ChatResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.userId

      if (request.body.stream) {
        const controller = new AbortController()
        const abort = (): void => controller.abort()
        request.raw.once('aborted', abort)
        reply.raw.once('close', abort)

        try {
          const { chatId, allUserMessages, directContent, stream } = await chatStream(
            fastify,
            request.body,
            userId,
            controller.signal,
          )

          if (controller.signal.aborted) {
            return reply
          }

          reply.raw.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          })
          reply.raw.write(`data: ${JSON.stringify({ id: chatId })}\n\n`)

          let fullContent = ''
          if (directContent) {
            fullContent = directContent
            reply.raw.write(`data: ${JSON.stringify({ content: directContent })}\n\n`)
          } else if (stream) {
            try {
              for await (const chunk of stream) {
                if (controller.signal.aborted) {
                  break
                }

                const content = chunk.choices[0]?.delta?.content
                if (content) {
                  fullContent += content
                  reply.raw.write(`data: ${JSON.stringify({ content })}\n\n`)
                }
              }
            } catch (error) {
              if (!controller.signal.aborted) {
                throw error
              }
            }
          }

          if (!controller.signal.aborted && !reply.raw.destroyed) {
            reply.raw.write('data: [DONE]\n\n')
            reply.raw.end()
          }

          const updatedMessages: ChatMessage[] = [...allUserMessages]
          if (fullContent) {
            updatedMessages.push({ role: 'assistant', content: fullContent })
          }
          try {
            await saveMessages(fastify, chatId, updatedMessages)
          } catch (error) {
            fastify.log.error({ err: error, chatId }, 'Failed to save chat messages')
          }

          return reply
        } catch (error) {
          if (controller.signal.aborted) {
            return reply
          }
          throw error
        } finally {
          request.raw.off('aborted', abort)
          reply.raw.off('close', abort)
        }
      }

      return chat(fastify, request.body, userId)
    },
  )

  fastify.get(
    '/',
    {
      schema: {
        tags: ['chat'],
        querystring: ChatListQuerySchema,
        response: {
          200: ChatListResponseSchema,
        },
      },
    },
    async (request) => {
      return listChats(fastify, request.user.userId, request.query)
    },
  )

  fastify.get(
    '/:id',
    {
      schema: {
        tags: ['chat'],
        params: ChatParamsSchema,
        response: {
          200: ChatDetailResponseSchema,
        },
      },
    },
    async (request) => {
      return getChat(fastify, request.params.id, request.user.userId)
    },
  )

  fastify.delete(
    '/:id',
    {
      schema: {
        tags: ['chat'],
        params: ChatParamsSchema,
        response: {
          200: { type: 'object', properties: { message: { type: 'string' } } },
        },
      },
    },
    async (request) => {
      return deleteChat(fastify, request.params.id, request.user.userId)
    },
  )
}

export default chatRoutes
