import type { FastifyInstance } from 'fastify'
import type { Prisma } from '../../../../prisma/generated/client'
import { getAiRuntime } from '../../../ai/client'
import {
  loadTimelineSourceData,
  TIMELINE_PROMPT_VERSION,
} from '../../../ai/research-timeline/service'
import { buildResearchTimelineFingerprint } from '../../../ai/research-timeline/periodizer'
import {
  TIMELINE_POLICY,
  TIMELINE_WINDOW_SIZE_YEARS,
  type TimelineGenerationStatus,
} from '../../../ai/research-timeline/types'
import { getInstitutionAccessById, getUserPlatformRole } from '../../../utils/permissions'
import type {
  CreateTimelineGenerationBody,
  ReviewTimelineGenerationBody,
  TimelineGenerationListQuery,
} from './schema'

interface TimelineAccess {
  canRequest: boolean
  canManage: boolean
  institutionId: string | null
}

const normalizeStatus = (value: string): TimelineGenerationStatus => {
  if (
    value === 'requested' ||
    value === 'queued' ||
    value === 'running' ||
    value === 'ready' ||
    value === 'published' ||
    value === 'failed' ||
    value === 'rejected' ||
    value === 'archived'
  ) {
    return value
  }
  return 'failed'
}

const assertTimelineEnabled = (fastify: FastifyInstance): void => {
  if (fastify.deployment.scholarTimeline.generationMode === 'disabled') {
    throw fastify.httpErrors.notFound('Scholar timeline generation is not available')
  }
}

const getTimelineAccess = async (
  fastify: FastifyInstance,
  userId: string,
  scholarId: string,
): Promise<TimelineAccess> => {
  const platformRole = await getUserPlatformRole(fastify, userId)
  if (platformRole === 'platform_admin') {
    return { canRequest: true, canManage: true, institutionId: null }
  }
  if (fastify.deployment.mode === 'public') {
    return { canRequest: true, canManage: false, institutionId: null }
  }

  const slug = fastify.deployment.paperLibrary.fixedInstitutionSlug
  if (!slug) {
    return { canRequest: false, canManage: false, institutionId: null }
  }
  const institution = await fastify.prisma.institutions.findUnique({
    where: { slug },
    select: { id: true },
  })
  if (!institution) {
    return { canRequest: false, canManage: false, institutionId: null }
  }
  const [membership, mapping] = await Promise.all([
    fastify.prisma.institution_memberships.findUnique({
      where: { institutionId_userId: { institutionId: institution.id, userId } },
      select: { role: true },
    }),
    fastify.prisma.institution_scholar_mappings.findFirst({
      where: { institutionId: institution.id, scholarId },
      select: { id: true },
    }),
  ])
  return {
    canRequest: membership !== null && mapping !== null,
    canManage: mapping !== null && (membership?.role === 'owner' || membership?.role === 'admin'),
    institutionId: institution.id,
  }
}

const assertModeAllowsCreate = (
  fastify: FastifyInstance,
  access: TimelineAccess,
): 'requested' | 'queued' => {
  const mode = fastify.deployment.scholarTimeline.generationMode
  if (!access.canRequest) {
    throw fastify.httpErrors.forbidden('You cannot request a timeline for this scholar')
  }
  if (mode === 'admin' && !access.canManage) {
    throw fastify.httpErrors.forbidden('Timeline generation is restricted to administrators')
  }
  if (mode === 'request_only' && !access.canManage) {
    return 'requested'
  }
  return 'queued'
}

const loadGenerationPeriods = async (fastify: FastifyInstance, generationId: string) => {
  const periods = await fastify.prisma.scholar_research_periods.findMany({
    where: { generation_id: generationId },
    orderBy: [{ period_start_year: 'asc' }, { period_end_year: 'asc' }, { id: 'asc' }],
  })
  const sourcePapers = await fastify.prisma.scholar_research_period_papers.findMany({
    where: { period_id: { in: periods.map((period) => period.id) } },
    orderBy: [{ period_id: 'asc' }, { display_order: 'asc' }, { id: 'asc' }],
  })
  const sourceByPeriod = new Map<bigint, typeof sourcePapers>()
  for (const paper of sourcePapers) {
    sourceByPeriod.set(paper.period_id, [...(sourceByPeriod.get(paper.period_id) ?? []), paper])
  }
  return periods.map((period) => ({
    period_start_year: period.period_start_year,
    period_end_year: period.period_end_year,
    paper_count: period.paper_count,
    papers_with_abstract: period.papers_with_abstract,
    papers_without_abstract: period.papers_without_abstract,
    focus_summary: period.focus_summary,
    focus_tags: period.focus_tags,
    source_papers: (sourceByPeriod.get(period.id) ?? []).map((paper) => ({
      year: paper.year,
      title: paper.title_snapshot,
      doi: paper.doi_snapshot,
      has_abstract: paper.has_abstract,
      source_status: paper.source_status,
    })),
  }))
}

const formatGeneration = async (
  fastify: FastifyInstance,
  generationId: string,
  reused = false,
  includeDetails = true,
) => {
  const generation = await fastify.prisma.scholar_research_timeline_generations.findUnique({
    where: { id: generationId },
  })
  if (!generation) {
    throw fastify.httpErrors.notFound('Timeline generation not found')
  }
  const scholar = await fastify.prisma.scholars.findUnique({
    where: { id: generation.scholar_id },
    select: { name: true },
  })
  if (!scholar) {
    throw fastify.httpErrors.notFound('Scholar not found')
  }
  const [periods, issues] = includeDetails
    ? await Promise.all([
        loadGenerationPeriods(fastify, generationId),
        fastify.prisma.scholar_research_timeline_issues.findMany({
          where: { generation_id: generationId },
          orderBy: { id: 'asc' },
        }),
      ])
    : [[], []]

  return {
    id: generation.id,
    scholarId: generation.scholar_id,
    scholarName: scholar.name,
    sourceType: generation.source_type,
    status: normalizeStatus(generation.status),
    sourceFingerprint: generation.source_fingerprint,
    model: generation.model,
    promptVersion: generation.prompt_version,
    progressStage: generation.progress_stage,
    completedPeriods: generation.completed_periods,
    totalPeriods: generation.total_periods,
    sourcePaperCount: generation.source_paper_count,
    resolvedPaperCount: generation.resolved_paper_count,
    unresolvedPaperCount: generation.unresolved_paper_count,
    inputTokens: generation.input_tokens,
    outputTokens: generation.output_tokens,
    errorMessage: generation.error_message,
    reviewNotes: generation.review_notes,
    requestedAt: generation.requested_at.toISOString(),
    startedAt: generation.started_at?.toISOString() ?? null,
    completedAt: generation.completed_at?.toISOString() ?? null,
    publishedAt: generation.published_at?.toISOString() ?? null,
    reused,
    periods,
    issues: issues.map((issue) => ({
      id: issue.id.toString(),
      paperId: issue.paper_id,
      doi: issue.doi,
      issueType: issue.issue_type,
      existingYear: issue.existing_year,
      candidateYear: issue.candidate_year,
      metadataSource: issue.metadata_source,
      message: issue.message,
    })),
  }
}

const assertCanReadGeneration = async (
  fastify: FastifyInstance,
  userId: string,
  scholarId: string,
  generationId: string,
): Promise<void> => {
  const access = await getTimelineAccess(fastify, userId, scholarId)
  if (access.canManage) {
    return
  }
  const request = await fastify.prisma.scholar_research_timeline_requests.findFirst({
    where: { generation_id: generationId, user_id: userId },
    select: { id: true },
  })
  if (!request) {
    throw fastify.httpErrors.forbidden('You cannot view this timeline preview')
  }
}

const attachRequester = async (
  fastify: FastifyInstance,
  generationId: string,
  userId: string,
  idempotencyKey: string,
): Promise<void> => {
  try {
    await fastify.prisma.scholar_research_timeline_requests.create({
      data: {
        generation_id: generationId,
        user_id: userId,
        idempotency_key: idempotencyKey,
      },
    })
  } catch (error) {
    if (typeof error !== 'object' || error === null || Reflect.get(error, 'code') !== 'P2002') {
      throw error
    }
  }
}

const assertDailyQuota = async (fastify: FastifyInstance, userId: string): Promise<void> => {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const count = await fastify.prisma.scholar_research_timeline_generations.count({
    where: {
      requested_by: userId,
      source_type: 'ai',
      status: { in: ['queued', 'running', 'ready', 'failed', 'published', 'archived'] },
      requested_at: { gte: since },
    },
  })
  if (count >= fastify.config.TIMELINE_DAILY_USER_LIMIT) {
    throw fastify.httpErrors.tooManyRequests('Daily scholar timeline generation limit reached')
  }
}

const isUniqueConstraintError = (error: unknown): boolean => {
  return typeof error === 'object' && error !== null && Reflect.get(error, 'code') === 'P2002'
}

export const createTimelineGeneration = async (
  fastify: FastifyInstance,
  scholarId: string,
  userId: string,
  idempotencyKey: string,
  body: CreateTimelineGenerationBody,
  requestMeta: { sourceIp: string | null; userAgent: string | null },
) => {
  assertTimelineEnabled(fastify)
  const existingRequest = await fastify.prisma.scholar_research_timeline_requests.findUnique({
    where: { user_id_idempotency_key: { user_id: userId, idempotency_key: idempotencyKey } },
  })
  if (existingRequest) {
    return {
      code: 0 as const,
      data: await formatGeneration(fastify, existingRequest.generation_id),
    }
  }

  const access = await getTimelineAccess(fastify, userId, scholarId)
  const requestedStatus = assertModeAllowsCreate(fastify, access)
  if (body.force && !access.canManage) {
    throw fastify.httpErrors.forbidden('Only timeline administrators can force regeneration')
  }
  const source = await loadTimelineSourceData(fastify, scholarId)
  const runtime = getAiRuntime(fastify)
  const fingerprint = buildResearchTimelineFingerprint(
    scholarId,
    source.papers,
    runtime.timelineModel,
    TIMELINE_PROMPT_VERSION,
    TIMELINE_WINDOW_SIZE_YEARS,
  )

  if (!body.force) {
    const reusable = await fastify.prisma.scholar_research_timeline_generations.findFirst({
      where: {
        scholar_id: scholarId,
        source_fingerprint: fingerprint,
        model: runtime.timelineModel,
        prompt_version: TIMELINE_PROMPT_VERSION,
        status: { in: ['ready', 'published'] },
      },
      orderBy: { createdAt: 'desc' },
    })
    if (reusable) {
      await attachRequester(fastify, reusable.id, userId, idempotencyKey)
      return { code: 0 as const, data: await formatGeneration(fastify, reusable.id, true) }
    }
  }

  const active = await fastify.prisma.scholar_research_timeline_generations.findFirst({
    where: { scholar_id: scholarId, status: { in: ['queued', 'running'] } },
    orderBy: { requested_at: 'asc' },
  })
  if (active) {
    await attachRequester(fastify, active.id, userId, idempotencyKey)
    return { code: 0 as const, data: await formatGeneration(fastify, active.id, true) }
  }

  if (requestedStatus === 'queued' && !access.canManage) {
    await assertDailyQuota(fastify, userId)
  }
  let generation: { id: string }
  try {
    generation = await fastify.prisma.$transaction(async (tx) => {
      const created = await tx.scholar_research_timeline_generations.create({
        data: {
          scholar_id: scholarId,
          source_type: 'ai',
          status: requestedStatus,
          requested_by: userId,
          idempotency_key: idempotencyKey,
          source_fingerprint: fingerprint,
          timeline_policy: TIMELINE_POLICY,
          window_size_years: TIMELINE_WINDOW_SIZE_YEARS,
          model: runtime.timelineModel,
          prompt_version: TIMELINE_PROMPT_VERSION,
          source_paper_count: source.papers.length,
          progress_stage: requestedStatus,
          request_ip: requestMeta.sourceIp,
          user_agent: requestMeta.userAgent,
        },
      })
      await tx.scholar_research_timeline_requests.create({
        data: {
          generation_id: created.id,
          user_id: userId,
          idempotency_key: idempotencyKey,
        },
      })
      return created
    })
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error
    }
    const concurrentRequest = await fastify.prisma.scholar_research_timeline_requests.findUnique({
      where: { user_id_idempotency_key: { user_id: userId, idempotency_key: idempotencyKey } },
    })
    const concurrentActive = concurrentRequest
      ? null
      : await fastify.prisma.scholar_research_timeline_generations.findFirst({
          where: { scholar_id: scholarId, status: { in: ['queued', 'running'] } },
          orderBy: { requested_at: 'asc' },
        })
    const concurrentGenerationId = concurrentRequest?.generation_id ?? concurrentActive?.id
    if (!concurrentGenerationId) {
      throw error
    }
    await attachRequester(fastify, concurrentGenerationId, userId, idempotencyKey)
    return {
      code: 0 as const,
      data: await formatGeneration(fastify, concurrentGenerationId, true),
    }
  }
  return { code: 0 as const, data: await formatGeneration(fastify, generation.id) }
}

export const getTimelineGeneration = async (
  fastify: FastifyInstance,
  scholarId: string,
  generationId: string,
  userId: string,
) => {
  assertTimelineEnabled(fastify)
  const generation = await fastify.prisma.scholar_research_timeline_generations.findUnique({
    where: { id: generationId },
    select: { scholar_id: true },
  })
  if (!generation || generation.scholar_id !== scholarId) {
    throw fastify.httpErrors.notFound('Timeline generation not found')
  }
  await assertCanReadGeneration(fastify, userId, scholarId, generationId)
  return { code: 0 as const, data: await formatGeneration(fastify, generationId) }
}

const assertCanManageGeneration = async (
  fastify: FastifyInstance,
  userId: string,
  scholarId: string,
): Promise<void> => {
  const access = await getTimelineAccess(fastify, userId, scholarId)
  if (!access.canManage) {
    throw fastify.httpErrors.forbidden('You cannot manage this timeline generation')
  }
}

export const startTimelineGeneration = async (
  fastify: FastifyInstance,
  scholarId: string,
  generationId: string,
  userId: string,
) => {
  assertTimelineEnabled(fastify)
  await assertCanManageGeneration(fastify, userId, scholarId)
  const generation = await fastify.prisma.scholar_research_timeline_generations.findUnique({
    where: { id: generationId },
  })
  if (!generation || generation.scholar_id !== scholarId) {
    throw fastify.httpErrors.notFound('Timeline generation not found')
  }
  if (generation.status !== 'requested') {
    throw fastify.httpErrors.badRequest('Only requested timeline generations can be started')
  }
  if (generation.requested_by) {
    const requesterAccess = await getTimelineAccess(fastify, generation.requested_by, scholarId)
    if (!requesterAccess.canManage) {
      await assertDailyQuota(fastify, generation.requested_by)
    }
  }
  const active = await fastify.prisma.scholar_research_timeline_generations.findFirst({
    where: {
      scholar_id: scholarId,
      status: { in: ['queued', 'running'] },
      id: { not: generationId },
    },
  })
  if (active) {
    throw fastify.httpErrors.conflict('Another timeline generation is already active')
  }
  await fastify.prisma.scholar_research_timeline_generations.update({
    where: { id: generationId },
    data: { status: 'queued', progress_stage: 'queued', updatedAt: new Date() },
  })
  return { code: 0 as const, data: await formatGeneration(fastify, generationId) }
}

export const publishTimelineGeneration = async (
  fastify: FastifyInstance,
  scholarId: string,
  generationId: string,
  userId: string,
  body: ReviewTimelineGenerationBody,
) => {
  assertTimelineEnabled(fastify)
  await assertCanManageGeneration(fastify, userId, scholarId)
  const generation = await fastify.prisma.scholar_research_timeline_generations.findUnique({
    where: { id: generationId },
  })
  if (!generation || generation.scholar_id !== scholarId) {
    throw fastify.httpErrors.notFound('Timeline generation not found')
  }
  if (generation.status === 'published') {
    return { code: 0 as const, data: await formatGeneration(fastify, generationId) }
  }
  if (generation.status !== 'ready') {
    throw fastify.httpErrors.badRequest('Only ready timeline generations can be published')
  }
  const now = new Date()
  await fastify.prisma.$transaction(async (tx) => {
    await tx.scholar_research_timeline_generations.updateMany({
      where: { scholar_id: scholarId, status: 'published' },
      data: { status: 'archived', progress_stage: 'archived', updatedAt: now },
    })
    await tx.scholar_research_timeline_generations.update({
      where: { id: generationId },
      data: {
        status: 'published',
        progress_stage: 'published',
        reviewed_by: userId,
        review_notes: body.notes ?? null,
        reviewed_at: now,
        published_at: now,
        updatedAt: now,
      },
    })
  })
  return { code: 0 as const, data: await formatGeneration(fastify, generationId) }
}

export const rejectTimelineGeneration = async (
  fastify: FastifyInstance,
  scholarId: string,
  generationId: string,
  userId: string,
  body: ReviewTimelineGenerationBody,
) => {
  assertTimelineEnabled(fastify)
  await assertCanManageGeneration(fastify, userId, scholarId)
  const generation = await fastify.prisma.scholar_research_timeline_generations.findUnique({
    where: { id: generationId },
  })
  if (!generation || generation.scholar_id !== scholarId) {
    throw fastify.httpErrors.notFound('Timeline generation not found')
  }
  if (!['requested', 'ready', 'failed'].includes(generation.status)) {
    throw fastify.httpErrors.badRequest('This timeline generation cannot be rejected')
  }
  const now = new Date()
  await fastify.prisma.scholar_research_timeline_generations.update({
    where: { id: generationId },
    data: {
      status: 'rejected',
      progress_stage: 'rejected',
      reviewed_by: userId,
      review_notes: body.notes ?? null,
      reviewed_at: now,
      updatedAt: now,
    },
  })
  return { code: 0 as const, data: await formatGeneration(fastify, generationId) }
}

const resolveAdminScholarFilter = async (
  fastify: FastifyInstance,
  userId: string,
): Promise<Prisma.scholar_research_timeline_generationsWhereInput> => {
  const role = await getUserPlatformRole(fastify, userId)
  if (role === 'platform_admin') {
    return {}
  }
  if (fastify.deployment.mode !== 'private') {
    throw fastify.httpErrors.forbidden('Platform administrator permission is required')
  }
  const slug = fastify.deployment.paperLibrary.fixedInstitutionSlug
  const institution = slug
    ? await fastify.prisma.institutions.findUnique({ where: { slug }, select: { id: true } })
    : null
  if (!institution) {
    throw fastify.httpErrors.forbidden('Institution administrator permission is required')
  }
  const access = await getInstitutionAccessById(fastify, userId, institution.id)
  if (access.institution_role !== 'owner' && access.institution_role !== 'admin') {
    throw fastify.httpErrors.forbidden('Institution administrator permission is required')
  }
  const mappings = await fastify.prisma.institution_scholar_mappings.findMany({
    where: { institutionId: institution.id },
    select: { scholarId: true },
  })
  return { scholar_id: { in: mappings.map((mapping) => mapping.scholarId) } }
}

export const listTimelineGenerations = async (
  fastify: FastifyInstance,
  userId: string,
  query: TimelineGenerationListQuery,
) => {
  assertTimelineEnabled(fastify)
  const accessWhere = await resolveAdminScholarFilter(fastify, userId)
  const where: Prisma.scholar_research_timeline_generationsWhereInput = {
    ...accessWhere,
    ...(query.status ? { status: query.status } : {}),
  }
  const limit = query.limit ?? 20
  const offset = query.offset ?? 0
  const [generations, total] = await Promise.all([
    fastify.prisma.scholar_research_timeline_generations.findMany({
      where,
      orderBy: [{ requested_at: 'desc' }, { id: 'desc' }],
      take: limit,
      skip: offset,
      select: { id: true },
    }),
    fastify.prisma.scholar_research_timeline_generations.count({ where }),
  ])
  return {
    code: 0 as const,
    data: {
      items: await Promise.all(
        generations.map((generation) => formatGeneration(fastify, generation.id, false, false)),
      ),
      total,
    },
  }
}
