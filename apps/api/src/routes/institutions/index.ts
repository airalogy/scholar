import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import {
  BindInstitutionPaperAuthorBodySchema,
  CreateInstitutionApiCredentialBodySchema,
  CreateInstitutionJoinRequestBodySchema,
  InstitutionCatalogResponseSchema,
  InstitutionApiCredentialListResponseSchema,
  InstitutionApiCredentialParamsSchema,
  InstitutionApiCredentialSecretResponseSchema,
  InstitutionDetailResponseSchema,
  InstitutionJoinRequestListResponseSchema,
  InstitutionJoinRequestParamsSchema,
  InstitutionListResponseSchema,
  InstitutionMemberParamsSchema,
  InstitutionMembershipListResponseSchema,
  InstitutionOrgStructureResponseSchema,
  InstitutionPaperBindingParamsSchema,
  InstitutionPaperBoundMemberListResponseSchema,
  MyInstitutionJoinRequestResponseSchema,
  InstitutionParamsSchema,
  InstitutionProvisionListResponseSchema,
  InstitutionProvisionParamsSchema,
  RotateInstitutionApiCredentialBodySchema,
  ReviewInstitutionJoinRequestBodySchema,
  UpdateInstitutionBodySchema,
  UpsertInstitutionMembershipBodySchema,
  UpsertInstitutionOrgStructureBodySchema,
  UpsertInstitutionProvisionBodySchema,
} from './schema'
import {
  bindInstitutionPaperAuthor,
  createInstitutionJoinRequest,
  disableInstitutionProvision,
  getInstitution,
  getInstitutionOrgStructure,
  getMyInstitutionJoinRequest,
  listInstitutionCatalog,
  listInstitutionJoinRequests,
  listInstitutions,
  listInstitutionMemberships,
  listInstitutionProvisions,
  removeInstitutionPaperAuthorBinding,
  reviewInstitutionJoinRequest,
  removeInstitutionMembership,
  updateInstitution,
  upsertInstitutionOrgStructure,
  upsertInstitutionMembership,
  upsertInstitutionProvision,
} from './service'
import {
  createInstitutionApiCredential,
  listInstitutionApiCredentials,
  revokeInstitutionApiCredential,
  rotateInstitutionApiCredential,
} from './service.credentials'

const institutionRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get(
    '/',
    {
      schema: {
        tags: ['institutions'],
        response: {
          200: InstitutionListResponseSchema,
        },
      },
    },
    async (request) => {
      return listInstitutions(fastify, request.user.userId)
    },
  )

  fastify.get(
    '/catalog',
    {
      schema: {
        tags: ['institutions'],
        response: {
          200: InstitutionCatalogResponseSchema,
        },
      },
    },
    async (request) => {
      return listInstitutionCatalog(fastify, request.user.userId)
    },
  )

  fastify.get(
    '/:slug',
    {
      schema: {
        tags: ['institutions'],
        params: InstitutionParamsSchema,
        response: {
          200: InstitutionDetailResponseSchema,
        },
      },
    },
    async (request) => {
      return getInstitution(fastify, request.params.slug, request.user.userId)
    },
  )

  fastify.put(
    '/:slug',
    {
      schema: {
        tags: ['institutions'],
        params: InstitutionParamsSchema,
        body: UpdateInstitutionBodySchema,
        response: {
          200: InstitutionDetailResponseSchema,
        },
      },
    },
    async (request) => {
      return updateInstitution(fastify, request.params.slug, request.user.userId, request.body)
    },
  )

  fastify.get(
    '/:slug/memberships',
    {
      schema: {
        tags: ['institutions'],
        params: InstitutionParamsSchema,
        response: {
          200: InstitutionMembershipListResponseSchema,
        },
      },
    },
    async (request) => {
      return listInstitutionMemberships(fastify, request.params.slug, request.user.userId)
    },
  )

  fastify.post(
    '/:slug/memberships',
    {
      schema: {
        tags: ['institutions'],
        params: InstitutionParamsSchema,
        body: UpsertInstitutionMembershipBodySchema,
        response: {
          200: InstitutionMembershipListResponseSchema,
        },
      },
    },
    async (request) => {
      return upsertInstitutionMembership(
        fastify,
        request.params.slug,
        request.user.userId,
        request.body,
      )
    },
  )

  fastify.get(
    '/:slug/org-structure',
    {
      schema: {
        tags: ['institutions'],
        params: InstitutionParamsSchema,
        response: {
          200: InstitutionOrgStructureResponseSchema,
        },
      },
    },
    async (request) => {
      return getInstitutionOrgStructure(fastify, request.params.slug, request.user.userId)
    },
  )

  fastify.put(
    '/:slug/org-structure',
    {
      schema: {
        tags: ['institutions'],
        params: InstitutionParamsSchema,
        body: UpsertInstitutionOrgStructureBodySchema,
        response: {
          200: InstitutionOrgStructureResponseSchema,
        },
      },
    },
    async (request) => {
      return upsertInstitutionOrgStructure(
        fastify,
        request.params.slug,
        request.user.userId,
        request.body,
      )
    },
  )

  fastify.get(
    '/:slug/join-requests/me',
    {
      schema: {
        tags: ['institutions'],
        params: InstitutionParamsSchema,
        response: {
          200: MyInstitutionJoinRequestResponseSchema,
        },
      },
    },
    async (request) => {
      return getMyInstitutionJoinRequest(fastify, request.params.slug, request.user.userId)
    },
  )

  fastify.post(
    '/:slug/paper-author-bindings',
    {
      schema: {
        tags: ['institutions'],
        params: InstitutionParamsSchema,
        body: BindInstitutionPaperAuthorBodySchema,
        response: {
          200: InstitutionPaperBoundMemberListResponseSchema,
        },
      },
    },
    async (request) => {
      return bindInstitutionPaperAuthor(
        fastify,
        request.params.slug,
        request.user.userId,
        request.body,
      )
    },
  )

  fastify.delete(
    '/:slug/paper-author-bindings/:bindingId',
    {
      schema: {
        tags: ['institutions'],
        params: InstitutionPaperBindingParamsSchema,
        response: {
          200: InstitutionPaperBoundMemberListResponseSchema,
        },
      },
    },
    async (request) => {
      return removeInstitutionPaperAuthorBinding(
        fastify,
        request.params.slug,
        request.user.userId,
        request.params.bindingId,
      )
    },
  )

  fastify.get(
    '/:slug/api-credentials',
    {
      schema: {
        tags: ['institutions'],
        params: InstitutionParamsSchema,
        response: {
          200: InstitutionApiCredentialListResponseSchema,
        },
      },
    },
    async (request) => {
      return listInstitutionApiCredentials(fastify, request.params.slug, request.user.userId)
    },
  )

  fastify.post(
    '/:slug/api-credentials',
    {
      schema: {
        tags: ['institutions'],
        params: InstitutionParamsSchema,
        body: CreateInstitutionApiCredentialBodySchema,
        response: {
          200: InstitutionApiCredentialSecretResponseSchema,
        },
      },
    },
    async (request) => {
      return createInstitutionApiCredential(
        fastify,
        request.params.slug,
        request.user.userId,
        request.body,
      )
    },
  )

  fastify.post(
    '/:slug/api-credentials/:credentialId/rotate',
    {
      schema: {
        tags: ['institutions'],
        params: InstitutionApiCredentialParamsSchema,
        body: RotateInstitutionApiCredentialBodySchema,
        response: {
          200: InstitutionApiCredentialSecretResponseSchema,
        },
      },
    },
    async (request) => {
      return rotateInstitutionApiCredential(
        fastify,
        request.params.slug,
        request.params.credentialId,
        request.user.userId,
        request.body,
      )
    },
  )

  fastify.delete(
    '/:slug/api-credentials/:credentialId',
    {
      schema: {
        tags: ['institutions'],
        params: InstitutionApiCredentialParamsSchema,
        response: {
          200: InstitutionApiCredentialListResponseSchema,
        },
      },
    },
    async (request) => {
      return revokeInstitutionApiCredential(
        fastify,
        request.params.slug,
        request.params.credentialId,
        request.user.userId,
      )
    },
  )

  fastify.post(
    '/:slug/join-requests',
    {
      schema: {
        tags: ['institutions'],
        params: InstitutionParamsSchema,
        body: CreateInstitutionJoinRequestBodySchema,
        response: {
          200: MyInstitutionJoinRequestResponseSchema,
        },
      },
    },
    async (request) => {
      return createInstitutionJoinRequest(
        fastify,
        request.params.slug,
        request.user.userId,
        request.body,
      )
    },
  )

  fastify.get(
    '/:slug/join-requests',
    {
      schema: {
        tags: ['institutions'],
        params: InstitutionParamsSchema,
        response: {
          200: InstitutionJoinRequestListResponseSchema,
        },
      },
    },
    async (request) => {
      return listInstitutionJoinRequests(fastify, request.params.slug, request.user.userId)
    },
  )

  fastify.post(
    '/:slug/join-requests/:requestId/review',
    {
      schema: {
        tags: ['institutions'],
        params: InstitutionJoinRequestParamsSchema,
        body: ReviewInstitutionJoinRequestBodySchema,
        response: {
          200: InstitutionJoinRequestListResponseSchema,
        },
      },
    },
    async (request) => {
      return reviewInstitutionJoinRequest(
        fastify,
        request.params.slug,
        request.params.requestId,
        request.user.userId,
        request.body,
      )
    },
  )

  fastify.get(
    '/:slug/provisions',
    {
      schema: {
        tags: ['institutions'],
        params: InstitutionParamsSchema,
        response: {
          200: InstitutionProvisionListResponseSchema,
        },
      },
    },
    async (request) => {
      return listInstitutionProvisions(fastify, request.params.slug, request.user.userId)
    },
  )

  fastify.post(
    '/:slug/provisions',
    {
      schema: {
        tags: ['institutions'],
        params: InstitutionParamsSchema,
        body: UpsertInstitutionProvisionBodySchema,
        response: {
          200: InstitutionProvisionListResponseSchema,
        },
      },
    },
    async (request) => {
      return upsertInstitutionProvision(
        fastify,
        request.params.slug,
        request.user.userId,
        request.body,
      )
    },
  )

  fastify.delete(
    '/:slug/memberships/:userId',
    {
      schema: {
        tags: ['institutions'],
        params: InstitutionMemberParamsSchema,
        response: {
          200: InstitutionMembershipListResponseSchema,
        },
      },
    },
    async (request) => {
      return removeInstitutionMembership(
        fastify,
        request.params.slug,
        request.user.userId,
        request.params.userId,
      )
    },
  )

  fastify.delete(
    '/:slug/provisions/:provisionId',
    {
      schema: {
        tags: ['institutions'],
        params: InstitutionProvisionParamsSchema,
        response: {
          200: InstitutionProvisionListResponseSchema,
        },
      },
    },
    async (request) => {
      return disableInstitutionProvision(
        fastify,
        request.params.slug,
        request.user.userId,
        request.params.provisionId,
      )
    },
  )
}

export default institutionRoutes
