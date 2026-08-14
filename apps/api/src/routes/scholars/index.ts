import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import {
  ScholarParamsSchema,
  ScholarListQuerySchema,
  ScholarResponseSchema,
  ScholarListResponseSchema,
  CreateScholarBodySchema,
  UpdateScholarBodySchema,
} from './schema'
import { listScholars, getScholar, createScholar, updateScholar, deleteScholar } from './service'
import { assertPlatformAdmin } from '../../utils/permissions'

const scholarRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get(
    '/',
    {
      schema: {
        tags: ['scholars'],
        querystring: ScholarListQuerySchema,
        response: { 200: ScholarListResponseSchema },
      },
    },
    async (request) => listScholars(fastify, request.query),
  )

  fastify.get(
    '/:id',
    {
      schema: {
        tags: ['scholars'],
        params: ScholarParamsSchema,
        response: { 200: ScholarResponseSchema },
      },
    },
    async (request) => getScholar(fastify, request.params.id),
  )

  fastify.post(
    '/',
    {
      preHandler: async (request) => {
        await assertPlatformAdmin(fastify, request.user.userId)
      },
      schema: {
        tags: ['scholars'],
        body: CreateScholarBodySchema,
        response: { 200: ScholarResponseSchema },
      },
    },
    async (request) => createScholar(fastify, request.body, request.user.userId),
  )

  fastify.put(
    '/:id',
    {
      preHandler: async (request) => {
        await assertPlatformAdmin(fastify, request.user.userId)
      },
      schema: {
        tags: ['scholars'],
        params: ScholarParamsSchema,
        body: UpdateScholarBodySchema,
        response: { 200: ScholarResponseSchema },
      },
    },
    async (request) => updateScholar(fastify, request.params.id, request.body, request.user.userId),
  )

  fastify.delete(
    '/:id',
    {
      preHandler: async (request) => {
        await assertPlatformAdmin(fastify, request.user.userId)
      },
      schema: {
        tags: ['scholars'],
        params: ScholarParamsSchema,
      },
    },
    async (request) => deleteScholar(fastify, request.params.id),
  )
}

export default scholarRoutes
