import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import {
  TimelineGenerationListQuerySchema,
  TimelineGenerationListResponseSchema,
} from '../scholars/schema'
import { listTimelineGenerations } from '../scholars/service'

const scholarTimelineAdminRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get(
    '/generations',
    {
      schema: {
        tags: ['scholar-timeline-v1'],
        querystring: TimelineGenerationListQuerySchema,
        response: { 200: TimelineGenerationListResponseSchema },
      },
    },
    async (request) => {
      return listTimelineGenerations(fastify, request.user.userId, request.query)
    },
  )
}

export default scholarTimelineAdminRoutes
