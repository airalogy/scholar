import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import {
  FeedbackListQuerySchema,
  FeedbackListResponseSchema,
  FeedbackParamsSchema,
  FeedbackStatusUpdateResponseSchema,
  FeedbackSubmitResponseSchema,
  SubmitFeedbackBodySchema,
  UpdateFeedbackStatusBodySchema,
} from './schema'
import { listFeedback, submitFeedback, updateFeedbackStatus } from './service'

const feedbackRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.post(
    '/submit',
    {
      config: {
        publicRoute: true,
        rateLimit: { max: 10, timeWindow: '1 hour' },
      },
      schema: {
        tags: ['feedback'],
        body: SubmitFeedbackBodySchema,
        response: {
          200: FeedbackSubmitResponseSchema,
        },
        security: [],
      },
    },
    async (request) => {
      return submitFeedback(fastify, request, request.body)
    },
  )

  fastify.get(
    '/',
    {
      schema: {
        tags: ['feedback'],
        querystring: FeedbackListQuerySchema,
        response: {
          200: FeedbackListResponseSchema,
        },
      },
    },
    async (request) => {
      return listFeedback(fastify, request.user.userId, request.query)
    },
  )

  fastify.patch(
    '/:id/status',
    {
      schema: {
        tags: ['feedback'],
        params: FeedbackParamsSchema,
        body: UpdateFeedbackStatusBodySchema,
        response: {
          200: FeedbackStatusUpdateResponseSchema,
        },
      },
    },
    async (request) => {
      return updateFeedbackStatus(fastify, request.user.userId, request.params.id, request.body)
    },
  )
}

export default feedbackRoutes
