import type { FastifyInstance } from 'fastify'
import { Prisma } from '../../../prisma/generated/client'
import type { SearchQuery } from './schema'
import type { ClaimRecord } from './service.shared'
import { formatPapers } from './service.paper'
import { getConfiguredInstitution } from '../../utils/institution-scope'
import {
  searchPaperSegmentsByBm25,
  searchPaperSegmentsByVector,
} from '../../search/paper-retrieval'

export async function searchPapers(fastify: FastifyInstance, userId: string, query: SearchQuery) {
  const limit = query.limit ?? 20
  const offset = query.offset ?? 0
  const mode = query.mode ?? 'fulltext'
  const keyword = query.q.trim()
  if (!keyword) {
    throw fastify.httpErrors.badRequest('Search query must not be empty')
  }

  if (mode === 'vector') {
    return searchByVector(fastify, userId, keyword, limit, offset)
  }
  return searchByFulltext(fastify, userId, keyword, limit, offset)
}

async function searchByFulltext(
  fastify: FastifyInstance,
  userId: string,
  q: string,
  limit: number,
  offset: number,
) {
  const institution = await getConfiguredInstitution(fastify)
  const results = await searchPaperSegmentsByBm25(fastify, q, {
    institutionId: institution.id,
    limit,
    offset,
    distinctPapers: true,
  })

  return hydrateSearchResults(fastify, userId, results)
}

async function searchByVector(
  fastify: FastifyInstance,
  userId: string,
  q: string,
  limit: number,
  offset: number,
) {
  const institution = await getConfiguredInstitution(fastify)
  const results = await searchPaperSegmentsByVector(fastify, q, {
    institutionId: institution.id,
    limit,
    offset,
    distinctPapers: true,
  })

  return hydrateSearchResults(fastify, userId, results)
}

async function hydrateSearchResults(
  fastify: FastifyInstance,
  userId: string,
  results: Array<{ paperId: string; text: string; score: number }>,
) {
  const institution = await getConfiguredInstitution(fastify)
  const paperIds = [...new Set(results.map((result) => result.paperId))]
  const approvedClaims =
    paperIds.length > 0
      ? await fastify.prisma.$queryRaw<ClaimRecord[]>(Prisma.sql`
        SELECT DISTINCT ON (pc."paperId")
          pc.id,
          pc."paperId",
          pc."institutionId",
          pc."labId",
          pc."reviewNodeId",
          crc."workflowId" AS "reviewWorkflowId",
          crc."currentStep" AS "currentReviewStep",
          pc."submittedBy",
          pc."submissionId",
          crc.status AS review_status,
          crc.decision_notes AS review_notes,
          crc."decidedBy" AS "reviewedBy",
          crc."decidedAt" AS "reviewedAt",
          pc."createdAt",
          pc."updatedAt"
        FROM paper_claims pc
        JOIN content_review_cases crc ON crc.id = pc."reviewCaseId"
        WHERE pc."paperId" IN (${Prisma.join(paperIds)})
          AND pc."institutionId" = ${institution.id}
          AND crc.status = 'approved'
        ORDER BY pc."paperId", crc."decidedAt" DESC, pc."updatedAt" DESC, pc."createdAt" DESC
      `)
      : []

  const claimMap = new Map<string, ClaimRecord>()
  for (const claim of approvedClaims) {
    claimMap.set(claim.paperId, claim)
  }

  const publicPaperIds = [...claimMap.keys()]
  const submissionIds = approvedClaims
    .map((claim) => claim.submissionId)
    .filter((value): value is string => Boolean(value))
  const [papers, submissions] = await Promise.all([
    publicPaperIds.length > 0
      ? fastify.prisma.papers.findMany({
          where: { id: { in: publicPaperIds } },
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
  const visibleResults = results.filter(
    (result) => claimMap.has(result.paperId) && paperMap.has(result.paperId),
  )
  const formattedPapers = await formatPapers(
    fastify,
    visibleResults.map((result) => {
      const claim = claimMap.get(result.paperId)!
      const paper = paperMap.get(result.paperId)!

      return {
        paper,
        claim,
        submission: claim.submissionId ? (submissionMap.get(claim.submissionId) ?? null) : null,
      }
    }),
    userId,
  )

  return {
    items: visibleResults.map((result, index) => ({
      paperId: result.paperId,
      text: result.text,
      score: Number(result.score),
      paper: formattedPapers[index],
    })),
  }
}
