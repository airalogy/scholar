import type { FastifyInstance } from 'fastify'
import { embedTexts } from '../../ai/embeddings'
import { buildPaperEmbeddingText, buildTsvText, splitText } from '../../utils/document'

const canGenerateEmbeddings = (fastify: FastifyInstance): boolean => {
  return Boolean(fastify.config.OPENAI_BASE_URL?.trim() && fastify.config.OPENAI_API_KEY?.trim())
}

const deletePaperSearchIndex = async (fastify: FastifyInstance, paperId: string): Promise<void> => {
  await fastify.prisma.$executeRawUnsafe('DELETE FROM embeddings WHERE "paperId" = $1', paperId)
}

export const refreshPaperSearchIndex = async (
  fastify: FastifyInstance,
  paperId: string,
): Promise<void> => {
  const [paper, approvedClaim] = await Promise.all([
    fastify.prisma.papers.findUnique({
      where: { id: paperId },
      select: { title: true, abstract: true, updatedAt: true },
    }),
    fastify.prisma.paper_claims.findFirst({
      where: { paperId, review_case: { status: 'approved' } },
      select: { id: true },
    }),
  ])

  if (!paper || !approvedClaim) {
    await deletePaperSearchIndex(fastify, paperId)
    return
  }

  const text = buildPaperEmbeddingText(paper.title, paper.abstract)
  if (!text) {
    await deletePaperSearchIndex(fastify, paperId)
    fastify.log.warn({ paperId }, 'Removed paper search index because paper text is empty')
    return
  }

  const chunks = await splitText(text)
  let embeddings: number[][] | null = null

  if (canGenerateEmbeddings(fastify)) {
    try {
      embeddings = await embedTexts(fastify, chunks)
    } catch (error) {
      fastify.log.warn(
        { err: error, paperId },
        'Embedding generation failed; retaining the full-text search index',
      )
    }
  }

  const [currentPaper, currentApprovedClaim] = await Promise.all([
    fastify.prisma.papers.findUnique({
      where: { id: paperId },
      select: { title: true, abstract: true, updatedAt: true },
    }),
    fastify.prisma.paper_claims.findFirst({
      where: { paperId, review_case: { status: 'approved' } },
      select: { id: true },
    }),
  ])
  if (!currentPaper || !currentApprovedClaim) {
    await deletePaperSearchIndex(fastify, paperId)
    return
  }
  if (
    currentPaper.updatedAt.getTime() !== paper.updatedAt.getTime() ||
    currentPaper.title !== paper.title ||
    currentPaper.abstract !== paper.abstract
  ) {
    fastify.log.info({ paperId }, 'Skipped a stale paper search index refresh')
    return
  }

  for (let index = 0; index < chunks.length; index++) {
    const tsvString = buildTsvText(chunks[index])
    const embedding = embeddings?.[index]
    const vector = embedding ? `[${embedding.join(',')}]` : null

    await fastify.prisma.$executeRawUnsafe(
      `INSERT INTO embeddings ("paperId", "segmentIndex", text, embedding, "createdAt", tsv)
       VALUES ($1, $2, $3, $4::vector, $5, to_tsvector('simple', $6))
       ON CONFLICT ("paperId", "segmentIndex") DO UPDATE
       SET text = EXCLUDED.text,
           embedding = EXCLUDED.embedding,
           tsv = EXCLUDED.tsv,
           "createdAt" = EXCLUDED."createdAt"`,
      paperId,
      index,
      chunks[index],
      vector,
      new Date(),
      tsvString,
    )
  }

  await fastify.prisma.$executeRawUnsafe(
    'DELETE FROM embeddings WHERE "paperId" = $1 AND "segmentIndex" >= $2',
    paperId,
    chunks.length,
  )

  fastify.log.info(
    { paperId, chunks: chunks.length, vectorized: embeddings !== null },
    'Paper search index processed',
  )
}
