import type { Prisma, content_review_tasks } from '../../prisma/generated/client'
import { activeAppointmentWhere, personAdmitted } from '../directory/policy'

export const eligibleGrantPeople = async (
  tx: Prisma.TransactionClient,
  institutionId: string,
  role: string,
  nodeId: string | null,
): Promise<Array<{ id: string; userId: string | null }>> => {
  const now = new Date()
  const policy = await tx.institution_directory_policies.findUnique({ where: { institutionId } })
  const grantWhere = {
    institutionId,
    role,
    nodeId,
    revokedAt: null,
    startsAt: { lte: now },
    OR: [{ endsAt: null }, { endsAt: { gt: now } }],
  }
  const people = await tx.institution_people.findMany({
    where: {
      institutionId,
      is_active: true,
      lifecycle_status: 'active',
      manually_suspended: false,
      ...(policy?.admissionMode === 'directory' ? { directory_record: { isNot: null } } : {}),
      reviewer_grants: { some: grantWhere },
      ...(nodeId
        ? {
            appointments: {
              some: {
                ...activeAppointmentWhere(now),
                position: { nodeId, is_active: true, node: { is_active: true } },
              },
            },
          }
        : {}),
    },
    select: {
      id: true,
      userId: true,
      reviewer_grants: { where: grantWhere, select: { appointmentIds: true } },
      appointments: {
        where: {
          ...activeAppointmentWhere(now),
          ...(nodeId ? { position: { nodeId, is_active: true, node: { is_active: true } } } : {}),
        },
        select: { id: true },
      },
    },
  })
  return people
    .filter((person) => {
      if (!nodeId && !policy?.requireAppointment) return true
      // A new appointment does not resurrect a grant from an ended appointment.
      const active = new Set(person.appointments.map((appointment) => appointment.id))
      return person.reviewer_grants.some((grant) =>
        grant.appointmentIds.some((id) => active.has(id)),
      )
    })
    .map(({ id, userId }) => ({ id, userId }))
}

export const canActOnTask = async (
  tx: Prisma.TransactionClient,
  institutionId: string,
  userId: string,
  task: content_review_tasks,
): Promise<boolean> => {
  if (task.status !== 'pending' || task.exception || (task.dueAt && task.dueAt <= new Date()))
    return false
  const person = await tx.institution_people.findUnique({
    where: { institutionId_userId: { institutionId, userId } },
  })
  if (!person || !(await personAdmitted(tx, institutionId, person.id))) return false
  if (task.assignedPersonId && task.assignedPersonId !== person.id) return false
  if (task.kind === 'author') return task.personId === person.id
  if (task.kind === 'relationship') {
    if (task.personId !== person.id || !task.subjectPersonId) return false
    const now = new Date()
    if (
      !(await tx.institution_person_relations.count({
        where: {
          institutionId,
          personId: task.subjectPersonId,
          relatedPersonId: person.id,
          kind: task.role ?? '',
          status: 'active',
          supersededAt: null,
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
          ],
        },
      }))
    )
      return false
  }
  if (!task.role) return false
  const step = await tx.content_review_step_instances.findUnique({
    where: { id: task.stepId },
    select: { review_case: { select: { submittedBy: true } } },
  })
  if (step?.review_case.submittedBy === userId) return false
  const eligible = await eligibleGrantPeople(tx, institutionId, task.role, task.nodeId)
  return eligible.some((item) => item.id === person.id)
}
