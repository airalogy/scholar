import type { FastifyInstance } from 'fastify'
import { isUserEligibleForClaimReview } from './institution-org-structure'

export type PlatformRole = 'member' | 'platform_admin'
export type InstitutionRole = 'owner' | 'admin' | 'member'
export type LabRole = 'owner' | 'admin' | 'member'

export interface InstitutionAccess {
  platform_role: PlatformRole
  institution_role: InstitutionRole | null
  can_edit_content: boolean
  can_manage_members: boolean
  can_review_content: boolean
  can_import_data: boolean
}

export interface LabAccess {
  platform_role: PlatformRole
  institution_role: InstitutionRole | null
  lab_role: LabRole | null
  can_edit_content: boolean
  can_manage_members: boolean
  can_review_content: boolean
}

export interface ReviewScope {
  platformRole: PlatformRole
  institutionIds: string[]
  labIds: string[]
}

export const normalizePlatformRole = (role: unknown): PlatformRole => {
  return role === 'platform_admin' ? 'platform_admin' : 'member'
}

export const normalizeInstitutionRole = (role: unknown): InstitutionRole => {
  if (role === 'owner' || role === 'admin') {
    return role
  }

  return 'member'
}

export const normalizeLabRole = (role: unknown): LabRole => {
  if (role === 'owner' || role === 'admin') {
    return role
  }

  return 'member'
}

const hasInstitutionRoleEditPermission = (role: InstitutionRole | null): boolean => {
  return role === 'owner' || role === 'admin'
}

const hasInstitutionReviewPermission = (
  role: InstitutionRole | null,
  explicitReviewPermission: boolean,
): boolean => {
  return hasInstitutionRoleEditPermission(role) || explicitReviewPermission
}

export const getUserPlatformRole = async (
  fastify: FastifyInstance,
  userId: string,
): Promise<PlatformRole> => {
  const user = await fastify.prisma.users.findUnique({
    where: { id: userId },
    select: { platform_role: true },
  })

  if (!user) {
    throw fastify.httpErrors.notFound('User not found')
  }

  return normalizePlatformRole(user.platform_role)
}

export const getInstitutionAccessById = async (
  fastify: FastifyInstance,
  userId: string,
  institutionId: string,
): Promise<InstitutionAccess> => {
  const [platformRole, membership] = await Promise.all([
    getUserPlatformRole(fastify, userId),
    fastify.prisma.institution_memberships.findUnique({
      where: {
        institutionId_userId: {
          institutionId,
          userId,
        },
      },
      select: {
        role: true,
        can_review_content: true,
        can_import_data: true,
      },
    }),
  ])

  const institutionRole = membership ? normalizeInstitutionRole(membership.role) : null
  const isPlatformAdmin = platformRole === 'platform_admin'
  const explicitReviewPermission = membership?.can_review_content === true
  const explicitImportPermission = membership?.can_import_data === true
  const canEditContent = isPlatformAdmin || hasInstitutionRoleEditPermission(institutionRole)
  const canManageMembers = canEditContent
  const canReviewContent =
    isPlatformAdmin || hasInstitutionReviewPermission(institutionRole, explicitReviewPermission)
  const canImportData =
    isPlatformAdmin || hasInstitutionRoleEditPermission(institutionRole) || explicitImportPermission

  return {
    platform_role: platformRole,
    institution_role: institutionRole,
    can_edit_content: canEditContent,
    can_manage_members: canManageMembers,
    can_review_content: canReviewContent,
    can_import_data: canImportData,
  }
}

export const getLabAccessById = async (
  fastify: FastifyInstance,
  userId: string,
  labId: string,
): Promise<LabAccess> => {
  const lab = await fastify.prisma.labs.findUnique({
    where: { id: labId },
    select: { institutionId: true },
  })

  if (!lab) {
    throw fastify.httpErrors.notFound('Lab not found')
  }

  const [platformRole, membership, institutionAccess] = await Promise.all([
    getUserPlatformRole(fastify, userId),
    fastify.prisma.lab_memberships.findUnique({
      where: {
        labId_userId: {
          labId,
          userId,
        },
      },
      select: { role: true },
    }),
    lab.institutionId
      ? getInstitutionAccessById(fastify, userId, lab.institutionId)
      : Promise.resolve<InstitutionAccess | null>(null),
  ])

  const labRole = membership ? normalizeLabRole(membership.role) : null
  const institutionRole = institutionAccess?.institution_role ?? null
  const isPlatformAdmin = platformRole === 'platform_admin'
  const canEditContent =
    isPlatformAdmin ||
    institutionAccess?.can_edit_content === true ||
    labRole === 'owner' ||
    labRole === 'admin'
  const canManageMembers =
    isPlatformAdmin || institutionAccess?.institution_role === 'owner' || labRole === 'owner'
  const canReviewContent =
    isPlatformAdmin ||
    institutionAccess?.can_review_content === true ||
    labRole === 'owner' ||
    labRole === 'admin'

  return {
    platform_role: platformRole,
    institution_role: institutionRole,
    lab_role: labRole,
    can_edit_content: canEditContent,
    can_manage_members: canManageMembers,
    can_review_content: canReviewContent,
  }
}

export const getReviewScope = async (
  fastify: FastifyInstance,
  userId: string,
): Promise<ReviewScope> => {
  const platformRole = await getUserPlatformRole(fastify, userId)
  if (platformRole === 'platform_admin') {
    return {
      platformRole,
      institutionIds: [],
      labIds: [],
    }
  }

  const [institutionMemberships, labMemberships] = await Promise.all([
    fastify.prisma.institution_memberships.findMany({
      where: {
        userId,
        OR: [{ role: { in: ['owner', 'admin'] } }, { can_review_content: true }],
      },
      select: { institutionId: true },
    }),
    fastify.prisma.lab_memberships.findMany({
      where: {
        userId,
        role: { in: ['owner', 'admin'] },
      },
      select: { labId: true },
    }),
  ])

  return {
    platformRole,
    institutionIds: institutionMemberships.map((membership) => membership.institutionId),
    labIds: labMemberships.map((membership) => membership.labId),
  }
}

export const assertCanEditLab = async (
  fastify: FastifyInstance,
  userId: string,
  labId: string,
): Promise<LabAccess> => {
  const access = await getLabAccessById(fastify, userId, labId)
  if (!access.can_edit_content) {
    throw fastify.httpErrors.forbidden('You do not have permission to edit this lab')
  }
  return access
}

export const assertCanEditInstitution = async (
  fastify: FastifyInstance,
  userId: string,
  institutionId: string,
): Promise<InstitutionAccess> => {
  const access = await getInstitutionAccessById(fastify, userId, institutionId)
  if (!access.can_edit_content) {
    throw fastify.httpErrors.forbidden('You do not have permission to edit this institution')
  }
  return access
}

export const assertCanImportInstitutionData = async (
  fastify: FastifyInstance,
  userId: string,
  institutionId: string,
): Promise<InstitutionAccess> => {
  const access = await getInstitutionAccessById(fastify, userId, institutionId)
  if (!access.can_import_data) {
    throw fastify.httpErrors.forbidden(
      'You do not have permission to import data for this institution',
    )
  }
  return access
}

export const assertPlatformAdmin = async (
  fastify: FastifyInstance,
  userId: string,
): Promise<void> => {
  const platformRole = await getUserPlatformRole(fastify, userId)
  if (platformRole !== 'platform_admin') {
    throw fastify.httpErrors.forbidden('Platform administrator permission is required')
  }
}

export const assertCanSearchUsers = async (
  fastify: FastifyInstance,
  userId: string,
): Promise<void> => {
  const platformRole = await getUserPlatformRole(fastify, userId)
  if (platformRole === 'platform_admin') {
    return
  }

  const [institutionMembership, labMembership] = await Promise.all([
    fastify.prisma.institution_memberships.findFirst({
      where: { userId, role: { in: ['owner', 'admin'] } },
      select: { id: true },
    }),
    fastify.prisma.lab_memberships.findFirst({
      where: { userId, role: 'owner' },
      select: { id: true },
    }),
  ])

  if (!institutionMembership && !labMembership) {
    throw fastify.httpErrors.forbidden('Member management permission is required to search users')
  }
}

export const assertCanManageInstitutionMembers = async (
  fastify: FastifyInstance,
  userId: string,
  institutionId: string,
): Promise<InstitutionAccess> => {
  const access = await getInstitutionAccessById(fastify, userId, institutionId)
  if (!access.can_manage_members) {
    throw fastify.httpErrors.forbidden(
      'You do not have permission to manage members for this institution',
    )
  }
  return access
}

export const assertCanManageLabMembers = async (
  fastify: FastifyInstance,
  userId: string,
  labId: string,
): Promise<LabAccess> => {
  const access = await getLabAccessById(fastify, userId, labId)
  if (!access.can_manage_members) {
    throw fastify.httpErrors.forbidden('You do not have permission to manage this lab')
  }
  return access
}

export const assertCanReviewPaperClaim = async (
  fastify: FastifyInstance,
  userId: string,
  claim: {
    institutionId: string | null
    labId: string | null
    reviewCaseId: string
  },
): Promise<void> => {
  const reviewScope = await getReviewScope(fastify, userId)
  if (reviewScope.platformRole === 'platform_admin') {
    return
  }

  const canReviewViaWorkflow = await isUserEligibleForClaimReview(fastify, userId, claim)
  if (canReviewViaWorkflow) {
    return
  }

  const canReviewViaInstitution = claim.institutionId
    ? reviewScope.institutionIds.includes(claim.institutionId)
    : false
  const canReviewViaLab = claim.labId ? reviewScope.labIds.includes(claim.labId) : false

  if (!canReviewViaInstitution && !canReviewViaLab) {
    throw fastify.httpErrors.forbidden('You do not have permission to review this paper claim')
  }
}
