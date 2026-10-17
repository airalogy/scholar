import type { Prisma } from '../../prisma/generated/client'
import { canActOnTask } from './authorization'
import { personAdmitted } from '../directory/policy'

export const personalTaskWhere = async (
  tx: Prisma.TransactionClient,
  institutionId: string,
  userId: string,
): Promise<Prisma.content_review_tasksWhereInput> => {
  const person = await tx.institution_people.findUnique({
    where: { institutionId_userId: { institutionId, userId } },
  })
  const grants = person
    ? await tx.institution_reviewer_grants.findMany({
        where: {
          personId: person.id,
          institutionId,
          revokedAt: null,
          startsAt: { lte: new Date() },
          OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
        },
        take: 1000,
      })
    : []
  return {
    step: { institutionId },
    OR: [
      { completedBy: userId },
      ...(person ? [{ personId: person.id }, { assignedPersonId: person.id }] : []),
      ...grants.map((grant) => ({
        role: grant.role,
        nodeId: grant.nodeId,
        assignedPersonId: null,
        status: 'pending',
      })),
    ],
  }
}

export const canReadReviewTask = async (
  tx: Prisma.TransactionClient,
  institutionId: string,
  userId: string,
  taskId: string,
): Promise<boolean> => {
  const task = await tx.content_review_tasks.findFirst({
    where: { id: taskId, step: { institutionId } },
  })
  if (!task) return false
  if (await canActOnTask(tx, institutionId, userId, task)) return true
  const person = await tx.institution_people.findUnique({
    where: { institutionId_userId: { institutionId, userId } },
  })
  return Boolean(
    person &&
    (await personAdmitted(tx, institutionId, person.id)) &&
    (task.personId === person.id || task.completedBy === userId),
  )
}

const record = (value: Prisma.JsonValue): Prisma.JsonObject =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}
export const publicReviewMaterial = (
  snapshot: Prisma.JsonValue,
): Record<string, Prisma.JsonValue> => {
  const root = record(snapshot)
  if (root.beforeSnapshot && root.payload) {
    const before = publicReviewMaterial(root.beforeSnapshot)
    const proposal = record(root.payload)
    return {
      ...before,
      changeKind: root.kind ?? null,
      proposal: Object.fromEntries(
        Object.entries(proposal).filter(
          ([key]) => !['personId', 'authorId', 'expectedFingerprint'].includes(key),
        ),
      ),
    }
  }
  const submitted = record(root.metadata_snapshot ?? {})
  const material = {
    ...record(root.paper ?? {}),
    ...root,
    ...submitted,
    ...record(submitted.metadata ?? {}),
  }
  const result: Record<string, Prisma.JsonValue> = {}
  for (const key of [
    'title',
    'title_en',
    'abstract',
    'doi',
    'language',
    'keywords',
    'author_name',
    'training_unit',
    'major',
    'degree_category',
    'award_year',
    'visibility',
    'confidentiality_until',
    'version_number',
    'fullTextRestricted',
    'attributionTarget',
    'titles',
    'authors',
    'affiliations',
    'funding',
    'identifiers',
    'language_tags',
    'journal',
    'institution_metadata',
    'publish_year',
    'publish_date',
  ]) {
    if (key in material) result[key] = material[key]!
  }
  result.fileId = root.fileId ?? root.oss_file_id ?? null
  return result
}

export const canReadTaskFile = async (
  tx: Prisma.TransactionClient,
  institutionId: string,
  userId: string,
  fileId: string,
): Promise<boolean> => {
  const where = await personalTaskWhere(tx, institutionId, userId)
  const tasks = await tx.content_review_tasks.findMany({
    where: {
      AND: [
        where,
        {
          step: {
            round: {
              OR: [
                { materialSnapshot: { path: ['fileId'], equals: fileId } },
                { materialSnapshot: { path: ['oss_file_id'], equals: fileId } },
                { materialSnapshot: { path: ['beforeSnapshot', 'fileId'], equals: fileId } },
              ],
            },
          },
        },
      ],
    },
    select: { id: true },
    take: 100,
  })
  for (const task of tasks)
    if (await canReadReviewTask(tx, institutionId, userId, task.id)) return true
  return false
}
