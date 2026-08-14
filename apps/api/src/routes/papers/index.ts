import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import {
  CreatePaperBodySchema,
  UpdatePaperBodySchema,
  PaperParamsSchema,
  PaperClaimParamsSchema,
  PaperResponseSchema,
  PaperListResponseSchema,
  SearchQuerySchema,
  SearchResultSchema,
  ListQuerySchema,
  MyPapersQuerySchema,
  ReviewQueueQuerySchema,
  ReviewPaperBodySchema,
  InstitutionUploadsQuerySchema,
} from './schema'
import {
  createPaper,
  getPaper,
  listInstitutionUploads,
  listPapers,
  listMyPapers,
  listReviewQueue,
  updatePaper,
  deletePaper,
  searchPapers,
  reviewPaper,
} from './service'
import { assertFeatureEnabled } from '../../utils/deployment'
import { resolveOptionalAccessTokenUserId } from '../../utils/auth'

const paperRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.post(
    '/create',
    {
      schema: {
        tags: ['papers'],
        body: CreatePaperBodySchema,
        response: {
          200: PaperResponseSchema,
        },
      },
    },
    async (request) => {
      assertFeatureEnabled(
        fastify,
        'paperUpload',
        'Paper upload is not available in this deployment',
      )
      return createPaper(fastify, request.body, request.user.userId)
    },
  )

  fastify.get(
    '/search',
    {
      schema: {
        tags: ['papers'],
        querystring: SearchQuerySchema,
        response: {
          200: SearchResultSchema,
        },
      },
    },
    async (request) => {
      return searchPapers(fastify, request.user.userId, request.query)
    },
  )

  fastify.get(
    '/my',
    {
      schema: {
        tags: ['papers'],
        querystring: MyPapersQuerySchema,
        response: {
          200: PaperListResponseSchema,
        },
      },
    },
    async (request) => {
      return listMyPapers(fastify, request.user.userId, request.query)
    },
  )

  fastify.get(
    '/institution-uploads',
    {
      schema: {
        tags: ['papers'],
        querystring: InstitutionUploadsQuerySchema,
        response: {
          200: PaperListResponseSchema,
        },
      },
    },
    async (request) => {
      return listInstitutionUploads(fastify, request.user.userId, request.query)
    },
  )

  fastify.get(
    '/review-queue',
    {
      schema: {
        tags: ['papers'],
        querystring: ReviewQueueQuerySchema,
        response: {
          200: PaperListResponseSchema,
        },
      },
    },
    async (request) => {
      return listReviewQueue(fastify, request.user.userId, request.query)
    },
  )

  fastify.get(
    '/',
    {
      config: { publicRoute: true },
      schema: {
        tags: ['papers'],
        querystring: ListQuerySchema,
        response: {
          200: PaperListResponseSchema,
        },
      },
    },
    async (request) => {
      const userId = await resolveOptionalAccessTokenUserId(fastify, request)
      return listPapers(fastify, userId, request.query)
    },
  )

  fastify.post(
    '/claims/:id/review',
    {
      schema: {
        tags: ['papers'],
        params: PaperClaimParamsSchema,
        body: ReviewPaperBodySchema,
        response: {
          200: PaperResponseSchema,
        },
      },
    },
    async (request) => {
      return reviewPaper(fastify, request.params.id, request.body, request.user.userId)
    },
  )

  fastify.get(
    '/:id',
    {
      config: { publicRoute: true },
      schema: {
        tags: ['papers'],
        params: PaperParamsSchema,
        response: {
          200: PaperResponseSchema,
        },
      },
    },
    async (request) => {
      const userId = await resolveOptionalAccessTokenUserId(fastify, request)
      return getPaper(fastify, request.params.id, userId)
    },
  )

  fastify.put(
    '/:id',
    {
      schema: {
        tags: ['papers'],
        params: PaperParamsSchema,
        body: UpdatePaperBodySchema,
        response: {
          200: PaperResponseSchema,
        },
      },
    },
    async (request) => {
      return updatePaper(fastify, request.params.id, request.body, request.user.userId)
    },
  )

  fastify.delete(
    '/:id',
    {
      schema: {
        tags: ['papers'],
        params: PaperParamsSchema,
      },
    },
    async (request) => {
      return deletePaper(fastify, request.params.id, request.user.userId)
    },
  )
}

export default paperRoutes
