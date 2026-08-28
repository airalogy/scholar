import type { FastifyInstance } from 'fastify'
import { embedTexts } from '../ai/embeddings'
import { normalizeSearchTerms } from '../utils/document'

export interface PaperRetrievalResult {
  paperId: string
  segmentIndex: number
  text: string
  score: number
}

interface RetrievalOptions {
  institutionId: string
  limit: number
  offset?: number
  paperId?: string
  distinctPapers?: boolean
}

const normalizeResults = (results: PaperRetrievalResult[]): PaperRetrievalResult[] => {
  return results.map((result) => ({ ...result, score: Number(result.score) }))
}

export const searchPaperSegmentsByBm25 = async (
  fastify: FastifyInstance,
  query: string,
  options: RetrievalOptions,
): Promise<PaperRetrievalResult[]> => {
  const terms = [...new Set(normalizeSearchTerms(query))].slice(0, 32)
  if (terms.length === 0) {
    return []
  }

  const distinctPapers = options.distinctPapers ?? false
  const selection = distinctPapers
    ? `SELECT "paperId", "segmentIndex", text, score
       FROM (
         SELECT scored.*,
                row_number() OVER (
                  PARTITION BY scored."paperId"
                  ORDER BY scored.score DESC, scored."segmentIndex"
                ) AS paper_rank
         FROM scored
       ) ranked
       WHERE paper_rank = 1`
    : 'SELECT "paperId", "segmentIndex", text, score FROM scored'

  const results = await fastify.prisma.$queryRawUnsafe<PaperRetrievalResult[]>(
    `WITH query_terms AS (
       SELECT value AS term
       FROM jsonb_array_elements_text($1::jsonb)
     ),
     corpus AS (
       SELECT e."paperId", e."segmentIndex", e.text, e."bm25_length", e."bm25_terms"
       FROM embeddings e
       WHERE ($3::uuid IS NULL OR e."paperId" = $3::uuid)
         AND EXISTS (
           SELECT 1
           FROM paper_claims claim
           JOIN content_review_cases review_case ON review_case.id = claim."reviewCaseId"
           WHERE claim."paperId" = e."paperId"
             AND claim."institutionId" = $2::uuid
             AND review_case.status = 'approved'
         )
     ),
     corpus_stats AS (
       SELECT count(*)::double precision AS document_count,
              COALESCE(avg("bm25_length"), 0)::double precision AS average_length
       FROM corpus
     ),
     document_frequencies AS (
       SELECT query_terms.term,
              count(*) FILTER (WHERE corpus."bm25_terms" ? query_terms.term)::double precision
                AS document_frequency
       FROM query_terms
       CROSS JOIN corpus
       GROUP BY query_terms.term
     ),
     scored AS (
       SELECT corpus."paperId", corpus."segmentIndex", corpus.text,
              sum(
                ln(
                  1 + (corpus_stats.document_count - document_frequencies.document_frequency + 0.5)
                    / (document_frequencies.document_frequency + 0.5)
                ) * (
                  COALESCE((corpus."bm25_terms" ->> document_frequencies.term)::double precision, 0)
                    * 2.2
                ) / (
                  COALESCE((corpus."bm25_terms" ->> document_frequencies.term)::double precision, 0)
                    + 1.2 * (
                      0.25 + 0.75 * corpus."bm25_length"
                        / greatest(corpus_stats.average_length, 1)
                    )
                )
              )::double precision AS score
       FROM corpus
       CROSS JOIN corpus_stats
       JOIN document_frequencies ON corpus."bm25_terms" ? document_frequencies.term
       WHERE corpus_stats.document_count > 0
       GROUP BY corpus."paperId", corpus."segmentIndex", corpus.text
     )
     ${selection}
     ORDER BY score DESC, "paperId", "segmentIndex"
     LIMIT $4 OFFSET $5`,
    JSON.stringify(terms),
    options.institutionId,
    options.paperId ?? null,
    options.limit,
    options.offset ?? 0,
  )

  return normalizeResults(results)
}

export const searchPaperSegmentsByVector = async (
  fastify: FastifyInstance,
  query: string,
  options: RetrievalOptions,
): Promise<PaperRetrievalResult[]> => {
  const [queryEmbedding] = await embedTexts(fastify, [query])
  const vector = `[${queryEmbedding.join(',')}]`
  const distinctPapers = options.distinctPapers ?? false
  const partition = distinctPapers ? 'PARTITION BY e."paperId"' : ''

  const results = await fastify.prisma.$queryRawUnsafe<PaperRetrievalResult[]>(
    `WITH ranked AS (
       SELECT e."paperId", e."segmentIndex", e.text,
              1 - (e.embedding <=> $1::vector) AS score,
              row_number() OVER (
                ${partition}
                ORDER BY e.embedding <=> $1::vector, e."paperId", e."segmentIndex"
              ) AS retrieval_rank
       FROM embeddings e
       WHERE e.embedding IS NOT NULL
         AND ($3::uuid IS NULL OR e."paperId" = $3::uuid)
         AND EXISTS (
           SELECT 1
           FROM paper_claims claim
           JOIN content_review_cases review_case ON review_case.id = claim."reviewCaseId"
           WHERE claim."paperId" = e."paperId"
             AND claim."institutionId" = $2::uuid
             AND review_case.status = 'approved'
         )
     )
     SELECT "paperId", "segmentIndex", text, score
     FROM ranked
     WHERE ${distinctPapers ? 'retrieval_rank = 1' : 'TRUE'}
     ORDER BY score DESC, "paperId", "segmentIndex"
     LIMIT $4 OFFSET $5`,
    vector,
    options.institutionId,
    options.paperId ?? null,
    options.limit,
    options.offset ?? 0,
  )

  return normalizeResults(results)
}

export const reciprocalRankFuse = (
  rankings: PaperRetrievalResult[][],
  keyOf: (result: PaperRetrievalResult) => string,
  limit: number,
  rankConstant = 60,
): PaperRetrievalResult[] => {
  const fused = new Map<string, PaperRetrievalResult>()

  for (const ranking of rankings) {
    ranking.forEach((result, index) => {
      const key = keyOf(result)
      const score = 1 / (rankConstant + index + 1)
      const existing = fused.get(key)
      fused.set(key, {
        ...(existing ?? result),
        score: (existing?.score ?? 0) + score,
      })
    })
  }

  return [...fused.entries()]
    .sort(([leftKey, left], [rightKey, right]) => {
      return right.score - left.score || leftKey.localeCompare(rightKey)
    })
    .slice(0, limit)
    .map(([, result]) => result)
}
