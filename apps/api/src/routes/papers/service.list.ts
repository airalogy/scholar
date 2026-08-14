import type { FastifyInstance } from 'fastify'
import { Prisma } from '../../../prisma/generated/client'
import type { ClaimRecord, ResolvedPaperListScope } from './service.shared'
import type { ListQuery } from './schema'
import { getInstitutionAccessById, getUserPlatformRole } from '../../utils/permissions'
import { resolveInstitutionPaperBoundMembersMap } from '../../utils/institution-paper-bindings'
import {
  createEmptyReviewStatusTotals,
  normalizePaperBrowseScope,
  normalizePaperListSort,
  normalizeReviewStatus,
  normalizeSearchText,
} from './service.shared'
import { formatPapers } from './service.paper'

const resolvePaperListScope = async (
  fastify: FastifyInstance,
  userId: string,
  query: ListQuery,
): Promise<ResolvedPaperListScope> => {
  const scope = normalizePaperBrowseScope(query.scope)
  let institutionId = query.institution_id ?? null
  let labId = query.lab_id ?? null
  let labInstitutionId: string | null = null
  let institutionAccess: Awaited<ReturnType<typeof getInstitutionAccessById>> | null = null
  let platformRole: Awaited<ReturnType<typeof getUserPlatformRole>> | null = null

  const resolvePlatformRole = async () => {
    if (!platformRole) {
      platformRole = await getUserPlatformRole(fastify, userId)
    }

    return platformRole
  }

  if (labId) {
    const lab = await fastify.prisma.labs.findUnique({
      where: { id: labId },
      select: { institutionId: true },
    })

    if (!lab) {
      throw fastify.httpErrors.notFound('Lab not found')
    }

    labInstitutionId = lab.institutionId ?? null
    if (institutionId && labInstitutionId && institutionId !== labInstitutionId) {
      throw fastify.httpErrors.badRequest(
        'The selected lab does not belong to the selected institution',
      )
    }
  }

  if (!institutionId && labInstitutionId) {
    institutionId = labInstitutionId
  }

  if (institutionId) {
    const institution = await fastify.prisma.institutions.findUnique({
      where: { id: institutionId },
      select: { id: true },
    })

    if (!institution) {
      throw fastify.httpErrors.notFound('Institution not found')
    }
  }

  if (institutionId) {
    const currentPlatformRole = await resolvePlatformRole()
    if (currentPlatformRole !== 'platform_admin') {
      institutionAccess = await getInstitutionAccessById(fastify, userId, institutionId)
      if (institutionAccess.institution_role === null) {
        throw fastify.httpErrors.forbidden(
          'You do not have permission to browse this institution library',
        )
      }
    }
  }

  if (scope === 'institution') {
    if (!institutionId) {
      throw fastify.httpErrors.badRequest(
        'Institution scope requires institution_id or a lab belonging to an institution',
      )
    }

    const currentPlatformRole = await resolvePlatformRole()
    if (currentPlatformRole !== 'platform_admin') {
      const access =
        institutionAccess ?? (await getInstitutionAccessById(fastify, userId, institutionId))
      if (!access.can_review_content) {
        throw fastify.httpErrors.forbidden(
          'You do not have permission to browse institution-private papers',
        )
      }
    }
  }

  return {
    scope,
    institutionId,
    labId,
  }
}

const escapeLikePattern = (value: string): string => {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')
}

const buildLatestClaimOrderSql = (): Prisma.Sql => {
  return Prisma.sql`
    fc."paperId",
    fc."reviewedAt" DESC,
    fc."updatedAt" DESC,
    fc."createdAt" DESC
  `
}

const buildListQueryContext = (
  fastify: FastifyInstance,
  scope: ResolvedPaperListScope,
  query: ListQuery,
) => {
  const keyword = normalizeSearchText(query.q)
  const normalizedCollege = normalizeSearchText(query.college)
  const sort = normalizePaperListSort(query.sort ?? (keyword ? 'relevance' : 'latest'))
  const claimFilters: Prisma.Sql[] = []
  const selectedFilters: Prisma.Sql[] = []
  const exposeInstitutionContext = Boolean(scope.institutionId || scope.labId)

  if (scope.scope === 'public') {
    if (query.review_status) {
      throw fastify.httpErrors.badRequest(
        'review_status filter is only available for institution scope',
      )
    }

    claimFilters.push(Prisma.sql`crc.status = 'approved'`)
  } else if (query.review_status) {
    claimFilters.push(Prisma.sql`crc.status = ${query.review_status}`)
  } else {
    claimFilters.push(
      Prisma.sql`crc.status IN ('draft', 'pending_review', 'changes_requested', 'approved', 'archived')`,
    )
  }

  if (scope.institutionId) {
    claimFilters.push(Prisma.sql`pc."institutionId" = ${scope.institutionId}`)
  }

  if (scope.labId) {
    claimFilters.push(Prisma.sql`pc."labId" = ${scope.labId}`)
  }

  if (query.year_from !== undefined) {
    selectedFilters.push(Prisma.sql`p.publish_year >= ${query.year_from}`)
  }

  if (query.year_to !== undefined) {
    selectedFilters.push(Prisma.sql`p.publish_year <= ${query.year_to}`)
  }

  if (query.paper_type !== undefined) {
    selectedFilters.push(Prisma.sql`p.paper_type = ${query.paper_type}`)
  }

  if (query.language !== undefined) {
    selectedFilters.push(Prisma.sql`p.language = ${query.language}`)
  }

  if (query.author_id) {
    selectedFilters.push(Prisma.sql`
      EXISTS (
        SELECT 1
        FROM paper_authors pa
        WHERE pa."paperId" = sc."paperId" AND pa."authorId" = ${query.author_id}
      )
    `)
  }

  if (query.scholar_id) {
    selectedFilters.push(Prisma.sql`
      EXISTS (
        SELECT 1
        FROM scholar_papers pp
        WHERE pp."paperId" = sc."paperId" AND pp."scholarId" = ${query.scholar_id}
      )
    `)
  }

  if (normalizedCollege) {
    const collegeLike = `%${escapeLikePattern(normalizedCollege)}%`
    selectedFilters.push(Prisma.sql`
      (
        EXISTS (
          SELECT 1
          FROM filtered_claims fc2
          JOIN labs ll ON ll.id = fc2."labId"
          WHERE fc2."paperId" = sc."paperId"
            AND LOWER(COALESCE(ll.college, '')) LIKE ${collegeLike} ESCAPE '\'
        )
        OR EXISTS (
          SELECT 1
          FROM scholar_papers pp2
          JOIN scholars s ON s.id = pp2."scholarId"
          JOIN LATERAL unnest(COALESCE(s.college, ARRAY[]::text[])) AS scholar_college ON TRUE
          WHERE pp2."paperId" = sc."paperId"
            AND LOWER(scholar_college) LIKE ${collegeLike} ESCAPE '\'
        )
      )
    `)
  }

  let relevanceSql = Prisma.sql`0`
  if (keyword) {
    const keywordLike = `%${escapeLikePattern(keyword)}%`
    const keywordPrefix = `${escapeLikePattern(keyword)}%`
    selectedFilters.push(Prisma.sql`
      (
        LOWER(p.title) LIKE ${keywordLike} ESCAPE '\'
        OR LOWER(COALESCE(p.abstract, '')) LIKE ${keywordLike} ESCAPE '\'
        OR LOWER(p.doi) LIKE ${keywordLike} ESCAPE '\'
        OR LOWER(COALESCE(p.journal_name, '')) LIKE ${keywordLike} ESCAPE '\'
        ${
          exposeInstitutionContext
            ? Prisma.sql`
            OR LOWER(COALESCE(i.name, '')) LIKE ${keywordLike} ESCAPE '\'
            OR LOWER(COALESCE(l.name, '')) LIKE ${keywordLike} ESCAPE '\'
          `
            : Prisma.empty
        }
        OR EXISTS (
          SELECT 1
          FROM unnest(p.keywords) AS keyword_item
          WHERE LOWER(keyword_item) LIKE ${keywordLike} ESCAPE '\'
        )
        OR EXISTS (
          SELECT 1
          FROM paper_authors pa
          JOIN authors a ON a.id = pa."authorId"
          WHERE pa."paperId" = sc."paperId"
            AND LOWER(a.name) LIKE ${keywordLike} ESCAPE '\'
        )
      )
    `)

    relevanceSql = Prisma.sql`
      (
        CASE WHEN LOWER(p.title) = ${keyword} THEN 200 ELSE 0 END
        + CASE WHEN LOWER(p.title) LIKE ${keywordPrefix} ESCAPE '\' THEN 120 ELSE 0 END
        + CASE WHEN LOWER(p.title) LIKE ${keywordLike} ESCAPE '\' THEN 80 ELSE 0 END
        + CASE WHEN LOWER(p.doi) = ${keyword} THEN 160 ELSE 0 END
        + CASE WHEN LOWER(p.doi) LIKE ${keywordLike} ESCAPE '\' THEN 120 ELSE 0 END
        + CASE WHEN EXISTS (
          SELECT 1
          FROM paper_authors pa
          JOIN authors a ON a.id = pa."authorId"
          WHERE pa."paperId" = sc."paperId"
            AND LOWER(a.name) = ${keyword}
        ) THEN 100 ELSE 0 END
        + CASE WHEN EXISTS (
          SELECT 1
          FROM paper_authors pa
          JOIN authors a ON a.id = pa."authorId"
          WHERE pa."paperId" = sc."paperId"
            AND LOWER(a.name) LIKE ${keywordLike} ESCAPE '\'
        ) THEN 70 ELSE 0 END
        + CASE WHEN LOWER(COALESCE(p.journal_name, '')) LIKE ${keywordLike} ESCAPE '\' THEN 40 ELSE 0 END
        + CASE WHEN LOWER(COALESCE(p.abstract, '')) LIKE ${keywordLike} ESCAPE '\' THEN 30 ELSE 0 END
        ${
          exposeInstitutionContext
            ? Prisma.sql`
            + CASE WHEN LOWER(COALESCE(i.name, '')) LIKE ${keywordLike} ESCAPE '\' THEN 24 ELSE 0 END
            + CASE WHEN LOWER(COALESCE(l.name, '')) LIKE ${keywordLike} ESCAPE '\' THEN 24 ELSE 0 END
          `
            : Prisma.empty
        }
        + CASE WHEN EXISTS (
          SELECT 1
          FROM unnest(p.keywords) AS keyword_item
          WHERE LOWER(keyword_item) LIKE ${keywordLike} ESCAPE '\'
        ) THEN 20 ELSE 0 END
        + LEAST(COALESCE(p.citation_count, 0), 500) / 50.0
      )
    `
  }

  const claimWhereSql =
    claimFilters.length > 0 ? Prisma.sql`WHERE ${Prisma.join(claimFilters, ' AND ')}` : Prisma.empty
  const selectedWhereSql =
    selectedFilters.length > 0
      ? Prisma.sql`WHERE ${Prisma.join(selectedFilters, ' AND ')}`
      : Prisma.empty

  const orderBySql =
    sort === 'citations'
      ? Prisma.sql`
      sr."citationCount" DESC,
      sr.publish_year DESC,
      sr."sortTimestamp" DESC
    `
      : sort === 'relevance'
        ? Prisma.sql`
        sr."relevanceScore" DESC,
        sr."sortTimestamp" DESC
      `
        : Prisma.sql`sr."sortTimestamp" DESC`

  const cteSql = Prisma.sql`
    WITH filtered_claims AS (
      SELECT
        pc.*,
        crc."workflowId" AS "reviewWorkflowId",
        crc."currentStep" AS "currentReviewStep",
        crc.status AS review_status,
        crc.decision_notes AS review_notes,
        crc."decidedBy" AS "reviewedBy",
        crc."decidedAt" AS "reviewedAt"
      FROM paper_claims pc
      JOIN content_review_cases crc ON crc.id = pc."reviewCaseId"
      ${claimWhereSql}
    ),
    selected_claims AS (
      SELECT DISTINCT ON (fc."paperId")
        fc.id,
        fc."paperId",
        fc."institutionId",
        fc."labId",
        fc."reviewNodeId",
        fc."reviewWorkflowId",
        fc."currentReviewStep",
        fc."submittedBy",
        fc."submissionId",
        fc.review_status,
        fc.review_notes,
        fc."reviewedBy",
        fc."reviewedAt",
        fc."createdAt",
        fc."updatedAt"
      FROM filtered_claims fc
      ORDER BY ${buildLatestClaimOrderSql()}
    ),
    selected_rows AS (
      SELECT
        sc.id,
        sc."paperId",
        sc."institutionId",
        sc."labId",
        sc."reviewNodeId",
        sc."reviewWorkflowId",
        sc."currentReviewStep",
        sc."submittedBy",
        sc."submissionId",
        sc.review_status,
        sc.review_notes,
        sc."reviewedBy",
        sc."reviewedAt",
        sc."createdAt",
        sc."updatedAt",
        p.publish_year,
        p.paper_type,
        p.language,
        COALESCE(p.citation_count, 0) AS "citationCount",
        COALESCE(sc."reviewedAt", sc."updatedAt", sc."createdAt") AS "sortTimestamp",
        ${relevanceSql} AS "relevanceScore"
      FROM selected_claims sc
      JOIN papers p ON p.id = sc."paperId"
      LEFT JOIN institutions i ON i.id = sc."institutionId"
      LEFT JOIN labs l ON l.id = sc."labId"
      ${selectedWhereSql}
    )
  `

  return {
    cteSql,
    orderBySql,
  }
}

export async function listPapers(fastify: FastifyInstance, userId: string, query: ListQuery) {
  const limit = query.limit ?? 20
  const offset = query.offset ?? 0

  const resolvedScope = await resolvePaperListScope(fastify, userId, query)
  const { cteSql, orderBySql } = buildListQueryContext(fastify, resolvedScope, query)

  const [totalRows, statusRows, pageClaims] = await Promise.all([
    fastify.prisma.$queryRaw<Array<{ total: bigint | number }>>(Prisma.sql`
      ${cteSql}
      SELECT COUNT(*) AS total
      FROM selected_rows sr
    `),
    fastify.prisma.$queryRaw<Array<{ review_status: string; count: bigint | number }>>(Prisma.sql`
      ${cteSql}
      SELECT sr.review_status, COUNT(*) AS count
      FROM selected_rows sr
      GROUP BY sr.review_status
    `),
    fastify.prisma.$queryRaw<ClaimRecord[]>(Prisma.sql`
      ${cteSql}
      SELECT
        sr.id,
        sr."paperId",
        sr."institutionId",
        sr."labId",
        sr."reviewNodeId",
        sr."reviewWorkflowId",
        sr."currentReviewStep",
        sr."submittedBy",
        sr."submissionId",
        sr.review_status,
        sr.review_notes,
        sr."reviewedBy",
        sr."reviewedAt",
        sr."createdAt",
        sr."updatedAt"
      FROM selected_rows sr
      ORDER BY ${orderBySql}
      LIMIT ${limit} OFFSET ${offset}
    `),
  ])

  const total = totalRows.length > 0 ? Number(totalRows[0].total) : 0
  if (total === 0) {
    return {
      items: [],
      total: 0,
      statusTotals: createEmptyReviewStatusTotals(),
    }
  }

  const statusTotals = createEmptyReviewStatusTotals()
  for (const row of statusRows) {
    const status = normalizeReviewStatus(row.review_status)
    statusTotals[status] = Number(row.count)
  }

  const paperIds = [...new Set(pageClaims.map((claim) => claim.paperId))]
  const submissionIds = pageClaims
    .map((claim) => claim.submissionId)
    .filter((value): value is string => Boolean(value))

  const [papers, submissions, boundMembersMap] = await Promise.all([
    paperIds.length > 0
      ? fastify.prisma.papers.findMany({
          where: { id: { in: paperIds } },
        })
      : Promise.resolve([]),
    submissionIds.length > 0
      ? fastify.prisma.paper_submissions.findMany({
          where: { id: { in: submissionIds } },
        })
      : Promise.resolve([]),
    resolvedScope.scope === 'institution' && resolvedScope.institutionId && paperIds.length > 0
      ? resolveInstitutionPaperBoundMembersMap(fastify, resolvedScope.institutionId, paperIds)
      : Promise.resolve(new Map()),
  ])

  const paperMap = new Map(papers.map((paper) => [paper.id, paper]))
  const submissionMap = new Map(submissions.map((submission) => [submission.id, submission]))
  const formattedItems = await formatPapers(
    fastify,
    pageClaims
      .map((claim) => {
        const paper = paperMap.get(claim.paperId)
        if (!paper) {
          return null
        }

        return {
          paper,
          claim,
          submission: claim.submissionId ? (submissionMap.get(claim.submissionId) ?? null) : null,
          boundMembers: boundMembersMap.get(claim.paperId) ?? [],
        }
      })
      .filter((item) => item !== null),
    userId,
  )
  const items =
    resolvedScope.institutionId || resolvedScope.labId
      ? formattedItems
      : formattedItems.map((item) => ({
          ...item,
          institutionId: null,
          institutionName: null,
          labId: null,
          labName: null,
        }))

  return {
    items,
    total,
    statusTotals,
  }
}
