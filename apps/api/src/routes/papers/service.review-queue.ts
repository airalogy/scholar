import type { FastifyInstance } from 'fastify'
import { Prisma } from '../../../prisma/generated/client'
import type { ClaimRecord } from './service.shared'
import type { ReviewQueueQuery } from './schema'
import { getReviewScope } from '../../utils/permissions'
import {
  createEmptyReviewStatusTotals,
  normalizeReviewStatus,
  normalizeSearchText,
} from './service.shared'
import { formatPapers } from './service.paper'

const escapeLikePattern = (value: string): string => {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')
}

const buildReviewQueueQuery = async (
  fastify: FastifyInstance,
  userId: string,
  query: ReviewQueueQuery,
) => {
  const reviewScope = await getReviewScope(fastify, userId)
  const filters: Prisma.Sql[] = []
  const keyword = normalizeSearchText(query.q)

  if (reviewScope.platformRole !== 'platform_admin') {
    const scopeFilters: Prisma.Sql[] = []
    const broadScopeFilters: Prisma.Sql[] = []
    const hasBroadScope = reviewScope.institutionIds.length > 0 || reviewScope.labIds.length > 0
    const workflowEligibilitySql = Prisma.sql`
      EXISTS (
        SELECT 1
        FROM content_review_cases review_case
        JOIN content_review_step_instances review_step
          ON review_step."caseId" = review_case.id
        WHERE review_case.content_type = 'paper'
          AND review_case."subjectId" = pc.id
          AND review_case.status = 'pending_review'
          AND review_step.status = 'pending'
          AND ${userId}::uuid = ANY(review_step.eligible_reviewer_user_ids)
      )
    `

    if (!hasBroadScope) {
      const workflowRows = await fastify.prisma.$queryRaw<Array<{ claimId: string }>>(Prisma.sql`
        SELECT DISTINCT review_case."subjectId" AS "claimId"
        FROM content_review_cases review_case
        JOIN content_review_step_instances review_step
          ON review_step."caseId" = review_case.id
        WHERE review_case.content_type = 'paper'
          AND review_case.status = 'pending_review'
          AND review_step.status = 'pending'
          AND ${userId}::uuid = ANY(review_step.eligible_reviewer_user_ids)
        LIMIT 1
      `)

      if (workflowRows.length === 0) {
        throw fastify.httpErrors.forbidden('You do not have permission to review papers')
      }
    }

    if (reviewScope.institutionIds.length > 0) {
      broadScopeFilters.push(
        Prisma.sql`pc."institutionId" IN (${Prisma.join(reviewScope.institutionIds)})`,
      )
    }

    if (reviewScope.labIds.length > 0) {
      broadScopeFilters.push(Prisma.sql`pc."labId" IN (${Prisma.join(reviewScope.labIds)})`)
    }

    if (broadScopeFilters.length > 0) {
      scopeFilters.push(Prisma.sql`
        NOT EXISTS (
          SELECT 1
          FROM content_review_step_instances assigned_step
          WHERE assigned_step."caseId" = pc."reviewCaseId"
            AND assigned_step.status = 'pending'
        )
        AND (${Prisma.join(broadScopeFilters, ' OR ')})
      `)
    }

    scopeFilters.push(workflowEligibilitySql)

    filters.push(Prisma.sql`(${Prisma.join(scopeFilters, ' OR ')})`)
  }

  if (query.reviewStatus) {
    filters.push(Prisma.sql`review_case.status = ${query.reviewStatus}`)
  }

  if (keyword) {
    const keywordLike = `%${escapeLikePattern(keyword)}%`
    filters.push(Prisma.sql`
      (
        LOWER(p.title) LIKE ${keywordLike} ESCAPE '\'
        OR LOWER(COALESCE(p.abstract, '')) LIKE ${keywordLike} ESCAPE '\'
        OR LOWER(p.doi) LIKE ${keywordLike} ESCAPE '\'
      )
    `)
  }

  const whereSql =
    filters.length > 0 ? Prisma.sql`WHERE ${Prisma.join(filters, ' AND ')}` : Prisma.empty

  return Prisma.sql`
    WITH filtered_claims AS (
      SELECT
        pc.id,
        pc."paperId",
        pc."institutionId",
        pc."labId",
        pc."reviewNodeId",
        review_case."workflowId" AS "reviewWorkflowId",
        review_case."currentStep" AS "currentReviewStep",
        pc."reviewCaseId",
        pc."submittedBy",
        pc."submissionId",
        review_case.status AS review_status,
        review_case.decision_notes AS review_notes,
        review_case."decidedBy" AS "reviewedBy",
        review_case."decidedAt" AS "reviewedAt",
        pc."createdAt",
        pc."updatedAt"
      FROM paper_claims pc
      JOIN content_review_cases review_case ON review_case.id = pc."reviewCaseId"
      JOIN papers p ON p.id = pc."paperId"
      ${whereSql}
    )
  `
}

export async function listReviewQueue(
  fastify: FastifyInstance,
  userId: string,
  query: ReviewQueueQuery,
) {
  const limit = query.limit ?? 20
  const offset = query.offset ?? 0
  const cteSql = await buildReviewQueueQuery(fastify, userId, query)

  const [totalRows, statusRows, claims] = await Promise.all([
    fastify.prisma.$queryRaw<Array<{ total: bigint | number }>>(Prisma.sql`
      ${cteSql}
      SELECT COUNT(*) AS total
      FROM filtered_claims fc
    `),
    fastify.prisma.$queryRaw<Array<{ review_status: string; count: bigint | number }>>(Prisma.sql`
      ${cteSql}
      SELECT fc.review_status, COUNT(*) AS count
      FROM filtered_claims fc
      GROUP BY fc.review_status
    `),
    fastify.prisma.$queryRaw<ClaimRecord[]>(Prisma.sql`
      ${cteSql}
      SELECT
        fc.id,
        fc."paperId",
        fc."institutionId",
        fc."labId",
        fc."reviewNodeId",
        fc."reviewWorkflowId",
        fc."currentReviewStep",
        fc."reviewCaseId",
        fc."submittedBy",
        fc."submissionId",
        fc.review_status,
        fc.review_notes,
        fc."reviewedBy",
        fc."reviewedAt",
        fc."createdAt",
        fc."updatedAt"
      FROM filtered_claims fc
      ORDER BY fc."updatedAt" DESC, fc."createdAt" DESC
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

  const paperIds = [...new Set(claims.map((claim) => claim.paperId))]
  const submissionIds = claims
    .map((claim) => claim.submissionId)
    .filter((value): value is string => Boolean(value))
  const [papers, submissions] = await Promise.all([
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
  ])

  const paperMap = new Map(papers.map((paper) => [paper.id, paper]))
  const submissionMap = new Map(submissions.map((submission) => [submission.id, submission]))
  const items = await formatPapers(
    fastify,
    claims
      .map((claim) => {
        const paper = paperMap.get(claim.paperId)
        if (!paper) {
          return null
        }

        return {
          paper,
          claim,
          submission: claim.submissionId ? (submissionMap.get(claim.submissionId) ?? null) : null,
        }
      })
      .filter((item) => item !== null),
    userId,
  )

  return {
    items,
    total,
    statusTotals,
  }
}
