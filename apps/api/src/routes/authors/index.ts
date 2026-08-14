import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import {
  AuthorSearchQuerySchema,
  AuthorParamsSchema,
  AuthorResponseSchema,
  AuthorListResponseSchema,
} from './schema'
import { searchAuthors, getAuthor } from './service'
import { resolveOptionalAccessTokenUserId } from '../../utils/auth'

const authorRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get(
    '/',
    {
      config: { publicRoute: true },
      schema: {
        tags: ['authors'],
        querystring: AuthorSearchQuerySchema,
        response: { 200: AuthorListResponseSchema },
      },
    },
    async (request) => {
      const userId = await resolveOptionalAccessTokenUserId(fastify, request)
      return searchAuthors(fastify, request.query, Boolean(userId))
    },
  )

  fastify.get(
    '/:id',
    {
      config: { publicRoute: true },
      schema: {
        tags: ['authors'],
        params: AuthorParamsSchema,
        response: { 200: AuthorResponseSchema },
      },
    },
    async (request) => {
      const userId = await resolveOptionalAccessTokenUserId(fastify, request)
      return getAuthor(fastify, request.params.id, Boolean(userId))
    },
  )
}

export default authorRoutes
