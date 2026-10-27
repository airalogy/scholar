import type { Prisma, content_review_tasks } from '../../prisma/generated/client'
import { canActOnTask, eligibleGrantPeople } from './authorization'
import type { ProgressAccess } from './progress-access'
import type { ProgressTask, ReviewProgress, ProgressHistory } from './progress-schema'

export const progressPageSize = 50
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
const string = (value: unknown): string | null => (typeof value === 'string' ? value : null)

export const projectProgressTasks = async (
  tx: Prisma.TransactionClient,
  access: ProgressAccess,
  userId: string,
  step: { status: string; roundNumber: number },
  tasks: content_review_tasks[],
): Promise<ProgressTask[]> => {
  const activeRound =
    step.roundNumber === access.reviewCase.currentRound &&
    access.reviewCase.status === 'pending_review'
  const groups = new Map<string, { names: string[]; ids: string[] }>()
  const result: ProgressTask[] = []
  for (const task of tasks) {
    let candidateNames: string[] = []
    let candidateCount: number | null = null
    let blocked = task.exception
    const active = activeRound && step.status === 'pending' && task.status === 'pending'
    if (active && task.kind === 'role' && task.role) {
      const key = `${task.role}:${task.nodeId}`
      if (!groups.has(key)) {
        const eligible = (
          await eligibleGrantPeople(tx, access.reviewCase.institutionId, task.role, task.nodeId)
        ).filter((person) => person.userId !== access.reviewCase.submittedBy)
        const people =
          access.viewer === 'administrator'
            ? await tx.institution_people.findMany({
                where: { id: { in: eligible.map((person) => person.id) } },
                select: { name: true },
                take: 20,
                orderBy: [{ name: 'asc' }, { id: 'asc' }],
              })
            : []
        groups.set(key, {
          names: people.map((person) => person.name),
          ids: eligible.map((person) => person.id),
        })
      }
      const group = groups.get(key)!
      if (
        !group.ids.length ||
        (task.assignedPersonId && !group.ids.includes(task.assignedPersonId))
      )
        blocked ??= 'No active scoped reviewer grant'
      if (access.viewer === 'administrator' && !task.assignedPersonId) {
        candidateCount = group.ids.length
        candidateNames = group.names
      }
    }
    result.push({
      id: task.id,
      kind: task.kind,
      role: task.role,
      status: task.status,
      personName: task.personName,
      assignedPersonName: task.assignedPersonName,
      completedByName: task.completedByName,
      nodeName: task.nodeName,
      hasPerson: !!task.personId,
      hasAssignee: !!task.assignedPersonId,
      hasCompletedBy: !!task.completedBy,
      hasNode: !!task.nodeId,
      dueAt: task.dueAt?.toISOString() ?? null,
      completedAt: task.completedAt?.toISOString() ?? null,
      overdue: Boolean(active && task.dueAt && task.dueAt <= new Date()),
      exception: blocked
        ? access.viewer === 'administrator'
          ? blocked
          : 'administrator_action_required'
        : null,
      canAct: active && (await canActOnTask(tx, access.reviewCase.institutionId, userId, task)),
      candidateNames,
      candidateCount,
    })
  }
  return result
}

export const getReviewProgress = async (
  tx: Prisma.TransactionClient,
  access: ProgressAccess,
  userId: string,
  query: { roundNumber?: number; roundOffset?: number },
): Promise<ReviewProgress | null> => {
  const reviewCase = access.reviewCase
  const number = query.roundNumber ?? reviewCase.currentRound
  const round = number
    ? await tx.content_review_rounds.findUnique({
        where: { caseId_number: { caseId: reviewCase.id, number } },
        include: {
          steps: {
            orderBy: { step_order: 'asc' },
            include: {
              tasks: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: progressPageSize + 1 },
            },
          },
        },
      })
    : null
  if (number && !round) return null
  const rounds = await tx.content_review_rounds.findMany({
    where: { caseId: reviewCase.id },
    orderBy: { number: 'desc' },
    skip: query.roundOffset ?? 0,
    take: 21,
    select: { number: true, status: true, createdAt: true },
  })
  const material = record(round?.materialSnapshot)
  const original = record(material.beforeSnapshot)
  const metadata = record(material.metadata_snapshot)
  const workflow = record(round?.workflowSnapshot)
  const rule = record(record(workflow.routing).selected)
  const totals = round
    ? await tx.content_review_tasks.groupBy({
        by: ['stepId', 'status', 'kind'],
        where: { step: { caseId: reviewCase.id, roundNumber: number } },
        _count: { _all: true },
      })
    : []
  const stages: NonNullable<ReviewProgress['round']>['stages'] = []
  for (const step of round?.steps ?? []) {
    const counts = totals.filter((item) => item.stepId === step.id && item.kind !== 'cc')
    stages.push({
      id: step.id,
      name: step.step_name,
      order: step.step_order,
      status: step.status,
      legacy: step.resolver_type !== 'governance',
      taskCount: counts.reduce((sum, item) => sum + item._count._all, 0),
      approvedCount: counts
        .filter((item) => item.status === 'approved')
        .reduce((sum, item) => sum + item._count._all, 0),
      tasks: await projectProgressTasks(
        tx,
        access,
        userId,
        step,
        step.tasks.slice(0, progressPageSize),
      ),
      nextTaskOffset: step.tasks.length > progressPageSize ? progressPageSize : null,
    })
  }
  return {
    caseId: reviewCase.id,
    title:
      string(metadata.title) ??
      string(material.title) ??
      string(record(material.paper).title) ??
      string(original.title) ??
      '',
    contentType: reviewCase.content_type,
    status: reviewCase.status,
    currentRound: reviewCase.currentRound,
    viewer: access.viewer,
    rounds: rounds
      .slice(0, 20)
      .map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })),
    nextRoundOffset: rounds.length > 20 ? (query.roundOffset ?? 0) + 20 : null,
    round: round
      ? {
          number: round.number,
          versionId: round.versionId,
          status: round.status,
          executionStatus: round.executionStatus,
          createdAt: round.createdAt.toISOString(),
          completedAt: round.completedAt?.toISOString() ?? null,
          workflowName: string(record(workflow.workflow).name),
          ruleName: string(rule.name),
          ruleRevision: typeof rule.revision === 'number' ? rule.revision : null,
          stages,
        }
      : null,
  }
}

const publicNoteActions = new Set([
  'submitted',
  'resubmitted',
  'task_approved',
  'task_changes_requested',
  'approved',
  'step_approved',
  'changes_requested',
  'withdrawn',
  'rejected',
  'change_proposed',
])
export const getProgressHistory = async (
  tx: Prisma.TransactionClient,
  access: ProgressAccess,
  query: { roundNumber?: number; offset?: number; taskId?: string },
): Promise<ProgressHistory> => {
  const items = await tx.content_review_actions.findMany({
    where: {
      caseId: access.reviewCase.id,
      ...(query.roundNumber ? { roundNumber: query.roundNumber } : {}),
      ...(query.taskId ? { taskId: query.taskId } : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: query.offset ?? 0,
    take: progressPageSize + 1,
    include: { step: { select: { step_name: true } } },
  })
  return {
    items: items.slice(0, progressPageSize).map((item) => ({
      id: item.id,
      action: item.action,
      actorName: item.actorName,
      assigneeName: item.assigneeName,
      roundNumber: item.roundNumber,
      stageName: item.step_name ?? item.step?.step_name ?? null,
      taskId: item.taskId,
      notes:
        access.viewer === 'administrator' || publicNoteActions.has(item.action) ? item.notes : null,
      createdAt: item.createdAt.toISOString(),
    })),
    nextOffset: items.length > progressPageSize ? (query.offset ?? 0) + progressPageSize : null,
  }
}
