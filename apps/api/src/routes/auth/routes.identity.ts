import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import {
  ApplicantResponse,
  IdentityProofBody,
  SubmitIdentityRequestBody,
} from '../../identity/schema'
import { assertHumanIdentityRequest } from '../../identity/challenges'
import { getApplicantRequest, submitIdentityRequest } from '../../identity/requests'

export const identityApplicantRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.post(
    '/institution-identity-requests/status',
    {
      config: { publicRoute: true, rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        tags: ['institution-identity'],
        body: IdentityProofBody,
        response: { 200: ApplicantResponse },
        security: [],
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store')
      await assertHumanIdentityRequest(fastify, request)
      return getApplicantRequest(fastify, request.body.proofToken)
    },
  )
  fastify.post(
    '/institution-identity-requests',
    {
      config: { publicRoute: true, rateLimit: { max: 5, timeWindow: '1 minute' } },
      schema: {
        tags: ['institution-identity'],
        body: SubmitIdentityRequestBody,
        response: { 200: ApplicantResponse },
        security: [],
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store')
      await assertHumanIdentityRequest(fastify, request)
      return submitIdentityRequest(fastify, request.body)
    },
  )
}
