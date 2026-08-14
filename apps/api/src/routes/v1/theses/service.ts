import crypto from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { Prisma } from '../../../../prisma/generated/client'
import {
  assertCanReviewContentCase,
  decideReviewCase,
  submitReviewCase,
  type ReviewCaseStatus,
} from '../../../review/service'
import { lockMutationScope } from '../../../utils/advisory-lock'
import { getInstitutionAccessById, getUserPlatformRole } from '../../../utils/permissions'
import {
  PROTECTED_FILE_SECURITY_PROFILE,
  buildProtectedFileAccessUrls,
} from '../../../utils/protected-files'
import type {
  CreateDegreeThesisBody,
  DegreeThesisListQuery,
  DegreeThesisReviewBody,
  DegreeThesisReviewQueueQuery,
  UpdateDegreeThesisBody,
} from './schema'
import { createDegreeThesisRecordCode } from './record-code'

interface RequestAuditContext {
  sourceIp?: string | null
  userAgent?: string | null
}

const thesisInclude = {
  institution: { select: { id: true, name: true, slug: true } },
  review_case: {
    include: {
      steps: { orderBy: { step_order: 'asc' as const } },
      actions: {
        include: {
          actor: { select: { id: true, name: true } },
          step: { select: { step_order: true, step_name: true } },
        },
        orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
      },
    },
  },
  current_version: true,
  published_version: true,
  versions: { orderBy: { version_number: 'desc' as const } },
} satisfies Prisma.degree_thesesInclude

const publishedThesisInclude = {
  institution: { select: { id: true, name: true, slug: true } },
  published_version: true,
} satisfies Prisma.degree_thesesInclude

type ThesisRecord = Prisma.degree_thesesGetPayload<{ include: typeof thesisInclude }>
type ThesisVersionRecord = ThesisRecord['versions'][number]
type PublishedThesisRecord = Prisma.degree_thesesGetPayload<{
  include: typeof publishedThesisInclude
}>

const normalizeStringArray = (values: string[]): string[] => {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

const normalizeInstitutionReference = (value?: string | null): string | null => {
  return value?.trim() || null
}

const versionData = (
  body: CreateDegreeThesisBody | UpdateDegreeThesisBody,
  thesisId: string,
  versionNumber: number,
  actorId: string,
  now: Date,
) => ({
  thesisId,
  version_number: versionNumber,
  title: body.title.trim(),
  title_en: body.title_en?.trim() || null,
  author_name: body.author_name.trim(),
  student_id: body.student_id?.trim() || null,
  training_unit: body.training_unit.trim(),
  major: body.major.trim(),
  degree_category: body.degree_category.trim(),
  award_year: body.award_year,
  advisors: normalizeStringArray(body.advisors),
  abstract: body.abstract?.trim() || null,
  keywords: normalizeStringArray(body.keywords),
  language: body.language.trim(),
  visibility: body.visibility,
  confidentiality_until: body.confidentiality_until
    ? new Date(`${body.confidentiality_until}T00:00:00.000Z`)
    : null,
  fileId: body.file_id ?? null,
  createdBy: actorId,
  createdAt: now,
})

const assertCanAttachFile = async (
  fastify: FastifyInstance,
  userId: string,
  institutionId: string,
  fileId?: string | null,
): Promise<void> => {
  if (!fileId) {
    return
  }
  const file = await fastify.prisma.oss_files.findUnique({ where: { id: fileId } })
  if (!file) {
    throw fastify.httpErrors.notFound('Uploaded thesis file not found')
  }
  if (file.userId !== userId) {
    throw fastify.httpErrors.forbidden('You can only attach a thesis file uploaded by yourself')
  }
  if (
    file.institutionId !== institutionId ||
    file.security_profile !== PROTECTED_FILE_SECURITY_PROFILE ||
    file.prefix !== 'scholar/theses'
  ) {
    throw fastify.httpErrors.badRequest(
      'The thesis file must use the thesis prefix and protected profile for the selected institution',
    )
  }
}

const findThesis = async (fastify: FastifyInstance, id: string): Promise<ThesisRecord> => {
  const thesis = await fastify.prisma.degree_theses.findUnique({
    where: { id },
    include: thesisInclude,
  })
  if (!thesis) {
    throw fastify.httpErrors.notFound('Degree thesis not found')
  }
  return thesis
}

const findThesisByRecordCode = async (
  fastify: FastifyInstance,
  recordCode: string,
): Promise<ThesisRecord> => {
  const thesis = await fastify.prisma.degree_theses.findUnique({
    where: { record_code: recordCode.toLocaleUpperCase('en-US') },
    include: thesisInclude,
  })
  if (!thesis) {
    throw fastify.httpErrors.notFound('Degree thesis not found')
  }
  return thesis
}

const resolveAccess = async (
  fastify: FastifyInstance,
  thesis: ThesisRecord,
  userId: string,
): Promise<{ canEdit: boolean; canReview: boolean; canViewCurrent: boolean }> => {
  const [platformRole, institutionAccess] = await Promise.all([
    getUserPlatformRole(fastify, userId),
    getInstitutionAccessById(fastify, userId, thesis.institutionId),
  ])
  const isPlatformAdmin = platformRole === 'platform_admin'
  const isSubmitter = thesis.submittedBy === userId
  const currentStep = thesis.review_case.steps.find(
    (step) => step.step_order === thesis.review_case.currentStep && step.status === 'pending',
  )
  const isResolvedReviewer = currentStep?.eligible_reviewer_user_ids.includes(userId) === true
  const canReview =
    thesis.review_case.status === 'pending_review' &&
    (isPlatformAdmin || (currentStep ? isResolvedReviewer : institutionAccess.can_review_content))
  const canEdit =
    (isSubmitter || isPlatformAdmin || institutionAccess.can_edit_content) &&
    thesis.review_case.status !== 'pending_review' &&
    thesis.review_case.status !== 'archived'
  return {
    canEdit,
    canReview,
    canViewCurrent:
      isSubmitter || isPlatformAdmin || canReview || institutionAccess.can_edit_content,
  }
}

const isConfidential = (version: ThesisVersionRecord): boolean => {
  return Boolean(
    version.confidentiality_until && version.confidentiality_until.getTime() > Date.now(),
  )
}

const canViewPublishedVersion = async (
  fastify: FastifyInstance,
  thesis: ThesisRecord,
  userId: string,
): Promise<boolean> => {
  const version = thesis.published_version
  if (!version || isConfidential(version)) {
    return false
  }
  if (version.visibility === 'public') {
    return true
  }
  if (version.visibility === 'institution') {
    const access = await getInstitutionAccessById(fastify, userId, thesis.institutionId)
    return access.platform_role === 'platform_admin' || access.institution_role !== null
  }
  return false
}

const formatVersion = (
  fastify: FastifyInstance,
  version: ThesisVersionRecord,
  userId: string,
  includePrivateMetadata: boolean,
) => {
  const urls = version.fileId
    ? buildProtectedFileAccessUrls(fastify, {
        fileId: version.fileId,
        userId,
        paperId: null,
      })
    : null
  return {
    id: version.id,
    version_number: version.version_number,
    title: version.title,
    title_en: version.title_en,
    author_name: version.author_name,
    student_id: includePrivateMetadata ? version.student_id : null,
    training_unit: version.training_unit,
    major: version.major,
    degree_category: version.degree_category,
    award_year: version.award_year,
    advisors: version.advisors,
    abstract: version.abstract,
    keywords: version.keywords,
    language: version.language,
    visibility: version.visibility as 'public' | 'institution' | 'restricted',
    confidentiality_until: version.confidentiality_until
      ? version.confidentiality_until.toISOString().slice(0, 10)
      : null,
    file_id: version.fileId,
    preview_url: urls?.previewUrl ?? null,
    download_url: urls?.downloadUrl ?? null,
    created_at: version.createdAt.toISOString(),
    submitted_at: version.submittedAt?.toISOString() ?? null,
  }
}

const formatThesis = async (
  fastify: FastifyInstance,
  thesis: ThesisRecord,
  userId: string,
  includePrivate: boolean,
) => {
  const access = includePrivate
    ? await resolveAccess(fastify, thesis, userId)
    : { canEdit: false, canReview: false, canViewCurrent: false }
  const showPrivate = includePrivate && access.canViewCurrent
  return {
    id: thesis.id,
    record_code: thesis.record_code,
    institution_reference: showPrivate ? thesis.institution_reference : null,
    institution_id: thesis.institutionId,
    institution_name: thesis.institution.name,
    submitted_by: showPrivate ? thesis.submittedBy : null,
    status: (showPrivate ? thesis.review_case.status : 'approved') as ReviewCaseStatus,
    current_step: showPrivate ? thesis.review_case.currentStep : null,
    decision_notes: showPrivate ? thesis.review_case.decision_notes : null,
    submitted_at:
      (showPrivate
        ? thesis.review_case.submittedAt
        : thesis.published_version?.submittedAt
      )?.toISOString() ?? null,
    published_at: thesis.publishedAt?.toISOString() ?? null,
    created_at: thesis.createdAt.toISOString(),
    updated_at: (showPrivate
      ? thesis.updatedAt
      : (thesis.publishedAt ?? thesis.updatedAt)
    ).toISOString(),
    can_edit: access.canEdit,
    can_review: access.canReview,
    current_version:
      showPrivate && thesis.current_version
        ? formatVersion(fastify, thesis.current_version, userId, true)
        : null,
    published_version: thesis.published_version
      ? formatVersion(fastify, thesis.published_version, userId, showPrivate)
      : null,
    versions: showPrivate
      ? thesis.versions.map((version) => formatVersion(fastify, version, userId, true))
      : [],
    review_steps: showPrivate
      ? thesis.review_case.steps.map((step) => ({
          id: step.id,
          order: step.step_order,
          name: step.step_name,
          status: step.status,
          eligible_reviewer_user_ids: step.eligible_reviewer_user_ids,
          resolution_notes: step.resolution_notes,
          review_notes: step.review_notes,
          reviewed_by: step.reviewedBy,
          reviewed_at: step.reviewedAt?.toISOString() ?? null,
        }))
      : [],
    review_history: showPrivate
      ? thesis.review_case.actions.map((action) => ({
          id: action.id,
          action: action.action,
          from_status: action.from_status,
          to_status: action.to_status,
          version_id: action.versionId,
          notes: action.notes,
          actor_id: action.actorId,
          actor_name: action.actor.name,
          step_order: action.step_order ?? action.step?.step_order ?? null,
          step_name: action.step_name ?? action.step?.step_name ?? null,
          created_at: action.createdAt.toISOString(),
        }))
      : [],
  }
}

const formatPublishedThesis = (
  fastify: FastifyInstance,
  thesis: PublishedThesisRecord,
  userId: string,
) => {
  const publishedVersion = thesis.published_version
  if (!publishedVersion) {
    throw fastify.httpErrors.notFound('Published degree thesis version not found')
  }
  return {
    id: thesis.id,
    record_code: thesis.record_code,
    institution_reference: null,
    institution_id: thesis.institutionId,
    institution_name: thesis.institution.name,
    submitted_by: null,
    status: 'approved' as const,
    current_step: null,
    decision_notes: null,
    submitted_at: publishedVersion.submittedAt?.toISOString() ?? null,
    published_at: thesis.publishedAt?.toISOString() ?? null,
    created_at: thesis.createdAt.toISOString(),
    updated_at: (thesis.publishedAt ?? thesis.updatedAt).toISOString(),
    can_edit: false,
    can_review: false,
    current_version: null,
    published_version: formatVersion(fastify, publishedVersion, userId, false),
    versions: [],
    review_steps: [],
    review_history: [],
  }
}

const loadCreateInstitution = async (
  fastify: FastifyInstance,
  userId: string,
  institutionId: string,
): Promise<{ id: string; slug: string }> => {
  const [access, institution] = await Promise.all([
    getInstitutionAccessById(fastify, userId, institutionId),
    fastify.prisma.institutions.findUnique({
      where: { id: institutionId },
      select: { id: true, slug: true },
    }),
  ])
  if (!institution) {
    throw fastify.httpErrors.notFound('Institution not found')
  }
  if (access.platform_role !== 'platform_admin' && access.institution_role === null) {
    throw fastify.httpErrors.forbidden(
      'You must be an institution member to submit a degree thesis',
    )
  }
  return institution
}

const assertReviewNodeBelongsToInstitution = async (
  fastify: FastifyInstance,
  institutionId: string,
  reviewNodeId?: string,
): Promise<void> => {
  if (!reviewNodeId) {
    return
  }
  const reviewNode = await fastify.prisma.institution_org_nodes.findFirst({
    where: { id: reviewNodeId, institutionId },
    select: { id: true },
  })
  if (!reviewNode) {
    throw fastify.httpErrors.badRequest(
      'The selected review node does not belong to the selected institution',
    )
  }
}

export const createDegreeThesis = async (
  fastify: FastifyInstance,
  body: CreateDegreeThesisBody,
  userId: string,
  audit: RequestAuditContext,
) => {
  const [institution] = await Promise.all([
    loadCreateInstitution(fastify, userId, body.institution_id),
    assertCanAttachFile(fastify, userId, body.institution_id, body.file_id),
    assertReviewNodeBelongsToInstitution(fastify, body.institution_id, body.review_node_id),
  ])
  const thesisId = crypto.randomUUID()
  const reviewCaseId = crypto.randomUUID()
  const recordCode = createDegreeThesisRecordCode(institution.slug)
  const now = new Date()

  await fastify.prisma.$transaction(async (tx) => {
    await lockMutationScope(tx, 'degree-thesis-create', `${body.institution_id}:${userId}`)
    await tx.content_review_cases.create({
      data: {
        id: reviewCaseId,
        institutionId: body.institution_id,
        content_type: 'degree_thesis',
        subjectId: thesisId,
        submittedBy: userId,
        reviewNodeId: body.review_node_id ?? null,
        status: 'draft',
        createdAt: now,
        updatedAt: now,
      },
    })
    await tx.degree_theses.create({
      data: {
        id: thesisId,
        institutionId: body.institution_id,
        record_code: recordCode,
        institution_reference: normalizeInstitutionReference(body.institution_reference),
        submittedBy: userId,
        reviewCaseId,
        createdAt: now,
        updatedAt: now,
      },
    })
    const version = await tx.degree_thesis_versions.create({
      data: versionData(body, thesisId, 1, userId, now),
    })
    await Promise.all([
      tx.degree_theses.update({
        where: { id: thesisId },
        data: { currentVersionId: version.id, updatedAt: now },
      }),
      tx.content_review_cases.update({
        where: { id: reviewCaseId },
        data: { currentVersionId: version.id, updatedAt: now },
      }),
      tx.content_review_actions.create({
        data: {
          caseId: reviewCaseId,
          institutionId: body.institution_id,
          actorId: userId,
          action: 'draft_created',
          to_status: 'draft',
          versionId: version.id,
          sourceIp: audit.sourceIp ?? null,
          userAgent: audit.userAgent?.slice(0, 1000) ?? null,
          createdAt: now,
        },
      }),
    ])
  })

  return {
    code: 0 as const,
    data: await formatThesis(fastify, await findThesis(fastify, thesisId), userId, true),
  }
}

export const updateDegreeThesis = async (
  fastify: FastifyInstance,
  id: string,
  body: UpdateDegreeThesisBody,
  userId: string,
  audit: RequestAuditContext,
) => {
  const thesis = await findThesis(fastify, id)
  const access = await resolveAccess(fastify, thesis, userId)
  if (!access.canEdit) {
    throw fastify.httpErrors.forbidden('You cannot edit this degree thesis in its current state')
  }
  if (body.file_id !== thesis.current_version?.fileId) {
    await assertCanAttachFile(fastify, userId, thesis.institutionId, body.file_id)
  }
  const now = new Date()

  await fastify.prisma.$transaction(async (tx) => {
    await lockMutationScope(tx, 'degree-thesis', thesis.id)
    const current = await tx.degree_theses.findUnique({
      where: { id: thesis.id },
      select: {
        review_case: {
          select: {
            status: true,
            currentStep: true,
            decision_notes: true,
            decidedBy: true,
            decidedAt: true,
          },
        },
      },
    })
    if (
      !current ||
      current.review_case.status === 'pending_review' ||
      current.review_case.status === 'archived'
    ) {
      throw fastify.httpErrors.conflict(
        'The degree thesis changed state while it was being edited; reload and try again',
      )
    }
    const nextStatus =
      current.review_case.status === 'approved' ? 'draft' : current.review_case.status
    const latestVersion = await tx.degree_thesis_versions.findFirst({
      where: { thesisId: thesis.id },
      orderBy: { version_number: 'desc' },
      select: { version_number: true },
    })
    const nextVersion = (latestVersion?.version_number ?? 0) + 1
    const version = await tx.degree_thesis_versions.create({
      data: versionData(body, thesis.id, nextVersion, userId, now),
    })
    await Promise.all([
      tx.degree_theses.update({
        where: { id: thesis.id },
        data: {
          currentVersionId: version.id,
          institution_reference:
            body.institution_reference === undefined
              ? thesis.institution_reference
              : normalizeInstitutionReference(body.institution_reference),
          updatedAt: now,
        },
      }),
      tx.content_review_cases.update({
        where: { id: thesis.reviewCaseId },
        data: {
          currentVersionId: version.id,
          status: nextStatus,
          currentStep: nextStatus === 'draft' ? null : current.review_case.currentStep,
          decision_notes: nextStatus === 'draft' ? null : current.review_case.decision_notes,
          decidedBy: nextStatus === 'draft' ? null : current.review_case.decidedBy,
          decidedAt: nextStatus === 'draft' ? null : current.review_case.decidedAt,
          updatedAt: now,
        },
      }),
      tx.content_review_actions.create({
        data: {
          caseId: thesis.reviewCaseId,
          institutionId: thesis.institutionId,
          actorId: userId,
          action: 'draft_saved',
          from_status: current.review_case.status,
          to_status: nextStatus,
          versionId: version.id,
          sourceIp: audit.sourceIp ?? null,
          userAgent: audit.userAgent?.slice(0, 1000) ?? null,
          createdAt: now,
        },
      }),
    ])
  })

  return {
    code: 0 as const,
    data: await formatThesis(fastify, await findThesis(fastify, id), userId, true),
  }
}

export const submitDegreeThesis = async (
  fastify: FastifyInstance,
  id: string,
  userId: string,
  audit: RequestAuditContext,
) => {
  const thesis = await findThesis(fastify, id)
  const access = await resolveAccess(fastify, thesis, userId)
  if (
    !access.canEdit ||
    !thesis.currentVersionId ||
    !['draft', 'changes_requested'].includes(thesis.review_case.status)
  ) {
    throw fastify.httpErrors.forbidden('This degree thesis cannot be submitted')
  }

  await fastify.prisma.$transaction(async (tx) => {
    await lockMutationScope(tx, 'degree-thesis', thesis.id)
    const current = await tx.degree_theses.findUnique({
      where: { id: thesis.id },
      select: {
        currentVersionId: true,
        reviewCaseId: true,
        review_case: { select: { status: true, reviewNodeId: true } },
      },
    })
    if (
      !current?.currentVersionId ||
      current.currentVersionId !== thesis.currentVersionId ||
      !['draft', 'changes_requested'].includes(current.review_case.status)
    ) {
      throw fastify.httpErrors.conflict(
        'The degree thesis changed while it was being submitted; reload and try again',
      )
    }
    const now = new Date()
    await tx.degree_thesis_versions.update({
      where: { id: current.currentVersionId },
      data: { submittedAt: now },
    })
    await submitReviewCase(fastify, tx, {
      caseId: current.reviewCaseId,
      actorId: userId,
      versionId: current.currentVersionId,
      reviewNodeId: current.review_case.reviewNodeId,
      ...audit,
    })
    await tx.degree_theses.update({ where: { id }, data: { updatedAt: now } })
  })

  return {
    code: 0 as const,
    data: await formatThesis(fastify, await findThesis(fastify, id), userId, true),
  }
}

export const reviewDegreeThesis = async (
  fastify: FastifyInstance,
  id: string,
  body: DegreeThesisReviewBody,
  userId: string,
  audit: RequestAuditContext,
) => {
  const thesis = await findThesis(fastify, id)
  await assertCanReviewContentCase(fastify, userId, thesis.review_case)

  await fastify.prisma.$transaction(async (tx) => {
    await lockMutationScope(tx, 'degree-thesis', thesis.id)
    const updatedCase = await decideReviewCase(fastify, tx, {
      caseId: thesis.reviewCaseId,
      actorId: userId,
      decision: body.decision,
      notes: body.notes,
      ...audit,
    })
    if (updatedCase.status === 'approved' && updatedCase.currentVersionId) {
      await tx.degree_theses.update({
        where: { id },
        data: {
          publishedVersionId: updatedCase.currentVersionId,
          publishedAt: new Date(),
          updatedAt: new Date(),
        },
      })
    }
  })

  return {
    code: 0 as const,
    data: await formatThesis(fastify, await findThesis(fastify, id), userId, true),
  }
}

const publishedWhere = async (
  fastify: FastifyInstance,
  userId: string,
  query: DegreeThesisListQuery,
): Promise<Prisma.degree_thesesWhereInput> => {
  const [platformRole, memberships] = await Promise.all([
    getUserPlatformRole(fastify, userId),
    fastify.prisma.institution_memberships.findMany({
      where: { userId },
      select: { institutionId: true },
    }),
  ])
  const institutionIds = memberships.map((membership) => membership.institutionId)
  const visibility: Prisma.degree_thesis_versionsWhereInput =
    platformRole === 'platform_admin'
      ? {}
      : {
          AND: [
            {
              OR: [
                { visibility: 'public' },
                {
                  visibility: 'institution',
                  thesis: { institutionId: { in: institutionIds } },
                },
              ],
            },
            {
              OR: [{ confidentiality_until: null }, { confidentiality_until: { lte: new Date() } }],
            },
          ],
        }

  const q = query.q?.trim()
  return {
    publishedVersionId: { not: null },
    institutionId: query.institution_id,
    published_version: {
      is: {
        ...visibility,
        training_unit: query.training_unit,
        major: query.major,
        degree_category: query.degree_category,
        award_year: {
          gte: query.year_from,
          lte: query.year_to,
        },
      },
    },
    ...(q
      ? {
          OR: [
            { record_code: { contains: q, mode: 'insensitive' } },
            { institution_reference: { contains: q, mode: 'insensitive' } },
            {
              published_version: {
                is: {
                  OR: [
                    { title: { contains: q, mode: 'insensitive' } },
                    { title_en: { contains: q, mode: 'insensitive' } },
                    { author_name: { contains: q, mode: 'insensitive' } },
                    { abstract: { contains: q, mode: 'insensitive' } },
                  ],
                },
              },
            },
          ],
        }
      : {}),
  }
}

export const listDegreeTheses = async (
  fastify: FastifyInstance,
  query: DegreeThesisListQuery,
  userId: string,
) => {
  const where = await publishedWhere(fastify, userId, query)
  const [items, total] = await Promise.all([
    fastify.prisma.degree_theses.findMany({
      where,
      include: publishedThesisInclude,
      orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
      take: query.limit ?? 20,
      skip: query.offset ?? 0,
    }),
    fastify.prisma.degree_theses.count({ where }),
  ])
  return {
    code: 0 as const,
    data: {
      items: items.map((thesis) => formatPublishedThesis(fastify, thesis, userId)),
      total,
    },
  }
}

export const listMyDegreeTheses = async (fastify: FastifyInstance, userId: string) => {
  const items = await fastify.prisma.degree_theses.findMany({
    where: { submittedBy: userId },
    include: thesisInclude,
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
  })
  return {
    code: 0 as const,
    data: {
      items: await Promise.all(items.map((thesis) => formatThesis(fastify, thesis, userId, true))),
      total: items.length,
    },
  }
}

export const listDegreeThesisReviewQueue = async (
  fastify: FastifyInstance,
  query: DegreeThesisReviewQueueQuery,
  userId: string,
) => {
  const [platformRole, memberships] = await Promise.all([
    getUserPlatformRole(fastify, userId),
    fastify.prisma.institution_memberships.findMany({
      where: {
        userId,
        OR: [{ role: { in: ['owner', 'admin'] } }, { can_review_content: true }],
      },
      select: { institutionId: true },
    }),
  ])
  const reviewInstitutionIds = memberships.map((membership) => membership.institutionId)
  const q = query.q?.trim()
  const where: Prisma.degree_thesesWhereInput = {
    institutionId: query.institution_id,
    review_case: {
      is: {
        status: 'pending_review',
        ...(platformRole === 'platform_admin'
          ? {}
          : {
              OR: [
                {
                  steps: {
                    some: {
                      status: 'pending',
                      eligible_reviewer_user_ids: { has: userId },
                    },
                  },
                },
                {
                  AND: [
                    { institutionId: { in: reviewInstitutionIds } },
                    { steps: { none: { status: 'pending' } } },
                  ],
                },
              ],
            }),
      },
    },
    ...(q
      ? {
          OR: [
            { record_code: { contains: q, mode: 'insensitive' } },
            { institution_reference: { contains: q, mode: 'insensitive' } },
            {
              current_version: {
                is: {
                  OR: [
                    { title: { contains: q, mode: 'insensitive' } },
                    { author_name: { contains: q, mode: 'insensitive' } },
                    { student_id: { contains: q, mode: 'insensitive' } },
                  ],
                },
              },
            },
          ],
        }
      : {}),
  }
  const [items, total] = await Promise.all([
    fastify.prisma.degree_theses.findMany({
      where,
      include: thesisInclude,
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: query.limit ?? 20,
      skip: query.offset ?? 0,
    }),
    fastify.prisma.degree_theses.count({ where }),
  ])
  return {
    code: 0 as const,
    data: {
      items: await Promise.all(items.map((thesis) => formatThesis(fastify, thesis, userId, true))),
      total,
    },
  }
}

export const getDegreeThesis = async (fastify: FastifyInstance, id: string, userId: string) => {
  const thesis = await findThesis(fastify, id)
  return formatAccessibleDegreeThesis(fastify, thesis, userId)
}

export const getDegreeThesisByRecordCode = async (
  fastify: FastifyInstance,
  recordCode: string,
  userId: string,
) => {
  const thesis = await findThesisByRecordCode(fastify, recordCode)
  return formatAccessibleDegreeThesis(fastify, thesis, userId)
}

const formatAccessibleDegreeThesis = async (
  fastify: FastifyInstance,
  thesis: ThesisRecord,
  userId: string,
) => {
  const access = await resolveAccess(fastify, thesis, userId)
  const canViewPublished = await canViewPublishedVersion(fastify, thesis, userId)
  if (!access.canViewCurrent && !canViewPublished) {
    throw fastify.httpErrors.forbidden('You do not have permission to view this degree thesis')
  }
  return {
    code: 0 as const,
    data: await formatThesis(fastify, thesis, userId, access.canViewCurrent),
  }
}

export const getDegreeThesisFacets = async (fastify: FastifyInstance, userId: string) => {
  const where = await publishedWhere(fastify, userId, {})
  const theses = await fastify.prisma.degree_theses.findMany({
    where,
    select: {
      published_version: {
        select: {
          training_unit: true,
          major: true,
          degree_category: true,
          award_year: true,
        },
      },
    },
  })
  const versions = theses
    .map((thesis) => thesis.published_version)
    .filter((version): version is NonNullable<typeof version> => version !== null)
  return {
    code: 0 as const,
    data: {
      training_units: [...new Set(versions.map((version) => version.training_unit))].sort(),
      majors: [...new Set(versions.map((version) => version.major))].sort(),
      degree_categories: [...new Set(versions.map((version) => version.degree_category))].sort(),
      award_years: [...new Set(versions.map((version) => version.award_year))].sort(
        (left, right) => right - left,
      ),
    },
  }
}
