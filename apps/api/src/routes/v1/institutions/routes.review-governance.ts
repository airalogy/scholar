import { Type } from 'typebox'
import {
  TypeBoxValidatorCompiler,
  type FastifyPluginAsyncTypebox,
} from '@fastify/type-provider-typebox'
import { requireIdentityAdmin } from '../../../identity/service'
import { lockMutationScope } from '../../../utils/advisory-lock'
import {
  grantReviewer,
  saveGovernedWorkflow,
  reassignReviewTask,
} from '../../../review/administration'
import { ReviewerGrantSchema, GovernedWorkflowSchema } from '../../../review/governance-schema'
import { publicReviewMaterial } from '../../../review/queries'
import { participantCandidates, verifyReviewParticipants } from '../../../review/participants'
import { enqueueInboxEvent } from '../../../review/tasks'

const params = Type.Object({ slug: Type.String() })
const response = { 200: Type.Object({ code: Type.Literal(0), data: Type.Unknown() }) }
const note = Type.String({ minLength: 1, maxLength: 2000 })

export const reviewGovernanceRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.setValidatorCompiler(TypeBoxValidatorCompiler)
  fastify.post(
    '/:slug/review-governance/changes/:changeId/retry',
    {
      schema: {
        params: Type.Object({ ...params.properties, changeId: Type.String({ format: 'uuid' }) }),
        body: Type.Object({ notes: note }),
        response,
      },
    },
    async (request) => {
      const admin = await requireIdentityAdmin(fastify, request.params.slug, request.user.userId)
      await fastify.prisma.$transaction(async (tx) => {
        const change = await tx.content_review_changes.findFirst({
          where: {
            id: request.params.changeId,
            institutionId: admin.institutionId,
            status: 'failed',
            review_case: { status: 'approved' },
          },
        })
        if (!change)
          throw fastify.httpErrors.conflict('No failed approved effect is available to retry')
        const updated = await tx.content_review_changes.updateMany({
          where: { id: change.id, status: 'failed' },
          data: { status: 'pending', error: null },
        })
        if (!updated.count) throw fastify.httpErrors.conflict('Execution state changed')
        await tx.content_review_rounds.updateMany({
          where: { caseId: change.caseId, status: 'approved' },
          data: { executionStatus: 'pending' },
        })
        await tx.institution_identity_events.create({
          data: {
            institutionId: admin.institutionId,
            actorUserId: admin.userId,
            action: 'review_effect_retry',
            notes: `${change.id}: ${request.body.notes}`.slice(0, 2000),
          },
        })
      })
      return { code: 0 as const, data: null }
    },
  )
  const caseParams = Type.Object({ ...params.properties, caseId: Type.String({ format: 'uuid' }) })
  fastify.get(
    '/:slug/review-governance/cases/:caseId/participants',
    { schema: { params: caseParams, response } },
    async (request) => {
      const admin = await requireIdentityAdmin(fastify, request.params.slug, request.user.userId)
      const reviewCase = await fastify.prisma.content_review_cases.findFirst({
        where: { id: request.params.caseId, institutionId: admin.institutionId },
      })
      if (!reviewCase) throw fastify.httpErrors.notFound('Review case not found')
      const people = await participantCandidates(fastify.prisma, reviewCase)
      return { code: 0 as const, data: { versionId: reviewCase.currentVersionId, people } }
    },
  )
  fastify.post(
    '/:slug/review-governance/cases/:caseId/participants',
    {
      schema: {
        params: caseParams,
        body: Type.Object(
          {
            versionId: Type.String({ format: 'uuid' }),
            personIds: Type.Array(Type.String({ format: 'uuid' }), {
              minItems: 1,
              maxItems: 500,
              uniqueItems: true,
            }),
            nodeIds: Type.Array(Type.String({ format: 'uuid' }), {
              maxItems: 100,
              uniqueItems: true,
            }),
            notes: note,
          },
          { additionalProperties: false },
        ),
        response,
      },
    },
    async (request) => {
      await verifyReviewParticipants(
        fastify,
        request.params.slug,
        request.user.userId,
        request.params.caseId,
        request.body,
      )
      return { code: 0 as const, data: null }
    },
  )
  fastify.get(
    '/:slug/review-governance',
    {
      schema: {
        params,
        querystring: Type.Object({
          offset: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
          nodeSearch: Type.Optional(Type.String({ maxLength: 200 })),
        }),
        response,
      },
    },
    async (request) => {
      const admin = await requireIdentityAdmin(fastify, request.params.slug, request.user.userId)
      const [grants, workflows, nodes, tasks, notifications, executionFailures] = await Promise.all(
        [
          fastify.prisma.institution_reviewer_grants.findMany({
            where: { institutionId: admin.institutionId },
            take: 100,
            skip: request.query.offset ?? 0,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            include: { person: { select: { name: true, userId: true, is_active: true } } },
          }),
          fastify.prisma.institution_review_workflows.findMany({
            where: { institutionId: admin.institutionId, key: { startsWith: 'governed-' } },
            include: { steps: { orderBy: { step_order: 'asc' } } },
          }),
          fastify.prisma.institution_org_nodes.findMany({
            where: {
              institutionId: admin.institutionId,
              is_active: true,
              ...(request.query.nodeSearch
                ? { name: { contains: request.query.nodeSearch, mode: 'insensitive' as const } }
                : {}),
            },
            take: 1000,
            select: { id: true, name: true },
          }),
          fastify.prisma.content_review_tasks.findMany({
            where: { status: 'pending', step: { institutionId: admin.institutionId } },
            take: 100,
            skip: request.query.offset ?? 0,
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            include: { step: { include: { round: true } } },
          }),
          fastify.prisma.review_inbox_events.groupBy({
            by: ['status'],
            where: { task: { step: { institutionId: admin.institutionId } } },
            _count: true,
          }),
          fastify.prisma.content_review_changes.findMany({
            where: { institutionId: admin.institutionId, status: 'failed' },
            take: 100,
            skip: request.query.offset ?? 0,
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: { id: true, kind: true, error: true, caseId: true },
          }),
        ],
      )
      return {
        code: 0 as const,
        data: {
          nextOffset:
            Math.max(grants.length, tasks.length, executionFailures.length) === 100
              ? (request.query.offset ?? 0) + 100
              : null,
          executionFailures,
          grants,
          workflows,
          nodes,
          notifications,
          tasks: tasks.map((task) => ({
            id: task.id,
            caseId: task.step.caseId,
            status: task.status,
            kind: task.kind,
            role: task.role,
            personId: task.personId,
            assignedPersonId: task.assignedPersonId,
            nodeId: task.nodeId,
            exception: task.exception,
            dueAt: task.dueAt,
            stage: task.step.step_name,
            versionId: task.step.round.versionId,
            material: publicReviewMaterial(task.step.round.materialSnapshot),
          })),
        },
      }
    },
  )
  fastify.post(
    '/:slug/review-governance/grants',
    { schema: { params, body: ReviewerGrantSchema, response } },
    async (request) => ({
      code: 0 as const,
      data: {
        id: await grantReviewer(fastify, request.params.slug, request.user.userId, request.body),
      },
    }),
  )
  fastify.post(
    '/:slug/review-governance/grants/:grantId/revoke',
    {
      schema: {
        params: Type.Object({ ...params.properties, grantId: Type.String({ format: 'uuid' }) }),
        body: Type.Object({ notes: note }),
        response,
      },
    },
    async (request) => {
      const admin = await requireIdentityAdmin(fastify, request.params.slug, request.user.userId)
      await fastify.prisma.$transaction(async (tx) => {
        await lockMutationScope(tx, 'institution-identity', admin.institutionId)
        const grant = await tx.institution_reviewer_grants.findFirst({
          where: { id: request.params.grantId, institutionId: admin.institutionId },
        })
        if (!grant) throw fastify.httpErrors.notFound('Review grant not found')
        if (grant.revokedAt) return
        await tx.institution_reviewer_grants.update({
          where: { id: grant.id },
          data: { revokedAt: new Date(), revokedBy: admin.userId },
        })
        await tx.institution_identity_events.create({
          data: {
            institutionId: admin.institutionId,
            personId: grant.personId,
            actorUserId: admin.userId,
            action: 'reviewer_revoked',
            notes: `${grant.id}: ${request.body.notes}`.slice(0, 2000),
          },
        })
      })
      return { code: 0 as const, data: null }
    },
  )
  fastify.put(
    '/:slug/review-governance/workflows/:contentType',
    {
      schema: {
        params: Type.Object({
          ...params.properties,
          contentType: Type.Union([Type.Literal('paper'), Type.Literal('degree_thesis')]),
        }),
        body: GovernedWorkflowSchema,
        response,
      },
    },
    async (request) => {
      await saveGovernedWorkflow(
        fastify,
        request.params.slug,
        request.user.userId,
        request.params.contentType,
        request.body,
      )
      return { code: 0 as const, data: null }
    },
  )
  fastify.post(
    '/:slug/review-governance/tasks/:taskId/reassign',
    {
      schema: {
        params: Type.Object({ ...params.properties, taskId: Type.String({ format: 'uuid' }) }),
        body: Type.Object({
          personId: Type.String({ format: 'uuid' }),
          nodeId: Type.Optional(Type.String({ format: 'uuid' })),
          notes: note,
          expectedVersionId: Type.String({ format: 'uuid' }),
        }),
        response,
      },
    },
    async (request) => {
      await reassignReviewTask(
        fastify,
        request.params.slug,
        request.user.userId,
        request.params.taskId,
        request.body,
      )
      return { code: 0 as const, data: null }
    },
  )
  fastify.post(
    '/:slug/review-governance/notifications/retry',
    { schema: { params, body: Type.Object({ notes: note }), response } },
    async (request) => {
      const admin = await requireIdentityAdmin(fastify, request.params.slug, request.user.userId)
      const result = await fastify.prisma.$transaction(async (tx) => {
        const updated = await tx.review_inbox_events.updateMany({
          where: { status: 'failed', task: { step: { institutionId: admin.institutionId } } },
          data: { status: 'pending', attempts: 0, availableAt: new Date(), error: null },
        })
        await tx.institution_identity_events.create({
          data: {
            institutionId: admin.institutionId,
            actorUserId: admin.userId,
            action: 'review_inbox_retry',
            notes: request.body.notes,
          },
        })
        return updated
      })
      return { code: 0 as const, data: { count: result.count } }
    },
  )
  fastify.post(
    '/:slug/review-governance/notifications/reconcile',
    {
      schema: {
        params,
        body: Type.Object({
          notes: note,
          offset: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
        }),
        response,
      },
    },
    async (request) => {
      const admin = await requireIdentityAdmin(fastify, request.params.slug, request.user.userId)
      const count = await fastify.prisma.$transaction(async (tx) => {
        await lockMutationScope(tx, 'institution-identity', admin.institutionId)
        const tasks = await tx.content_review_tasks.findMany({
          where: { step: { institutionId: admin.institutionId } },
          orderBy: { id: 'asc' },
          take: 100,
          skip: request.body.offset ?? 0,
          select: { id: true },
        })
        for (const task of tasks) await enqueueInboxEvent(tx, task.id, 'reconciled')
        await tx.institution_identity_events.create({
          data: {
            institutionId: admin.institutionId,
            actorUserId: admin.userId,
            action: 'review_inbox_reconciled',
            notes: request.body.notes,
          },
        })
        return tasks.length
      })
      return {
        code: 0 as const,
        data: { count, nextOffset: count === 100 ? (request.body.offset ?? 0) + 100 : null },
      }
    },
  )
}
