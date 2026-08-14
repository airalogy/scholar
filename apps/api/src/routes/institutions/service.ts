import type { FastifyInstance } from 'fastify'
import type {
  BindInstitutionPaperAuthorBody,
  CreateInstitutionJoinRequestBody,
  ReviewInstitutionJoinRequestBody,
  UpdateInstitutionBody,
  UpsertInstitutionMembershipBody,
  UpsertInstitutionOrgStructureBody,
  UpsertInstitutionProvisionBody,
} from './schema'
import { resolveAvatarUrl } from '../../utils/avatar'
import {
  assertCanEditInstitution,
  assertCanManageInstitutionMembers,
  getInstitutionAccessById,
  getUserPlatformRole,
  type InstitutionAccess,
  normalizeInstitutionRole,
  normalizePlatformRole,
} from '../../utils/permissions'
import {
  buildInstitutionProvisionExpiry,
  generateInstitutionInviteToken,
  normalizeInstitutionProvisionStatus,
} from '../../utils/institution-provisions'
import {
  resolveInstitutionMemberPaperStats,
  resolveInstitutionPaperBoundMembersMap,
} from '../../utils/institution-paper-bindings'
import {
  getInstitutionOrgStructure as resolveInstitutionOrgStructure,
  upsertInstitutionOrgStructure as persistInstitutionOrgStructure,
} from '../../utils/institution-org-structure'
import { lockMutationScope } from '../../utils/advisory-lock'

interface InstitutionRecord {
  id: string
  name: string
  slug: string
  summary: string | null
  website: string | null
}

interface ResolvedInstitutionMember {
  userId: string
  name: string
  email: string
  avatar: string | null
  degree: string | null
  major: string | null
  role: 'owner' | 'admin' | 'member'
  canReviewContent: boolean
  canImportData: boolean
  paperCount: number
  approvedPaperCount: number
}

interface ResolvedInstitutionProvision {
  id: string
  email: string
  name: string
  role: 'owner' | 'admin' | 'member'
  canReviewContent: boolean
  canImportData: boolean
  externalId: string | null
  college: string | null
  major: string | null
  laboratory: string | null
  status: 'pending_activation' | 'claimed' | 'disabled'
  inviteToken: string | null
  claimedUserId: string | null
  claimedUserName: string | null
  claimedAt: string | null
  expiresAt: string | null
  createdAt: string
  updatedAt: string
}

interface ResolvedInstitutionJoinRequest {
  id: string
  userId: string
  userName: string
  userEmail: string
  userAvatar: string | null
  userDegree: string | null
  userMajor: string | null
  userCollege: string | null
  userLaboratory: string | null
  status: 'pending' | 'approved' | 'rejected'
  reason: string | null
  reviewNotes: string | null
  reviewedBy: string | null
  reviewedByName: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
}

const INSTITUTION_ROLE_WEIGHT = {
  owner: 0,
  admin: 1,
  member: 2,
} as const

const INSTITUTION_JOIN_REQUEST_STATUS_WEIGHT = {
  pending: 0,
  approved: 1,
  rejected: 2,
} as const

const hasInstitutionReviewerRole = (
  role: 'owner' | 'admin' | 'member',
  canReviewContent: boolean,
): boolean => {
  return role === 'owner' || role === 'admin' || canReviewContent
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

const assertCanManageInstitutionRole = (
  fastify: FastifyInstance,
  access: InstitutionAccess,
  targetRole: 'owner' | 'admin' | 'member',
  action: 'assign' | 'update' | 'remove' | 'provision',
): void => {
  if (access.platform_role === 'platform_admin' || access.institution_role === 'owner') {
    return
  }

  if (access.institution_role === 'admin' && targetRole !== 'owner') {
    return
  }

  const actionLabel = action === 'provision' ? 'provision' : action

  throw fastify.httpErrors.forbidden(
    `You do not have permission to ${actionLabel} institution owners`,
  )
}

const getInstitutionBySlug = async (
  fastify: FastifyInstance,
  slug: string,
): Promise<InstitutionRecord> => {
  if (
    fastify.deployment.paperLibrary.fixedInstitutionSlug &&
    slug !== fastify.deployment.paperLibrary.fixedInstitutionSlug
  ) {
    throw fastify.httpErrors.notFound('Institution not found')
  }

  const institution = await fastify.prisma.institutions.findUnique({
    where: { slug },
  })

  if (!institution) {
    throw fastify.httpErrors.notFound('Institution not found')
  }

  return institution
}

const assertCanBrowseInstitution = async (
  fastify: FastifyInstance,
  userId: string,
  institutionId: string,
): Promise<InstitutionAccess> => {
  const access = await getInstitutionAccessById(fastify, userId, institutionId)
  if (access.platform_role === 'platform_admin' || access.institution_role !== null) {
    return access
  }

  throw fastify.httpErrors.notFound('Institution not found')
}

const resolveInstitutionMembers = async (
  fastify: FastifyInstance,
  institutionId: string,
): Promise<ResolvedInstitutionMember[]> => {
  const memberships = await fastify.prisma.institution_memberships.findMany({
    where: { institutionId },
  })

  if (memberships.length === 0) {
    return []
  }

  const userIds = memberships.map((membership) => membership.userId)
  const [users, paperStatsMap] = await Promise.all([
    fastify.prisma.users.findMany({
      where: { id: { in: userIds } },
    }),
    resolveInstitutionMemberPaperStats(fastify, institutionId, userIds),
  ])
  const userMap = new Map(users.map((user) => [user.id, user]))

  const resolved = await Promise.all(
    memberships.map(async (membership) => {
      const user = userMap.get(membership.userId)
      if (!user) {
        return null
      }

      const paperStats = paperStatsMap.get(user.id) ?? {
        paperCount: 0,
        approvedPaperCount: 0,
      }

      return {
        userId: user.id,
        name: user.name,
        email: user.email,
        avatar: await resolveAvatarUrl(fastify, user.avatar),
        degree: user.degree,
        major: user.major,
        role: normalizeInstitutionRole(membership.role),
        canReviewContent: hasInstitutionReviewerRole(
          normalizeInstitutionRole(membership.role),
          membership.can_review_content === true,
        ),
        canImportData:
          normalizeInstitutionRole(membership.role) !== 'member' ||
          membership.can_import_data === true,
        paperCount: paperStats.paperCount,
        approvedPaperCount: paperStats.approvedPaperCount,
      }
    }),
  )

  return resolved
    .filter((item): item is ResolvedInstitutionMember => item !== null)
    .sort((a, b) => {
      const roleDelta = INSTITUTION_ROLE_WEIGHT[a.role] - INSTITUTION_ROLE_WEIGHT[b.role]
      if (roleDelta !== 0) {
        return roleDelta
      }

      const reviewDelta = Number(b.canReviewContent) - Number(a.canReviewContent)
      if (reviewDelta !== 0) {
        return reviewDelta
      }

      return a.name.localeCompare(b.name, 'zh-CN')
    })
}

const normalizeProvisionEmail = (email: string): string => email.trim().toLowerCase()

const trimNullableString = (value: string | undefined): string | null => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

const normalizeInstitutionJoinRequestStatus = (
  status: string,
): 'pending' | 'approved' | 'rejected' => {
  if (status === 'approved' || status === 'rejected') {
    return status
  }

  return 'pending'
}

const resolveInstitutionProvisions = async (
  fastify: FastifyInstance,
  institutionId: string,
  access: InstitutionAccess,
): Promise<ResolvedInstitutionProvision[]> => {
  const provisions = await fastify.prisma.institution_user_provisions.findMany({
    where: { institutionId },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
  })

  if (provisions.length === 0) {
    return []
  }

  const claimedUserIds = provisions
    .map((provision) => provision.claimedUserId)
    .filter((value): value is string => Boolean(value))
  const claimedUsers =
    claimedUserIds.length > 0
      ? await fastify.prisma.users.findMany({
          where: { id: { in: claimedUserIds } },
          select: { id: true, name: true },
        })
      : []
  const claimedUserMap = new Map(claimedUsers.map((user) => [user.id, user.name]))

  return provisions.map((provision) => {
    const normalizedRole = normalizeInstitutionRole(provision.role)
    const normalizedStatus = normalizeInstitutionProvisionStatus(provision.status)
    const canRevealInviteToken =
      normalizedStatus === 'pending_activation' &&
      (access.platform_role === 'platform_admin' ||
        access.institution_role === 'owner' ||
        normalizedRole !== 'owner')

    return {
      id: provision.id,
      email: provision.email,
      name: provision.name,
      role: normalizedRole,
      canReviewContent: hasInstitutionReviewerRole(
        normalizedRole,
        provision.can_review_content === true,
      ),
      canImportData: normalizedRole !== 'member' || provision.can_import_data === true,
      externalId: provision.externalId,
      college: provision.college,
      major: provision.major,
      laboratory: provision.laboratory,
      status: normalizedStatus,
      inviteToken: canRevealInviteToken ? provision.inviteToken : null,
      claimedUserId: provision.claimedUserId,
      claimedUserName: provision.claimedUserId
        ? (claimedUserMap.get(provision.claimedUserId) ?? null)
        : null,
      claimedAt: provision.claimedAt ? provision.claimedAt.toISOString() : null,
      expiresAt: provision.expiresAt ? provision.expiresAt.toISOString() : null,
      createdAt: provision.createdAt.toISOString(),
      updatedAt: provision.updatedAt.toISOString(),
    }
  })
}

const resolveInstitutionJoinRequests = async (
  fastify: FastifyInstance,
  requests: Array<{
    id: string
    userId: string
    status: string
    reason: string | null
    review_notes: string | null
    reviewedBy: string | null
    reviewedAt: Date | null
    createdAt: Date
    updatedAt: Date
  }>,
): Promise<ResolvedInstitutionJoinRequest[]> => {
  if (requests.length === 0) {
    return []
  }

  const userIds = [
    ...new Set(
      requests.flatMap((request) => [
        request.userId,
        ...(request.reviewedBy ? [request.reviewedBy] : []),
      ]),
    ),
  ]

  const users =
    userIds.length > 0
      ? await fastify.prisma.users.findMany({
          where: { id: { in: userIds } },
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            degree: true,
            major: true,
            college: true,
            laboratory: true,
          },
        })
      : []
  const userMap = new Map(users.map((user) => [user.id, user]))

  const resolved = await Promise.all(
    requests.map(async (request) => {
      const user = userMap.get(request.userId)
      if (!user) {
        return null
      }

      const reviewer = request.reviewedBy ? userMap.get(request.reviewedBy) : null

      return {
        id: request.id,
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        userAvatar: await resolveAvatarUrl(fastify, user.avatar),
        userDegree: user.degree,
        userMajor: user.major,
        userCollege: user.college,
        userLaboratory: user.laboratory,
        status: normalizeInstitutionJoinRequestStatus(request.status),
        reason: request.reason,
        reviewNotes: request.review_notes,
        reviewedBy: request.reviewedBy,
        reviewedByName: reviewer?.name ?? null,
        reviewedAt: request.reviewedAt ? request.reviewedAt.toISOString() : null,
        createdAt: request.createdAt.toISOString(),
        updatedAt: request.updatedAt.toISOString(),
      }
    }),
  )

  return resolved
    .filter((item): item is ResolvedInstitutionJoinRequest => item !== null)
    .sort((left, right) => {
      const statusDelta =
        INSTITUTION_JOIN_REQUEST_STATUS_WEIGHT[left.status] -
        INSTITUTION_JOIN_REQUEST_STATUS_WEIGHT[right.status]
      if (statusDelta !== 0) {
        return statusDelta
      }

      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    })
}

export const getInstitution = async (
  fastify: FastifyInstance,
  slug: string,
  currentUserId: string,
) => {
  const institution = await getInstitutionBySlug(fastify, slug)

  const [access, labs, memberships] = await Promise.all([
    assertCanBrowseInstitution(fastify, currentUserId, institution.id),
    fastify.prisma.labs.findMany({
      where: { institutionId: institution.id },
      orderBy: { name: 'asc' },
    }),
    resolveInstitutionMembers(fastify, institution.id),
  ])

  const labIds = labs.map((lab) => lab.id)
  const labMembershipCounts =
    labIds.length > 0
      ? await fastify.prisma.lab_memberships.groupBy({
          by: ['labId'],
          where: { labId: { in: labIds } },
          _count: { _all: true },
        })
      : []
  const membershipCountMap = new Map(
    labMembershipCounts.map((item) => [item.labId, item._count._all]),
  )

  return {
    id: institution.id,
    name: institution.name,
    slug: institution.slug,
    summary: institution.summary,
    website: institution.website,
    labCount: labs.length,
    memberCount: memberships.length,
    access,
    labs: labs.map((lab) => ({
      id: lab.id,
      name: lab.name,
      slug: lab.slug,
      college: lab.college,
      location: lab.location,
      memberCount: membershipCountMap.get(lab.id) ?? 0,
    })),
  }
}

export const listInstitutions = async (fastify: FastifyInstance, currentUserId: string) => {
  const user = await fastify.prisma.users.findUnique({
    where: { id: currentUserId },
    select: { platform_role: true },
  })

  if (!user) {
    throw fastify.httpErrors.notFound('User not found')
  }

  const platformRole = normalizePlatformRole(user.platform_role)
  const fixedInstitutionSlug = fastify.deployment.paperLibrary.fixedInstitutionSlug
  const memberships =
    platformRole === 'platform_admin'
      ? []
      : await fastify.prisma.institution_memberships.findMany({
          where: {
            userId: currentUserId,
            OR: [
              { role: { in: ['owner', 'admin'] } },
              { can_review_content: true },
              { can_import_data: true },
            ],
          },
          select: {
            institutionId: true,
            role: true,
            can_review_content: true,
            can_import_data: true,
          },
        })

  const institutions =
    platformRole === 'platform_admin'
      ? await fastify.prisma.institutions.findMany({
          ...(fixedInstitutionSlug
            ? {
                where: {
                  slug: fixedInstitutionSlug,
                },
              }
            : {}),
          orderBy: { name: 'asc' },
        })
      : memberships.length > 0
        ? await fastify.prisma.institutions.findMany({
            where: fixedInstitutionSlug
              ? { slug: fixedInstitutionSlug }
              : {
                  id: {
                    in: memberships.map((membership) => membership.institutionId),
                  },
                },
            orderBy: { name: 'asc' },
          })
        : []

  if (institutions.length === 0) {
    return { items: [] }
  }

  const institutionIds = institutions.map((institution) => institution.id)
  const [labCounts, memberCounts] = await Promise.all([
    fastify.prisma.labs.groupBy({
      by: ['institutionId'],
      where: {
        institutionId: { in: institutionIds },
      },
      _count: { _all: true },
    }),
    fastify.prisma.institution_memberships.groupBy({
      by: ['institutionId'],
      where: {
        institutionId: { in: institutionIds },
      },
      _count: { _all: true },
    }),
  ])

  const membershipRoleMap = new Map(
    memberships.map((membership) => [
      membership.institutionId,
      getInstitutionDisplayRole(
        normalizeInstitutionRole(membership.role),
        membership.can_review_content === true,
      ),
    ]),
  )
  const labCountMap = new Map(labCounts.map((item) => [item.institutionId, item._count._all]))
  const memberCountMap = new Map(memberCounts.map((item) => [item.institutionId, item._count._all]))

  return {
    items: institutions.map((institution) => ({
      id: institution.id,
      name: institution.name,
      slug: institution.slug,
      summary: institution.summary,
      website: institution.website,
      role:
        platformRole === 'platform_admin'
          ? platformRole
          : (membershipRoleMap.get(institution.id) ?? 'member'),
      labCount: labCountMap.get(institution.id) ?? 0,
      memberCount: memberCountMap.get(institution.id) ?? 0,
    })),
  }
}

export const listInstitutionCatalog = async (fastify: FastifyInstance, currentUserId: string) => {
  const platformRole = await getUserPlatformRole(fastify, currentUserId)
  if (platformRole !== 'platform_admin') {
    return { items: [] }
  }

  const institutions = await fastify.prisma.institutions.findMany({
    ...(fastify.deployment.paperLibrary.fixedInstitutionSlug
      ? {
          where: {
            slug: fastify.deployment.paperLibrary.fixedInstitutionSlug,
          },
        }
      : {}),
    orderBy: { name: 'asc' },
  })

  if (institutions.length === 0) {
    return { items: [] }
  }

  const institutionIds = institutions.map((institution) => institution.id)
  const labs = await fastify.prisma.labs.findMany({
    where: {
      institutionId: { in: institutionIds },
    },
    select: {
      institutionId: true,
      college: true,
    },
  })

  const labCountMap = new Map<string, number>()
  const collegeSetMap = new Map<string, Set<string>>()

  for (const lab of labs) {
    if (!lab.institutionId) {
      continue
    }

    labCountMap.set(lab.institutionId, (labCountMap.get(lab.institutionId) ?? 0) + 1)

    const college = lab.college?.trim()
    if (!college) {
      continue
    }

    const collegeSet = collegeSetMap.get(lab.institutionId) ?? new Set<string>()
    collegeSet.add(college)
    collegeSetMap.set(lab.institutionId, collegeSet)
  }

  return {
    items: institutions.map((institution) => ({
      id: institution.id,
      name: institution.name,
      slug: institution.slug,
      summary: institution.summary,
      website: institution.website,
      labCount: labCountMap.get(institution.id) ?? 0,
      collegeCount: collegeSetMap.get(institution.id)?.size ?? 0,
    })),
  }
}

export const updateInstitution = async (
  fastify: FastifyInstance,
  slug: string,
  currentUserId: string,
  body: UpdateInstitutionBody,
) => {
  const institution = await getInstitutionBySlug(fastify, slug)
  await assertCanEditInstitution(fastify, currentUserId, institution.id)

  const data: Record<string, string | Date | null> = {
    updatedAt: new Date(),
  }

  if (body.summary !== undefined) data.summary = body.summary
  if (body.website !== undefined) data.website = body.website.trim() || null

  await fastify.prisma.institutions.update({
    where: { id: institution.id },
    data,
  })

  return getInstitution(fastify, slug, currentUserId)
}

export const listInstitutionMemberships = async (
  fastify: FastifyInstance,
  slug: string,
  currentUserId: string,
) => {
  const institution = await getInstitutionBySlug(fastify, slug)
  await assertCanManageInstitutionMembers(fastify, currentUserId, institution.id)

  const items = await resolveInstitutionMembers(fastify, institution.id)

  return {
    items: items.map((item) => ({
      userId: item.userId,
      name: item.name,
      email: item.email,
      avatar: item.avatar,
      degree: item.degree,
      major: item.major,
      role: item.role,
      canReviewContent: item.canReviewContent,
      canImportData: item.canImportData,
      paperCount: item.paperCount,
      approvedPaperCount: item.approvedPaperCount,
    })),
  }
}

export const getInstitutionOrgStructure = async (
  fastify: FastifyInstance,
  slug: string,
  currentUserId: string,
) => {
  const institution = await getInstitutionBySlug(fastify, slug)
  await assertCanManageInstitutionMembers(fastify, currentUserId, institution.id)

  return resolveInstitutionOrgStructure(fastify, institution.id)
}

export const upsertInstitutionOrgStructure = async (
  fastify: FastifyInstance,
  slug: string,
  currentUserId: string,
  body: UpsertInstitutionOrgStructureBody,
) => {
  const institution = await getInstitutionBySlug(fastify, slug)
  await assertCanManageInstitutionMembers(fastify, currentUserId, institution.id)

  return persistInstitutionOrgStructure(fastify, institution.id, currentUserId, body)
}

const listInstitutionPaperBoundMembers = async (
  fastify: FastifyInstance,
  institutionId: string,
  paperId: string,
) => {
  const bindingsMap = await resolveInstitutionPaperBoundMembersMap(fastify, institutionId, [
    paperId,
  ])
  return bindingsMap.get(paperId) ?? []
}

export const bindInstitutionPaperAuthor = async (
  fastify: FastifyInstance,
  slug: string,
  currentUserId: string,
  body: BindInstitutionPaperAuthorBody,
) => {
  const institution = await getInstitutionBySlug(fastify, slug)
  await assertCanManageInstitutionMembers(fastify, currentUserId, institution.id)

  const [claim, paperAuthor, membership] = await Promise.all([
    fastify.prisma.paper_claims.findFirst({
      where: {
        paperId: body.paperId,
        institutionId: institution.id,
      },
      select: {
        id: true,
      },
    }),
    fastify.prisma.paper_authors.findFirst({
      where: {
        paperId: body.paperId,
        authorId: body.authorId,
      },
      select: {
        id: true,
      },
    }),
    fastify.prisma.institution_memberships.findUnique({
      where: {
        institutionId_userId: {
          institutionId: institution.id,
          userId: body.userId,
        },
      },
      select: {
        userId: true,
      },
    }),
  ])

  if (!claim) {
    throw fastify.httpErrors.notFound('Paper is not part of this institution library')
  }

  if (!paperAuthor) {
    throw fastify.httpErrors.notFound('Author not found in this paper')
  }

  if (!membership) {
    throw fastify.httpErrors.badRequest('Selected user is not a member of this institution')
  }

  const existingBindingForAuthor =
    await fastify.prisma.institution_paper_author_bindings.findUnique({
      where: {
        institutionId_paperId_authorId: {
          institutionId: institution.id,
          paperId: body.paperId,
          authorId: body.authorId,
        },
      },
    })

  const existingBindingForUser = await fastify.prisma.institution_paper_author_bindings.findUnique({
    where: {
      institutionId_paperId_userId: {
        institutionId: institution.id,
        paperId: body.paperId,
        userId: body.userId,
      },
    },
  })

  if (existingBindingForUser && existingBindingForUser.authorId !== body.authorId) {
    throw fastify.httpErrors.conflict(
      'This institution member is already bound to another author in the same paper',
    )
  }

  const now = new Date()
  if (!existingBindingForAuthor) {
    await fastify.prisma.institution_paper_author_bindings.create({
      data: {
        institutionId: institution.id,
        paperId: body.paperId,
        authorId: body.authorId,
        userId: body.userId,
        boundBy: currentUserId,
        createdAt: now,
        updatedAt: now,
      },
    })
  } else if (existingBindingForAuthor.userId !== body.userId) {
    await fastify.prisma.institution_paper_author_bindings.update({
      where: { id: existingBindingForAuthor.id },
      data: {
        userId: body.userId,
        boundBy: currentUserId,
        updatedAt: now,
      },
    })
  }

  return {
    items: await listInstitutionPaperBoundMembers(fastify, institution.id, body.paperId),
  }
}

export const removeInstitutionPaperAuthorBinding = async (
  fastify: FastifyInstance,
  slug: string,
  currentUserId: string,
  bindingId: string,
) => {
  const institution = await getInstitutionBySlug(fastify, slug)
  await assertCanManageInstitutionMembers(fastify, currentUserId, institution.id)

  const binding = await fastify.prisma.institution_paper_author_bindings.findUnique({
    where: { id: bindingId },
  })

  if (!binding || binding.institutionId !== institution.id) {
    throw fastify.httpErrors.notFound('Binding not found')
  }

  await fastify.prisma.institution_paper_author_bindings.delete({
    where: { id: binding.id },
  })

  return {
    items: await listInstitutionPaperBoundMembers(fastify, institution.id, binding.paperId),
  }
}

export const listInstitutionProvisions = async (
  fastify: FastifyInstance,
  slug: string,
  currentUserId: string,
) => {
  const institution = await getInstitutionBySlug(fastify, slug)
  const access = await assertCanManageInstitutionMembers(fastify, currentUserId, institution.id)

  return {
    items: await resolveInstitutionProvisions(fastify, institution.id, access),
  }
}

export const getMyInstitutionJoinRequest = async (
  fastify: FastifyInstance,
  slug: string,
  currentUserId: string,
) => {
  const institution = await getInstitutionBySlug(fastify, slug)

  const request = await fastify.prisma.institution_join_requests.findFirst({
    where: {
      institutionId: institution.id,
      userId: currentUserId,
    },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
  })

  if (!request) {
    return { item: null }
  }

  const [item] = await resolveInstitutionJoinRequests(fastify, [request])

  return {
    item: item ?? null,
  }
}

export const createInstitutionJoinRequest = async (
  fastify: FastifyInstance,
  slug: string,
  currentUserId: string,
  body: CreateInstitutionJoinRequestBody,
) => {
  const institution = await getInstitutionBySlug(fastify, slug)

  const [membership, pendingRequest] = await Promise.all([
    fastify.prisma.institution_memberships.findUnique({
      where: {
        institutionId_userId: {
          institutionId: institution.id,
          userId: currentUserId,
        },
      },
    }),
    fastify.prisma.institution_join_requests.findFirst({
      where: {
        institutionId: institution.id,
        userId: currentUserId,
        status: 'pending',
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    }),
  ])

  if (membership) {
    throw fastify.httpErrors.conflict('You are already a member of this institution')
  }

  if (pendingRequest) {
    throw fastify.httpErrors.conflict(
      'You already have a pending join request for this institution',
    )
  }

  const now = new Date()
  const created = await fastify.prisma.institution_join_requests.create({
    data: {
      institutionId: institution.id,
      userId: currentUserId,
      status: 'pending',
      reason: trimNullableString(body.reason),
      review_notes: null,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: now,
      updatedAt: now,
    },
  })

  const [item] = await resolveInstitutionJoinRequests(fastify, [created])

  return {
    item: item ?? null,
  }
}

export const listInstitutionJoinRequests = async (
  fastify: FastifyInstance,
  slug: string,
  currentUserId: string,
) => {
  const institution = await getInstitutionBySlug(fastify, slug)
  await assertCanManageInstitutionMembers(fastify, currentUserId, institution.id)

  const requests = await fastify.prisma.institution_join_requests.findMany({
    where: { institutionId: institution.id },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
  })

  return {
    items: await resolveInstitutionJoinRequests(fastify, requests),
  }
}

export const reviewInstitutionJoinRequest = async (
  fastify: FastifyInstance,
  slug: string,
  requestId: string,
  currentUserId: string,
  body: ReviewInstitutionJoinRequestBody,
) => {
  const institution = await getInstitutionBySlug(fastify, slug)
  await assertCanManageInstitutionMembers(fastify, currentUserId, institution.id)

  const joinRequest = await fastify.prisma.institution_join_requests.findUnique({
    where: { id: requestId },
  })

  if (!joinRequest || joinRequest.institutionId !== institution.id) {
    throw fastify.httpErrors.notFound('Join request not found')
  }

  if (normalizeInstitutionJoinRequestStatus(joinRequest.status) !== 'pending') {
    throw fastify.httpErrors.badRequest('This join request has already been reviewed')
  }

  const now = new Date()
  await fastify.prisma.$transaction(async (tx) => {
    if (body.status === 'approved') {
      const membership = await tx.institution_memberships.findUnique({
        where: {
          institutionId_userId: {
            institutionId: institution.id,
            userId: joinRequest.userId,
          },
        },
      })

      if (!membership) {
        await tx.institution_memberships.create({
          data: {
            institutionId: institution.id,
            userId: joinRequest.userId,
            role: 'member',
            can_review_content: false,
            can_import_data: false,
            createdAt: now,
            updatedAt: now,
          },
        })
      }
    }

    await tx.institution_join_requests.update({
      where: { id: joinRequest.id },
      data: {
        status: body.status,
        review_notes: trimNullableString(body.notes),
        reviewedBy: currentUserId,
        reviewedAt: now,
        updatedAt: now,
      },
    })
  })

  return listInstitutionJoinRequests(fastify, slug, currentUserId)
}

export const upsertInstitutionMembership = async (
  fastify: FastifyInstance,
  slug: string,
  currentUserId: string,
  body: UpsertInstitutionMembershipBody,
) => {
  const institution = await getInstitutionBySlug(fastify, slug)
  const access = await assertCanManageInstitutionMembers(fastify, currentUserId, institution.id)

  const existingMembership = await fastify.prisma.institution_memberships.findUnique({
    where: {
      institutionId_userId: {
        institutionId: institution.id,
        userId: body.userId,
      },
    },
  })

  if (existingMembership) {
    assertCanManageInstitutionRole(
      fastify,
      access,
      normalizeInstitutionRole(existingMembership.role),
      'update',
    )
  }

  assertCanManageInstitutionRole(
    fastify,
    access,
    body.role,
    existingMembership ? 'update' : 'assign',
  )

  const user = await fastify.prisma.users.findUnique({
    where: { id: body.userId },
  })
  if (!user) {
    throw fastify.httpErrors.notFound('User not found')
  }

  await fastify.prisma.$transaction(async (tx) => {
    await lockMutationScope(tx, 'institution', institution.id)
    const currentMembership = await tx.institution_memberships.findUnique({
      where: {
        institutionId_userId: {
          institutionId: institution.id,
          userId: body.userId,
        },
      },
    })
    if (
      currentMembership &&
      normalizeInstitutionRole(currentMembership.role) === 'owner' &&
      body.role !== 'owner'
    ) {
      const ownerCount = await tx.institution_memberships.count({
        where: { institutionId: institution.id, role: 'owner' },
      })
      if (ownerCount <= 1) {
        throw fastify.httpErrors.badRequest('At least one owner must remain for the institution')
      }
    }

    await tx.institution_memberships.upsert({
      where: {
        institutionId_userId: {
          institutionId: institution.id,
          userId: body.userId,
        },
      },
      create: {
        institutionId: institution.id,
        userId: body.userId,
        role: body.role,
        can_review_content: body.can_review_content ?? false,
        can_import_data: body.can_import_data ?? false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      update: {
        role: body.role,
        can_review_content: body.can_review_content ?? false,
        can_import_data: body.can_import_data ?? false,
        updatedAt: new Date(),
      },
    })
  })

  return listInstitutionMemberships(fastify, slug, currentUserId)
}

export const upsertInstitutionProvision = async (
  fastify: FastifyInstance,
  slug: string,
  currentUserId: string,
  body: UpsertInstitutionProvisionBody,
) => {
  const institution = await getInstitutionBySlug(fastify, slug)
  const access = await assertCanManageInstitutionMembers(fastify, currentUserId, institution.id)

  const normalizedEmail = normalizeProvisionEmail(body.email)
  const now = new Date()
  const existingProvision = await fastify.prisma.institution_user_provisions.findUnique({
    where: {
      institutionId_email: {
        institutionId: institution.id,
        email: normalizedEmail,
      },
    },
  })
  if (existingProvision) {
    assertCanManageInstitutionRole(
      fastify,
      access,
      normalizeInstitutionRole(existingProvision.role),
      'provision',
    )
  }
  assertCanManageInstitutionRole(fastify, access, body.role, 'provision')
  await fastify.prisma.institution_user_provisions.upsert({
    where: {
      institutionId_email: {
        institutionId: institution.id,
        email: normalizedEmail,
      },
    },
    create: {
      institutionId: institution.id,
      createdBy: currentUserId,
      claimedUserId: null,
      email: normalizedEmail,
      name: body.name.trim(),
      role: body.role,
      can_review_content: body.can_review_content ?? false,
      can_import_data: body.can_import_data ?? false,
      externalId: body.externalId?.trim() ?? null,
      college: body.college?.trim() ?? null,
      major: body.major?.trim() ?? null,
      laboratory: body.laboratory?.trim() ?? null,
      inviteToken: generateInstitutionInviteToken(),
      status: 'pending_activation',
      claimedAt: null,
      expiresAt: buildInstitutionProvisionExpiry(body.expiresInDays ?? 30),
      createdAt: now,
      updatedAt: now,
    },
    update: {
      name: body.name.trim(),
      role: body.role,
      can_review_content: body.can_review_content ?? false,
      can_import_data: body.can_import_data ?? false,
      externalId: body.externalId?.trim() ?? null,
      college: body.college?.trim() ?? null,
      major: body.major?.trim() ?? null,
      laboratory: body.laboratory?.trim() ?? null,
      inviteToken: generateInstitutionInviteToken(),
      status: 'pending_activation',
      claimedUserId: null,
      claimedAt: null,
      expiresAt: buildInstitutionProvisionExpiry(body.expiresInDays ?? 30),
      updatedAt: now,
    },
  })

  return listInstitutionProvisions(fastify, slug, currentUserId)
}

export const removeInstitutionMembership = async (
  fastify: FastifyInstance,
  slug: string,
  currentUserId: string,
  targetUserId: string,
) => {
  const institution = await getInstitutionBySlug(fastify, slug)
  const access = await assertCanManageInstitutionMembers(fastify, currentUserId, institution.id)

  const membership = await fastify.prisma.institution_memberships.findUnique({
    where: {
      institutionId_userId: {
        institutionId: institution.id,
        userId: targetUserId,
      },
    },
  })

  if (!membership) {
    throw fastify.httpErrors.notFound('Membership not found')
  }

  assertCanManageInstitutionRole(
    fastify,
    access,
    normalizeInstitutionRole(membership.role),
    'remove',
  )

  if (normalizeInstitutionRole(membership.role) === 'owner') {
    const ownerCount = await fastify.prisma.institution_memberships.count({
      where: {
        institutionId: institution.id,
        role: 'owner',
      },
    })

    if (ownerCount <= 1) {
      throw fastify.httpErrors.badRequest('At least one owner must remain for the institution')
    }
  }

  const institutionLabs = await fastify.prisma.labs.findMany({
    where: { institutionId: institution.id },
    select: { id: true, name: true },
  })

  const institutionLabIds = institutionLabs.map((lab) => lab.id)
  const ownedLabMemberships =
    institutionLabIds.length > 0
      ? await fastify.prisma.lab_memberships.findMany({
          where: {
            userId: targetUserId,
            labId: { in: institutionLabIds },
            role: 'owner',
          },
          select: { labId: true },
        })
      : []

  if (ownedLabMemberships.length > 0) {
    const soleOwnerLabNames: string[] = []

    for (const ownedLab of ownedLabMemberships) {
      const ownerCount = await fastify.prisma.lab_memberships.count({
        where: {
          labId: ownedLab.labId,
          role: 'owner',
        },
      })

      if (ownerCount <= 1) {
        const labName =
          institutionLabs.find((lab) => lab.id === ownedLab.labId)?.name ?? ownedLab.labId
        soleOwnerLabNames.push(labName)
      }
    }

    if (soleOwnerLabNames.length > 0) {
      throw fastify.httpErrors.badRequest(
        `Transfer lab owner role before removing this institution member: ${soleOwnerLabNames.join(', ')}`,
      )
    }
  }

  await fastify.prisma.$transaction(async (tx) => {
    await lockMutationScope(tx, 'institution', institution.id)
    for (const labId of [...institutionLabIds].sort()) {
      await lockMutationScope(tx, 'lab', labId)
    }

    const currentMembership = await tx.institution_memberships.findUnique({
      where: {
        institutionId_userId: {
          institutionId: institution.id,
          userId: targetUserId,
        },
      },
    })
    if (!currentMembership) {
      throw fastify.httpErrors.notFound('Membership not found')
    }
    if (normalizeInstitutionRole(currentMembership.role) === 'owner') {
      const ownerCount = await tx.institution_memberships.count({
        where: { institutionId: institution.id, role: 'owner' },
      })
      if (ownerCount <= 1) {
        throw fastify.httpErrors.badRequest('At least one owner must remain for the institution')
      }
    }

    const currentOwnedLabs = await tx.lab_memberships.findMany({
      where: {
        userId: targetUserId,
        labId: { in: institutionLabIds },
        role: 'owner',
      },
      select: { labId: true },
    })
    for (const ownedLab of currentOwnedLabs) {
      const ownerCount = await tx.lab_memberships.count({
        where: { labId: ownedLab.labId, role: 'owner' },
      })
      if (ownerCount <= 1) {
        const labName =
          institutionLabs.find((lab) => lab.id === ownedLab.labId)?.name ?? ownedLab.labId
        throw fastify.httpErrors.badRequest(
          `Transfer lab owner role before removing this institution member: ${labName}`,
        )
      }
    }

    await tx.institution_memberships.delete({
      where: {
        institutionId_userId: {
          institutionId: institution.id,
          userId: targetUserId,
        },
      },
    })
    await tx.lab_memberships.deleteMany({
      where: { userId: targetUserId, labId: { in: institutionLabIds } },
    })
    await tx.institution_paper_author_bindings.deleteMany({
      where: { institutionId: institution.id, userId: targetUserId },
    })
  })

  return listInstitutionMemberships(fastify, slug, currentUserId)
}

export const disableInstitutionProvision = async (
  fastify: FastifyInstance,
  slug: string,
  currentUserId: string,
  provisionId: string,
) => {
  const institution = await getInstitutionBySlug(fastify, slug)
  const access = await assertCanManageInstitutionMembers(fastify, currentUserId, institution.id)

  const provision = await fastify.prisma.institution_user_provisions.findUnique({
    where: { id: provisionId },
  })

  if (!provision || provision.institutionId !== institution.id) {
    throw fastify.httpErrors.notFound('Provision not found')
  }

  assertCanManageInstitutionRole(
    fastify,
    access,
    normalizeInstitutionRole(provision.role),
    'provision',
  )

  await fastify.prisma.institution_user_provisions.update({
    where: { id: provision.id },
    data: {
      status: 'disabled',
      updatedAt: new Date(),
    },
  })

  return listInstitutionProvisions(fastify, slug, currentUserId)
}
