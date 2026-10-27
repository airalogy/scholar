import crypto from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { normalizeInstitutionRole } from './permissions'
import { linkInstitutionPersonToUser } from './institution-people'
import { lockMutationScope } from './advisory-lock'
import { assertPermissionManager, permissionContext } from '../administrators/access'
import { personAdmitted } from '../directory/policy'

export type InstitutionProvisionStatus = 'pending_activation' | 'claimed' | 'disabled'

export interface InstitutionProvisionLike {
  id: string
  institutionId: string
  claimedUserId: string | null
  name: string
  role: string
  can_review_content: boolean
  can_import_data: boolean
  college: string | null
  major: string | null
  laboratory: string | null
}

export const normalizeInstitutionProvisionStatus = (
  status: unknown,
): InstitutionProvisionStatus => {
  if (status === 'claimed' || status === 'disabled') {
    return status
  }

  return 'pending_activation'
}

export const generateInstitutionInviteToken = (): string => {
  return `${crypto.randomUUID().replaceAll('-', '')}${crypto.randomBytes(12).toString('hex')}`
}

export const buildInstitutionProvisionExpiry = (days = 30): Date => {
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + days)
  return expiresAt
}

export const syncInstitutionProvisionToUser = async (
  fastify: FastifyInstance,
  provision: InstitutionProvisionLike,
  userId: string,
  expectedToken: string,
): Promise<void> => {
  const now = new Date()
  const user = await fastify.prisma.users.findUnique({
    where: { id: userId },
  })

  if (!user) {
    throw fastify.httpErrors.notFound('User not found')
  }

  const data: Record<string, unknown> = {
    updatedAt: now,
  }
  let shouldUpdateUser = false

  if (!user.college && provision.college) {
    data.college = provision.college
    shouldUpdateUser = true
  }

  if (!user.major && provision.major) {
    data.major = provision.major
    shouldUpdateUser = true
  }

  if (!user.laboratory && provision.laboratory) {
    data.laboratory = provision.laboratory
    shouldUpdateUser = true
  }

  await fastify.prisma.$transaction(async (tx) => {
    await lockMutationScope(tx, 'institution-identity', provision.institutionId)
    const current = await tx.institution_user_provisions.findUnique({ where: { id: provision.id } })
    if (
      !current ||
      current.inviteToken !== expectedToken ||
      current.status !== 'pending_activation' ||
      (current.expiresAt && current.expiresAt <= new Date())
    )
      throw fastify.httpErrors.conflict(
        'Activation invitation is no longer valid; request a new invitation',
      )
    await assertPermissionManager(fastify, tx, current.institutionId, current.createdBy, [
      current.role,
    ])
    await permissionContext(tx, {
      actorUserId: userId,
      source: 'provision_activation',
      reason: `Accepted invitation ${current.id}; authorized by ${current.createdBy}`,
    })
    const person = await tx.institution_people.findUnique({
      where: {
        institutionId_provisionId: {
          institutionId: provision.institutionId,
          provisionId: provision.id,
        },
      },
    })
    if (!person) {
      throw fastify.httpErrors.conflict(
        'Institution provision is not linked to an institution person',
      )
    }
    if (
      !person.is_active ||
      person.lifecycle_status !== 'active' ||
      !(await personAdmitted(tx, provision.institutionId, person.id))
    )
      throw fastify.httpErrors.forbidden('Institution person is not active')
    const membership = await tx.institution_memberships.findUnique({
      where: { institutionId_userId: { institutionId: provision.institutionId, userId } },
    })
    if (membership)
      throw fastify.httpErrors.conflict(
        'An existing member must use the membership permission workflow',
      )

    await linkInstitutionPersonToUser(tx, {
      institutionId: provision.institutionId,
      personId: person.id,
      userId,
      source: 'provision_activation',
      actorUserId: userId,
    })

    await tx.institution_memberships.upsert({
      where: {
        institutionId_userId: {
          institutionId: provision.institutionId,
          userId,
        },
      },
      create: {
        institutionId: provision.institutionId,
        userId,
        role: normalizeInstitutionRole(current.role),
        can_review_content: current.can_review_content,
        can_import_data: current.can_import_data,
        createdAt: now,
        updatedAt: now,
      },
      update: {
        role: normalizeInstitutionRole(current.role),
        can_review_content: current.can_review_content,
        can_import_data: current.can_import_data,
        updatedAt: now,
      },
    })

    await tx.institution_user_provisions.update({
      where: { id: current.id },
      data: { claimedUserId: userId, status: 'claimed', claimedAt: now, updatedAt: now },
    })

    if (shouldUpdateUser) {
      await tx.users.update({
        where: { id: user.id },
        data,
      })
    }
  })
}
