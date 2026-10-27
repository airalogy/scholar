import { Type } from 'typebox'
import {
  TypeBoxValidatorCompiler,
  type FastifyPluginAsyncTypebox,
} from '@fastify/type-provider-typebox'
import { requireIdentityAdmin } from '../../../identity/service'
import { completeHandoff, handoffSnapshot } from '../../../administrators/handoff'
import { assertActiveTarget, assertPermissionManager } from '../../../administrators/access'

const params = Type.Object({ slug: Type.String() })
const pair = {
  fromUserId: Type.String({ format: 'uuid' }),
  toUserId: Type.String({ format: 'uuid' }),
}
const account = Type.Object({
  userId: Type.String(),
  role: Type.String(),
  user: Type.Object({ name: Type.String() }),
})
const id = Type.Object({ id: Type.String() })
const previewResponse = {
  200: Type.Object({
    code: Type.Literal(0),
    data: Type.Object({
      digest: Type.String(),
      from: account,
      to: account,
      labs: Type.Array(Type.Object({ labId: Type.String() })),
      grants: Type.Array(Type.Object({ id: Type.String(), role: Type.String() })),
      tasks: Type.Array(
        Type.Object({
          id: Type.String(),
          kind: Type.String(),
          status: Type.String(),
          step: Type.Object({ caseId: Type.String() }),
        }),
      ),
      invitations: Type.Array(id),
      credentials: Type.Array(id),
    }),
  }),
}
const auditResponse = {
  200: Type.Object({
    code: Type.Literal(0),
    data: Type.Object({
      activeOwners: Type.Integer(),
      items: Type.Array(
        Type.Object({
          id: Type.String(),
          entity: Type.String(),
          entityId: Type.String(),
          actorUserId: Type.Union([Type.String(), Type.Null()]),
          actorLabel: Type.String(),
          source: Type.String(),
          reason: Type.String(),
          before: Type.Unknown(),
          after: Type.Unknown(),
          createdAt: Type.String(),
        }),
      ),
    }),
  }),
}

export const administratorRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.setValidatorCompiler(TypeBoxValidatorCompiler)
  fastify.get(
    '/:slug/administrators/audit',
    {
      schema: {
        params,
        querystring: Type.Object({
          offset: Type.Optional(Type.Integer({ minimum: 0, maximum: 1000000 })),
        }),
        response: auditResponse,
      },
    },
    async (request) => {
      const admin = await requireIdentityAdmin(fastify, request.params.slug, request.user.userId)
      await assertPermissionManager(
        fastify,
        fastify.prisma,
        admin.institutionId,
        request.user.userId,
      )
      const items = await fastify.prisma.institution_permission_events.findMany({
        where: { institutionId: admin.institutionId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: request.query.offset ?? 0,
        take: 50,
      })
      const owners = await fastify.prisma.institution_memberships.findMany({
        where: { institutionId: admin.institutionId, role: 'owner' },
      })
      let activeOwners = 0
      for (const owner of owners) {
        try {
          await assertActiveTarget(fastify, fastify.prisma, admin.institutionId, owner.userId)
          activeOwners++
        } catch (error) {
          if (!(error instanceof Error) || !('statusCode' in error) || error.statusCode !== 409)
            throw error
        }
      }
      return {
        code: 0 as const,
        data: {
          items: items.map((event) => ({ ...event, createdAt: event.createdAt.toISOString() })),
          activeOwners,
        },
      }
    },
  )
  fastify.post(
    '/:slug/administrators/handoff/preview',
    {
      schema: {
        params,
        body: Type.Object(pair, { additionalProperties: false }),
        response: previewResponse,
      },
    },
    async (request) => {
      const admin = await requireIdentityAdmin(fastify, request.params.slug, request.user.userId)
      const snapshot = await handoffSnapshot(
        fastify,
        fastify.prisma,
        admin.institutionId,
        request.user.userId,
        request.body,
      )
      const member = (
        value: typeof snapshot.from,
      ): { userId: string; role: string; user: { name: string } } => ({
        userId: value.userId,
        role: value.role,
        user: { name: value.user.name },
      })
      return {
        code: 0 as const,
        data: {
          digest: snapshot.digest,
          from: member(snapshot.from),
          to: member(snapshot.to),
          labs: snapshot.labs,
          grants: snapshot.grants.map((grant) => ({ id: grant.id, role: grant.role })),
          tasks: snapshot.tasks,
          invitations: snapshot.invitations,
          credentials: snapshot.credentials,
        },
      }
    },
  )
  fastify.post(
    '/:slug/administrators/handoff',
    {
      schema: {
        params,
        body: Type.Object(
          {
            ...pair,
            digest: Type.String({ pattern: '^[a-f0-9]{64}$' }),
            reason: Type.String({ minLength: 3, maxLength: 1000, pattern: '\\S' }),
            acknowledgeOutstanding: Type.Boolean(),
          },
          { additionalProperties: false },
        ),
        response: { 200: Type.Object({ code: Type.Literal(0), data: Type.Null() }) },
      },
    },
    async (request) => {
      const admin = await requireIdentityAdmin(fastify, request.params.slug, request.user.userId)
      await completeHandoff(fastify, admin.institutionId, request.user.userId, request.body)
      return { code: 0 as const, data: null }
    },
  )
}
