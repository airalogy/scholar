import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import {
  LabDetailResponseSchema,
  LabMembershipListResponseSchema,
  LabMemberParamsSchema,
  LabParamsSchema,
  UpdateLabBodySchema,
  UpsertLabMembershipBodySchema,
} from './schema'
import {
  getLab,
  listLabMemberships,
  removeLabMembership,
  updateLab,
  upsertLabMembership,
} from './service'

const labRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get(
    '/:slug',
    {
      schema: {
        tags: ['labs'],
        params: LabParamsSchema,
        response: {
          200: LabDetailResponseSchema,
        },
      },
    },
    async (request) => {
      return getLab(fastify, request.params.slug, request.user.userId)
    },
  )

  fastify.put(
    '/:slug',
    {
      schema: {
        tags: ['labs'],
        params: LabParamsSchema,
        body: UpdateLabBodySchema,
        response: {
          200: LabDetailResponseSchema,
        },
      },
    },
    async (request) => {
      return updateLab(fastify, request.params.slug, request.user.userId, request.body)
    },
  )

  fastify.get(
    '/:slug/memberships',
    {
      schema: {
        tags: ['labs'],
        params: LabParamsSchema,
        response: {
          200: LabMembershipListResponseSchema,
        },
      },
    },
    async (request) => {
      return listLabMemberships(fastify, request.params.slug, request.user.userId)
    },
  )

  fastify.post(
    '/:slug/memberships',
    {
      schema: {
        tags: ['labs'],
        params: LabParamsSchema,
        body: UpsertLabMembershipBodySchema,
        response: {
          200: LabMembershipListResponseSchema,
        },
      },
    },
    async (request) => {
      return upsertLabMembership(fastify, request.params.slug, request.user.userId, request.body)
    },
  )

  fastify.delete(
    '/:slug/memberships/:userId',
    {
      schema: {
        tags: ['labs'],
        params: LabMemberParamsSchema,
        response: {
          200: LabMembershipListResponseSchema,
        },
      },
    },
    async (request) => {
      return removeLabMembership(
        fastify,
        request.params.slug,
        request.user.userId,
        request.params.userId,
      )
    },
  )
}

export default labRoutes
