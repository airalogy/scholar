import type { FastifyInstance } from 'fastify'
import type { Prisma, content_review_cases } from '../../prisma/generated/client'
import { userAdmitted } from '../directory/policy'
import { getInstitutionAccessById } from '../utils/permissions'
import { getConfiguredInstitution } from '../utils/institution-scope'
import { personalTaskWhere, canReadReviewTask } from './queries'
import { eligibleGrantPeople } from './authorization'

export type ProgressViewer = 'administrator' | 'applicant' | 'reviewer'
export interface ProgressAccess {
  reviewCase: content_review_cases
  viewer: ProgressViewer
}

export const requireProgressAccess = async (
  fastify: FastifyInstance,
  tx: Prisma.TransactionClient,
  userId: string,
  caseId: string,
): Promise<ProgressAccess> => {
  const institution = await getConfiguredInstitution(fastify)
  const reviewCase = await tx.content_review_cases.findFirst({
    where: { id: caseId, institutionId: institution.id },
  })
  const missing = (): never => {
    throw fastify.httpErrors.notFound('Review progress not found')
  }
  if (!reviewCase) return missing()
  const scoped = Object.create(fastify) as FastifyInstance
  Object.defineProperty(scoped, 'prisma', { value: tx })
  const access = await getInstitutionAccessById(scoped, userId, institution.id)
  if (access.platform_role === 'platform_admin') return { reviewCase, viewer: 'administrator' }
  if (!(await userAdmitted(tx, institution.id, userId))) return missing()
  if (access.institution_role === 'owner') return { reviewCase, viewer: 'administrator' }
  if (reviewCase.submittedBy === userId) return { reviewCase, viewer: 'applicant' }
  // Legacy rounds had stage-level decisions rather than individual tasks.
  if (await tx.content_review_step_instances.count({ where: { caseId, reviewedBy: userId } })) {
    return { reviewCase, viewer: 'reviewer' }
  }

  // Participation permits process metadata only, not access to other material versions/files.
  const where = await personalTaskWhere(tx, institution.id, userId)
  const person = await tx.institution_people.findUnique({
    where: { institutionId_userId: { institutionId: institution.id, userId } },
  })
  const groups = new Map<string, boolean>()
  let cursor: string | undefined
  for (;;) {
    const tasks = await tx.content_review_tasks.findMany({
      where: { AND: [where, { step: { caseId } }] },
      orderBy: { id: 'asc' },
      take: 100,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })
    for (const task of tasks) {
      if (await canReadReviewTask(tx, institution.id, userId, task.id))
        return { reviewCase, viewer: 'reviewer' }
      // A deadline blocks decisions, not a currently authorized reviewer's progress view.
      if (
        person &&
        task.kind === 'role' &&
        task.status === 'pending' &&
        (!task.assignedPersonId || task.assignedPersonId === person.id) &&
        task.role
      ) {
        const key = `${task.role}:${task.nodeId}`
        if (!groups.has(key))
          groups.set(
            key,
            (await eligibleGrantPeople(tx, institution.id, task.role, task.nodeId)).some(
              (item) => item.id === person.id,
            ),
          )
        if (groups.get(key)) return { reviewCase, viewer: 'reviewer' }
      }
    }
    if (tasks.length < 100) return missing()
    cursor = tasks.at(-1)!.id
  }
}
