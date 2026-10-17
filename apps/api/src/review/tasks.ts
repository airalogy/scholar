import type {
  Prisma,
  content_review_cases,
  content_review_step_instances,
} from '../../prisma/generated/client'
import { Check } from 'typebox/value'
import { GovernedStepSchema, type GovernedStep } from './governance-schema'
import { eligibleGrantPeople } from './authorization'

export const enqueueInboxEvent = async (
  tx: Prisma.TransactionClient,
  taskId: string,
  eventType: string,
): Promise<void> => {
  const last = await tx.review_inbox_events.aggregate({
    where: { taskId },
    _max: { sequence: true },
  })
  await tx.review_inbox_events.create({
    data: { taskId, sequence: (last._max.sequence ?? 0) + 1, eventType },
  })
}

export const createStepTasks = async (
  tx: Prisma.TransactionClient,
  reviewCase: content_review_cases,
  step: content_review_step_instances,
): Promise<void> => {
  if (step.resolver_type !== 'governance') return
  if (!Check(GovernedStepSchema, step.resolver_config))
    throw new Error('Invalid governed workflow step')
  const config = step.resolver_config as GovernedStep
  const round = await tx.content_review_rounds.findUniqueOrThrow({
    where: { caseId_number: { caseId: reviewCase.id, number: step.roundNumber } },
  })
  const snapshot = round.materialSnapshot as Prisma.JsonObject
  const participants = snapshot.participants as { personIds?: string[]; nodeIds?: string[] } | null
  const definitions: Array<{
    kind: string
    role?: string
    personId?: string
    nodeId?: string
    exception?: string
  }> = []
  for (const group of config.groups) {
    if (group.kind === 'role')
      definitions.push({ kind: 'role', role: group.role, nodeId: group.nodeId })
    if (group.kind === 'departments') {
      // Historical publication affiliation is not inferred from today's employment.
      if (participants?.nodeIds?.length)
        for (const nodeId of participants.nodeIds)
          definitions.push({ kind: 'role', role: 'department', nodeId })
      else
        definitions.push({
          kind: 'role',
          role: 'department',
          exception: 'Publication department has not been verified',
        })
    }
    if (group.kind === 'authors') {
      if (participants?.personIds?.length)
        for (const personId of participants.personIds)
          definitions.push({ kind: 'author', personId })
      else
        definitions.push({
          kind: 'author',
          exception:
            'Institution authors have not been completely verified for this material version',
        })
    }
  }
  const deduplicated = new Map(definitions.map((item) => [JSON.stringify(item), item]))
  for (const personId of config.ccPersonIds ?? [])
    deduplicated.set(`cc:${personId}`, { kind: 'cc', personId })
  for (const definition of deduplicated.values()) {
    const eligible = definition.role
      ? await eligibleGrantPeople(
          tx,
          reviewCase.institutionId,
          definition.role,
          definition.nodeId ?? null,
        )
      : []
    const task = await tx.content_review_tasks.create({
      data: {
        ...definition,
        stepId: step.id,
        status:
          step.status === 'pending'
            ? definition.kind === 'cc'
              ? 'notified'
              : 'pending'
            : 'queued',
        exception:
          definition.exception ??
          (definition.role && !eligible.length ? 'No active scoped reviewer grant' : null),
        dueAt:
          step.status === 'pending' ? new Date(Date.now() + config.deadlineHours * 3600000) : null,
      },
    })
    if (task.status === 'pending' || task.status === 'notified')
      await enqueueInboxEvent(tx, task.id, 'created')
  }
}

export const activateStepTasks = async (
  tx: Prisma.TransactionClient,
  step: content_review_step_instances,
): Promise<void> => {
  const config = step.resolver_config as unknown as GovernedStep
  const tasks = await tx.content_review_tasks.findMany({
    where: { stepId: step.id, status: 'queued' },
  })
  for (const task of tasks) {
    await tx.content_review_tasks.update({
      where: { id: task.id },
      data: {
        status: task.kind === 'cc' ? 'notified' : 'pending',
        dueAt: new Date(Date.now() + config.deadlineHours * 3600000),
      },
    })
    await enqueueInboxEvent(tx, task.id, 'created')
  }
}
