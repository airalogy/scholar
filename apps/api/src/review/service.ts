import type { FastifyInstance } from 'fastify'
import { Prisma } from '../../prisma/generated/client'
import {
  loadReviewResolutionContext,
  resolveApplicableWorkflow,
  resolveWorkflowStepReviewers,
} from '../utils/institution-org-structure'
import { getInstitutionAccessById, getUserPlatformRole } from '../utils/permissions'
import { lockMutationScope } from '../utils/advisory-lock'
import { userAdmitted } from '../directory/policy'
import { createReviewRound } from './rounds'
import { createStepTasks, activateStepTasks, enqueueInboxEvent } from './tasks'
import { canActOnTask } from './authorization'

export type ReviewContentType = 'paper' | 'degree_thesis'
export type ReviewCaseStatus =
  | 'draft'
  | 'pending_review'
  | 'changes_requested'
  | 'approved'
  | 'archived'
export type ReviewDecision = 'approve' | 'request_changes'

type ReviewClient = FastifyInstance['prisma'] | Prisma.TransactionClient

interface ReviewAuditContext {
  sourceIp?: string | null
  userAgent?: string | null
}

interface SubmitReviewCaseInput extends ReviewAuditContext {
  caseId: string
  actorId: string
  versionId: string
  reviewNodeId?: string | null
}

interface DecideReviewCaseInput extends ReviewAuditContext {
  caseId: string
  actorId: string
  decision: ReviewDecision
  notes?: string | null
  taskId?: string
  expectedVersionId?: string
}

interface EnsureReviewCaseInput {
  institutionId: string
  contentType: ReviewContentType
  subjectId: string
  currentVersionId?: string | null
  submittedBy: string
  reviewNodeId?: string | null
  initialStatus?: ReviewCaseStatus
}

const normalizeStatus = (value: string): ReviewCaseStatus => {
  if (
    value === 'draft' ||
    value === 'pending_review' ||
    value === 'changes_requested' ||
    value === 'approved' ||
    value === 'archived'
  ) {
    return value
  }
  return 'draft'
}

const toJson = (value: Prisma.JsonValue): Prisma.InputJsonValue => {
  return value as Prisma.InputJsonValue
}

export const ensureReviewCase = async (client: ReviewClient, input: EnsureReviewCaseInput) => {
  const now = new Date()
  return client.content_review_cases.upsert({
    where: {
      content_type_subjectId: {
        content_type: input.contentType,
        subjectId: input.subjectId,
      },
    },
    create: {
      institutionId: input.institutionId,
      content_type: input.contentType,
      subjectId: input.subjectId,
      currentVersionId: input.currentVersionId ?? null,
      submittedBy: input.submittedBy,
      reviewNodeId: input.reviewNodeId ?? null,
      status: input.initialStatus ?? 'draft',
      createdAt: now,
      updatedAt: now,
    },
    update: {
      institutionId: input.institutionId,
      currentVersionId: input.currentVersionId ?? undefined,
      submittedBy: input.submittedBy,
      reviewNodeId: input.reviewNodeId ?? undefined,
      updatedAt: now,
    },
  })
}

export const assertCanReviewContentCase = async (
  fastify: FastifyInstance,
  userId: string,
  reviewCase: {
    institutionId: string
    id?: string
    reviewNodeId?: string | null
    currentStep: number | null
    steps?: Array<{
      step_order: number
      status: string
      eligible_reviewer_user_ids: string[]
      id?: string
      resolver_type?: string
      resolver_config?: Prisma.JsonValue
    }>
  },
): Promise<void> => {
  const currentStep = reviewCase.steps?.find(
    (step) => step.step_order === reviewCase.currentStep && step.status === 'pending',
  )
  if (currentStep?.resolver_type === 'governance' && currentStep.id) {
    const tasks = await fastify.prisma.content_review_tasks.findMany({
      where: { stepId: currentStep.id, status: 'pending' },
    })
    for (const task of tasks)
      if (await canActOnTask(fastify.prisma, reviewCase.institutionId, userId, task)) return
    throw fastify.httpErrors.forbidden(
      'No current task is assigned to your verified identity and scope',
    )
  }
  const platformRole = await getUserPlatformRole(fastify, userId)
  if (platformRole === 'platform_admin') return
  if (!(await userAdmitted(fastify.prisma, reviewCase.institutionId, userId)))
    throw fastify.httpErrors.forbidden('Institution personnel status does not permit review')
  if (currentStep) {
    if (currentStep.resolver_type && currentStep.resolver_config) {
      const context = await loadReviewResolutionContext(fastify.prisma, reviewCase.institutionId)
      const live = resolveWorkflowStepReviewers(context, reviewCase.reviewNodeId ?? null, {
        resolver_type: currentStep.resolver_type,
        resolver_config: currentStep.resolver_config,
      })
      if (
        currentStep.eligible_reviewer_user_ids.includes(userId) &&
        live.eligibleUserIds.includes(userId)
      )
        return
    }
    throw fastify.httpErrors.forbidden(
      'You are not an eligible reviewer for the current review step',
    )
  }

  const access = await getInstitutionAccessById(fastify, userId, reviewCase.institutionId)
  if (!access.can_review_content) {
    throw fastify.httpErrors.forbidden('You do not have permission to review this content')
  }
}

export const canReviewContentCase = async (
  fastify: FastifyInstance,
  userId: string,
  reviewCase: Parameters<typeof assertCanReviewContentCase>[2],
): Promise<boolean> => {
  try {
    await assertCanReviewContentCase(fastify, userId, reviewCase)
    return true
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      error.statusCode === 403
    )
      return false
    throw error
  }
}

export const submitReviewCase = async (
  fastify: FastifyInstance,
  client: ReviewClient,
  input: SubmitReviewCaseInput,
) => {
  const initial = await client.content_review_cases.findUnique({
    where: { id: input.caseId },
  })
  if (!initial) {
    throw fastify.httpErrors.notFound('Review case not found')
  }
  await lockMutationScope(
    client as Prisma.TransactionClient,
    'institution-identity',
    initial.institutionId,
  )
  const existing = await client.content_review_cases.findUniqueOrThrow({
    where: { id: input.caseId },
  })
  const previousStatus = normalizeStatus(existing.status)
  if (previousStatus === 'archived') {
    throw fastify.httpErrors.badRequest('This content cannot be submitted in its current state')
  }
  if (previousStatus === 'pending_review' && existing.currentVersionId === input.versionId) {
    const round = await client.content_review_rounds.findFirst({
      where: { caseId: existing.id, number: existing.currentRound, versionId: input.versionId },
    })
    if (round) return existing
  }

  await lockMutationScope(
    client as Prisma.TransactionClient,
    'institution-identity',
    existing.institutionId,
  )
  const change =
    existing.content_type === 'change_request'
      ? await client.content_review_changes.findUniqueOrThrow({ where: { id: existing.subjectId } })
      : null
  const contentType = (change?.subjectType ?? existing.content_type) as ReviewContentType
  const resolvedWorkflow = await resolveApplicableWorkflow(
    client,
    existing.institutionId,
    input.reviewNodeId ?? existing.reviewNodeId,
    contentType,
  )
  if (resolvedWorkflow && resolvedWorkflow.steps.length > 10) {
    throw fastify.httpErrors.badRequest('A review workflow cannot exceed ten stages')
  }

  const now = new Date()
  await lockMutationScope(
    client as Prisma.TransactionClient,
    'institution-identity',
    existing.institutionId,
  )
  const roundNumber = await createReviewRound(
    client as Prisma.TransactionClient,
    existing,
    input.versionId,
    resolvedWorkflow,
  )
  const oldTasks = await client.content_review_tasks.findMany({
    where: { step: { caseId: existing.id }, status: { in: ['pending', 'queued'] } },
  })
  for (const task of oldTasks) {
    await client.content_review_tasks.update({
      where: { id: task.id },
      data: { status: 'superseded' },
    })
    await enqueueInboxEvent(client as Prisma.TransactionClient, task.id, 'cancelled')
  }
  await client.content_review_step_instances.updateMany({
    where: { caseId: existing.id, status: { in: ['pending', 'queued'] } },
    data: { status: 'cancelled', updatedAt: now },
  })

  const firstStepOrder = resolvedWorkflow?.steps[0]?.step_order ?? null
  if (resolvedWorkflow && firstStepOrder !== null) {
    const context = await loadReviewResolutionContext(client, existing.institutionId)
    await client.content_review_step_instances.createMany({
      data: resolvedWorkflow.steps.map((step) => {
        const resolved = resolveWorkflowStepReviewers(
          context,
          input.reviewNodeId ?? existing.reviewNodeId,
          step,
        )
        return {
          caseId: existing.id,
          roundNumber,
          institutionId: existing.institutionId,
          workflowId: resolvedWorkflow.workflow.id,
          step_order: step.step_order,
          step_name: step.name,
          status: step.step_order === firstStepOrder ? 'pending' : 'queued',
          resolver_type: step.resolver_type,
          resolver_config: toJson(step.resolver_config),
          eligible_reviewer_user_ids: resolved.eligibleUserIds,
          resolution_notes: resolved.resolutionNotes,
          createdAt: now,
          updatedAt: now,
        }
      }),
    })
    const createdSteps = await client.content_review_step_instances.findMany({
      where: { caseId: existing.id, roundNumber },
    })
    for (const step of createdSteps)
      await createStepTasks(client as Prisma.TransactionClient, existing, step)
  }

  const updated = await client.content_review_cases.update({
    where: { id: existing.id },
    data: {
      currentVersionId: input.versionId,
      currentRound: roundNumber,
      reviewNodeId: input.reviewNodeId ?? existing.reviewNodeId,
      workflowId: resolvedWorkflow?.workflow.id ?? null,
      status: 'pending_review',
      currentStep: firstStepOrder,
      decision_notes: null,
      decidedBy: null,
      decidedAt: null,
      submittedAt: now,
      updatedAt: now,
    },
  })

  await client.content_review_actions.create({
    data: {
      caseId: existing.id,
      roundNumber,
      institutionId: existing.institutionId,
      actorId: input.actorId,
      action: previousStatus === 'draft' ? 'submitted' : 'resubmitted',
      from_status: previousStatus,
      to_status: 'pending_review',
      versionId: input.versionId,
      notes: null,
      sourceIp: input.sourceIp ?? null,
      userAgent: input.userAgent?.slice(0, 1000) ?? null,
      createdAt: now,
    },
  })

  return updated
}

export const decideReviewCase = async (
  fastify: FastifyInstance,
  client: ReviewClient,
  input: DecideReviewCaseInput,
) => {
  const initial = await client.content_review_cases.findUnique({ where: { id: input.caseId } })
  if (!initial) throw fastify.httpErrors.notFound('Review case not found')
  await lockMutationScope(
    client as Prisma.TransactionClient,
    'institution-identity',
    initial.institutionId,
  )
  const reviewCase = await client.content_review_cases.findUnique({
    where: { id: input.caseId },
    include: { steps: { orderBy: { step_order: 'asc' } } },
  })
  if (!reviewCase) {
    throw fastify.httpErrors.notFound('Review case not found')
  }
  if (reviewCase.status !== 'pending_review') {
    throw fastify.httpErrors.badRequest('Only content awaiting review can be reviewed')
  }
  await lockMutationScope(
    client as Prisma.TransactionClient,
    'institution-identity',
    reviewCase.institutionId,
  )
  if (input.expectedVersionId && reviewCase.currentVersionId !== input.expectedVersionId)
    throw fastify.httpErrors.conflict('Review material changed; reload the current round')
  const now = new Date()
  const currentStep = reviewCase.steps.find(
    (step) => step.step_order === reviewCase.currentStep && step.status === 'pending',
  )
  if (currentStep?.resolver_type === 'governance') {
    if (!input.taskId || !input.expectedVersionId)
      throw fastify.httpErrors.conflict('Open the versioned review task to record a decision')
    const task = await client.content_review_tasks.findFirst({
      where: { id: input.taskId, stepId: currentStep.id },
    })
    if (
      !task ||
      !(await canActOnTask(
        client as Prisma.TransactionClient,
        reviewCase.institutionId,
        input.actorId,
        task,
      ))
    )
      throw fastify.httpErrors.forbidden(
        'Task is unavailable or your current review authority is insufficient',
      )
    if (input.decision === 'request_changes' && !input.notes?.trim())
      throw fastify.httpErrors.badRequest('Review notes are required when requesting changes')
    await client.content_review_tasks.update({
      where: { id: task.id },
      data: {
        status: input.decision === 'approve' ? 'approved' : 'changes_requested',
        completedBy: input.actorId,
        completedAt: now,
      },
    })
    await enqueueInboxEvent(client as Prisma.TransactionClient, task.id, 'completed')
    await client.content_review_actions.create({
      data: {
        caseId: reviewCase.id,
        institutionId: reviewCase.institutionId,
        roundNumber: currentStep.roundNumber,
        stepId: currentStep.id,
        taskId: task.id,
        actorId: input.actorId,
        action: input.decision === 'approve' ? 'task_approved' : 'task_changes_requested',
        sourceIp: input.sourceIp,
        userAgent: input.userAgent?.slice(0, 1000),
        from_status: 'pending_review',
        to_status: 'pending_review',
        versionId: reviewCase.currentVersionId,
        notes: input.notes?.trim() || null,
      },
    })
    const outstanding = await client.content_review_tasks.count({
      where: { stepId: currentStep.id, kind: { not: 'cc' }, status: { not: 'approved' } },
    })
    if (input.decision === 'approve' && outstanding > 0) return reviewCase
  } else {
    // Use the same transaction for the final live permission check.
    const scoped = Object.create(fastify) as FastifyInstance
    Object.defineProperty(scoped, 'prisma', { value: client })
    await assertCanReviewContentCase(scoped, input.actorId, reviewCase)
  }

  if (input.decision === 'request_changes') {
    if (!input.notes?.trim()) {
      throw fastify.httpErrors.badRequest('Review notes are required when requesting changes')
    }
    if (currentStep) {
      await client.content_review_step_instances.update({
        where: { id: currentStep.id },
        data: {
          status: 'changes_requested',
          review_notes: input.notes.trim(),
          reviewedBy: input.actorId,
          reviewedAt: now,
          updatedAt: now,
        },
      })
      await client.content_review_step_instances.updateMany({
        where: { caseId: reviewCase.id, status: 'queued' },
        data: { status: 'cancelled', updatedAt: now },
      })
    }

    const updated = await client.content_review_cases.update({
      where: { id: reviewCase.id },
      data: {
        status: 'changes_requested',
        currentStep: null,
        decision_notes: input.notes.trim(),
        decidedBy: input.actorId,
        decidedAt: now,
        updatedAt: now,
      },
    })
    await client.content_review_rounds.updateMany({
      where: { caseId: reviewCase.id, number: reviewCase.currentRound },
      data: { status: 'changes_requested', completedAt: now },
    })
    const cancelled = await client.content_review_tasks.findMany({
      where: {
        step: { caseId: reviewCase.id, roundNumber: reviewCase.currentRound },
        status: { in: ['pending', 'queued', 'notified'] },
      },
    })
    for (const task of cancelled) {
      await client.content_review_tasks.update({
        where: { id: task.id },
        data: { status: 'cancelled' },
      })
      await enqueueInboxEvent(client as Prisma.TransactionClient, task.id, 'cancelled')
    }
    await client.content_review_actions.create({
      data: {
        caseId: reviewCase.id,
        roundNumber: reviewCase.currentRound,
        institutionId: reviewCase.institutionId,
        stepId: currentStep?.id ?? null,
        step_order: currentStep?.step_order ?? null,
        step_name: currentStep?.step_name ?? null,
        actorId: input.actorId,
        action: 'changes_requested',
        from_status: 'pending_review',
        to_status: 'changes_requested',
        versionId: reviewCase.currentVersionId,
        notes: input.notes.trim(),
        sourceIp: input.sourceIp ?? null,
        userAgent: input.userAgent?.slice(0, 1000) ?? null,
        createdAt: now,
      },
    })
    return updated
  }

  if (currentStep) {
    await client.content_review_step_instances.update({
      where: { id: currentStep.id },
      data: {
        status: 'approved',
        review_notes: input.notes?.trim() || null,
        reviewedBy: input.actorId,
        reviewedAt: now,
        updatedAt: now,
      },
    })
  }

  const nextStep = currentStep
    ? reviewCase.steps.find(
        (step) => step.step_order > currentStep.step_order && step.status === 'queued',
      )
    : null
  if (nextStep) {
    await client.content_review_step_instances.update({
      where: { id: nextStep.id },
      data: { status: 'pending', updatedAt: now },
    })
    await activateStepTasks(client as Prisma.TransactionClient, nextStep)
  }

  const finalApproval = !nextStep
  if (finalApproval)
    await client.content_review_rounds.updateMany({
      where: { caseId: reviewCase.id, number: reviewCase.currentRound },
      data: { status: 'approved', executionStatus: 'pending', completedAt: now },
    })
  if (finalApproval && reviewCase.content_type === 'change_request')
    await client.content_review_changes.update({
      where: { caseId: reviewCase.id },
      data: { status: 'pending', error: null },
    })
  const updated = await client.content_review_cases.update({
    where: { id: reviewCase.id },
    data: {
      status: finalApproval ? 'approved' : 'pending_review',
      currentStep: nextStep?.step_order ?? null,
      decision_notes: finalApproval ? input.notes?.trim() || null : null,
      decidedBy: finalApproval ? input.actorId : null,
      decidedAt: finalApproval ? now : null,
      updatedAt: now,
    },
  })

  await client.content_review_actions.create({
    data: {
      caseId: reviewCase.id,
      roundNumber: reviewCase.currentRound,
      institutionId: reviewCase.institutionId,
      stepId: currentStep?.id ?? null,
      step_order: currentStep?.step_order ?? null,
      step_name: currentStep?.step_name ?? null,
      actorId: input.actorId,
      action: finalApproval ? 'approved' : 'step_approved',
      from_status: 'pending_review',
      to_status: updated.status,
      versionId: reviewCase.currentVersionId,
      notes: input.notes?.trim() || null,
      sourceIp: input.sourceIp ?? null,
      userAgent: input.userAgent?.slice(0, 1000) ?? null,
      createdAt: now,
    },
  })

  return updated
}

export const getReviewHistory = async (client: ReviewClient, caseId: string) => {
  return client.content_review_actions.findMany({
    where: { caseId },
    include: {
      actor: { select: { id: true, name: true } },
      step: { select: { id: true, step_order: true, step_name: true } },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
}
