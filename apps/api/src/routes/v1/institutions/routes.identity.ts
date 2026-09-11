import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import {
  addIdentityIdentifier,
  findIdentityPeople,
  requireIdentityAdmin,
  requireIdentityPerson,
  revokeIdentityIdentifier,
} from '../../../identity/service'
import { adminRequest, decideIdentityRequest } from '../../../identity/requests'
import * as schemas from '../../../identity/schema'

export const identityAdminRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get(
    '/:slug/identity/people',
    {
      schema: {
        tags: ['institution-identity'],
        params: schemas.IdentityInstitutionParams,
        querystring: schemas.IdentityPeopleQuery,
        response: { 200: schemas.IdentityPeopleResponse },
      },
    },
    async (request) => {
      const admin = await requireIdentityAdmin(fastify, request.params.slug, request.user.userId)
      return {
        code: 0 as const,
        data: await findIdentityPeople(
          fastify,
          admin,
          request.query.search ?? '',
          request.query.offset ?? 0,
        ),
      }
    },
  )
  fastify.get(
    '/:slug/identity/people/:personId',
    {
      schema: {
        tags: ['institution-identity'],
        params: schemas.IdentityPersonParams,
        response: { 200: schemas.IdentityPersonResponse },
      },
    },
    async (request) => {
      const admin = await requireIdentityAdmin(fastify, request.params.slug, request.user.userId)
      const person = await requireIdentityPerson(
        fastify,
        fastify.prisma,
        admin,
        request.params.personId,
      )
      const [identifiers, events] = await Promise.all([
        fastify.prisma.institution_person_identifiers.findMany({
          where: { institutionId: admin.institutionId, personId: person.id },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        }),
        fastify.prisma.institution_identity_events.findMany({
          where: { institutionId: admin.institutionId, personId: person.id },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 100,
        }),
      ])
      return {
        code: 0 as const,
        data: {
          person,
          identifiers: identifiers.map((item) => ({
            ...item,
            revokedAt: item.revokedAt?.toISOString() ?? null,
            createdAt: item.createdAt.toISOString(),
          })),
          events: events.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })),
        },
      }
    },
  )
  fastify.post(
    '/:slug/identity/people/:personId/identifiers',
    {
      schema: {
        tags: ['institution-identity'],
        params: schemas.IdentityPersonParams,
        body: schemas.IdentityIdentifierBody,
        response: { 200: schemas.IdentityMutationResponse },
      },
    },
    async (request) => {
      const admin = await requireIdentityAdmin(fastify, request.params.slug, request.user.userId)
      await addIdentityIdentifier(fastify, admin, {
        personId: request.params.personId,
        ...request.body,
      })
      return { code: 0 as const }
    },
  )
  fastify.post(
    '/:slug/identity/people/:personId/identifiers/:identifierId/revoke',
    {
      schema: {
        tags: ['institution-identity'],
        params: schemas.IdentityIdentifierParams,
        body: schemas.IdentityNoteBody,
        response: { 200: schemas.IdentityMutationResponse },
      },
    },
    async (request) => {
      const admin = await requireIdentityAdmin(fastify, request.params.slug, request.user.userId)
      await revokeIdentityIdentifier(
        fastify,
        admin,
        request.params.personId,
        request.params.identifierId,
        request.body.notes,
      )
      return { code: 0 as const }
    },
  )
  fastify.get(
    '/:slug/identity/requests',
    {
      schema: {
        tags: ['institution-identity'],
        params: schemas.IdentityInstitutionParams,
        querystring: schemas.IdentityRequestsQuery,
        response: { 200: schemas.IdentityRequestsResponse },
      },
    },
    async (request) => {
      const admin = await requireIdentityAdmin(fastify, request.params.slug, request.user.userId)
      const where = {
        institutionId: admin.institutionId,
        ...(request.query.status ? { status: request.query.status } : {}),
      }
      const [items, total] = await Promise.all([
        fastify.prisma.institution_identity_requests.findMany({
          where,
          skip: request.query.offset ?? 0,
          take: 20,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
        fastify.prisma.institution_identity_requests.count({ where }),
      ])
      return { code: 0 as const, data: { items: items.map(adminRequest), total } }
    },
  )
  fastify.get(
    '/:slug/identity/requests/:requestId',
    {
      schema: {
        tags: ['institution-identity'],
        params: schemas.IdentityRequestParams,
        response: { 200: schemas.IdentityRequestResponse },
      },
    },
    async (request) => {
      const admin = await requireIdentityAdmin(fastify, request.params.slug, request.user.userId)
      const item = await fastify.prisma.institution_identity_requests.findFirst({
        where: { id: request.params.requestId, institutionId: admin.institutionId },
      })
      if (!item) throw fastify.httpErrors.notFound('Identity request not found')
      const events = await fastify.prisma.institution_identity_events.findMany({
        where: { institutionId: admin.institutionId, requestId: item.id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 100,
      })
      return {
        code: 0 as const,
        data: {
          request: adminRequest(item),
          events: events.map((event) => ({ ...event, createdAt: event.createdAt.toISOString() })),
        },
      }
    },
  )
  fastify.post(
    '/:slug/identity/requests/:requestId/decision',
    {
      schema: {
        tags: ['institution-identity'],
        params: schemas.IdentityRequestParams,
        body: schemas.IdentityDecisionBody,
        response: { 200: schemas.IdentityMutationResponse },
      },
    },
    async (request) => {
      const admin = await requireIdentityAdmin(fastify, request.params.slug, request.user.userId)
      await decideIdentityRequest(fastify, admin, request.params.requestId, request.body)
      return { code: 0 as const }
    },
  )
}
