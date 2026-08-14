import type { FastifyInstance } from 'fastify'
import type { papers as PaperRecord, Prisma } from '../../../prisma/generated/client'
import type { InstitutionPaperBoundMember } from '../../utils/institution-paper-bindings'
import type { UpdatePaperBody } from './schema'
import type { ClaimRecord, FormattedPaper, PaperScope, SubmissionRecord } from './service.shared'
import {
  assertCanReviewPaperClaim,
  getInstitutionAccessById,
  getReviewScope,
  getUserPlatformRole,
} from '../../utils/permissions'
import { getUserWorkflowReviewableClaimIds } from '../../utils/institution-org-structure'
import { buildProtectedFileAccessUrls } from '../../utils/protected-files'
import { requireNormalizedDoi } from '../../utils/doi'
import { mergeWhere, normalizeReviewStatus, toClaimRecord } from './service.shared'
import { refreshPaperSearchIndex } from './paper-index'

export const resolvePaperScope = async (
  fastify: FastifyInstance,
  userId: string,
  requestedInstitutionId?: string,
  requestedLabId?: string,
  requestedReviewNodeId?: string,
): Promise<PaperScope> => {
  if (!requestedInstitutionId && !requestedLabId) {
    throw fastify.httpErrors.badRequest('Institution scope is required when submitting a paper')
  }

  if (requestedLabId) {
    const lab = await fastify.prisma.labs.findUnique({
      where: { id: requestedLabId },
      select: { id: true, institutionId: true },
    })

    if (!lab) {
      throw fastify.httpErrors.notFound('Lab not found')
    }

    if (
      requestedInstitutionId &&
      lab.institutionId &&
      requestedInstitutionId !== lab.institutionId
    ) {
      throw fastify.httpErrors.badRequest(
        'The selected lab does not belong to the selected institution',
      )
    }

    const platformRole = await getUserPlatformRole(fastify, userId)
    if (platformRole !== 'platform_admin') {
      const [labMembership, institutionAccess] = await Promise.all([
        fastify.prisma.lab_memberships.findUnique({
          where: {
            labId_userId: {
              labId: requestedLabId,
              userId,
            },
          },
          select: { id: true },
        }),
        lab.institutionId
          ? getInstitutionAccessById(fastify, userId, lab.institutionId)
          : Promise.resolve(null),
      ])

      if (!labMembership && institutionAccess?.can_edit_content !== true) {
        throw fastify.httpErrors.forbidden('You can only submit papers under labs you belong to')
      }
    }

    let reviewNodeId: string | null = null
    if (requestedReviewNodeId && (lab.institutionId ?? requestedInstitutionId)) {
      const effectiveInstitutionId = lab.institutionId ?? requestedInstitutionId ?? null
      const node = await fastify.prisma.institution_org_nodes.findUnique({
        where: { id: requestedReviewNodeId },
        select: {
          id: true,
          institutionId: true,
          is_active: true,
        },
      })

      if (
        !effectiveInstitutionId ||
        !node ||
        node.institutionId !== effectiveInstitutionId ||
        node.is_active !== true
      ) {
        throw fastify.httpErrors.badRequest(
          'The selected review node does not belong to the selected institution',
        )
      }

      reviewNodeId = node.id
    }

    const institutionId = lab.institutionId ?? requestedInstitutionId
    if (!institutionId) {
      throw fastify.httpErrors.badRequest('The selected lab must belong to an institution')
    }

    return {
      institutionId,
      labId: lab.id,
      reviewNodeId,
    }
  }

  if (requestedInstitutionId) {
    const institution = await fastify.prisma.institutions.findUnique({
      where: { id: requestedInstitutionId },
      select: { id: true },
    })
    if (!institution) {
      throw fastify.httpErrors.notFound('Institution not found')
    }

    const platformRole = await getUserPlatformRole(fastify, userId)
    if (platformRole !== 'platform_admin') {
      const membership = await fastify.prisma.institution_memberships.findUnique({
        where: {
          institutionId_userId: {
            institutionId: requestedInstitutionId,
            userId,
          },
        },
        select: { id: true },
      })

      if (!membership) {
        throw fastify.httpErrors.forbidden(
          'You can only submit papers under institutions you belong to',
        )
      }
    }

    let reviewNodeId: string | null = null
    if (requestedReviewNodeId) {
      const node = await fastify.prisma.institution_org_nodes.findUnique({
        where: { id: requestedReviewNodeId },
        select: {
          id: true,
          institutionId: true,
          is_active: true,
        },
      })

      if (!node || node.institutionId !== requestedInstitutionId || node.is_active !== true) {
        throw fastify.httpErrors.badRequest(
          'The selected review node does not belong to the selected institution',
        )
      }

      reviewNodeId = node.id
    }

    return {
      institutionId: requestedInstitutionId,
      labId: null,
      reviewNodeId,
    }
  }

  throw fastify.httpErrors.badRequest('Institution scope is required when submitting a paper')
}

const buildReviewScopeWhere = async (fastify: FastifyInstance, userId: string) => {
  const reviewScope = await getReviewScope(fastify, userId)
  if (reviewScope.platformRole === 'platform_admin') {
    return {}
  }

  const conditions: Array<Record<string, unknown>> = []
  if (reviewScope.institutionIds.length > 0) {
    conditions.push({ institutionId: { in: reviewScope.institutionIds } })
  }
  if (reviewScope.labIds.length > 0) {
    conditions.push({ labId: { in: reviewScope.labIds } })
  }

  if (conditions.length === 0) {
    throw fastify.httpErrors.forbidden('You do not have permission to review papers')
  }

  return conditions.length === 1 ? conditions[0] : { OR: conditions }
}

export const buildUserReviewableClaimsWhere = async (fastify: FastifyInstance, userId: string) => {
  const platformRole = await getUserPlatformRole(fastify, userId)
  if (platformRole === 'platform_admin') {
    return {}
  }

  const [scopeWhereResult, workflowClaimIds] = await Promise.all([
    buildReviewScopeWhere(fastify, userId).catch(() => null),
    getUserWorkflowReviewableClaimIds(fastify, userId),
  ])

  const conditions: Array<Record<string, unknown>> = []
  if (scopeWhereResult && Object.keys(scopeWhereResult).length > 0) {
    conditions.push(scopeWhereResult)
  }
  if (workflowClaimIds.length > 0) {
    conditions.push({ id: { in: workflowClaimIds } })
  }

  if (conditions.length === 0) {
    throw fastify.httpErrors.forbidden('You do not have permission to review papers')
  }

  return conditions.length === 1 ? conditions[0] : { OR: conditions }
}

const assertCanAccessClaim = async (
  fastify: FastifyInstance,
  userId: string,
  claim: ClaimRecord | null,
  submission: SubmissionRecord | null,
): Promise<void> => {
  if (!claim && submission?.userId === userId) {
    return
  }

  if (!claim) {
    throw fastify.httpErrors.forbidden('This paper is not publicly available yet')
  }

  const reviewStatus = normalizeReviewStatus(claim.review_status)
  if (reviewStatus === 'approved') {
    return
  }

  if (submission?.userId === userId || claim.submittedBy === userId) {
    return
  }

  await assertCanReviewPaperClaim(fastify, userId, claim)
}

const assertCanManagePaper = async (fastify: FastifyInstance, userId: string): Promise<void> => {
  const platformRole = await getUserPlatformRole(fastify, userId)
  if (platformRole !== 'platform_admin') {
    throw fastify.httpErrors.forbidden(
      'Only platform administrators can modify global paper metadata',
    )
  }
}

export const resolveSubmissionForClaim = async (
  fastify: FastifyInstance,
  claim: ClaimRecord | null,
): Promise<SubmissionRecord | null> => {
  if (!claim) {
    return null
  }

  if (claim.submissionId) {
    const submission = await fastify.prisma.paper_submissions.findUnique({
      where: { id: claim.submissionId },
    })
    if (submission) {
      return submission
    }
  }

  return fastify.prisma.paper_submissions.findFirst({
    where: { claimId: claim.id },
    orderBy: { createdAt: 'desc' },
  })
}

interface FormatPaperBatchInput {
  paper: PaperRecord
  claim: ClaimRecord | null
  submission?: SubmissionRecord | null
  boundMembers?: InstitutionPaperBoundMember[]
}

const resolveBatchSubmissions = async (
  fastify: FastifyInstance,
  items: FormatPaperBatchInput[],
): Promise<Array<SubmissionRecord | null>> => {
  const explicitByKey = new Map<number, SubmissionRecord | null>()
  const submissionIds = new Set<string>()
  const fallbackClaimIds = new Set<string>()
  const claimIdByKey = new Map<number, string>()

  for (let index = 0; index < items.length; index++) {
    const item = items[index]
    if (item.submission !== undefined) {
      explicitByKey.set(index, item.submission)
      continue
    }

    if (!item.claim) {
      explicitByKey.set(index, null)
      continue
    }

    claimIdByKey.set(index, item.claim.id)
    if (item.claim.submissionId) {
      submissionIds.add(item.claim.submissionId)
      continue
    }

    fallbackClaimIds.add(item.claim.id)
  }

  const submissionsById =
    submissionIds.size > 0
      ? new Map(
          (
            await fastify.prisma.paper_submissions.findMany({
              where: { id: { in: [...submissionIds] } },
            })
          ).map((submission) => [submission.id, submission]),
        )
      : new Map<string, SubmissionRecord>()

  for (let index = 0; index < items.length; index++) {
    if (explicitByKey.has(index)) {
      continue
    }

    const claim = items[index].claim
    if (!claim) {
      explicitByKey.set(index, null)
      continue
    }

    if (claim.submissionId) {
      const submission = submissionsById.get(claim.submissionId) ?? null
      explicitByKey.set(index, submission)
      if (!submission) {
        fallbackClaimIds.add(claim.id)
      }
    }
  }

  const fallbackSubmissions =
    fallbackClaimIds.size > 0
      ? await fastify.prisma.paper_submissions.findMany({
          where: {
            claimId: { in: [...fallbackClaimIds] },
          },
          orderBy: [{ claimId: 'asc' }, { createdAt: 'desc' }],
        })
      : []
  const fallbackByClaimId = new Map<string, SubmissionRecord>()
  for (const submission of fallbackSubmissions) {
    if (submission.claimId && !fallbackByClaimId.has(submission.claimId)) {
      fallbackByClaimId.set(submission.claimId, submission)
    }
  }

  return items.map((item, index) => {
    const explicitSubmission = explicitByKey.get(index)
    if (explicitSubmission !== undefined) {
      return (
        explicitSubmission ??
        (claimIdByKey.has(index) ? (fallbackByClaimId.get(claimIdByKey.get(index)!) ?? null) : null)
      )
    }

    const claimId = claimIdByKey.get(index)
    return claimId ? (fallbackByClaimId.get(claimId) ?? null) : null
  })
}

const buildFormattedPaper = (
  fastify: FastifyInstance,
  paper: PaperRecord,
  claim: ClaimRecord | null,
  viewerUserId: string,
  resolvedSubmission: SubmissionRecord | null,
  boundMembers: InstitutionPaperBoundMember[],
  paperAuthors: Array<{ authorId: string; order: number }>,
  authorMap: Map<string, { name: string; email: string | null }>,
  uploaderMap: Map<string, { name: string | null }>,
  institutionMap: Map<string, { name: string | null }>,
  labMap: Map<string, { name: string | null }>,
  ossFileMap: Map<string, { id: string }>,
): FormattedPaper => {
  const uploaderId = resolvedSubmission?.userId ?? claim?.submittedBy ?? ''
  const institutionId = claim?.institutionId ?? resolvedSubmission?.institutionId ?? null
  const labId = claim?.labId ?? resolvedSubmission?.labId ?? null
  const ossFile = resolvedSubmission?.oss_file_id
    ? (ossFileMap.get(resolvedSubmission.oss_file_id) ?? null)
    : null
  const fileUrls = ossFile
    ? buildProtectedFileAccessUrls(fastify, {
        fileId: ossFile.id,
        userId: viewerUserId,
        paperId: paper.id,
      })
    : null

  return {
    id: paper.id,
    claimId: claim?.id ?? null,
    submissionId: resolvedSubmission?.id ?? null,
    title: paper.title,
    abstract: paper.abstract,
    doi: paper.doi,
    journal_name: paper.journal_name,
    publish_year: paper.publish_year,
    publish_date: paper.publish_date ? paper.publish_date.toISOString().split('T')[0] : null,
    paper_type: paper.paper_type,
    language: paper.language,
    citation_count: paper.citation_count,
    pages: paper.pages,
    keywords: paper.keywords,
    authors: paperAuthors.map((paperAuthor) => {
      const author = authorMap.get(paperAuthor.authorId)
      return {
        id: paperAuthor.authorId,
        name: author?.name ?? '',
        email: author?.email ?? null,
        order: paperAuthor.order,
      }
    }),
    boundMembers,
    oss_file_id: resolvedSubmission?.oss_file_id ?? null,
    preview_url: fileUrls?.previewUrl ?? null,
    download_url: fileUrls?.downloadUrl ?? null,
    file_url: fileUrls?.previewUrl ?? null,
    link: (paper.link as string | null) ?? null,
    uploadUserId: uploaderId,
    uploadUserName: uploaderMap.get(uploaderId)?.name ?? null,
    institutionId,
    institutionName: institutionId ? (institutionMap.get(institutionId)?.name ?? null) : null,
    labId,
    labName: labId ? (labMap.get(labId)?.name ?? null) : null,
    reviewNodeId: claim?.reviewNodeId ?? null,
    reviewWorkflowId: claim?.reviewWorkflowId ?? null,
    currentReviewStep: claim?.currentReviewStep ?? null,
    reviewStatus: claim ? normalizeReviewStatus(claim.review_status) : 'pending_review',
    reviewNotes: claim?.review_notes ?? null,
    reviewedAt: claim?.reviewedAt ? claim.reviewedAt.toISOString() : null,
    createdAt: (
      resolvedSubmission?.createdAt ??
      claim?.createdAt ??
      (paper.createdAt as Date)
    ).toISOString(),
    updatedAt: (
      resolvedSubmission?.updatedAt ??
      claim?.updatedAt ??
      (paper.updatedAt as Date)
    ).toISOString(),
  }
}

export async function formatPapers(
  fastify: FastifyInstance,
  items: FormatPaperBatchInput[],
  viewerUserId: string,
): Promise<FormattedPaper[]> {
  if (items.length === 0) {
    return []
  }

  const resolvedSubmissions = await resolveBatchSubmissions(fastify, items)
  const paperIds = [...new Set(items.map((item) => item.paper.id as string))]
  const uploaderIds = [
    ...new Set(
      resolvedSubmissions
        .map((submission, index) => submission?.userId ?? items[index].claim?.submittedBy ?? null)
        .filter((value): value is string => Boolean(value)),
    ),
  ]
  const institutionIds = [
    ...new Set(
      items
        .map(
          (item, index) =>
            item.claim?.institutionId ?? resolvedSubmissions[index]?.institutionId ?? null,
        )
        .filter((value): value is string => Boolean(value)),
    ),
  ]
  const labIds = [
    ...new Set(
      items
        .map((item, index) => item.claim?.labId ?? resolvedSubmissions[index]?.labId ?? null)
        .filter((value): value is string => Boolean(value)),
    ),
  ]
  const ossFileIds = [
    ...new Set(
      resolvedSubmissions
        .map((submission) => submission?.oss_file_id ?? null)
        .filter((value): value is string => Boolean(value)),
    ),
  ]

  const [ossFiles, paperAuthors, users, institutions, labs] = await Promise.all([
    ossFileIds.length > 0
      ? fastify.prisma.oss_files.findMany({
          where: { id: { in: ossFileIds } },
          select: { id: true },
        })
      : Promise.resolve([]),
    fastify.prisma.paper_authors.findMany({
      where: { paperId: { in: paperIds } },
      orderBy: [{ paperId: 'asc' }, { order: 'asc' }],
    }),
    uploaderIds.length > 0
      ? fastify.prisma.users.findMany({
          where: { id: { in: uploaderIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    institutionIds.length > 0
      ? fastify.prisma.institutions.findMany({
          where: { id: { in: institutionIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    labIds.length > 0
      ? fastify.prisma.labs.findMany({
          where: { id: { in: labIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ])

  const authorIds = [...new Set(paperAuthors.map((paperAuthor) => paperAuthor.authorId))]
  const authors =
    authorIds.length > 0
      ? await fastify.prisma.authors.findMany({
          where: { id: { in: authorIds } },
          select: { id: true, name: true, email: true },
        })
      : []

  const paperAuthorsByPaperId = new Map<string, Array<{ authorId: string; order: number }>>()
  for (const paperAuthor of paperAuthors) {
    const current = paperAuthorsByPaperId.get(paperAuthor.paperId) ?? []
    current.push({
      authorId: paperAuthor.authorId,
      order: paperAuthor.order,
    })
    paperAuthorsByPaperId.set(paperAuthor.paperId, current)
  }

  const authorMap = new Map(
    authors.map((author) => [
      author.id,
      {
        name: author.name,
        email: author.email,
      },
    ]),
  )
  const uploaderMap = new Map(
    users.map((user) => [
      user.id,
      {
        name: user.name,
      },
    ]),
  )
  const institutionMap = new Map(
    institutions.map((institution) => [
      institution.id,
      {
        name: institution.name,
      },
    ]),
  )
  const labMap = new Map(
    labs.map((lab) => [
      lab.id,
      {
        name: lab.name,
      },
    ]),
  )
  const ossFileMap = new Map(ossFiles.map((file) => [file.id, file]))

  return items.map((item, index) =>
    buildFormattedPaper(
      fastify,
      item.paper,
      item.claim,
      viewerUserId,
      resolvedSubmissions[index] ?? null,
      item.boundMembers ?? [],
      paperAuthorsByPaperId.get(item.paper.id) ?? [],
      authorMap,
      uploaderMap,
      institutionMap,
      labMap,
      ossFileMap,
    ),
  )
}

export async function formatPaper(
  fastify: FastifyInstance,
  paper: PaperRecord,
  claim: ClaimRecord | null,
  viewerUserId: string,
  submission?: SubmissionRecord | null,
  boundMembers: InstitutionPaperBoundMember[] = [],
): Promise<FormattedPaper> {
  const [formatted] = await formatPapers(
    fastify,
    [
      {
        paper,
        claim,
        submission,
        boundMembers,
      },
    ],
    viewerUserId,
  )

  return formatted
}

export async function getPaper(fastify: FastifyInstance, id: string, userId: string) {
  const paper = await fastify.prisma.papers.findUnique({ where: { id } })
  if (!paper) {
    throw fastify.httpErrors.notFound('Paper not found')
  }

  const ownSubmission = await fastify.prisma.paper_submissions.findFirst({
    where: {
      paperId: id,
      userId,
    },
    orderBy: { createdAt: 'desc' },
  })

  const ownClaim = ownSubmission?.claimId
    ? await fastify.prisma.paper_claims.findUnique({
        where: { id: ownSubmission.claimId },
        include: { review_case: true },
      })
    : null
  let claim = ownClaim ? toClaimRecord(ownClaim) : null
  let submission = ownSubmission

  if (!claim) {
    const approvedClaim = await fastify.prisma.paper_claims.findFirst({
      where: {
        paperId: id,
        review_case: { status: 'approved' },
      },
      include: { review_case: true },
      orderBy: [{ review_case: { decidedAt: 'desc' } }, { updatedAt: 'desc' }],
    })
    claim = approvedClaim ? toClaimRecord(approvedClaim) : null
  }

  if (!claim) {
    const reviewScopeWhere = await buildUserReviewableClaimsWhere(fastify, userId).catch(() => ({}))
    if (Object.keys(reviewScopeWhere).length > 0) {
      const reviewableClaim = await fastify.prisma.paper_claims.findFirst({
        where: mergeWhere({ paperId: id }, reviewScopeWhere),
        include: { review_case: true },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      })
      claim = reviewableClaim ? toClaimRecord(reviewableClaim) : null
    }
  }

  if (!submission) {
    submission = await resolveSubmissionForClaim(fastify, claim)
  }

  await assertCanAccessClaim(fastify, userId, claim, submission)

  return formatPaper(fastify, paper, claim, userId, submission)
}

export async function updatePaper(
  fastify: FastifyInstance,
  id: string,
  body: UpdatePaperBody,
  userId: string,
) {
  const paper = await fastify.prisma.papers.findUnique({ where: { id } })
  if (!paper) {
    throw fastify.httpErrors.notFound('Paper not found')
  }

  const claims = await fastify.prisma.paper_claims.findMany({
    where: { paperId: id },
    include: { review_case: true },
    orderBy: { createdAt: 'asc' },
  })
  await assertCanManagePaper(fastify, userId)

  const data: Prisma.papersUpdateInput = { updatedAt: new Date() }
  if (body.title !== undefined) data.title = body.title
  if (body.abstract !== undefined) data.abstract = body.abstract
  if (body.doi !== undefined) {
    const normalizedDoi = requireNormalizedDoi(body.doi)
    data.doi = normalizedDoi
    data.normalized_doi = normalizedDoi
  }
  if (body.journal_name !== undefined) data.journal_name = body.journal_name
  if (body.publish_year !== undefined) data.publish_year = body.publish_year
  if (body.publish_date !== undefined) data.publish_date = new Date(body.publish_date)
  if (body.paper_type !== undefined) data.paper_type = body.paper_type
  if (body.language !== undefined) data.language = body.language
  if (body.citation_count !== undefined) data.citation_count = body.citation_count
  if (body.pages !== undefined) data.pages = body.pages
  if (body.keywords !== undefined) data.keywords = body.keywords
  if (body.link !== undefined) data.link = body.link

  const updatedPaper = await fastify.prisma.papers.update({
    where: { id },
    data,
  })

  const hasApprovedClaim = claims.some(
    (claim) => normalizeReviewStatus(claim.review_case.status) === 'approved',
  )
  if (
    hasApprovedClaim &&
    (paper.title !== updatedPaper.title || paper.abstract !== updatedPaper.abstract)
  ) {
    refreshPaperSearchIndex(fastify, updatedPaper.id).catch((error) => {
      fastify.log.error(
        { err: error, paperId: updatedPaper.id },
        'Failed to update paper search index after canonical edit',
      )
    })
  }

  return getPaper(fastify, updatedPaper.id, userId)
}

export async function deletePaper(fastify: FastifyInstance, id: string, userId: string) {
  const paper = await fastify.prisma.papers.findUnique({ where: { id } })
  if (!paper) {
    throw fastify.httpErrors.notFound('Paper not found')
  }

  const claims = await fastify.prisma.paper_claims.findMany({
    where: { paperId: id },
  })
  await assertCanManagePaper(fastify, userId)

  const posts = await fastify.prisma.forum_posts.findMany({
    where: { paperId: id },
    select: { id: true },
  })
  const postIds = posts.map((post) => post.id)

  const claimIds = claims.map((claim) => claim.id)
  await fastify.prisma.$transaction(async (tx) => {
    if (postIds.length > 0) {
      await tx.forum_likes.deleteMany({
        where: { postId: { in: postIds } },
      })
      await tx.forum_comments.deleteMany({
        where: { postId: { in: postIds } },
      })
    }

    await tx.forum_posts.deleteMany({ where: { paperId: id } })
    await tx.user_bookmarks.deleteMany({ where: { paperId: id } })
    await tx.scholar_papers.deleteMany({ where: { paperId: id } })
    await tx.paper_authors.deleteMany({ where: { paperId: id } })
    await tx.paper_submissions.deleteMany({ where: { paperId: id } })
    if (claimIds.length > 0) {
      await tx.content_review_cases.deleteMany({
        where: { content_type: 'paper', subjectId: { in: claimIds } },
      })
    }
    await tx.paper_claims.deleteMany({ where: { paperId: id } })
    await tx.$executeRawUnsafe('DELETE FROM embeddings WHERE "paperId" = $1', id)
    await tx.papers.delete({ where: { id } })
  })

  return { message: 'Paper deleted' }
}
