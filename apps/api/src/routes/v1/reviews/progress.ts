import { Type } from 'typebox'
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { requireProgressAccess } from '../../../review/progress-access'
import {
  getReviewProgress,
  getProgressHistory,
  projectProgressTasks,
  progressPageSize,
} from '../../../review/progress'
import * as schema from '../../../review/progress-schema'

export const progressRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  const params = Type.Object({ caseId: Type.String({ format: 'uuid' }) })
  fastify.get(
    '/cases/:caseId/progress',
    {
      schema: {
        params,
        querystring: schema.ProgressQuerySchema,
        response: { 200: schema.ProgressResponseSchema },
      },
    },
    async (request) =>
      fastify.prisma.$transaction(
        async (tx) => {
          const access = await requireProgressAccess(
            fastify,
            tx,
            request.user.userId,
            request.params.caseId,
          )
          const data = await getReviewProgress(tx, access, request.user.userId, request.query)
          if (!data) throw fastify.httpErrors.notFound('Review round not found')
          return { code: 0 as const, data }
        },
        { isolationLevel: 'RepeatableRead', timeout: 15000 },
      ),
  )
  fastify.get(
    '/cases/:caseId/history',
    {
      schema: {
        params,
        querystring: schema.ProgressHistoryQuerySchema,
        response: { 200: schema.ProgressHistoryResponseSchema },
      },
    },
    async (request) =>
      fastify.prisma.$transaction(
        async (tx) => {
          const access = await requireProgressAccess(
            fastify,
            tx,
            request.user.userId,
            request.params.caseId,
          )
          return { code: 0 as const, data: await getProgressHistory(tx, access, request.query) }
        },
        { isolationLevel: 'RepeatableRead' },
      ),
  )
  fastify.get(
    '/cases/:caseId/stages/:stepId/tasks',
    {
      schema: {
        params: Type.Object({ ...params.properties, stepId: Type.String({ format: 'uuid' }) }),
        querystring: schema.ProgressPageQuerySchema,
        response: { 200: schema.ProgressTasksResponseSchema },
      },
    },
    async (request) =>
      fastify.prisma.$transaction(
        async (tx) => {
          const access = await requireProgressAccess(
            fastify,
            tx,
            request.user.userId,
            request.params.caseId,
          )
          const step = await tx.content_review_step_instances.findFirst({
            where: { id: request.params.stepId, caseId: request.params.caseId },
          })
          if (!step) throw fastify.httpErrors.notFound('Review stage not found')
          const tasks = await tx.content_review_tasks.findMany({
            where: { stepId: step.id },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            skip: request.query.offset ?? 0,
            take: progressPageSize + 1,
          })
          return {
            code: 0 as const,
            data: {
              items: await projectProgressTasks(
                tx,
                access,
                request.user.userId,
                step,
                tasks.slice(0, progressPageSize),
              ),
              nextOffset:
                tasks.length > progressPageSize
                  ? (request.query.offset ?? 0) + progressPageSize
                  : null,
            },
          }
        },
        { isolationLevel: 'RepeatableRead', timeout: 15000 },
      ),
  )
}
