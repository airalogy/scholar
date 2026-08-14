import type { FastifyInstance } from 'fastify'
import { Prisma } from '../../../prisma/generated/client'
import type { SubmissionRecord } from './service.shared'
import type { InstitutionUploadsQuery } from './schema'
import { getInstitutionAccessById, getUserPlatformRole } from '../../utils/permissions'
import { resolveInstitutionPaperBoundMembersMap } from '../../utils/institution-paper-bindings'
import {
  createEmptyReviewStatusTotals,
  normalizeReviewStatus,
  normalizeSearchText,
  toClaimRecord,
} from './service.shared'
import { formatPapers } from './service.paper'

const escapeLikePattern = (value: string): string => {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')
}

const buildInstitutionUploadsQuery = (query: InstitutionUploadsQuery) => {
  const filters: Prisma.Sql[] = [Prisma.sql`ps."institutionId" = ${query.institution_id}`]
  const keyword = normalizeSearchText(query.q)

  if (query.lab_id) {
    filters.push(Prisma.sql`ps."labId" = ${query.lab_id}`)
  }

  if (query.review_status) {
    filters.push(Prisma.sql`COALESCE(crc.status, 'draft') = ${query.review_status}`)
  }

  if (keyword) {
    const keywordLike = `%${escapeLikePattern(keyword)}%`
    filters.push(Prisma.sql`
      (
        LOWER(p.title) LIKE ${keywordLike} ESCAPE '\'
        OR LOWER(COALESCE(p.abstract, '')) LIKE ${keywordLike} ESCAPE '\'
        OR LOWER(p.doi) LIKE ${keywordLike} ESCAPE '\'
        OR LOWER(COALESCE(p.journal_name, '')) LIKE ${keywordLike} ESCAPE '\'
      )
    `)
  }

  const whereSql = Prisma.sql`WHERE ${Prisma.join(filters, ' AND ')}`

  return Prisma.sql`
    WITH filtered_submissions AS (
      SELECT
        ps.id,
        ps."paperId",
        ps."claimId",
        ps."userId",
        ps."institutionId",
        ps."labId",
        ps.oss_file_id,
        ps.metadata_snapshot,
        ps.notes,
        ps."createdAt",
        ps."updatedAt",
        COALESCE(crc.status, 'draft') AS "effectiveReviewStatus"
      FROM paper_submissions ps
      JOIN papers p ON p.id = ps."paperId"
      LEFT JOIN paper_claims pc ON pc.id = ps."claimId"
      LEFT JOIN content_review_cases crc ON crc.id = pc."reviewCaseId"
      ${whereSql}
    )
  `
}

export async function listInstitutionUploads(
  fastify: FastifyInstance,
  userId: string,
  query: InstitutionUploadsQuery,
) {
  const limit = query.limit ?? 20
  const offset = query.offset ?? 0

  const institution = await fastify.prisma.institutions.findUnique({
    where: { id: query.institution_id },
    select: { id: true },
  })
  if (!institution) {
    throw fastify.httpErrors.notFound('Institution not found')
  }

  const platformRole = await getUserPlatformRole(fastify, userId)
  if (platformRole !== 'platform_admin') {
    const access = await getInstitutionAccessById(fastify, userId, institution.id)
    if (!access.can_review_content) {
      throw fastify.httpErrors.forbidden('You do not have permission to browse institution uploads')
    }
  }

  if (query.lab_id) {
    const lab = await fastify.prisma.labs.findUnique({
      where: { id: query.lab_id },
      select: { institutionId: true },
    })

    if (!lab) {
      throw fastify.httpErrors.notFound('Lab not found')
    }

    if (lab.institutionId !== institution.id) {
      throw fastify.httpErrors.badRequest(
        'The selected lab does not belong to the selected institution',
      )
    }
  }

  const cteSql = buildInstitutionUploadsQuery(query)
  const [totalRows, statusRows, pageRows] = await Promise.all([
    fastify.prisma.$queryRaw<Array<{ total: bigint | number }>>(Prisma.sql`
      ${cteSql}
      SELECT COUNT(*) AS total
      FROM filtered_submissions fs
    `),
    fastify.prisma.$queryRaw<Array<{ review_status: string; count: bigint | number }>>(Prisma.sql`
      ${cteSql}
      SELECT fs."effectiveReviewStatus" AS review_status, COUNT(*) AS count
      FROM filtered_submissions fs
      GROUP BY fs."effectiveReviewStatus"
    `),
    fastify.prisma.$queryRaw<SubmissionRecord[]>(Prisma.sql`
      ${cteSql}
      SELECT
        fs.id,
        fs."paperId",
        fs."claimId",
        fs."userId",
        fs."institutionId",
        fs."labId",
        fs.oss_file_id,
        fs.metadata_snapshot,
        fs.notes,
        fs."createdAt",
        fs."updatedAt"
      FROM filtered_submissions fs
      ORDER BY fs."createdAt" DESC, fs."updatedAt" DESC
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

  const paperIds = [...new Set(pageRows.map((submission) => submission.paperId))]
  const claimIds = pageRows
    .map((submission) => submission.claimId)
    .filter((value): value is string => Boolean(value))

  const [papers, claims, boundMembersMap] = await Promise.all([
    paperIds.length > 0
      ? fastify.prisma.papers.findMany({
          where: { id: { in: paperIds } },
        })
      : Promise.resolve([]),
    claimIds.length > 0
      ? fastify.prisma.paper_claims.findMany({
          where: { id: { in: claimIds } },
          include: { review_case: true },
        })
      : Promise.resolve([]),
    paperIds.length > 0
      ? resolveInstitutionPaperBoundMembersMap(fastify, institution.id, paperIds)
      : Promise.resolve(new Map()),
  ])

  const paperMap = new Map(papers.map((paper) => [paper.id, paper]))
  const claimMap = new Map(claims.map((claim) => [claim.id, toClaimRecord(claim)]))
  const items = await formatPapers(
    fastify,
    pageRows
      .map((submission) => {
        const paper = paperMap.get(submission.paperId)
        if (!paper) {
          return null
        }

        return {
          paper,
          claim: submission.claimId ? (claimMap.get(submission.claimId) ?? null) : null,
          submission,
          boundMembers: boundMembersMap.get(submission.paperId) ?? [],
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
