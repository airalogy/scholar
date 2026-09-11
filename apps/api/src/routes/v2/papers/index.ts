import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { resolveOptionalAccessTokenUserId } from '../../../utils/auth'
import {
  readPaperBibliography,
  listPaperEditions,
  readPaperMetrics,
} from '../../../bibliography/read'
import {
  PaperParams,
  EditionParams,
  PageQuery,
  BibliographyResponse,
  EditionsResponse,
  MetricsResponse,
} from './schema'

const routes: FastifyPluginAsyncTypebox = async (fastify) => {
  const config = { publicRoute: true, publicContentRoute: true }
  const tags = ['paper-bibliography']
  // Responses vary by membership. Never cache privileged fields in a shared cache.
  fastify.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'private, no-store')
  })
  fastify.get(
    '/:id/bibliography',
    { config, schema: { tags, params: PaperParams, response: { 200: BibliographyResponse } } },
    async (request) => ({
      code: 0 as const,
      data: await readPaperBibliography(
        fastify,
        request.params.id,
        await resolveOptionalAccessTokenUserId(fastify, request),
      ),
    }),
  )
  fastify.get(
    '/:id/bibliometric-editions',
    {
      config,
      schema: {
        tags,
        params: PaperParams,
        querystring: PageQuery,
        response: { 200: EditionsResponse },
      },
    },
    async (request) => ({
      code: 0 as const,
      data: await listPaperEditions(
        fastify,
        request.params.id,
        await resolveOptionalAccessTokenUserId(fastify, request),
        request.query,
      ),
    }),
  )
  fastify.get(
    '/:id/bibliometric-editions/:editionId',
    {
      config,
      schema: {
        tags,
        params: EditionParams,
        querystring: PageQuery,
        response: { 200: MetricsResponse },
      },
    },
    async (request) => ({
      code: 0 as const,
      data: await readPaperMetrics(
        fastify,
        request.params.id,
        request.params.editionId,
        await resolveOptionalAccessTokenUserId(fastify, request),
        request.query,
      ),
    }),
  )
}
export default routes
