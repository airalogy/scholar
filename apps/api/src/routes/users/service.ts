import bcrypt from 'bcrypt'
import type { FastifyInstance } from 'fastify'
import type { Prisma } from '../../../prisma/generated/client'
import type { ChangePasswordBody, UpdateUserProfileBody, UserSearchQuery } from './schema'
import {
  normalizeInstitutionRole,
  normalizeLabRole,
  normalizePlatformRole,
} from '../../utils/permissions'
import { assertCanUseProfileAvatar, resolveAvatarUrl } from '../../utils/avatar'
import { resolveAdminAccess } from '../../utils/admin-access'

const SALT_ROUNDS = 10
interface UserJsonItem {
  id: string
  title: string
  period?: string
}

const getInstitutionDisplayRole = (
  role: 'owner' | 'admin' | 'member',
  canReviewContent: boolean,
): 'owner' | 'admin' | 'member' | 'reviewer' => {
  if (role === 'member' && canReviewContent) {
    return 'reviewer'
  }

  return role
}

const normalizeJsonList = (value: unknown): UserJsonItem[] => {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null
      }
      const data = item as Record<string, unknown>
      const id = typeof data.id === 'string' ? data.id : ''
      const title = typeof data.title === 'string' ? data.title : ''
      const period = typeof data.period === 'string' ? data.period : ''
      if (!id || !title) {
        return null
      }
      return {
        id,
        title,
        period,
      }
    })
    .filter(Boolean) as UserJsonItem[]
}

export async function getMyProfile(fastify: FastifyInstance, userId: string) {
  const user = await fastify.prisma.users.findUnique({
    where: { id: userId },
  })

  if (!user) {
    throw fastify.httpErrors.notFound('User not found')
  }

  const profile = user as Record<string, unknown>
  const avatar = (profile.avatar as string | null) ?? null
  const [avatarUrl, labMemberships, institutionMemberships] = await Promise.all([
    resolveAvatarUrl(fastify, avatar),
    fastify.prisma.lab_memberships.findMany({
      where: { userId },
    }),
    fastify.prisma.institution_memberships.findMany({
      where: { userId },
    }),
  ])

  const manageableLabMemberships = labMemberships.filter(
    (membership) => normalizeLabRole(membership.role) !== 'member',
  )
  const manageableInstitutionMemberships = institutionMemberships.filter((membership) => {
    const role = normalizeInstitutionRole(membership.role)
    return (
      role !== 'member' ||
      membership.can_review_content === true ||
      membership.can_import_data === true
    )
  })

  const allLabs =
    labMemberships.length > 0
      ? await fastify.prisma.labs.findMany({
          where: {
            id: {
              in: [...new Set(labMemberships.map((membership) => membership.labId))],
            },
          },
        })
      : []
  const allInstitutions =
    institutionMemberships.length > 0
      ? await fastify.prisma.institutions.findMany({
          where: {
            id: {
              in: [
                ...new Set(institutionMemberships.map((membership) => membership.institutionId)),
              ],
            },
          },
        })
      : []
  const manageableLabs = allLabs.filter((lab) => {
    return manageableLabMemberships.some((membership) => membership.labId === lab.id)
  })
  const manageableLabRoleMap = new Map(
    manageableLabMemberships.map((membership) => [
      membership.labId,
      normalizeLabRole(membership.role),
    ]),
  )
  const manageableInstitutions = allInstitutions.filter((institution) => {
    return manageableInstitutionMemberships.some(
      (membership) => membership.institutionId === institution.id,
    )
  })
  const manageableInstitutionRoleMap = new Map(
    manageableInstitutionMemberships.map((membership) => [
      membership.institutionId,
      getInstitutionDisplayRole(
        normalizeInstitutionRole(membership.role),
        membership.can_review_content === true,
      ),
    ]),
  )
  const institutionMembershipMap = new Map(
    institutionMemberships.map((membership) => [
      membership.institutionId,
      {
        role: normalizeInstitutionRole(membership.role),
        canReviewContent: membership.can_review_content === true,
        canImportData: membership.can_import_data === true,
      },
    ]),
  )
  const labMembershipRoleMap = new Map(
    labMemberships.map((membership) => [membership.labId, normalizeLabRole(membership.role)]),
  )
  const adminAccess = resolveAdminAccess({
    platformRole: profile.platform_role,
    institutionMemberships,
    labMemberships,
  })

  return {
    code: 0 as const,
    data: {
      id: user.id,
      username: user.username,
      email: user.email,
      phone: (profile.phone as string | null) ?? null,
      name: user.name,
      avatar,
      avatar_url: avatarUrl,
      gender: (profile.gender as string | null) ?? null,
      grade: (profile.grade as string | null) ?? null,
      degree: (profile.degree as string | null) ?? null,
      college: (profile.college as string | null) ?? null,
      major: (profile.major as string | null) ?? null,
      laboratory: (profile.laboratory as string | null) ?? null,
      bio: (profile.bio as string | null) ?? null,
      research_interests: (profile.research_interests as string | null) ?? null,
      project_experiences: normalizeJsonList(profile.project_experiences).map((item) => ({
        id: item.id,
        title: item.title,
        period: item.period ?? '',
      })),
      publications: normalizeJsonList(profile.publications).map((item) => ({
        id: item.id,
        title: item.title,
      })),
      platform_role: normalizePlatformRole(profile.platform_role),
      admin_access: adminAccess,
      manageable_labs: manageableLabs
        .map((lab) => ({
          id: lab.id,
          name: lab.name,
          slug: lab.slug,
          role: manageableLabRoleMap.get(lab.id) ?? 'member',
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')),
      manageable_institutions: manageableInstitutions
        .map((institution) => ({
          id: institution.id,
          name: institution.name,
          slug: institution.slug,
          role: manageableInstitutionRoleMap.get(institution.id) ?? 'member',
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')),
      institution_memberships: allInstitutions
        .map((institution) => {
          const membership = institutionMembershipMap.get(institution.id)
          if (!membership) {
            return null
          }

          return {
            id: institution.id,
            name: institution.name,
            slug: institution.slug,
            role: membership.role,
            can_review_content: membership.canReviewContent,
            can_import_data: membership.canImportData,
          }
        })
        .filter(
          (
            item,
          ): item is {
            id: string
            name: string
            slug: string
            role: 'owner' | 'admin' | 'member'
            can_review_content: boolean
            can_import_data: boolean
          } => item !== null,
        )
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')),
      lab_memberships: allLabs
        .map((lab) => {
          const role = labMembershipRoleMap.get(lab.id)
          if (!role) {
            return null
          }

          return {
            id: lab.id,
            institutionId: lab.institutionId ?? null,
            name: lab.name,
            slug: lab.slug,
            role,
          }
        })
        .filter(
          (
            item,
          ): item is {
            id: string
            institutionId: string | null
            name: string
            slug: string
            role: 'owner' | 'admin' | 'member'
          } => item !== null,
        )
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')),
    },
  }
}

export async function searchUsers(fastify: FastifyInstance, query: UserSearchQuery) {
  const keyword = query.q.trim()
  if (!keyword) {
    return { items: [] }
  }

  const users = await fastify.prisma.users.findMany({
    where: {
      OR: [
        { username: { contains: keyword, mode: 'insensitive' } },
        { name: { contains: keyword, mode: 'insensitive' } },
        { email: { contains: keyword, mode: 'insensitive' } },
        { college: { contains: keyword, mode: 'insensitive' } },
        { major: { contains: keyword, mode: 'insensitive' } },
        { laboratory: { contains: keyword, mode: 'insensitive' } },
      ],
    },
    orderBy: [{ name: 'asc' }, { username: 'asc' }],
    take: query.limit ?? 10,
  })

  const items = await Promise.all(
    users.map(async (user) => ({
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      avatar: await resolveAvatarUrl(fastify, user.avatar),
      degree: user.degree,
      college: user.college,
      major: user.major,
      laboratory: user.laboratory,
    })),
  )

  return { items }
}

export async function updateMyProfile(
  fastify: FastifyInstance,
  userId: string,
  body: UpdateUserProfileBody,
) {
  const existing = await fastify.prisma.users.findUnique({ where: { id: userId } })
  if (!existing) {
    throw fastify.httpErrors.notFound('User not found')
  }

  const now = new Date()
  const data: Prisma.usersUncheckedUpdateInput = { updatedAt: now }

  if (body.name !== undefined) data.name = body.name
  if (body.avatar !== undefined) {
    const avatar = body.avatar.trim()
    await assertCanUseProfileAvatar(fastify, userId, existing.avatar, avatar)
    data.avatar = avatar || null
  }
  if (body.gender !== undefined) data.gender = body.gender
  if (body.grade !== undefined) data.grade = body.grade
  if (body.degree !== undefined) data.degree = body.degree
  if (body.college !== undefined) data.college = body.college
  if (body.major !== undefined) data.major = body.major
  if (body.laboratory !== undefined) data.laboratory = body.laboratory
  if (body.bio !== undefined) data.bio = body.bio
  if (body.research_interests !== undefined) data.research_interests = body.research_interests
  if (body.project_experiences !== undefined) data.project_experiences = body.project_experiences
  if (body.publications !== undefined) data.publications = body.publications

  await fastify.prisma.users.update({
    where: { id: userId },
    data,
  })

  return {
    code: 0 as const,
    message: 'Profile updated',
  }
}

export async function changeMyPassword(
  fastify: FastifyInstance,
  userId: string,
  body: ChangePasswordBody,
) {
  const user = await fastify.prisma.users.findUnique({ where: { id: userId } })
  if (!user || !user.password_hash) {
    throw fastify.httpErrors.badRequest('Password is not set')
  }

  const isValid = await bcrypt.compare(body.oldPassword, user.password_hash)
  if (!isValid) {
    throw fastify.httpErrors.badRequest('Old password is incorrect')
  }

  if (body.oldPassword === body.newPassword) {
    throw fastify.httpErrors.badRequest('New password must be different from old password')
  }
  if (body.newPassword.trim().length < 12) {
    throw fastify.httpErrors.badRequest(
      'New password must contain at least 12 non-whitespace characters',
    )
  }

  const passwordHash = await bcrypt.hash(body.newPassword, SALT_ROUNDS)
  await fastify.prisma.users.update({
    where: { id: userId },
    data: {
      password_hash: passwordHash,
      updatedAt: new Date(),
    },
  })

  return {
    code: 0 as const,
    message: 'Password updated',
  }
}
