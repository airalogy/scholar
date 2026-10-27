import { Type } from 'typebox'
import {
  TypeBoxValidatorCompiler,
  type FastifyPluginAsyncTypebox,
} from '@fastify/type-provider-typebox'
import { getConfiguredInstitution } from '../../../utils/institution-scope'
import { personalTaskWhere, canReadReviewTask, publicReviewMaterial } from '../../../review/queries'
import { canActOnTask } from '../../../review/authorization'
import { TaskDecisionSchema } from '../../../review/governance-schema'
import { reviewPaper } from '../../papers/service.claim-review'
import { reviewDegreeThesis } from '../theses/service'
import { CreateReviewChangeSchema } from '../../../review/changes-schema'
import { createReviewChange, changeContext } from '../../../review/changes'
import { decideReviewCase } from '../../../review/service'
import { lockMutationScope } from '../../../utils/advisory-lock'
import { closeReviewCase } from '../../../review/closing'
import { progressRoutes } from './progress'

const response = { 200: Type.Object({ code: Type.Literal(0), data: Type.Unknown() }) }
const params = Type.Object({ taskId: Type.String({ format: 'uuid' }) })
const page = Type.Object({ offset: Type.Optional(Type.Integer({ minimum: 0, default: 0 })) })

const reviewRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.setValidatorCompiler(TypeBoxValidatorCompiler)
  await fastify.register(progressRoutes)
  fastify.get(
    '/subjects/:subjectType/:subjectId',
    {
      schema: {
        params: Type.Object({
          subjectType: Type.Union([Type.Literal('paper'), Type.Literal('degree_thesis')]),
          subjectId: Type.String({ format: 'uuid' }),
        }),
        response,
      },
    },
    async (request) => {
      const institution = await getConfiguredInstitution(fastify)
      return {
        code: 0 as const,
        data: await changeContext(
          fastify,
          institution.id,
          request.user.userId,
          request.params.subjectType,
          request.params.subjectId,
        ),
      }
    },
  )
  fastify.post(
    '/changes',
    {
      schema: {
        body: CreateReviewChangeSchema,
        headers: Type.Object({ 'idempotency-key': Type.String({ minLength: 1, maxLength: 128 }) }),
        response,
      },
    },
    async (request) => {
      const institution = await getConfiguredInstitution(fastify)
      return {
        code: 0 as const,
        data: await createReviewChange(
          fastify,
          institution.id,
          request.user.userId,
          request.headers['idempotency-key'],
          request.body,
        ),
      }
    },
  )
  fastify.post(
    '/cases/:caseId/close',
    {
      schema: {
        params: Type.Object({ caseId: Type.String({ format: 'uuid' }) }),
        body: Type.Object(
          {
            versionId: Type.String({ format: 'uuid' }),
            outcome: Type.Union([Type.Literal('withdrawn'), Type.Literal('rejected')]),
            notes: Type.String({ minLength: 1, maxLength: 2000 }),
            taskId: Type.Optional(Type.String({ format: 'uuid' })),
          },
          { additionalProperties: false },
        ),
        response,
      },
    },
    async (request) => {
      const institution = await getConfiguredInstitution(fastify)
      await closeReviewCase(
        fastify,
        institution.id,
        request.user.userId,
        request.params.caseId,
        request.body,
      )
      return { code: 0 as const, data: null }
    },
  )
  fastify.get('/tasks', { schema: { querystring: page, response } }, async (request) => {
    const institution = await getConfiguredInstitution(fastify)
    const where = await personalTaskWhere(fastify.prisma, institution.id, request.user.userId)
    const tasks = await fastify.prisma.content_review_tasks.findMany({
      where,
      take: 30,
      skip: request.query.offset ?? 0,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { step: { include: { round: true } } },
    })
    const items = []
    for (const task of tasks)
      if (await canReadReviewTask(fastify.prisma, institution.id, request.user.userId, task.id))
        items.push({
          id: task.id,
          kind: task.kind,
          role: task.role,
          status: task.status,
          dueAt: task.dueAt,
          stage: task.step.step_name,
          round: task.step.roundNumber,
          material: publicReviewMaterial(task.step.round.materialSnapshot),
          canAct:
            task.step.status === 'pending' &&
            (await canActOnTask(fastify.prisma, institution.id, request.user.userId, task)),
        })
    return {
      code: 0 as const,
      data: { items, nextOffset: tasks.length === 30 ? (request.query.offset ?? 0) + 30 : null },
    }
  })
  fastify.get('/applications', { schema: { querystring: page, response } }, async (request) => {
    const institution = await getConfiguredInstitution(fastify)
    const items = await fastify.prisma.content_review_cases.findMany({
      where: { institutionId: institution.id, submittedBy: request.user.userId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 30,
      skip: request.query.offset ?? 0,
      include: {
        rounds: {
          orderBy: { number: 'desc' },
          take: 10,
          include: {
            steps: {
              orderBy: { step_order: 'asc' },
              include: {
                tasks: {
                  select: {
                    id: true,
                    status: true,
                    kind: true,
                    role: true,
                    exception: true,
                    dueAt: true,
                  },
                },
              },
            },
          },
        },
      },
    })
    return {
      code: 0 as const,
      data: {
        items: items.map((item) => ({
          id: item.id,
          contentType: item.content_type,
          subjectId: item.subjectId,
          status: item.status,
          rounds: item.rounds.map((round) => ({
            id: round.id,
            versionId: round.versionId,
            number: round.number,
            status: round.status,
            executionStatus: round.executionStatus,
            material: publicReviewMaterial(round.materialSnapshot),
            stages: round.steps.map((step) => ({
              name: step.step_name,
              status: step.status,
              tasks: step.tasks.filter((task) => task.kind !== 'cc'),
            })),
          })),
        })),
        nextOffset: items.length === 30 ? (request.query.offset ?? 0) + 30 : null,
      },
    }
  })
  fastify.get('/tasks/:taskId', { schema: { params, response } }, async (request) => {
    const institution = await getConfiguredInstitution(fastify)
    if (
      !(await canReadReviewTask(
        fastify.prisma,
        institution.id,
        request.user.userId,
        request.params.taskId,
      ))
    )
      throw fastify.httpErrors.notFound('Review task not found')
    const task = await fastify.prisma.content_review_tasks.findUniqueOrThrow({
      where: { id: request.params.taskId },
      include: { step: { include: { round: true } } },
    })
    const previous = await fastify.prisma.content_review_rounds.findFirst({
      where: { caseId: task.step.caseId, number: { lt: task.step.roundNumber } },
      orderBy: { number: 'desc' },
    })
    const history = await fastify.prisma.content_review_actions.findMany({
      where: { taskId: task.id },
      select: { action: true, notes: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: 100,
    })
    return {
      code: 0 as const,
      data: {
        id: task.id,
        caseId: task.step.caseId,
        kind: task.kind,
        role: task.role,
        status: task.status,
        stage: task.step.step_name,
        round: task.step.roundNumber,
        versionId: task.step.round.versionId,
        digest: task.step.round.materialDigest,
        material: publicReviewMaterial(task.step.round.materialSnapshot),
        previousMaterial: previous ? publicReviewMaterial(previous.materialSnapshot) : null,
        dueAt: task.dueAt,
        history: history.map((item) => ({
          ...item,
          notes: item.action === 'task_reassigned' ? null : item.notes,
        })),
        canAct:
          task.step.status === 'pending' &&
          (await canActOnTask(fastify.prisma, institution.id, request.user.userId, task)),
      },
    }
  })
  fastify.post(
    '/tasks/:taskId/decision',
    { schema: { params, body: TaskDecisionSchema, response } },
    async (request) => {
      const institution = await getConfiguredInstitution(fastify)
      const task = await fastify.prisma.content_review_tasks.findFirst({
        where: { id: request.params.taskId, step: { institutionId: institution.id } },
        include: { step: { include: { review_case: true } } },
      })
      if (!task || task.step.status !== 'pending')
        throw fastify.httpErrors.conflict('Task is no longer current')
      const body = {
        taskId: task.id,
        expectedVersionId: request.body.versionId,
        decision: request.body.decision,
        notes: request.body.notes,
      }
      if (task.step.review_case.content_type === 'change_request')
        await fastify.prisma.$transaction(async (tx) => {
          await lockMutationScope(tx, 'review-change', task.step.review_case.subjectId)
          await decideReviewCase(fastify, tx, {
            caseId: task.step.caseId,
            actorId: request.user.userId,
            ...body,
            sourceIp: request.ip,
            userAgent: request.headers['user-agent'],
          })
        })
      else if (task.step.review_case.content_type === 'paper')
        await reviewPaper(fastify, task.step.review_case.subjectId, body, request.user.userId, {
          sourceIp: request.ip,
          userAgent: request.headers['user-agent'],
        })
      else
        await reviewDegreeThesis(
          fastify,
          task.step.review_case.subjectId,
          body,
          request.user.userId,
          { sourceIp: request.ip, userAgent: request.headers['user-agent'] },
        )
      return { code: 0 as const, data: null }
    },
  )
}
export default reviewRoutes
