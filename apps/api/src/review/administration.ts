import type { FastifyInstance } from 'fastify'
import type { Static } from 'typebox'
import { requireIdentityAdmin } from '../identity/service'
import { lockMutationScope } from '../utils/advisory-lock'
import { personAdmitted, activeAppointmentWhere } from '../directory/policy'
import { ReviewerGrantSchema, GovernedWorkflowSchema } from './governance-schema'
import { snapshotJson } from './rounds'
import { enqueueInboxEvent } from './tasks'
import { eligibleGrantPeople } from './authorization'

export const grantReviewer = async (
  fastify: FastifyInstance,
  slug: string,
  userId: string,
  input: Static<typeof ReviewerGrantSchema>,
): Promise<string> => {
  const admin = await requireIdentityAdmin(fastify, slug, userId)
  return fastify.prisma.$transaction(async (tx) => {
    await lockMutationScope(tx, 'institution-identity', admin.institutionId)
    if (!(await personAdmitted(tx, admin.institutionId, input.personId)))
      throw fastify.httpErrors.conflict('Reviewer must be an active admitted person')
    const sourcePerson = await tx.institution_people.findFirst({
      where: {
        id: input.personId,
        institutionId: admin.institutionId,
        is_active: true,
        lifecycle_status: 'active',
        manually_suspended: false,
      },
    })
    if (!sourcePerson)
      throw fastify.httpErrors.conflict(
        'A temporary login exception cannot receive reviewer authority',
      )
    if (input.role === 'department' && !input.nodeId)
      throw fastify.httpErrors.badRequest('Department grants require a unit scope')
    if (['supervisor', 'responsible'].includes(input.role) && input.nodeId)
      throw fastify.httpErrors.badRequest(
        'Responsible-person grants use institution scope; the relationship limits each task',
      )
    const startsAt = new Date(input.startsAt)
    const endsAt = input.endsAt ? new Date(input.endsAt) : null
    if (endsAt && endsAt <= startsAt)
      throw fastify.httpErrors.badRequest('Grant expiry must be later than start')
    if (input.nodeId) {
      const node = await tx.institution_org_nodes.findFirst({
        where: { id: input.nodeId, institutionId: admin.institutionId, is_active: true },
      })
      if (!node)
        throw fastify.httpErrors.badRequest('Review scope must be an active institution unit')
      const appointment = await tx.institution_org_appointments.findFirst({
        where: {
          personId: input.personId,
          institutionId: admin.institutionId,
          ...activeAppointmentWhere(),
          position: { nodeId: node.id, is_active: true },
        },
      })
      if (!appointment)
        throw fastify.httpErrors.conflict('Reviewer needs a valid appointment in the scoped unit')
    }
    const appointments = await tx.institution_org_appointments.findMany({
      where: {
        institutionId: admin.institutionId,
        personId: input.personId,
        ...activeAppointmentWhere(),
        ...(input.nodeId
          ? { position: { nodeId: input.nodeId, is_active: true, node: { is_active: true } } }
          : {}),
      },
      select: { id: true },
    })
    const grant = await tx.institution_reviewer_grants.create({
      data: {
        ...input,
        nodeId: input.nodeId ?? null,
        institutionId: admin.institutionId,
        startsAt,
        endsAt,
        grantedBy: userId,
        appointmentIds: appointments.map((appointment) => appointment.id),
      },
    })
    await tx.institution_identity_events.create({
      data: {
        institutionId: admin.institutionId,
        personId: input.personId,
        actorUserId: userId,
        action: 'reviewer_granted',
        notes: `${grant.id}: ${input.notes}`.slice(0, 2000),
      },
    })
    return grant.id
  })
}

export const saveGovernedWorkflow = async (
  fastify: FastifyInstance,
  slug: string,
  userId: string,
  contentType: 'paper' | 'degree_thesis',
  input: Static<typeof GovernedWorkflowSchema>,
): Promise<void> => {
  const admin = await requireIdentityAdmin(fastify, slug, userId)
  // Every configured workflow retains a human final review. Author confirmation
  // cannot accidentally become the final publishing authority.
  const last = input.steps.at(-1)!
  if (!last.groups.some((group) => group.kind === 'role' && group.role === 'library_final'))
    throw fastify.httpErrors.badRequest(
      'The final stage must include an explicitly granted library final reviewer',
    )
  await fastify.prisma.$transaction(async (tx) => {
    await lockMutationScope(tx, 'institution-identity', admin.institutionId)
    for (const stage of input.steps)
      for (const group of stage.groups)
        if (
          group.kind === 'role' &&
          !(await eligibleGrantPeople(tx, admin.institutionId, group.role, group.nodeId ?? null))
            .length
        )
          throw fastify.httpErrors.conflict(
            'Configure active, scoped reviewer grants before enabling this workflow',
          )
    for (const step of input.steps)
      for (const personId of step.ccPersonIds ?? []) {
        if (
          !(await tx.institution_people.findFirst({
            where: { id: personId, institutionId: admin.institutionId },
          }))
        )
          throw fastify.httpErrors.badRequest('A CC recipient is outside this institution')
      }
    for (const step of input.steps)
      for (const group of step.groups)
        if (group.kind === 'role' && group.nodeId) {
          const node = await tx.institution_org_nodes.findFirst({
            where: { id: group.nodeId, institutionId: admin.institutionId, is_active: true },
          })
          if (!node)
            throw fastify.httpErrors.badRequest('A workflow scope is outside this institution')
        }
    const key = `governed-${contentType}`
    const workflow = await tx.institution_review_workflows.upsert({
      where: { institutionId_key: { institutionId: admin.institutionId, key } },
      create: { institutionId: admin.institutionId, key, name: input.name, createdBy: userId },
      update: { name: input.name, is_active: true, updatedAt: new Date() },
    })
    await tx.institution_review_workflow_steps.deleteMany({ where: { workflowId: workflow.id } })
    await tx.institution_review_workflow_steps.createMany({
      data: input.steps.map((step, index) => ({
        institutionId: admin.institutionId,
        workflowId: workflow.id,
        step_order: index + 1,
        name: step.name,
        resolver_type: 'governance',
        resolver_config: snapshotJson(step),
      })),
    })
    await tx.institution_review_workflow_bindings.deleteMany({ where: { workflowId: workflow.id } })
    await tx.institution_review_workflow_bindings.create({
      data: {
        institutionId: admin.institutionId,
        workflowId: workflow.id,
        binding_type: 'institution_default',
        content_type: contentType,
        priority: 1000,
      },
    })
    await tx.institution_identity_events.create({
      data: {
        institutionId: admin.institutionId,
        actorUserId: userId,
        action: 'review_workflow_changed',
        notes: `Workflow ${workflow.id}; ${input.steps.length} stages. Existing review rounds are unchanged.`,
      },
    })
  })
}

export const reassignReviewTask = async (
  fastify: FastifyInstance,
  slug: string,
  userId: string,
  taskId: string,
  input: { personId: string; nodeId?: string; notes: string; expectedVersionId: string },
): Promise<void> => {
  const admin = await requireIdentityAdmin(fastify, slug, userId)
  await fastify.prisma.$transaction(async (tx) => {
    await lockMutationScope(tx, 'institution-identity', admin.institutionId)
    const task = await tx.content_review_tasks.findFirst({
      where: { id: taskId, step: { institutionId: admin.institutionId } },
      include: { step: { include: { review_case: true } } },
    })
    if (
      !task ||
      task.status !== 'pending' ||
      task.step.status !== 'pending' ||
      task.step.review_case.currentVersionId !== input.expectedVersionId
    )
      throw fastify.httpErrors.conflict('Task or material version is no longer current')
    if (!(await personAdmitted(tx, admin.institutionId, input.personId)))
      throw fastify.httpErrors.conflict('Assignee is not currently admitted')
    if (task.kind === 'routing' || task.kind === 'relationship')
      throw fastify.httpErrors.conflict(
        'Correct the rule or responsible-person relationship and start a new round',
      )
    if (task.kind === 'author' && !task.personId)
      throw fastify.httpErrors.conflict(
        'Verify all participants and start a new review round; an unmatched author cannot be bypassed by reassignment',
      )
    if (task.kind === 'author' && task.personId && task.personId !== input.personId)
      throw fastify.httpErrors.conflict('Author confirmation cannot be delegated to another person')
    if (task.role === 'department' && !task.nodeId)
      throw fastify.httpErrors.conflict(
        'Verify all publication departments and start a new round before assigning representatives',
      )
    if (input.nodeId && input.nodeId !== task.nodeId)
      throw fastify.httpErrors.conflict('Reassignment cannot change the frozen review scope')
    const nodeId = task.nodeId
    if (task.role) {
      const eligible = await eligibleGrantPeople(tx, admin.institutionId, task.role, nodeId)
      if (!eligible.some((person) => person.id === input.personId))
        throw fastify.httpErrors.conflict('Assignee lacks a current scoped review grant')
    }
    await tx.content_review_tasks.update({
      where: { id: task.id },
      data: {
        assignedPersonId: input.personId,
        personId: task.kind === 'author' ? input.personId : task.personId,
        nodeId,
        exception: null,
        dueAt: new Date(Date.now() + 7 * 86400000),
      },
    })
    await tx.content_review_actions.create({
      data: {
        caseId: task.step.caseId,
        institutionId: admin.institutionId,
        stepId: task.stepId,
        taskId,
        roundNumber: task.step.roundNumber,
        actorId: userId,
        action: 'task_reassigned',
        from_status: 'pending_review',
        to_status: 'pending_review',
        versionId: input.expectedVersionId,
        notes: `From ${task.assignedPersonId ?? task.personId ?? 'unassigned'} to ${input.personId}; scope ${nodeId ?? 'institution'}; ${input.notes}`,
      },
    })
    await enqueueInboxEvent(tx, task.id, 'reassigned')
  })
}
