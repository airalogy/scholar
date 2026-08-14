import type { FastifyInstance } from 'fastify'
import { Prisma } from '../../../prisma/generated/client'
import type { SearchQuery } from './schema'
import type { ClaimRecord } from './service.shared'
import { tokenizeText } from '../../utils/document'
import { embedTexts } from '../../ai/embeddings'
import { formatPapers } from './service.paper'

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
  const queryText = tokenizeText(q)
    .filter((token) => token.trim())
    .join(' ')
  const results: { paperId: string; text: string; score: number }[] =
    await fastify.prisma.$queryRawUnsafe(
      `WITH ranked AS (
         SELECT e."paperId", e.text,
                ts_rank(e.tsv, websearch_to_tsquery('simple', $1)) AS score,
                row_number() OVER (
                  PARTITION BY e."paperId"
                  ORDER BY ts_rank(e.tsv, websearch_to_tsquery('simple', $1)) DESC
                ) AS row_number
         FROM embeddings e
         WHERE e.tsv @@ websearch_to_tsquery('simple', $1)
           AND EXISTS (
             SELECT 1
             FROM paper_claims claim
             JOIN content_review_cases review_case ON review_case.id = claim."reviewCaseId"
             WHERE claim."paperId" = e."paperId"
               AND review_case.status = 'approved'
           )
       )
       SELECT "paperId", text, score
       FROM ranked
       WHERE row_number = 1
       ORDER BY score DESC, "paperId"
       LIMIT $2 OFFSET $3`,
      queryText,
      limit,
      offset,
    )

  return hydrateSearchResults(fastify, userId, results)
}

async function searchByVector(
  fastify: FastifyInstance,
  userId: string,
  q: string,
  limit: number,
  offset: number,
) {
  const [queryEmbedding] = await embedTexts(fastify, [q])
  const vectorStr = `[${queryEmbedding.join(',')}]`

  const results: { paperId: string; text: string; score: number }[] =
    await fastify.prisma.$queryRawUnsafe(
      `WITH ranked AS (
         SELECT e."paperId", e.text,
                1 - (e.embedding <=> $1::vector) AS score,
                row_number() OVER (
                  PARTITION BY e."paperId"
                  ORDER BY e.embedding <=> $1::vector
                ) AS row_number
         FROM embeddings e
         WHERE e.embedding IS NOT NULL
           AND EXISTS (
             SELECT 1
             FROM paper_claims claim
             JOIN content_review_cases review_case ON review_case.id = claim."reviewCaseId"
             WHERE claim."paperId" = e."paperId"
               AND review_case.status = 'approved'
           )
       )
       SELECT "paperId", text, score
       FROM ranked
       WHERE row_number = 1
       ORDER BY score DESC, "paperId"
       LIMIT $2 OFFSET $3`,
      vectorStr,
      limit,
      offset,
    )

  return hydrateSearchResults(fastify, userId, results)
}

async function hydrateSearchResults(
  fastify: FastifyInstance,
  userId: string,
  results: Array<{ paperId: string; text: string; score: number }>,
) {
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
