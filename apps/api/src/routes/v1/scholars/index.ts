import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import {
  CreateTimelineGenerationBodySchema,
  ReviewTimelineGenerationBodySchema,
  ScholarFacetsQuerySchema,
  ScholarFacetsResponseSchema,
  TimelineGenerationParamsSchema,
  TimelineGenerationResponseSchema,
  TimelineIdempotencyHeadersSchema,
  TimelineScholarParamsSchema,
} from './schema'
import {
  createTimelineGeneration,
  getTimelineGeneration,
  publishTimelineGeneration,
  rejectTimelineGeneration,
  startTimelineGeneration,
} from './service'
import { getScholarFacets } from './service.facets'

const scholarTimelineRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get(
    '/facets',
    {
      config: { publicRoute: true },
      schema: {
        tags: ['scholars-v1'],
        querystring: ScholarFacetsQuerySchema,
        response: { 200: ScholarFacetsResponseSchema },
      },
    },
    async (request) => getScholarFacets(fastify, request.query),
  )

  fastify.post(
    '/:id/research-timeline/generations',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
      schema: {
        tags: ['scholar-timeline-v1'],
        params: TimelineScholarParamsSchema,
        headers: TimelineIdempotencyHeadersSchema,
        body: CreateTimelineGenerationBodySchema,
        response: { 202: TimelineGenerationResponseSchema },
      },
    },
    async (request, reply) => {
      const result = await createTimelineGeneration(
        fastify,
        request.params.id,
        request.user.userId,
        request.headers['idempotency-key'],
        request.body,
        {
          sourceIp: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        },
      )
      return reply.code(202).send(result)
    },
  )

  fastify.get(
    '/:id/research-timeline/generations/:generationId',
    {
      schema: {
        tags: ['scholar-timeline-v1'],
        params: TimelineGenerationParamsSchema,
        response: { 200: TimelineGenerationResponseSchema },
      },
    },
    async (request) => {
      return getTimelineGeneration(
        fastify,
        request.params.id,
        request.params.generationId,
        request.user.userId,
      )
    },
  )

  fastify.post(
    '/:id/research-timeline/generations/:generationId/start',
    {
      schema: {
        tags: ['scholar-timeline-v1'],
        params: TimelineGenerationParamsSchema,
        response: { 200: TimelineGenerationResponseSchema },
      },
    },
    async (request) => {
      return startTimelineGeneration(
        fastify,
        request.params.id,
        request.params.generationId,
        request.user.userId,
      )
    },
  )

  fastify.post(
    '/:id/research-timeline/generations/:generationId/publish',
    {
      schema: {
        tags: ['scholar-timeline-v1'],
        params: TimelineGenerationParamsSchema,
        body: ReviewTimelineGenerationBodySchema,
        response: { 200: TimelineGenerationResponseSchema },
      },
    },
    async (request) => {
      return publishTimelineGeneration(
        fastify,
        request.params.id,
        request.params.generationId,
        request.user.userId,
        request.body,
      )
    },
  )

  fastify.post(
    '/:id/research-timeline/generations/:generationId/reject',
    {
      schema: {
        tags: ['scholar-timeline-v1'],
        params: TimelineGenerationParamsSchema,
        body: ReviewTimelineGenerationBodySchema,
        response: { 200: TimelineGenerationResponseSchema },
      },
    },
    async (request) => {
      return rejectTimelineGeneration(
        fastify,
        request.params.id,
        request.params.generationId,
        request.user.userId,
        request.body,
      )
    },
  )
}

export default scholarTimelineRoutes
