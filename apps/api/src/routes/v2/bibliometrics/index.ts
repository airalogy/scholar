import {
  TypeBoxValidatorCompiler,
  type FastifyPluginAsyncTypebox,
} from '@fastify/type-provider-typebox'
import { assertCanManageBibliometrics } from '../../../bibliography/bibliometrics-access'
import {
  listEditions,
  listJournals,
  getEditionDetail,
} from '../../../bibliography/bibliometrics-read'
import {
  createEdition,
  changeRanking,
  changeIndicator,
  publishEdition,
  reviseEdition,
  withdrawObservation,
} from '../../../bibliography/bibliometrics-write'
import {
  PageQuery,
  EditionQuery,
  IdParams,
  CreateBody,
  RankingBody,
  IndicatorBody,
  NoteBody,
  WithdrawBody,
  EditionResponse,
  EditionsResponse,
  JournalsResponse,
  DetailResponse,
} from './schema'

const routes: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.setValidatorCompiler(TypeBoxValidatorCompiler)
  fastify.addHook('preHandler', async (request) =>
    assertCanManageBibliometrics(fastify, request.user.userId),
  )
  const tags = ['bibliometrics-v2']
  fastify.post(
    '/editions/:id/withdraw',
    { schema: { tags, params: IdParams, body: WithdrawBody, response: { 200: EditionResponse } } },
    async (request) =>
      withdrawObservation(fastify, request.params.id, request.body, request.user.userId),
  )
  fastify.get(
    '/journals',
    { schema: { tags, querystring: PageQuery, response: { 200: JournalsResponse } } },
    async (request) => listJournals(fastify, request.query),
  )
  fastify.get(
    '/editions',
    { schema: { tags, querystring: EditionQuery, response: { 200: EditionsResponse } } },
    async (request) => listEditions(fastify, request.query),
  )
  fastify.get(
    '/editions/:id',
    {
      schema: { tags, params: IdParams, querystring: PageQuery, response: { 200: DetailResponse } },
    },
    async (request) => getEditionDetail(fastify, request.params.id, request.query),
  )
  fastify.post(
    '/editions',
    { schema: { tags, body: CreateBody, response: { 200: EditionResponse } } },
    async (request) => createEdition(fastify, request.body, request.user.userId),
  )
  fastify.put(
    '/editions/:id/rankings',
    { schema: { tags, params: IdParams, body: RankingBody, response: { 200: EditionResponse } } },
    async (request) => changeRanking(fastify, request.params.id, request.body, request.user.userId),
  )
  fastify.put(
    '/editions/:id/indicators',
    { schema: { tags, params: IdParams, body: IndicatorBody, response: { 200: EditionResponse } } },
    async (request) =>
      changeIndicator(fastify, request.params.id, request.body, request.user.userId),
  )
  fastify.post(
    '/editions/:id/publish',
    { schema: { tags, params: IdParams, body: NoteBody, response: { 200: EditionResponse } } },
    async (request) =>
      publishEdition(fastify, request.params.id, request.body, request.user.userId),
  )
  fastify.post(
    '/editions/:id/revisions',
    { schema: { tags, params: IdParams, body: NoteBody, response: { 200: EditionResponse } } },
    async (request) => reviseEdition(fastify, request.params.id, request.body, request.user.userId),
  )
}
export default routes
