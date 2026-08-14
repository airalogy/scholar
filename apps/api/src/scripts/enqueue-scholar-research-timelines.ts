import process from 'node:process'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../prisma/generated/client'
import { buildResearchTimelineFingerprint } from '../ai/research-timeline/periodizer'
import {
  TIMELINE_POLICY,
  TIMELINE_PROMPT_VERSION,
  TIMELINE_WINDOW_SIZE_YEARS,
  type TimelinePaperInput,
} from '../ai/research-timeline/types'

const APPLY_FLAG = '--apply'
const HELP_FLAG = '--help'

interface CliOptions {
  scholarIds: string[]
  allMissing: boolean
  staleDays: number | null
  apply: boolean
}

const readOptionValues = (name: string): string[] => {
  const values: string[] = []
  for (const [index, argument] of process.argv.entries()) {
    if (argument === name && process.argv[index + 1]) {
      values.push(process.argv[index + 1])
    } else if (argument.startsWith(`${name}=`)) {
      values.push(argument.slice(name.length + 1))
    }
  }
  return values
}

const parseOptions = (): CliOptions => {
  const staleValue = readOptionValues('--stale-days')[0]
  const staleDays = staleValue === undefined ? null : Number(staleValue)
  if (staleDays !== null && (!Number.isInteger(staleDays) || staleDays < 1)) {
    throw new Error('--stale-days must be a positive integer')
  }
  const options = {
    scholarIds: [...new Set(readOptionValues('--scholar'))],
    allMissing: process.argv.includes('--all-missing'),
    staleDays,
    apply: process.argv.includes(APPLY_FLAG),
  }
  if (!options.allMissing && options.staleDays === null && options.scholarIds.length === 0) {
    throw new Error('Specify --scholar, --all-missing, or --stale-days')
  }
  return options
}

const loadPaperInputs = async (
  prisma: PrismaClient,
  scholarId: string,
): Promise<TimelinePaperInput[]> => {
  const links = await prisma.scholar_papers.findMany({
    where: { scholarId },
    orderBy: [{ display_order: 'asc' }, { id: 'asc' }],
    select: { paperId: true },
  })
  const papers = await prisma.papers.findMany({
    where: { id: { in: links.map((link) => link.paperId) } },
  })
  const paperById = new Map(papers.map((paper) => [paper.id, paper]))
  return links.flatMap((link) => {
    const paper = paperById.get(link.paperId)
    return paper
      ? [
          {
            id: paper.id,
            doi: paper.doi,
            normalizedDoi: paper.normalized_doi,
            title: paper.title,
            abstract: paper.abstract,
            year: paper.publish_year,
            publicationDate: paper.publish_date,
            updatedAt: paper.updatedAt,
            sourceStatus: 'database_year',
          },
        ]
      : []
  })
}

const main = async (): Promise<void> => {
  if (process.argv.includes(HELP_FLAG)) {
    console.log(
      'Usage: pnpm enqueue:scholar-timelines -- ' +
        '[--scholar <uuid> ...] [--all-missing] [--stale-days <days>] [--apply]\n' +
        'Runs as a dry run unless --apply is provided.',
    )
    return
  }

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required')
  }
  const model = process.env.TIMELINE_MODEL || process.env.CHAT_MODEL
  if (!model) {
    throw new Error('TIMELINE_MODEL or CHAT_MODEL environment variable is required')
  }

  const options = parseOptions()
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
  try {
    const staleBefore =
      options.staleDays === null
        ? null
        : new Date(Date.now() - options.staleDays * 24 * 60 * 60 * 1000)
    const selectedScholarIds = new Set(options.scholarIds)
    if (options.allMissing) {
      const published = await prisma.scholar_research_timeline_generations.findMany({
        where: { status: 'published' },
        select: { scholar_id: true },
      })
      const publishedScholarIds = new Set(published.map((generation) => generation.scholar_id))
      const missing = await prisma.scholars.findMany({
        where: { id: { notIn: [...publishedScholarIds] } },
        select: { id: true },
      })
      for (const scholar of missing) {
        selectedScholarIds.add(scholar.id)
      }
    }
    const staleScholarIds = staleBefore
      ? new Set(
          (
            await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT scholar."id"
          FROM "scholars" AS scholar
          LEFT JOIN "scholar_research_timeline_generations" AS generation
            ON generation."scholar_id" = scholar."id"
            AND generation."status" = 'published'
          WHERE generation."id" IS NULL OR generation."published_at" < ${staleBefore}
        `
          ).map((scholar) => scholar.id),
        )
      : new Set<string>()
    for (const scholarId of staleScholarIds) {
      selectedScholarIds.add(scholarId)
    }
    const selected = await prisma.scholars.findMany({
      where: { id: { in: [...selectedScholarIds] } },
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    })
    const queued: Array<{
      scholar_id: string
      source_type: string
      status: string
      source_fingerprint: string
      timeline_policy: string
      window_size_years: number
      model: string
      prompt_version: string
      source_paper_count: number
      progress_stage: string
    }> = []
    let skippedActive = 0
    let skippedCached = 0

    for (const scholar of selected) {
      const papers = await loadPaperInputs(prisma, scholar.id)
      const fingerprint = buildResearchTimelineFingerprint(
        scholar.id,
        papers,
        model,
        TIMELINE_PROMPT_VERSION,
        TIMELINE_WINDOW_SIZE_YEARS,
      )
      const [active, cached] = await Promise.all([
        prisma.scholar_research_timeline_generations.findFirst({
          where: { scholar_id: scholar.id, status: { in: ['queued', 'running'] } },
          select: { id: true },
        }),
        prisma.scholar_research_timeline_generations.findFirst({
          where: {
            scholar_id: scholar.id,
            source_fingerprint: fingerprint,
            model,
            prompt_version: TIMELINE_PROMPT_VERSION,
            status: { in: ['ready', 'published'] },
          },
          select: { id: true },
        }),
      ])
      if (active) {
        skippedActive += 1
      } else if (cached) {
        skippedCached += 1
      } else {
        queued.push({
          scholar_id: scholar.id,
          source_type: 'ai_batch',
          status: 'queued',
          source_fingerprint: fingerprint,
          timeline_policy: TIMELINE_POLICY,
          window_size_years: TIMELINE_WINDOW_SIZE_YEARS,
          model,
          prompt_version: TIMELINE_PROMPT_VERSION,
          source_paper_count: papers.length,
          progress_stage: 'queued',
        })
      }
    }

    const created =
      options.apply && queued.length > 0
        ? await prisma.scholar_research_timeline_generations.createMany({
            data: queued,
            skipDuplicates: true,
          })
        : { count: 0 }
    console.log(
      JSON.stringify(
        {
          mode: options.apply ? 'apply' : 'dry-run',
          selectedScholars: selected.length,
          eligibleJobs: queued.length,
          createdJobs: created.count,
          skippedActive,
          skippedCached,
        },
        null,
        2,
      ),
    )
    if (!options.apply) {
      console.log(`Dry run only. Re-run with ${APPLY_FLAG} to enqueue generation jobs.`)
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
