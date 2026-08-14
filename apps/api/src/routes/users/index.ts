import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import {
  ChangePasswordBodySchema,
  CommonSuccessResponseSchema,
  UserSearchQuerySchema,
  UserSearchResponseSchema,
  UpdateUserProfileBodySchema,
  UserProfileResponseSchema,
} from './schema'
import { changeMyPassword, getMyProfile, searchUsers, updateMyProfile } from './service'
import { assertCanSearchUsers } from '../../utils/permissions'

const usersRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get(
    '/search',
    {
      schema: {
        tags: ['users'],
        querystring: UserSearchQuerySchema,
        response: {
          200: UserSearchResponseSchema,
        },
      },
    },
    async (request) => {
      await assertCanSearchUsers(fastify, request.user.userId)
      return searchUsers(fastify, request.query)
    },
  )

  fastify.get(
    '/me',
    {
      schema: {
        tags: ['users'],
        response: {
          200: UserProfileResponseSchema,
        },
      },
    },
    async (request) => {
      return getMyProfile(fastify, request.user.userId)
    },
  )

  fastify.put(
    '/me',
    {
      schema: {
        tags: ['users'],
        body: UpdateUserProfileBodySchema,
        response: {
          200: CommonSuccessResponseSchema,
        },
      },
    },
    async (request) => {
      return updateMyProfile(fastify, request.user.userId, request.body)
    },
  )

  fastify.put(
    '/me/password',
    {
      schema: {
        tags: ['users'],
        body: ChangePasswordBodySchema,
        response: {
          200: CommonSuccessResponseSchema,
        },
      },
    },
    async (request) => {
      return changeMyPassword(fastify, request.user.userId, request.body)
    },
  )
}

export default usersRoutes
