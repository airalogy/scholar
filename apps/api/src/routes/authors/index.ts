import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import {
  AuthorSearchQuerySchema,
  AuthorParamsSchema,
  AuthorResponseSchema,
  AuthorListResponseSchema,
} from './schema'
import { searchAuthors, getAuthor } from './service'

const authorRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get(
    '/',
    {
      schema: {
        tags: ['authors'],
        querystring: AuthorSearchQuerySchema,
        response: { 200: AuthorListResponseSchema },
      },
    },
    async (request) => {
      return searchAuthors(fastify, request.query)
    },
  )

  fastify.get(
    '/:id',
    {
      schema: {
        tags: ['authors'],
        params: AuthorParamsSchema,
        response: { 200: AuthorResponseSchema },
      },
    },
    async (request) => {
      return getAuthor(fastify, request.params.id)
    },
  )
}

export default authorRoutes
