import type { FastifyInstance } from 'fastify'
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

const deletePaperSearchIndex = async (fastify: FastifyInstance, paperId: string): Promise<void> => {
  await fastify.prisma.$executeRawUnsafe('DELETE FROM embeddings WHERE "paperId" = $1', paperId)
}

const loadPaperIndexSnapshot = async (
  fastify: FastifyInstance,
  paperId: string,
): Promise<PaperIndexSnapshot | null> => {
  const institution = await getConfiguredInstitution(fastify)
  const [paper, approvedClaim] = await Promise.all([
    fastify.prisma.papers.findUnique({
      where: { id: paperId },
      select: { title: true, abstract: true, updatedAt: true },
    }),
    fastify.prisma.paper_claims.findFirst({
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
    (await fastify.prisma.paper_submissions.findFirst({
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

export const refreshPaperSearchIndex = async (
  fastify: FastifyInstance,
  paperId: string,
): Promise<PaperIndexRefreshResult> => {
  const snapshot = await loadPaperIndexSnapshot(fastify, paperId)
  if (!snapshot) {
    await deletePaperSearchIndex(fastify, paperId)
    return { status: 'removed', chunks: 0, fullTextIndexed: false }
  }

  const fullText = await extractApprovedPdfText(fastify, paperId, snapshot.file)
  const text = buildPaperIndexText(snapshot.paper.title, snapshot.paper.abstract, fullText)
  if (!text) {
    await deletePaperSearchIndex(fastify, paperId)
    fastify.log.warn({ paperId }, 'Removed paper search index because paper text is empty')
    return { status: 'removed', chunks: 0, fullTextIndexed: false }
  }

  const chunks = await splitText(text)
  let embeddings: Array<number[] | null> | null = null

  if (canGenerateEmbeddings(fastify)) {
    try {
      if (fullText?.trim() && !fastify.config.ALLOW_APPROVED_PDF_MODEL_PROCESSING) {
        const metadataText = buildPaperIndexText(snapshot.paper.title, snapshot.paper.abstract)
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

  const currentSnapshot = await loadPaperIndexSnapshot(fastify, paperId)
  if (!currentSnapshot) {
    await deletePaperSearchIndex(fastify, paperId)
    return { status: 'removed', chunks: 0, fullTextIndexed: false }
  }
  if (snapshotFingerprint(currentSnapshot) !== snapshotFingerprint(snapshot)) {
    fastify.log.info({ paperId }, 'Skipped a stale paper search index refresh')
    return { status: 'stale', chunks: 0, fullTextIndexed: false }
  }

  const createdAt = new Date()
  await fastify.prisma.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe('DELETE FROM embeddings WHERE "paperId" = $1', paperId)

    for (let index = 0; index < chunks.length; index++) {
      const chunk = chunks[index]
      const tsvString = buildTsvText(chunk)
      const statistics = buildBm25DocumentStatistics(chunk)
      const embedding = embeddings?.[index]
      const vector = embedding ? `[${embedding.join(',')}]` : null

      await transaction.$executeRawUnsafe(
        `INSERT INTO embeddings (
           "paperId", "segmentIndex", text, embedding, "createdAt", tsv,
           "bm25_length", "bm25_terms"
         )
         VALUES ($1, $2, $3, $4::vector, $5, to_tsvector('simple', $6), $7, $8::jsonb)`,
        paperId,
        index,
        chunk,
        vector,
        createdAt,
        tsvString,
        statistics.length,
        JSON.stringify(statistics.termFrequencies),
      )
    }
  })

  const fullTextIndexed = Boolean(fullText?.trim())
  const vectorizedSegments = embeddings?.filter(Boolean).length ?? 0
  fastify.log.info(
    { paperId, chunks: chunks.length, vectorizedSegments, fullTextIndexed },
    'Paper search index processed',
  )
  return { status: 'indexed', chunks: chunks.length, fullTextIndexed }
}
