import type { FastifyInstance } from 'fastify'
import type { Prisma } from '../../prisma/generated/client'
import { userAdmitted } from '../directory/policy'

export const permissionContext = async (
  tx: Prisma.TransactionClient,
  input: {
    actorUserId?: string
    actorLabel?: string
    institutionId?: string
    source: string
    reason: string
  },
): Promise<void> => {
  const actor = input.actorUserId
    ? await tx.users.findUnique({ where: { id: input.actorUserId }, select: { name: true } })
    : null
  await tx.$queryRawUnsafe(
    'SELECT set_config($1, $2, true)',
    'scholar.permission_context',
    JSON.stringify({
      ...input,
      actorLabel: actor?.name ?? input.actorLabel ?? 'System',
    }),
  )
}

export const assertPermissionManager = async (
  fastify: FastifyInstance,
  tx: Prisma.TransactionClient,
  institutionId: string,
  userId: string,
  roles: string[] = ['owner'],
): Promise<void> => {
  const user = await tx.users.findUnique({ where: { id: userId } })
  if (
    !user ||
    (user.administratorAccessExpiresAt && user.administratorAccessExpiresAt <= new Date())
  )
    throw fastify.httpErrors.forbidden('Administrator account expired')
  const person = await tx.institution_people.findUnique({
    where: { institutionId_userId: { institutionId, userId } },
  })
  // A break-glass account is independent, not an exception for a departed employee.
  if (user?.platform_role === 'platform_admin' && !person) return
  if (!(await userAdmitted(tx, institutionId, userId)))
    throw fastify.httpErrors.forbidden('Administrator is not currently admitted')
  if (user?.platform_role === 'platform_admin') return
  const membership = await tx.institution_memberships.findUnique({
    where: { institutionId_userId: { institutionId, userId } },
  })
  const privileged = roles.some((role) => role !== 'member')
  if (membership?.role === 'owner' || (!privileged && membership?.role === 'admin')) return
  throw fastify.httpErrors.forbidden(
    'Only owners and platform administrators can manage administrator permissions',
  )
}

export const assertActiveTarget = async (
  fastify: FastifyInstance,
  tx: Prisma.TransactionClient,
  institutionId: string,
  userId: string,
): Promise<void> => {
  const user = await tx.users.findUnique({ where: { id: userId } })
  if (
    !user ||
    (user.administratorAccessExpiresAt && user.administratorAccessExpiresAt <= new Date())
  )
    throw fastify.httpErrors.conflict('Target account is missing or expired')
  const person = await tx.institution_people.findUnique({
    where: { institutionId_userId: { institutionId, userId } },
  })
  if (
    person &&
    (!person.is_active || person.manually_suspended || person.lifecycle_status !== 'active')
  )
    throw fastify.httpErrors.conflict(
      'An inactive person or temporary admission exception cannot receive permissions',
    )
  if (!(await userAdmitted(tx, institutionId, userId)))
    throw fastify.httpErrors.conflict('Target person is not currently admitted')
}

export const assertOtherActiveOwner = async (
  fastify: FastifyInstance,
  tx: Prisma.TransactionClient,
  institutionId: string,
  excludedUserId: string,
): Promise<void> => {
  const owners = await tx.institution_memberships.findMany({
    where: { institutionId, role: 'owner', userId: { not: excludedUserId } },
  })
  for (const owner of owners) {
    try {
      await assertActiveTarget(fastify, tx, institutionId, owner.userId)
      return
    } catch (error) {
      if (!(error instanceof Error) || !('statusCode' in error) || error.statusCode !== 409)
        throw error
    }
  }
  throw fastify.httpErrors.conflict('At least one active owner must remain; complete handoff first')
}
