import { Type } from 'typebox'
import {
  TypeBoxValidatorCompiler,
  type FastifyPluginAsyncTypebox,
} from '@fastify/type-provider-typebox'
import { requireIdentityAdmin } from '../../../identity/service'
import { lockMutationScope } from '../../../utils/advisory-lock'
import {
  CorrectionSchema,
  requestCorrection,
  decideCorrection,
  reconcilePersonCorrections,
} from '../../../directory/corrections'
import { RouteSchema, SimulationSchema } from '../../../review/routing-schema'
import { saveReviewRoute, simulateReviewRoute } from '../../../review/routing'
import { ReviewRoutesResponseSchema, toReviewRouteResponse } from '../../../review/routing-response'
import { submitReviewCase } from '../../../review/service'

const params = Type.Object({ slug: Type.String() })
const uuid = Type.String({ format: 'uuid' })
const notes = Type.String({ minLength: 1, maxLength: 2000, pattern: '\\S' })
const response = { 200: Type.Object({ code: Type.Literal(0), data: Type.Unknown() }) }
const paging = Type.Object({
  offset: Type.Optional(Type.Integer({ minimum: 0 })),
  history: Type.Optional(Type.Boolean()),
})

export const personnelGovernanceRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.setValidatorCompiler(TypeBoxValidatorCompiler)
  fastify.get(
    '/:slug/directory/people/:personId/history',
    {
      schema: {
        params: Type.Object({ ...params.properties, personId: uuid }),
        querystring: paging,
        response,
      },
    },
    async (request) => {
      const admin = await requireIdentityAdmin(fastify, request.params.slug, request.user.userId)
      return fastify.prisma.$transaction(async (tx) => {
        await lockMutationScope(tx, 'institution-identity', admin.institutionId)
        const personId = request.params.personId
        await reconcilePersonCorrections(tx, admin.institutionId, personId)
        const person = await tx.institution_people.findFirst({
          where: { id: personId, institutionId: admin.institutionId },
          include: {
            directory_record: {
              include: { source: { select: { name: true, lastAppliedAt: true } } },
            },
          },
        })
        if (!person) throw fastify.httpErrors.notFound('Person not found')
        const where = { institutionId: admin.institutionId, personId }
        const page = { skip: request.query.offset ?? 0, take: 100 }
        const [identities, relationships, appointments, corrections] = await Promise.all([
          tx.institution_person_roles.findMany({
            where,
            ...page,
            orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
          }),
          tx.institution_person_relations.findMany({
            where,
            ...page,
            orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
            include: { relatedPerson: { select: { name: true } } },
          }),
          tx.institution_appointment_history.findMany({
            where,
            ...page,
            orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
            include: { position: { select: { name: true } } },
          }),
          tx.institution_directory_corrections.findMany({
            where,
            ...page,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          }),
        ])
        return {
          code: 0 as const,
          data: {
            person: {
              id: person.id,
              name: person.name,
              sourceName: person.directory_record?.sourceName ?? null,
              lifecycleStatus: person.lifecycle_status,
              manuallySuspended: person.manually_suspended,
              source: person.directory_record?.source ?? null,
            },
            identities,
            relationships,
            appointments,
            corrections,
            nextOffset:
              Math.max(
                identities.length,
                relationships.length,
                appointments.length,
                corrections.length,
              ) === 100
                ? (request.query.offset ?? 0) + 100
                : null,
          },
        }
      })
    },
  )
  fastify.get(
    '/:slug/directory/organization-history',
    { schema: { params, querystring: paging, response } },
    async (request) => {
      const admin = await requireIdentityAdmin(fastify, request.params.slug, request.user.userId)
      const items = await fastify.prisma.institution_org_edge_history.findMany({
        where: { institutionId: admin.institutionId },
        skip: request.query.offset ?? 0,
        take: 100,
        orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
        include: { parent: { select: { name: true } }, child: { select: { name: true } } },
      })
      return {
        code: 0 as const,
        data: {
          items,
          nextOffset: items.length === 100 ? (request.query.offset ?? 0) + 100 : null,
        },
      }
    },
  )
  fastify.get(
    '/:slug/directory/corrections',
    { schema: { params, querystring: paging, response } },
    async (request) => {
      const admin = await requireIdentityAdmin(fastify, request.params.slug, request.user.userId)
      const items = await fastify.prisma.institution_directory_corrections.findMany({
        where: { institutionId: admin.institutionId },
        take: 100,
        skip: request.query.offset ?? 0,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: { person: { select: { name: true } } },
      })
      return {
        code: 0 as const,
        data: {
          items: items.map((item) => ({
            ...item,
            status:
              ['requested', 'active'].includes(item.status) && item.expiresAt <= new Date()
                ? 'expired'
                : item.status,
          })),
          nextOffset: items.length === 100 ? (request.query.offset ?? 0) + 100 : null,
        },
      }
    },
  )
  fastify.post(
    '/:slug/directory/corrections',
    { schema: { params, body: CorrectionSchema, response } },
    async (request) => ({
      code: 0 as const,
      data: {
        id: await requestCorrection(
          fastify,
          request.params.slug,
          request.user.userId,
          request.body,
        ),
      },
    }),
  )
  fastify.post(
    '/:slug/directory/corrections/:id/decision',
    {
      schema: {
        params: Type.Object({ ...params.properties, id: uuid }),
        body: Type.Object(
          {
            decision: Type.Union([
              Type.Literal('approve'),
              Type.Literal('reject'),
              Type.Literal('revoke'),
            ]),
            notes,
          },
          { additionalProperties: false },
        ),
        response,
      },
    },
    async (request) => {
      await decideCorrection(
        fastify,
        request.params.slug,
        request.user.userId,
        request.params.id,
        request.body.decision,
        request.body.notes,
      )
      return { code: 0 as const, data: null }
    },
  )
  fastify.get(
    '/:slug/review-governance/routes',
    { schema: { params, querystring: paging, response: { 200: ReviewRoutesResponseSchema } } },
    async (request) => {
      const admin = await requireIdentityAdmin(fastify, request.params.slug, request.user.userId)
      const items = await fastify.prisma.institution_review_routes.findMany({
        where: {
          institutionId: admin.institutionId,
          ...(request.query.history ? {} : { supersededAt: null }),
        },
        take: 100,
        skip: request.query.offset ?? 0,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: { workflow: { include: { steps: { orderBy: { step_order: 'asc' } } } } },
      })
      return {
        code: 0 as const,
        data: {
          items: items.map(toReviewRouteResponse),
          nextOffset: items.length === 100 ? (request.query.offset ?? 0) + 100 : null,
        },
      }
    },
  )
  fastify.post(
    '/:slug/review-governance/routes',
    { schema: { params, body: RouteSchema, response } },
    async (request) => ({
      code: 0 as const,
      data: {
        id: await saveReviewRoute(fastify, request.params.slug, request.user.userId, request.body),
      },
    }),
  )
  fastify.post(
    '/:slug/review-governance/simulate',
    { schema: { params, body: SimulationSchema, response } },
    async (request) => {
      const admin = await requireIdentityAdmin(fastify, request.params.slug, request.user.userId)
      const result = await fastify.prisma.$transaction(async (tx) => {
        await lockMutationScope(tx, 'institution-identity', admin.institutionId)
        return simulateReviewRoute(tx, admin.institutionId, request.body)
      })
      return { code: 0 as const, data: result }
    },
  )
  fastify.post(
    '/:slug/review-governance/cases/:caseId/reroute',
    {
      schema: {
        params: Type.Object({ ...params.properties, caseId: uuid }),
        body: Type.Object({ versionId: uuid, notes }, { additionalProperties: false }),
        response,
      },
    },
    async (request) => {
      const admin = await requireIdentityAdmin(fastify, request.params.slug, request.user.userId)
      const initial = await fastify.prisma.content_review_cases.findFirst({
        where: { id: request.params.caseId, institutionId: admin.institutionId },
      })
      if (!initial) throw fastify.httpErrors.notFound('Review case not found')
      await fastify.prisma.$transaction(async (tx) => {
        await lockMutationScope(
          tx,
          initial.content_type === 'paper'
            ? 'paper-claim'
            : initial.content_type === 'change_request'
              ? 'review-change'
              : 'degree-thesis',
          initial.subjectId,
        )
        await lockMutationScope(tx, 'institution-identity', admin.institutionId)
        const current = await tx.content_review_cases.findUniqueOrThrow({
          where: { id: initial.id },
        })
        if (
          current.status !== 'pending_review' ||
          current.currentVersionId !== request.body.versionId
        )
          throw fastify.httpErrors.conflict(
            'Only the current pending material may start a new routing round',
          )
        await tx.content_review_cases.update({
          where: { id: current.id },
          data: { status: 'changes_requested' },
        })
        await submitReviewCase(fastify, tx, {
          caseId: current.id,
          actorId: request.user.userId,
          versionId: request.body.versionId,
        })
        await tx.institution_identity_events.create({
          data: {
            institutionId: admin.institutionId,
            actorUserId: request.user.userId,
            action: 'review_route_restarted',
            notes: `${current.id}: ${request.body.notes}`.slice(0, 2000),
          },
        })
      })
      return { code: 0 as const, data: null }
    },
  )
}
