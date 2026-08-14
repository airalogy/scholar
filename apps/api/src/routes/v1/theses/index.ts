import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import {
  CreateDegreeThesisBodySchema,
  DegreeThesisFacetsResponseSchema,
  DegreeThesisListQuerySchema,
  DegreeThesisListResponseSchema,
  DegreeThesisParamsSchema,
  DegreeThesisRecordCodeParamsSchema,
  DegreeThesisResponseSchema,
  DegreeThesisReviewBodySchema,
  DegreeThesisReviewQueueQuerySchema,
  UpdateDegreeThesisBodySchema,
} from './schema'
import {
  createDegreeThesis,
  getDegreeThesis,
  getDegreeThesisByRecordCode,
  getDegreeThesisFacets,
  listDegreeTheses,
  listDegreeThesisReviewQueue,
  listMyDegreeTheses,
  reviewDegreeThesis,
  submitDegreeThesis,
  updateDegreeThesis,
} from './service'
import { assertFeatureEnabled } from '../../../utils/deployment'

const degreeThesisRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.addHook('preHandler', async () => {
    assertFeatureEnabled(
      fastify,
      'degreeTheses',
      'Degree thesis features are not available in this deployment',
    )
  })
  fastify.get(
    '/facets',
    {
      schema: {
        tags: ['degree-theses-v1'],
        response: { 200: DegreeThesisFacetsResponseSchema },
      },
    },
    async (request) => getDegreeThesisFacets(fastify, request.user.userId),
  )

  fastify.get(
    '/mine',
    {
      schema: {
        tags: ['degree-theses-v1'],
        response: { 200: DegreeThesisListResponseSchema },
      },
    },
    async (request) => listMyDegreeTheses(fastify, request.user.userId),
  )

  fastify.get(
    '/review-queue',
    {
      schema: {
        tags: ['degree-theses-v1'],
        querystring: DegreeThesisReviewQueueQuerySchema,
        response: { 200: DegreeThesisListResponseSchema },
      },
    },
    async (request) => listDegreeThesisReviewQueue(fastify, request.query, request.user.userId),
  )

  fastify.get(
    '/',
    {
      schema: {
        tags: ['degree-theses-v1'],
        querystring: DegreeThesisListQuerySchema,
        response: { 200: DegreeThesisListResponseSchema },
      },
    },
    async (request) => listDegreeTheses(fastify, request.query, request.user.userId),
  )

  fastify.post(
    '/',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 hour' } },
      schema: {
        tags: ['degree-theses-v1'],
        body: CreateDegreeThesisBodySchema,
        response: { 201: DegreeThesisResponseSchema },
      },
    },
    async (request, reply) => {
      const result = await createDegreeThesis(fastify, request.body, request.user.userId, {
        sourceIp: request.ip,
        userAgent: request.headers['user-agent'] ?? null,
      })
      return reply.code(201).send(result)
    },
  )

  fastify.get(
    '/by-code/:recordCode',
    {
      schema: {
        tags: ['degree-theses-v1'],
        params: DegreeThesisRecordCodeParamsSchema,
        response: { 200: DegreeThesisResponseSchema },
      },
    },
    async (request) =>
      getDegreeThesisByRecordCode(fastify, request.params.recordCode, request.user.userId),
  )

  fastify.get(
    '/:id',
    {
      schema: {
        tags: ['degree-theses-v1'],
        params: DegreeThesisParamsSchema,
        response: { 200: DegreeThesisResponseSchema },
      },
    },
    async (request) => getDegreeThesis(fastify, request.params.id, request.user.userId),
  )

  fastify.put(
    '/:id',
    {
      schema: {
        tags: ['degree-theses-v1'],
        params: DegreeThesisParamsSchema,
        body: UpdateDegreeThesisBodySchema,
        response: { 200: DegreeThesisResponseSchema },
      },
    },
    async (request) =>
      updateDegreeThesis(fastify, request.params.id, request.body, request.user.userId, {
        sourceIp: request.ip,
        userAgent: request.headers['user-agent'] ?? null,
      }),
  )

  fastify.post(
    '/:id/submit',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 hour' } },
      schema: {
        tags: ['degree-theses-v1'],
        params: DegreeThesisParamsSchema,
        response: { 200: DegreeThesisResponseSchema },
      },
    },
    async (request) =>
      submitDegreeThesis(fastify, request.params.id, request.user.userId, {
        sourceIp: request.ip,
        userAgent: request.headers['user-agent'] ?? null,
      }),
  )

  fastify.post(
    '/:id/review',
    {
      config: { rateLimit: { max: 100, timeWindow: '1 hour' } },
      schema: {
        tags: ['degree-theses-v1'],
        params: DegreeThesisParamsSchema,
        body: DegreeThesisReviewBodySchema,
        response: { 200: DegreeThesisResponseSchema },
      },
    },
    async (request) =>
      reviewDegreeThesis(fastify, request.params.id, request.body, request.user.userId, {
        sourceIp: request.ip,
        userAgent: request.headers['user-agent'] ?? null,
      }),
  )
}

export default degreeThesisRoutes
