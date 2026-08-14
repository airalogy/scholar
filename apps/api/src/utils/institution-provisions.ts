import crypto from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { normalizeInstitutionRole } from './permissions'

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
): Promise<void> => {
  const now = new Date()

  await fastify.prisma.institution_memberships.upsert({
    where: {
      institutionId_userId: {
        institutionId: provision.institutionId,
        userId,
      },
    },
    create: {
      institutionId: provision.institutionId,
      userId,
      role: normalizeInstitutionRole(provision.role),
      can_review_content: provision.can_review_content,
      can_import_data: provision.can_import_data,
      createdAt: now,
      updatedAt: now,
    },
    update: {
      role: normalizeInstitutionRole(provision.role),
      can_review_content: provision.can_review_content,
      can_import_data: provision.can_import_data,
      updatedAt: now,
    },
  })

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

  if (shouldUpdateUser) {
    await fastify.prisma.users.update({
      where: { id: user.id },
      data,
    })
  }
}
