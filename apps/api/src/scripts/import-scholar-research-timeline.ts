import { readFile } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import { PrismaClient } from '../../prisma/generated/client'
import { PrismaPg } from '@prisma/adapter-pg'
import {
  loadScholarResearchTimelines,
  normalizeScholarResearchTimeline,
  replaceScholarResearchTimeline,
  type ScholarResearchPeriod,
} from '../utils/scholarResearchPeriod'

interface ScholarTimelineProfile {
  scholar_name: string
  scholar_id: string
  research_timeline: ScholarResearchPeriod[]
}

const APPLY_FLAG = '--apply'
const STRICT_FLAG = '--strict'
const HELP_FLAG = '--help'
const DEFAULT_INPUT_PATH = fileURLToPath(
  new URL(
    '../../../../.local-data/scholar_research_timeline/scholar_research_timeline.json',
    import.meta.url,
  ),
)

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

const resolveInputPath = (): string => {
  const inlineFileArg = process.argv.find((argument) => argument.startsWith('--file='))
  const fileFlagIndex = process.argv.indexOf('--file')
  const requestedPath =
    inlineFileArg?.slice('--file='.length) ??
    (fileFlagIndex >= 0 ? process.argv[fileFlagIndex + 1] : undefined)

  if (!requestedPath) {
    return DEFAULT_INPUT_PATH
  }
  return isAbsolute(requestedPath) ? requestedPath : resolve(process.cwd(), requestedPath)
}

const parseProfiles = (value: unknown): ScholarTimelineProfile[] => {
  if (!Array.isArray(value)) {
    throw new Error('Timeline input must be a JSON array')
  }

  const profiles: ScholarTimelineProfile[] = []
  const seenScholarIds = new Set<string>()

  for (const [index, item] of value.entries()) {
    if (!isRecord(item)) {
      throw new Error(`Timeline profile at index ${index} must be an object`)
    }

    const scholarName = typeof item.scholar_name === 'string' ? item.scholar_name.trim() : ''
    const scholarId = typeof item.scholar_id === 'string' ? item.scholar_id.trim() : ''
    if (!scholarName || !scholarId) {
      throw new Error(`Timeline profile at index ${index} requires scholar_name and scholar_id`)
    }
    if (seenScholarIds.has(scholarId)) {
      throw new Error(`Timeline input contains duplicated scholar_id "${scholarId}"`)
    }

    const rawTimeline = item.research_timeline
    const researchTimeline = normalizeScholarResearchTimeline(rawTimeline)
    if (!Array.isArray(rawTimeline) || researchTimeline.length !== rawTimeline.length) {
      throw new Error(`Timeline profile "${scholarId}" contains invalid period data`)
    }

    const periodKeys = researchTimeline.map((period) => {
      return `${period.period_start_year}:${period.period_end_year}`
    })
    if (new Set(periodKeys).size !== periodKeys.length) {
      throw new Error(`Timeline profile "${scholarId}" contains duplicated periods`)
    }

    seenScholarIds.add(scholarId)
    profiles.push({
      scholar_name: scholarName,
      scholar_id: scholarId,
      research_timeline: researchTimeline,
    })
  }

  return profiles
}

const main = async (): Promise<void> => {
  if (process.argv.includes(HELP_FLAG)) {
    console.log(
      'Usage: pnpm import:scholar-timeline -- [--file <path>] [--apply] [--strict]\n' +
        'Runs as a dry run unless --apply is provided. --strict fails on unknown scholar UUIDs.',
    )
    return
  }

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required')
  }

  const inputPath = resolveInputPath()
  const input = JSON.parse(await readFile(inputPath, 'utf8')) as unknown
  const profiles = parseProfiles(input)
  const scholarIds = profiles.map((profile) => profile.scholar_id)
  const adapter = new PrismaPg({ connectionString })
  const prisma = new PrismaClient({ adapter })

  try {
    const scholars = await prisma.scholars.findMany({
      where: { id: { in: scholarIds } },
      select: { id: true },
    })
    const existingScholarIds = new Set(scholars.map((scholar) => scholar.id))
    const missingProfiles = profiles.filter(
      (profile) => !existingScholarIds.has(profile.scholar_id),
    )
    const matchedProfiles = profiles.filter((profile) => existingScholarIds.has(profile.scholar_id))
    const existingResearchTimelines = await loadScholarResearchTimelines(
      prisma,
      matchedProfiles.map((profile) => profile.scholar_id),
    )

    if (process.argv.includes(STRICT_FLAG) && missingProfiles.length > 0) {
      throw new Error(
        `${missingProfiles.length} timeline profiles do not match an existing scholar`,
      )
    }

    const changedProfiles = matchedProfiles.filter((profile) => {
      return (
        JSON.stringify(existingResearchTimelines.get(profile.scholar_id) ?? []) !==
        JSON.stringify(profile.research_timeline)
      )
    })
    const inputPeriodCount = profiles.reduce((total, profile) => {
      return total + profile.research_timeline.length
    }, 0)
    const matchedPeriodCount = matchedProfiles.reduce((total, profile) => {
      return total + profile.research_timeline.length
    }, 0)
    const summary = {
      mode: process.argv.includes(APPLY_FLAG) ? 'apply' : 'dry-run',
      inputPath,
      inputProfiles: profiles.length,
      matchedProfiles: matchedProfiles.length,
      missingProfiles: missingProfiles.length,
      changedProfiles: changedProfiles.length,
      unchangedProfiles: matchedProfiles.length - changedProfiles.length,
      inputPeriodCount,
      matchedPeriodCount,
    }

    console.log(JSON.stringify(summary, null, 2))
    if (missingProfiles.length > 0) {
      console.log(
        `Skipped scholar IDs: ${missingProfiles
          .slice(0, 20)
          .map((profile) => profile.scholar_id)
          .join(', ')}`,
      )
    }

    if (!process.argv.includes(APPLY_FLAG)) {
      console.log(`Dry run only. Re-run with ${APPLY_FLAG} to update PostgreSQL.`)
      return
    }

    for (const profile of changedProfiles) {
      await prisma.$transaction(async (tx) => {
        await replaceScholarResearchTimeline(tx, profile.scholar_id, profile.research_timeline, {
          sourceType: 'migration',
        })
      })
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
