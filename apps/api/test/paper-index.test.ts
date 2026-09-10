import assert from 'node:assert/strict'
import test from 'node:test'
import type { FastifyInstance } from 'fastify'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { refreshPaperSearchIndex } from '../src/routes/papers/paper-index'

const INSTITUTION_ID = '22222222-2222-4222-8222-222222222222'
const PAPER_ID = '33333333-3333-4333-8333-333333333333'
const FILE_ID = '44444444-4444-4444-8444-444444444444'

const createPdf = async (): Promise<Buffer> => {
  const document = await PDFDocument.create()
  const font = await document.embedFont(StandardFonts.Helvetica)
  const page = document.addPage([612, 792])
  page.drawText('Unique full text evidence about hybrid retrieval.', {
    x: 72,
    y: 700,
    size: 12,
    font,
  })
  return Buffer.from(await document.save())
}

test('approved PDF text is included in the local BM25 paper index', async () => {
  const calls: unknown[][] = []
  const downloads: string[] = []
  const updatedAt = new Date('2026-08-28T00:00:00.000Z')
  const pdf = await createPdf()
  const fastify = {
    deployment: { institution: { slug: 'example' } },
    config: {
      OPENAI_BASE_URL: '',
      OPENAI_API_KEY: '',
      ALLOW_APPROVED_PDF_MODEL_PROCESSING: false,
    },
    oss: {
      download: async (key: string) => {
        downloads.push(key)
        return pdf
      },
    },
    prisma: {
      institutions: {
        findUnique: async () => ({ id: INSTITUTION_ID, slug: 'example', name: 'Example' }),
      },
      papers: {
        findUnique: async () => ({ title: 'Paper title', abstract: 'Abstract', updatedAt }),
      },
      paper_claims: {
        findFirst: async () => ({
          id: 'approved-claim',
          updatedAt,
          submissionId: 'approved-submission',
          primary_submission: {
            id: 'approved-submission',
            updatedAt,
            paperId: PAPER_ID,
            institutionId: INSTITUTION_ID,
            oss_file: {
              id: FILE_ID,
              prefix: 'scholar/papers',
              ext: '.pdf',
              mime_type: 'application/pdf',
              hash: 'sha256-example',
              institutionId: INSTITUTION_ID,
              security_profile: 'institution_document',
            },
          },
        }),
      },
      paper_submissions: {
        findFirst: async () => null,
      },
      $executeRawUnsafe: async () => 1,
      $transaction: async (operation: (client: unknown) => Promise<unknown>) =>
        operation({
          $executeRawUnsafe: async (...args: unknown[]) => {
            calls.push(args)
            return 1
          },
        }),
    },
    log: {
      info: () => undefined,
      warn: () => undefined,
    },
  } as unknown as FastifyInstance

  const result = await refreshPaperSearchIndex(fastify, PAPER_ID)

  assert.equal(result.status, 'indexed')
  assert.equal(result.fullTextIndexed, true)
  assert.deepEqual(downloads, [`scholar/papers/${FILE_ID}.pdf`])
  const insertedText = calls
    .filter((call) => String(call[0]).includes('INSERT INTO embeddings'))
    .map((call) => String(call[3]))
    .join('\n')
  assert.match(insertedText, /Unique full text evidence about hybrid retrieval/u)
})
