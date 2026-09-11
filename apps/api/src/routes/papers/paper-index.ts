import type { FastifyInstance } from 'fastify'
import { Prisma } from '../../../prisma/generated/client'
import { embedTexts } from '../../ai/embeddings'
import {
  buildBm25DocumentStatistics,
  buildPaperIndexText,
  buildTsvText,
  pdfToMarkdown,
  splitText,
} from '../../utils/document'
import { getConfiguredInstitution } from '../../utils/institution-scope'
import { buildObjectKey } from '../../utils/oss'
import { PROTECTED_FILE_SECURITY_PROFILE } from '../../utils/protected-files'

const canGenerateEmbeddings = (fastify: FastifyInstance): boolean => {
  return Boolean(fastify.config.OPENAI_BASE_URL?.trim() && fastify.config.OPENAI_API_KEY?.trim())
}

interface PaperIndexFile {
  id: string
  prefix: string
  ext: string
  mimeType: string
  hash: string
}

interface PaperIndexSnapshot {
  paper: {
    title: string
    abstract: string | null
    updatedAt: Date
    titles: Array<{ title: string; language: string; kind: string }>
  }
  claim: {
    id: string
    updatedAt: Date
    submissionId: string | null
  }
  submission: {
    id: string
    updatedAt: Date
    paperId: string
    institutionId: string | null
  } | null
  file: PaperIndexFile | null
}

export interface PaperIndexRefreshResult {
  status: 'indexed' | 'removed' | 'stale'
  chunks: number
  fullTextIndexed: boolean
}

const loadPaperIndexSnapshot = async (
  fastify: FastifyInstance,
  paperId: string,
  prisma: Prisma.TransactionClient = fastify.prisma,
): Promise<PaperIndexSnapshot | null> => {
  const institution = await getConfiguredInstitution(fastify)
  const [paper, approvedClaim] = await Promise.all([
    prisma.papers.findUnique({
      where: { id: paperId },
      select: {
        title: true,
        abstract: true,
        updatedAt: true,
        titles: {
          select: { title: true, language: true, kind: true },
          orderBy: [{ language: 'asc' }, { kind: 'asc' }],
        },
      },
    }),
    prisma.paper_claims.findFirst({
      where: {
        paperId,
        institutionId: institution.id,
        review_case: { status: 'approved' },
      },
      select: {
        id: true,
        updatedAt: true,
        submissionId: true,
        primary_submission: {
          select: {
            id: true,
            updatedAt: true,
            paperId: true,
            institutionId: true,
            oss_file: {
              select: {
                id: true,
                prefix: true,
                ext: true,
                mime_type: true,
                hash: true,
                institutionId: true,
                security_profile: true,
              },
            },
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    }),
  ])

  if (!paper || !approvedClaim) {
    return null
  }

  const submission =
    (approvedClaim.primary_submission?.paperId === paperId &&
    approvedClaim.primary_submission.institutionId === institution.id
      ? approvedClaim.primary_submission
      : null) ??
    (await prisma.paper_submissions.findFirst({
      where: { paperId, claimId: approvedClaim.id, institutionId: institution.id },
      select: {
        id: true,
        updatedAt: true,
        paperId: true,
        institutionId: true,
        oss_file: {
          select: {
            id: true,
            prefix: true,
            ext: true,
            mime_type: true,
            hash: true,
            institutionId: true,
            security_profile: true,
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    }))
  const file =
    submission?.oss_file?.institutionId === institution.id &&
    submission.oss_file.security_profile === PROTECTED_FILE_SECURITY_PROFILE &&
    submission.oss_file.prefix === 'scholar/papers'
      ? submission.oss_file
      : null

  return {
    paper,
    claim: {
      id: approvedClaim.id,
      updatedAt: approvedClaim.updatedAt,
      submissionId: approvedClaim.submissionId,
    },
    submission: submission
      ? {
          id: submission.id,
          updatedAt: submission.updatedAt,
          paperId: submission.paperId,
          institutionId: submission.institutionId,
        }
      : null,
    file: file
      ? {
          id: file.id,
          prefix: file.prefix,
          ext: file.ext,
          mimeType: file.mime_type,
          hash: file.hash,
        }
      : null,
  }
}

const snapshotFingerprint = (snapshot: PaperIndexSnapshot): string => {
  return JSON.stringify({
    title: snapshot.paper.title,
    titles: snapshot.paper.titles,
    abstract: snapshot.paper.abstract,
    paperUpdatedAt: snapshot.paper.updatedAt.toISOString(),
    claimId: snapshot.claim.id,
    claimUpdatedAt: snapshot.claim.updatedAt.toISOString(),
    claimSubmissionId: snapshot.claim.submissionId,
    submissionId: snapshot.submission?.id ?? null,
    submissionUpdatedAt: snapshot.submission?.updatedAt.toISOString() ?? null,
    file: snapshot.file,
  })
}

const extractApprovedPdfText = async (
  fastify: FastifyInstance,
  paperId: string,
  file: PaperIndexFile | null,
): Promise<string | null> => {
  if (!file || (file.mimeType !== 'application/pdf' && file.ext.toLowerCase() !== '.pdf')) {
    return null
  }

  const key = buildObjectKey(file.prefix, file.id, file.ext)
  const buffer = await fastify.oss.download(key)
  try {
    return await pdfToMarkdown(buffer)
  } catch (error) {
    fastify.log.warn(
      { err: error, paperId, fileId: file.id },
      'PDF text extraction failed; indexing paper metadata only',
    )
    return null
  }
}

// Lock only while publishing the finished index, never during PDF/model work.
// Review changes and file replacement cannot race the final fingerprint check.
const lockIndexSources = async (tx: Prisma.TransactionClient, paperId: string): Promise<void> => {
  await tx.$queryRaw(Prisma.sql`SELECT id FROM papers WHERE id = ${paperId}::uuid FOR UPDATE`)
  await tx.$queryRaw(Prisma.sql`
    SELECT c.id FROM paper_claims c JOIN content_review_cases r ON r.id = c."reviewCaseId"
    WHERE c."paperId" = ${paperId}::uuid ORDER BY c.id FOR SHARE OF c, r`)
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM paper_submissions WHERE "paperId" = ${paperId}::uuid ORDER BY id FOR SHARE`,
  )
  await tx.$queryRaw(Prisma.sql`
    SELECT f.id FROM oss_files f JOIN paper_submissions s ON s.oss_file_id = f.id
    WHERE s."paperId" = ${paperId}::uuid ORDER BY f.id FOR SHARE OF f`)
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM paper_titles WHERE "paperId" = ${paperId}::uuid ORDER BY id FOR SHARE`,
  )
}

export const refreshPaperSearchIndex = async (
  fastify: FastifyInstance,
  paperId: string,
): Promise<PaperIndexRefreshResult> => {
  const snapshot = await loadPaperIndexSnapshot(fastify, paperId)
  const fullText = snapshot ? await extractApprovedPdfText(fastify, paperId, snapshot.file) : null
  const titles = snapshot
    ? [...new Set([snapshot.paper.title, ...snapshot.paper.titles.map((item) => item.title)])].join(
        '\n',
      )
    : ''
  const text = snapshot ? buildPaperIndexText(titles, snapshot.paper.abstract, fullText) : null
  const chunks = text ? await splitText(text) : []
  let embeddings: Array<number[] | null> | null = null

  if (snapshot && chunks.length && canGenerateEmbeddings(fastify)) {
    try {
      if (fullText?.trim() && !fastify.config.ALLOW_APPROVED_PDF_MODEL_PROCESSING) {
        const metadataText = buildPaperIndexText(titles, snapshot.paper.abstract)
        if (metadataText) {
          const [metadataEmbedding] = await embedTexts(fastify, [metadataText])
          embeddings = Array.from({ length: chunks.length }, () => null)
          embeddings[0] = metadataEmbedding
        }
      } else {
        embeddings = await embedTexts(fastify, chunks)
      }
    } catch (error) {
      fastify.log.warn(
        { err: error, paperId },
        'Embedding generation failed; retaining the BM25 search index',
      )
    }
  }

  const createdAt = new Date()
  const result = await fastify.prisma.$transaction(
    async (tx): Promise<PaperIndexRefreshResult> => {
      await lockIndexSources(tx, paperId)
      const current = await loadPaperIndexSnapshot(fastify, paperId, tx)
      if (
        current &&
        (!snapshot || snapshotFingerprint(current) !== snapshotFingerprint(snapshot))
      ) {
        return { status: 'stale', chunks: 0, fullTextIndexed: false }
      }
      await tx.$executeRawUnsafe('DELETE FROM embeddings WHERE "paperId" = $1', paperId)
      if (!current || !chunks.length)
        return { status: 'removed', chunks: 0, fullTextIndexed: false }

      for (let index = 0; index < chunks.length; index++) {
        const chunk = chunks[index]
        const statistics = buildBm25DocumentStatistics(chunk)
        const embedding = embeddings?.[index]
        await tx.$executeRawUnsafe(
          `INSERT INTO embeddings (
           "paperId", "segmentIndex", text, embedding, "createdAt", tsv, "bm25_length", "bm25_terms"
         ) VALUES ($1, $2, $3, $4::vector, $5, to_tsvector('simple', $6), $7, $8::jsonb)`,
          paperId,
          index,
          chunk,
          embedding ? `[${embedding.join(',')}]` : null,
          createdAt,
          buildTsvText(chunk),
          statistics.length,
          JSON.stringify(statistics.termFrequencies),
        )
      }
      return {
        status: 'indexed',
        chunks: chunks.length,
        fullTextIndexed: Boolean(fullText?.trim()),
      }
    },
    { timeout: 30000 },
  )
  fastify.log.info({ paperId, ...result }, 'Paper search index processed')
  return result
}
