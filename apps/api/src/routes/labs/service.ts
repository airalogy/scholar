import type { FastifyInstance } from 'fastify'
import type { UpdateLabBody, UpsertLabMembershipBody } from './schema'
import { resolveAvatarUrl } from '../../utils/avatar'
import {
  assertCanEditLab,
  assertCanManageLabMembers,
  getLabAccessById,
  normalizeLabRole,
} from '../../utils/permissions'
import { lockMutationScope } from '../../utils/advisory-lock'

interface ResearchDirectionItem {
  name: string
  description: string
}

interface LabRecord {
  id: string
  institutionId: string | null
  name: string
  slug: string
  summary: string | null
  college: string | null
  location: string | null
  website: string | null
}

interface ResolvedLabMember {
  userId: string
  name: string
  email: string
  avatar: string | null
  degree: string | null
  major: string | null
  research_interests: string | null
  role: 'owner' | 'admin' | 'member'
}

const ANONYMOUS_LAB_ACCESS = {
  platform_role: 'member',
  institution_role: null,
  lab_role: null,
  can_edit_content: false,
  can_manage_members: false,
  can_review_content: false,
} as const

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

const normalizeResearchDirections = (value: unknown): ResearchDirectionItem[] => {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => {
      if (typeof item === 'string') {
        return {
          name: item,
          description: '',
        }
      }
      if (!isRecord(item)) {
        return null
      }

      const name =
        typeof item.name === 'string' ? item.name : typeof item.title === 'string' ? item.title : ''
      if (!name) {
        return null
      }

      return {
        name,
        description: typeof item.description === 'string' ? item.description : '',
      }
    })
    .filter((item): item is ResearchDirectionItem => item !== null)
}

const LAB_ROLE_WEIGHT = {
  owner: 0,
  admin: 1,
  member: 2,
} as const

const getLabBySlug = async (fastify: FastifyInstance, slug: string): Promise<LabRecord> => {
  const lab = await fastify.prisma.labs.findUnique({
    where: { slug },
  })

  if (!lab) {
    throw fastify.httpErrors.notFound('Lab not found')
  }

  return lab
}

const resolveLabMembers = async (
  fastify: FastifyInstance,
  lab: LabRecord,
): Promise<ResolvedLabMember[]> => {
  const memberships = await fastify.prisma.lab_memberships.findMany({
    where: { labId: lab.id },
  })

  if (memberships.length === 0) {
    const fallbackUsers = await fastify.prisma.users.findMany({
      where: { laboratory: lab.name },
      orderBy: { name: 'asc' },
    })

    return Promise.all(
      fallbackUsers.map(async (user) => ({
        userId: user.id,
        name: user.name,
        email: user.email,
        avatar: await resolveAvatarUrl(fastify, user.avatar),
        degree: user.degree,
        major: user.major,
        research_interests: user.research_interests,
        role: 'member' as const,
      })),
    )
  }

  const userIds = memberships.map((membership) => membership.userId)
  const users = await fastify.prisma.users.findMany({
    where: { id: { in: userIds } },
  })
  const userMap = new Map(users.map((user) => [user.id, user]))

  const resolved = await Promise.all(
    memberships.map(async (membership) => {
      const user = userMap.get(membership.userId)
      if (!user) {
        return null
      }

      return {
        userId: user.id,
        name: user.name,
        email: user.email,
        avatar: await resolveAvatarUrl(fastify, user.avatar),
        degree: user.degree,
        major: user.major,
        research_interests: user.research_interests,
        role: normalizeLabRole(membership.role),
      }
    }),
  )

  return resolved
    .filter((item): item is ResolvedLabMember => item !== null)
    .sort((a, b) => {
      const roleDelta = LAB_ROLE_WEIGHT[a.role] - LAB_ROLE_WEIGHT[b.role]
      if (roleDelta !== 0) {
        return roleDelta
      }
      return a.name.localeCompare(b.name, 'zh-CN')
    })
}

const resolveRepresentativePapers = async (
  fastify: FastifyInstance,
  lab: LabRecord,
  scholarIds: string[],
) => {
  const representativeLinks =
    scholarIds.length > 0
      ? await fastify.prisma.scholar_papers.findMany({
          where: {
            scholarId: { in: scholarIds },
            is_representative: true,
          },
          orderBy: [{ display_order: 'asc' }, { id: 'asc' }],
        })
      : []

  const representativePaperIds = [...new Set(representativeLinks.map((link) => link.paperId))]
  const approvedClaims =
    representativePaperIds.length > 0
      ? await fastify.prisma.paper_claims.findMany({
          where: {
            paperId: { in: representativePaperIds },
            labId: lab.id,
            review_case: { status: 'approved' },
          },
        })
      : []
  const approvedPaperIds = [...new Set(approvedClaims.map((claim) => claim.paperId))]
  const [papers, paperAuthors] =
    approvedPaperIds.length > 0
      ? await Promise.all([
          fastify.prisma.papers.findMany({
            where: {
              id: { in: approvedPaperIds },
            },
          }),
          fastify.prisma.paper_authors.findMany({
            where: { paperId: { in: approvedPaperIds } },
            orderBy: [{ paperId: 'asc' }, { order: 'asc' }],
          }),
        ])
      : [[], []]

  const authorIds = [...new Set(paperAuthors.map((author) => author.authorId))]
  const authors =
    authorIds.length > 0
      ? await fastify.prisma.authors.findMany({
          where: { id: { in: authorIds } },
        })
      : []

  const authorMap = new Map(authors.map((author) => [author.id, author.name]))
  const paperMap = new Map(papers.map((paper) => [paper.id, paper]))
  const paperAuthorsMap = new Map<string, string[]>()

  for (const paperAuthor of paperAuthors) {
    const names = paperAuthorsMap.get(paperAuthor.paperId) ?? []
    const authorName = authorMap.get(paperAuthor.authorId)
    if (authorName) {
      names.push(authorName)
      paperAuthorsMap.set(paperAuthor.paperId, names)
    }
  }

  return representativePaperIds
    .map((paperId) => {
      const paper = paperMap.get(paperId)
      if (!paper) {
        return null
      }

      return {
        id: paper.id,
        title: paper.title,
        journal_name: paper.journal_name,
        publish_year: paper.publish_year,
        doi: paper.doi,
        keywords: paper.keywords,
        authors: paperAuthorsMap.get(paper.id) ?? [],
      }
    })
    .filter((paper): paper is NonNullable<typeof paper> => paper !== null)
}

export const getLab = async (
  fastify: FastifyInstance,
  slug: string,
  currentUserId: string | null,
) => {
  const lab = await getLabBySlug(fastify, slug)
  const institution = lab.institutionId
    ? await fastify.prisma.institutions.findUnique({
        where: { id: lab.institutionId },
        select: { name: true },
      })
    : null

  const [scholars, memberships, access] = await Promise.all([
    fastify.prisma.scholars.findMany({
      where: { lab: lab.name },
      orderBy: [{ join_year: 'asc' }, { name: 'asc' }],
    }),
    resolveLabMembers(fastify, lab),
    currentUserId
      ? getLabAccessById(fastify, currentUserId, lab.id)
      : Promise.resolve(ANONYMOUS_LAB_ACCESS),
  ])

  const representativePapers = await resolveRepresentativePapers(
    fastify,
    lab,
    scholars.map((scholar) => scholar.id),
  )

  return {
    id: lab.id,
    institutionId: lab.institutionId,
    institutionName: institution?.name ?? null,
    name: lab.name,
    slug: lab.slug,
    summary: lab.summary,
    college: lab.college,
    location: lab.location,
    website: lab.website,
    scholarCount: scholars.length,
    memberCount: memberships.length,
    representativePaperCount: representativePapers.length,
    access,
    scholars: await Promise.all(
      scholars.map(async (scholar) => ({
        id: scholar.id,
        name: scholar.name,
        avatar: await resolveAvatarUrl(fastify, scholar.avatar),
        title: scholar.title,
        college: scholar.college,
        research_directions: normalizeResearchDirections(scholar.research_directions),
      })),
    ),
    members: memberships.map((member) => ({
      id: member.userId,
      name: member.name,
      avatar: member.avatar,
      degree: member.degree,
      major: member.major,
      research_interests: member.research_interests,
    })),
    representativePapers,
  }
}

export const updateLab = async (
  fastify: FastifyInstance,
  slug: string,
  currentUserId: string,
  body: UpdateLabBody,
) => {
  const lab = await getLabBySlug(fastify, slug)
  await assertCanEditLab(fastify, currentUserId, lab.id)

  const data: Record<string, string | Date | null> = {
    updatedAt: new Date(),
  }

  if (body.summary !== undefined) data.summary = body.summary
  if (body.college !== undefined) data.college = body.college
  if (body.location !== undefined) data.location = body.location
  if (body.website !== undefined) data.website = body.website.trim() || null

  await fastify.prisma.labs.update({
    where: { id: lab.id },
    data,
  })

  return getLab(fastify, slug, currentUserId)
}

export const listLabMemberships = async (
  fastify: FastifyInstance,
  slug: string,
  currentUserId: string,
) => {
  const lab = await getLabBySlug(fastify, slug)
  await assertCanManageLabMembers(fastify, currentUserId, lab.id)

  const items = await resolveLabMembers(fastify, lab)

  return {
    items: items.map((item) => ({
      userId: item.userId,
      name: item.name,
      email: item.email,
      avatar: item.avatar,
      degree: item.degree,
      major: item.major,
      role: item.role,
    })),
  }
}

export const upsertLabMembership = async (
  fastify: FastifyInstance,
  slug: string,
  currentUserId: string,
  body: UpsertLabMembershipBody,
) => {
  const lab = await getLabBySlug(fastify, slug)
  await assertCanManageLabMembers(fastify, currentUserId, lab.id)

  const user = await fastify.prisma.users.findUnique({
    where: { id: body.userId },
  })
  if (!user) {
    throw fastify.httpErrors.notFound('User not found')
  }

  await fastify.prisma.$transaction(async (tx) => {
    await lockMutationScope(tx, 'lab', lab.id)
    const currentMembership = await tx.lab_memberships.findUnique({
      where: {
        labId_userId: {
          labId: lab.id,
          userId: body.userId,
        },
      },
    })
    if (
      currentMembership &&
      normalizeLabRole(currentMembership.role) === 'owner' &&
      body.role !== 'owner'
    ) {
      const ownerCount = await tx.lab_memberships.count({
        where: { labId: lab.id, role: 'owner' },
      })
      if (ownerCount <= 1) {
        throw fastify.httpErrors.badRequest('At least one owner must remain for the lab')
      }
    }

    await tx.lab_memberships.upsert({
      where: {
        labId_userId: {
          labId: lab.id,
          userId: body.userId,
        },
      },
      create: {
        labId: lab.id,
        userId: body.userId,
        role: body.role,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      update: {
        role: body.role,
        updatedAt: new Date(),
      },
    })
  })

  if (!user.laboratory) {
    await fastify.prisma.users.update({
      where: { id: user.id },
      data: {
        laboratory: lab.name,
        updatedAt: new Date(),
      },
    })
  }

  return listLabMemberships(fastify, slug, currentUserId)
}

export const removeLabMembership = async (
  fastify: FastifyInstance,
  slug: string,
  currentUserId: string,
  targetUserId: string,
) => {
  const lab = await getLabBySlug(fastify, slug)
  await assertCanManageLabMembers(fastify, currentUserId, lab.id)

  const membership = await fastify.prisma.lab_memberships.findUnique({
    where: {
      labId_userId: {
        labId: lab.id,
        userId: targetUserId,
      },
    },
  })

  if (!membership) {
    throw fastify.httpErrors.notFound('Membership not found')
  }

  await fastify.prisma.$transaction(async (tx) => {
    await lockMutationScope(tx, 'lab', lab.id)
    const currentMembership = await tx.lab_memberships.findUnique({
      where: {
        labId_userId: {
          labId: lab.id,
          userId: targetUserId,
        },
      },
    })
    if (!currentMembership) {
      throw fastify.httpErrors.notFound('Membership not found')
    }
    if (normalizeLabRole(currentMembership.role) === 'owner') {
      const ownerCount = await tx.lab_memberships.count({
        where: { labId: lab.id, role: 'owner' },
      })
      if (ownerCount <= 1) {
        throw fastify.httpErrors.badRequest('At least one owner must remain for the lab')
      }
    }

    await tx.lab_memberships.delete({
      where: {
        labId_userId: {
          labId: lab.id,
          userId: targetUserId,
        },
      },
    })
  })

  return listLabMemberships(fastify, slug, currentUserId)
}
