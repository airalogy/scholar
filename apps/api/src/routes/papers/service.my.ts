import type { FastifyInstance } from 'fastify'
import type { SubmissionRecord } from './service.shared'
import type { MyPapersQuery } from './schema'
import {
  createEmptyReviewStatusTotals,
  normalizeReviewStatus,
  toClaimRecord,
} from './service.shared'
import { formatPapers } from './service.paper'

async function countSubmissionStatusTotals(fastify: FastifyInstance, userId: string) {
  const totals = createEmptyReviewStatusTotals()
  const rows = await fastify.prisma.$queryRaw<
    Array<{
      review_status: string | null
      count: bigint | number
    }>
  >`
    SELECT COALESCE(crc.status, 'draft') AS review_status, COUNT(*) AS count
    FROM paper_submissions ps
    LEFT JOIN paper_claims pc ON pc.id = ps."claimId"
    LEFT JOIN content_review_cases crc ON crc.id = pc."reviewCaseId"
    WHERE ps."userId" = ${userId}
    GROUP BY COALESCE(crc.status, 'draft')
  `

  for (const row of rows) {
    const status = normalizeReviewStatus(row.review_status)
    totals[status] = Number(row.count)
  }

  return totals
}

export async function listMyPapers(fastify: FastifyInstance, userId: string, query: MyPapersQuery) {
  const limit = query.limit ?? 20
  const offset = query.offset ?? 0

  const where = { userId }
  const [submissions, total, statusTotals] = await Promise.all([
    fastify.prisma.paper_submissions.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
    }),
    fastify.prisma.paper_submissions.count({ where }),
    countSubmissionStatusTotals(fastify, userId),
  ])

  const paperIds = [...new Set(submissions.map((submission) => submission.paperId))]
  const claimIds = submissions
    .map((submission) => submission.claimId)
    .filter((value): value is string => Boolean(value))
  const [papers, claims] = await Promise.all([
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
  ])

  const paperMap = new Map(papers.map((paper) => [paper.id, paper]))
  const claimMap = new Map(claims.map((claim) => [claim.id, toClaimRecord(claim)]))
  const formattedItems = await formatPapers(
    fastify,
    submissions
      .map((submission) => {
        const paper = paperMap.get(submission.paperId)
        if (!paper) {
          return null
        }

        return {
          paper,
          claim: submission.claimId ? (claimMap.get(submission.claimId) ?? null) : null,
          submission: submission as SubmissionRecord,
        }
      })
      .filter((item) => item !== null),
    userId,
  )

  return {
    items: formattedItems,
    total,
    statusTotals,
  }
}
