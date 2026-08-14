import type { FastifyInstance } from 'fastify'
import { buildObjectKey } from './oss'
import {
  isAvatarFile,
  isAvatarFileId,
  resolveSafeAvatarHttpUrl,
  resolveSafeAvatarStorageKey,
} from './avatar'

export interface InstitutionPaperBoundMember {
  bindingId: string
  paperId: string
  userId: string
  name: string
  avatar: string | null
  authorId: string
  authorName: string
}

export interface InstitutionMemberPaperStats {
  paperCount: number
  approvedPaperCount: number
}

const resolveAvatarUrlMap = async (
  fastify: FastifyInstance,
  avatars: Array<string | null>,
): Promise<Map<string, string | null>> => {
  const map = new Map<string, string | null>()
  const ossAvatarIds = [
    ...new Set(
      avatars.filter(
        (avatar): avatar is string => typeof avatar === 'string' && isAvatarFileId(avatar),
      ),
    ),
  ]

  const files =
    ossAvatarIds.length > 0
      ? await fastify.prisma.oss_files.findMany({
          where: {
            id: {
              in: ossAvatarIds,
            },
          },
        })
      : []
  const fileMap = new Map(files.map((file) => [file.id, file]))

  for (const avatar of avatars) {
    if (!avatar || map.has(avatar)) {
      continue
    }

    const httpUrl = resolveSafeAvatarHttpUrl(avatar)
    if (httpUrl) {
      map.set(avatar, httpUrl)
      continue
    }

    const storageKey = resolveSafeAvatarStorageKey(avatar)
    if (storageKey) {
      map.set(avatar, fastify.oss.getSignedUrl(storageKey))
      continue
    }

    if (!isAvatarFileId(avatar)) {
      map.set(avatar, null)
      continue
    }

    const file = fileMap.get(avatar)
    map.set(
      avatar,
      file && isAvatarFile(file)
        ? fastify.oss.getSignedUrl(buildObjectKey(file.prefix ?? '', file.id, file.ext ?? ''))
        : null,
    )
  }

  return map
}

export const resolveInstitutionPaperBoundMembersMap = async (
  fastify: FastifyInstance,
  institutionId: string,
  paperIds: string[],
): Promise<Map<string, InstitutionPaperBoundMember[]>> => {
  const uniquePaperIds = [...new Set(paperIds)]
  if (uniquePaperIds.length === 0) {
    return new Map()
  }

  const bindings = await fastify.prisma.institution_paper_author_bindings.findMany({
    where: {
      institutionId,
      paperId: { in: uniquePaperIds },
    },
    orderBy: [{ paperId: 'asc' }, { createdAt: 'asc' }],
  })

  if (bindings.length === 0) {
    return new Map()
  }

  const [users, authors, paperAuthors] = await Promise.all([
    fastify.prisma.users.findMany({
      where: {
        id: {
          in: [...new Set(bindings.map((binding) => binding.userId))],
        },
      },
      select: {
        id: true,
        name: true,
        avatar: true,
      },
    }),
    fastify.prisma.authors.findMany({
      where: {
        id: {
          in: [...new Set(bindings.map((binding) => binding.authorId))],
        },
      },
      select: {
        id: true,
        name: true,
      },
    }),
    fastify.prisma.paper_authors.findMany({
      where: {
        paperId: { in: uniquePaperIds },
        authorId: {
          in: [...new Set(bindings.map((binding) => binding.authorId))],
        },
      },
      select: {
        paperId: true,
        authorId: true,
        order: true,
      },
    }),
  ])

  const userMap = new Map(users.map((user) => [user.id, user]))
  const authorMap = new Map(authors.map((author) => [author.id, author.name]))
  const orderMap = new Map(
    paperAuthors.map((paperAuthor) => [
      `${paperAuthor.paperId}:${paperAuthor.authorId}`,
      paperAuthor.order,
    ]),
  )
  const avatarMap = await resolveAvatarUrlMap(
    fastify,
    users.map((user) => user.avatar),
  )

  const resolved = await Promise.all(
    bindings.map(async (binding) => {
      const user = userMap.get(binding.userId)
      if (!user) {
        return null
      }

      return {
        bindingId: binding.id,
        paperId: binding.paperId,
        userId: binding.userId,
        name: user.name,
        avatar: user.avatar ? (avatarMap.get(user.avatar) ?? null) : null,
        authorId: binding.authorId,
        authorName: authorMap.get(binding.authorId) ?? '',
        order: orderMap.get(`${binding.paperId}:${binding.authorId}`) ?? Number.MAX_SAFE_INTEGER,
      }
    }),
  )

  const map = new Map<string, InstitutionPaperBoundMember[]>()
  for (const item of resolved) {
    if (!item) {
      continue
    }

    const current = map.get(item.paperId) ?? []
    current.push({
      bindingId: item.bindingId,
      paperId: item.paperId,
      userId: item.userId,
      name: item.name,
      avatar: item.avatar,
      authorId: item.authorId,
      authorName: item.authorName,
    })
    map.set(item.paperId, current)
  }

  for (const [paperId, current] of map) {
    const sorted = [...current].sort((left, right) => {
      const leftOrder = orderMap.get(`${paperId}:${left.authorId}`) ?? Number.MAX_SAFE_INTEGER
      const rightOrder = orderMap.get(`${paperId}:${right.authorId}`) ?? Number.MAX_SAFE_INTEGER
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder
      }

      return left.name.localeCompare(right.name, 'zh-CN')
    })
    map.set(paperId, sorted)
  }

  return map
}

export const resolveInstitutionMemberPaperStats = async (
  fastify: FastifyInstance,
  institutionId: string,
  userIds: string[],
): Promise<Map<string, InstitutionMemberPaperStats>> => {
  const uniqueUserIds = [...new Set(userIds)]
  const statsMap = new Map<string, InstitutionMemberPaperStats>()

  for (const userId of uniqueUserIds) {
    statsMap.set(userId, {
      paperCount: 0,
      approvedPaperCount: 0,
    })
  }

  if (uniqueUserIds.length === 0) {
    return statsMap
  }

  const bindings = await fastify.prisma.institution_paper_author_bindings.findMany({
    where: {
      institutionId,
      userId: { in: uniqueUserIds },
    },
    select: {
      userId: true,
      paperId: true,
    },
  })

  if (bindings.length === 0) {
    return statsMap
  }

  const approvedClaims = await fastify.prisma.paper_claims.findMany({
    where: {
      institutionId,
      review_case: { status: 'approved' },
      paperId: {
        in: [...new Set(bindings.map((binding) => binding.paperId))],
      },
    },
    select: {
      paperId: true,
    },
  })
  const approvedPaperIdSet = new Set(approvedClaims.map((claim) => claim.paperId))

  for (const binding of bindings) {
    const current = statsMap.get(binding.userId) ?? {
      paperCount: 0,
      approvedPaperCount: 0,
    }

    current.paperCount += 1
    if (approvedPaperIdSet.has(binding.paperId)) {
      current.approvedPaperCount += 1
    }
    statsMap.set(binding.userId, current)
  }

  return statsMap
}
