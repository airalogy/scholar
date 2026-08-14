import type { FastifyInstance, FastifyRequest } from 'fastify'
import { Prisma, type feedbacks } from '../../../prisma/generated/client'
import type {
  FeedbackListQuery,
  FeedbackStatus,
  FeedbackType,
  SubmitFeedbackBody,
  UpdateFeedbackStatusBody,
} from './schema'
import { assertUserExists, resolveAccessTokenUserId } from '../../utils/auth'
import { getUserPlatformRole } from '../../utils/permissions'

interface UserSummary {
  id: string
  name: string
  email: string
}

interface FeedbackItem {
  id: string
  userId: string | null
  userName: string | null
  userEmail: string | null
  email: string | null
  title: string
  type: FeedbackType
  content: string
  status: FeedbackStatus
  handledBy: string | null
  handledByName: string | null
  handledAt: string | null
  createdAt: string
  updatedAt: string
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const isNonEmptyString = (value: string | null | undefined): value is string => {
  return typeof value === 'string' && value.length > 0
}

const normalizeFeedbackType = (value: string): FeedbackType => {
  return value === 'feature_request' ? 'feature_request' : 'bug_report'
}

const normalizeFeedbackStatus = (value: string): FeedbackStatus => {
  return value === 'processed' ? 'processed' : 'pending'
}

const createEmptyStatusTotals = (): Record<FeedbackStatus, number> => {
  return {
    pending: 0,
    processed: 0,
  }
}

const resolveOptionalUserId = async (
  fastify: FastifyInstance,
  request: FastifyRequest,
): Promise<string | null> => {
  const authorization = request.headers.authorization
  if (!authorization?.startsWith('Bearer ')) {
    return null
  }

  try {
    await request.jwtVerify()
    const userId = resolveAccessTokenUserId(fastify, request.user)
    await assertUserExists(fastify, userId)
    return userId
  } catch (error) {
    fastify.log.warn({ err: error }, 'Ignoring invalid feedback submit token')
    return null
  }
}

const assertPlatformAdmin = async (fastify: FastifyInstance, userId: string): Promise<void> => {
  const platformRole = await getUserPlatformRole(fastify, userId)
  if (platformRole !== 'platform_admin') {
    throw fastify.httpErrors.forbidden('You do not have permission to manage feedback')
  }
}

const buildFeedbackWhere = (
  query: FeedbackListQuery,
  includeStatus: boolean,
): Prisma.feedbacksWhereInput => {
  const where: Prisma.feedbacksWhereInput = {}
  const keyword = query.q?.trim()

  if (includeStatus && query.status) {
    where.status = query.status
  }

  if (query.type) {
    where.type = query.type
  }

  if (keyword) {
    where.OR = [
      { title: { contains: keyword } },
      { content: { contains: keyword } },
      { email: { contains: keyword } },
    ]
  }

  return where
}

const loadUserSummaries = async (
  fastify: FastifyInstance,
  feedbackItems: feedbacks[],
): Promise<Map<string, UserSummary>> => {
  const userIds = [
    ...new Set(
      feedbackItems.flatMap((item) => [item.userId, item.handledBy]).filter(isNonEmptyString),
    ),
  ]

  if (userIds.length === 0) {
    return new Map()
  }

  const users = await fastify.prisma.users.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      name: true,
      email: true,
    },
  })

  return new Map(users.map((user) => [user.id, user]))
}

const formatFeedbackItem = (
  feedback: feedbacks,
  userMap: Map<string, UserSummary>,
): FeedbackItem => {
  const submitter = feedback.userId ? (userMap.get(feedback.userId) ?? null) : null
  const handler = feedback.handledBy ? (userMap.get(feedback.handledBy) ?? null) : null

  return {
    id: feedback.id,
    userId: feedback.userId,
    userName: submitter?.name ?? null,
    userEmail: submitter?.email ?? null,
    email: feedback.email,
    title: feedback.title,
    type: normalizeFeedbackType(feedback.type),
    content: feedback.content,
    status: normalizeFeedbackStatus(feedback.status),
    handledBy: feedback.handledBy,
    handledByName: handler?.name ?? null,
    handledAt: feedback.handledAt?.toISOString() ?? null,
    createdAt: feedback.createdAt.toISOString(),
    updatedAt: feedback.updatedAt.toISOString(),
  }
}

const formatFeedbackItems = async (
  fastify: FastifyInstance,
  feedbackItems: feedbacks[],
): Promise<FeedbackItem[]> => {
  const userMap = await loadUserSummaries(fastify, feedbackItems)
  return feedbackItems.map((item) => formatFeedbackItem(item, userMap))
}

export const submitFeedback = async (
  fastify: FastifyInstance,
  request: FastifyRequest,
  data: SubmitFeedbackBody,
) => {
  const userId = await resolveOptionalUserId(fastify, request)
  const title = data.title.trim()
  const content = data.content.trim()
  const email = data.email?.trim().toLowerCase() ?? ''

  if (!title) {
    throw fastify.httpErrors.badRequest('Feedback title is required')
  }

  if (!content) {
    throw fastify.httpErrors.badRequest('Feedback content is required')
  }

  if (!userId && !email) {
    throw fastify.httpErrors.badRequest('Email is required for anonymous feedback')
  }

  if (email && !EMAIL_PATTERN.test(email)) {
    throw fastify.httpErrors.badRequest('Invalid email address')
  }

  const now = new Date()
  const feedback = await fastify.prisma.feedbacks.create({
    data: {
      userId,
      email: userId ? null : email,
      title,
      type: data.type,
      content,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    },
  })
  const [item] = await formatFeedbackItems(fastify, [feedback])

  return {
    code: 0 as const,
    data: item,
    message: 'Feedback submitted',
  }
}

export const listFeedback = async (
  fastify: FastifyInstance,
  userId: string,
  query: FeedbackListQuery,
) => {
  await assertPlatformAdmin(fastify, userId)

  const limit = query.limit ?? 20
  const offset = query.offset ?? 0
  const where = buildFeedbackWhere(query, true)
  const totalsWhere = buildFeedbackWhere(query, false)

  const [feedbackItems, total, statusRows] = await Promise.all([
    fastify.prisma.feedbacks.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: limit,
      skip: offset,
    }),
    fastify.prisma.feedbacks.count({ where }),
    fastify.prisma.feedbacks.groupBy({
      by: ['status'],
      where: totalsWhere,
      _count: { _all: true },
    }),
  ])

  const statusTotals = createEmptyStatusTotals()
  for (const row of statusRows) {
    statusTotals[normalizeFeedbackStatus(row.status)] = row._count._all
  }

  return {
    code: 0 as const,
    data: {
      items: await formatFeedbackItems(fastify, feedbackItems),
      total,
      statusTotals,
    },
  }
}

export const updateFeedbackStatus = async (
  fastify: FastifyInstance,
  userId: string,
  feedbackId: string,
  data: UpdateFeedbackStatusBody,
) => {
  await assertPlatformAdmin(fastify, userId)

  const existing = await fastify.prisma.feedbacks.findUnique({
    where: { id: feedbackId },
    select: { id: true },
  })

  if (!existing) {
    throw fastify.httpErrors.notFound('Feedback not found')
  }

  const now = new Date()
  const feedback = await fastify.prisma.feedbacks.update({
    where: { id: feedbackId },
    data:
      data.status === 'processed'
        ? {
            status: data.status,
            handledBy: userId,
            handledAt: now,
            updatedAt: now,
          }
        : {
            status: data.status,
            handledBy: null,
            handledAt: null,
            updatedAt: now,
          },
  })
  const [item] = await formatFeedbackItems(fastify, [feedback])

  return {
    code: 0 as const,
    data: item,
    message: data.status === 'processed' ? 'Feedback marked as processed' : 'Feedback reopened',
  }
}
