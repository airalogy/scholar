import process from 'node:process'
import { PrismaClient } from '../../prisma/generated/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { buildPaperEmbeddingText, buildTsvText, splitText } from '../utils/document'
import { embedTextsFromEnvironment } from '../ai/embeddings'

interface PaperRecord {
  id: string
  title: string
  abstract: string | null
}

interface ExistingEmbeddingRow {
  paperId: string
  segmentIndex: number
  text: string
  hasEmbedding: boolean
  hasTsv: boolean
}

interface SummaryCounters {
  papers: {
    created: number
    updated: number
    unchanged: number
    skipped: number
  }
  chunks: {
    created: number
    updated: number
  }
}

const QUERY_CHUNK_SIZE = 500
const DRY_RUN_FLAG = '--dry-run'
const MAX_WARNING_OUTPUT = 100
const isDryRun = process.argv.includes(DRY_RUN_FLAG)

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required')
}

const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

const summary: SummaryCounters = {
  papers: {
    created: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
  },
  chunks: {
    created: 0,
    updated: 0,
  },
}

const warnings: string[] = []
let warningOutputSuppressed = false

const logInfo = (message: string) => {
  console.log(message)
}

const logWarn = (message: string) => {
  warnings.push(message)

  if (warnings.length <= MAX_WARNING_OUTPUT) {
    console.warn(message)
    return
  }

  if (!warningOutputSuppressed) {
    warningOutputSuppressed = true
    console.warn(`Further warnings suppressed after ${MAX_WARNING_OUTPUT} entries`)
  }
}

const logProgress = (processed: number, total: number) => {
  if (processed % 100 === 0 || processed === total) {
    logInfo(`Processed ${processed}/${total} papers`)
  }
}

const chunkArray = <T>(items: T[], size: number): T[][] => {
  if (items.length === 0) {
    return []
  }

  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }

  return chunks
}

const buildPaperText = (paper: PaperRecord): string | null => {
  return buildPaperEmbeddingText(paper.title, paper.abstract)
}

const groupBy = <T, K>(items: T[], getKey: (item: T) => K): Map<K, T[]> => {
  const grouped = new Map<K, T[]>()

  for (const item of items) {
    const key = getKey(item)
    const existing = grouped.get(key) ?? []
    existing.push(item)
    grouped.set(key, existing)
  }

  return grouped
}

const loadPapers = async (): Promise<PaperRecord[]> => {
  return prisma.papers.findMany({
    where: {
      claims: {
        some: { review_case: { status: 'approved' } },
      },
    },
    select: {
      id: true,
      title: true,
      abstract: true,
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
}

const loadEmbeddingsByPaperId = async (paperIds: string[]): Promise<ExistingEmbeddingRow[]> => {
  const rows: ExistingEmbeddingRow[] = []

  for (const chunk of chunkArray(paperIds, QUERY_CHUNK_SIZE)) {
    const placeholders = chunk.map((_, index) => `$${index + 1}`).join(', ')
    const query = `
      SELECT
        "paperId",
        "segmentIndex",
        text,
        (embedding IS NOT NULL AND embedding::text <> '') AS "hasEmbedding",
        (tsv IS NOT NULL AND tsv::text <> '') AS "hasTsv"
      FROM embeddings
      WHERE "paperId" IN (${placeholders})
      ORDER BY "paperId" ASC, "segmentIndex" ASC
    `
    const chunkRows = await prisma.$queryRawUnsafe<ExistingEmbeddingRow[]>(query, ...chunk)
    rows.push(...chunkRows)
  }

  return rows
}

const hasReusableEmbeddings = (chunks: string[], rows: ExistingEmbeddingRow[]): boolean => {
  if (rows.length !== chunks.length) {
    return false
  }

  for (let index = 0; index < chunks.length; index++) {
    const row = rows[index]
    if (!row) {
      return false
    }

    if (row.segmentIndex !== index) {
      return false
    }

    if (row.text !== chunks[index]) {
      return false
    }

    if (!row.hasEmbedding || !row.hasTsv) {
      return false
    }
  }

  return true
}

const replaceEmbeddings = async (paperId: string, chunks: string[]) => {
  const embeddings = await embedTextsFromEnvironment(chunks)
  const createdAt = new Date()

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('DELETE FROM embeddings WHERE "paperId" = $1', paperId)

    for (let index = 0; index < chunks.length; index++) {
      const tsvString = buildTsvText(chunks[index])
      const vectorString = `[${embeddings[index].join(',')}]`

      await tx.$executeRawUnsafe(
        `INSERT INTO embeddings ("paperId", "segmentIndex", text, embedding, "createdAt", tsv)
         VALUES ($1, $2, $3, $4::vector, $5, to_tsvector('simple', $6))`,
        paperId,
        index,
        chunks[index],
        vectorString,
        createdAt,
        tsvString,
      )
    }
  })
}

const main = async () => {
  logInfo(`Starting paper embeddings generation${isDryRun ? ' (dry run)' : ''}`)

  const papers = await loadPapers()
  const existingEmbeddings = await loadEmbeddingsByPaperId(papers.map((paper) => paper.id))
  const existingEmbeddingsByPaperId = groupBy(existingEmbeddings, (row) => row.paperId)

  for (let index = 0; index < papers.length; index++) {
    const paper = papers[index]
    const text = buildPaperText(paper)
    const processed = index + 1

    if (!text) {
      summary.papers.skipped += 1
      logWarn(`Skipped paper "${paper.id}" because title and abstract are both empty`)
      logProgress(processed, papers.length)
      continue
    }

    const chunks = await splitText(text)
    const existingRows = existingEmbeddingsByPaperId.get(paper.id) ?? []

    if (hasReusableEmbeddings(chunks, existingRows)) {
      summary.papers.unchanged += 1
      logProgress(processed, papers.length)
      continue
    }

    if (!isDryRun) {
      await replaceEmbeddings(paper.id, chunks)
    }

    if (existingRows.length === 0) {
      summary.papers.created += 1
      summary.chunks.created += chunks.length
    } else {
      summary.papers.updated += 1
      summary.chunks.updated += chunks.length
    }

    logProgress(processed, papers.length)
  }

  console.log(
    JSON.stringify(
      {
        dryRun: isDryRun,
        summary,
        warningCount: warnings.length,
      },
      null,
      2,
    ),
  )
}

main()
  .catch((error) => {
    console.error('Paper embeddings generation failed')
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
