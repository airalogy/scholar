import { createHash } from 'node:crypto'
import type { Prisma } from '../../prisma/generated/client'
import { normalizeDoi } from './doi'

export interface ScholarResearchSourcePaper {
  year: number
  title: string
  doi: string
  has_abstract: boolean
  source_status: string
}

export interface ScholarResearchPeriod {
  period_start_year: number
  period_end_year: number
  paper_count: number
  papers_with_abstract: number
  papers_without_abstract: number
  focus_summary: string
  focus_tags: string[]
  source_papers: ScholarResearchSourcePaper[]
}

export type TimelineSourceType = 'ai' | 'institution_import' | 'migration' | 'manual'

export interface ReplaceTimelineOptions {
  sourceType?: TimelineSourceType
  actorId?: string | null
  model?: string
  promptVersion?: string
}

type ResearchPeriodClient = Pick<
  Prisma.TransactionClient,
  | 'papers'
  | 'scholar_research_period_papers'
  | 'scholar_research_periods'
  | 'scholar_research_timeline_generations'
  | 'scholar_research_timeline_issues'
>

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

const normalizeSourcePapers = (value: unknown): ScholarResearchSourcePaper[] => {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null
      }

      const year = typeof item.year === 'number' ? item.year : null
      const title = typeof item.title === 'string' ? item.title.trim() : ''
      const doi = typeof item.doi === 'string' ? normalizeDoi(item.doi) : ''
      if (year === null || !title) {
        return null
      }

      return {
        year,
        title,
        doi,
        has_abstract: item.has_abstract === true,
        source_status: typeof item.source_status === 'string' ? item.source_status : '',
      }
    })
    .filter((item): item is ScholarResearchSourcePaper => item !== null)
}

const normalizeFocusTags = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return []
  }

  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ]
}

export const normalizeScholarResearchTimeline = (value: unknown): ScholarResearchPeriod[] => {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null
      }

      const periodStartYear =
        typeof item.period_start_year === 'number' ? item.period_start_year : null
      const periodEndYear = typeof item.period_end_year === 'number' ? item.period_end_year : null
      const paperCount = typeof item.paper_count === 'number' ? item.paper_count : null
      const papersWithAbstract =
        typeof item.papers_with_abstract === 'number' ? item.papers_with_abstract : null
      const papersWithoutAbstract =
        typeof item.papers_without_abstract === 'number' ? item.papers_without_abstract : null
      const focusSummary = typeof item.focus_summary === 'string' ? item.focus_summary.trim() : ''

      if (
        periodStartYear === null ||
        periodEndYear === null ||
        paperCount === null ||
        papersWithAbstract === null ||
        papersWithoutAbstract === null ||
        !focusSummary
      ) {
        return null
      }

      return {
        period_start_year: periodStartYear,
        period_end_year: periodEndYear,
        paper_count: paperCount,
        papers_with_abstract: papersWithAbstract,
        papers_without_abstract: papersWithoutAbstract,
        focus_summary: focusSummary,
        focus_tags: normalizeFocusTags(item.focus_tags),
        source_papers: normalizeSourcePapers(item.source_papers),
      }
    })
    .filter((item): item is ScholarResearchPeriod => item !== null)
    .sort((a, b) => {
      return a.period_start_year - b.period_start_year || a.period_end_year - b.period_end_year
    })
}

export const assertValidScholarResearchTimeline = (
  value: unknown,
  timeline: ScholarResearchPeriod[] = normalizeScholarResearchTimeline(value),
): void => {
  if (!Array.isArray(value) || timeline.length !== value.length) {
    throw new Error('research_timeline contains an invalid period')
  }

  let previousEndYear: number | null = null
  for (const period of timeline) {
    if (period.period_start_year > period.period_end_year) {
      throw new Error('research_timeline period_start_year must not exceed period_end_year')
    }
    if (previousEndYear !== null && period.period_start_year <= previousEndYear) {
      throw new Error('research_timeline periods must not overlap')
    }
    if (period.paper_count !== period.source_papers.length) {
      throw new Error('research_timeline paper_count must match source_papers length')
    }

    const papersWithAbstract = period.source_papers.filter((paper) => paper.has_abstract).length
    const papersWithoutAbstract = period.source_papers.length - papersWithAbstract
    if (
      period.papers_with_abstract !== papersWithAbstract ||
      period.papers_without_abstract !== papersWithoutAbstract
    ) {
      throw new Error('research_timeline abstract counts must match source_papers')
    }
    if (
      period.source_papers.some(
        (paper) => paper.year < period.period_start_year || paper.year > period.period_end_year,
      )
    ) {
      throw new Error('research_timeline paper years must fall inside their period')
    }

    previousEndYear = period.period_end_year
  }
}

const timelineFingerprint = (timeline: ScholarResearchPeriod[]): string => {
  return createHash('sha256').update(JSON.stringify(timeline)).digest('hex')
}

export const loadScholarResearchTimelines = async (
  client: ResearchPeriodClient,
  scholarIds: string[],
): Promise<Map<string, ScholarResearchPeriod[]>> => {
  if (scholarIds.length === 0) {
    return new Map()
  }

  const generations = await client.scholar_research_timeline_generations.findMany({
    where: {
      scholar_id: { in: scholarIds },
      status: 'published',
    },
    select: { id: true, scholar_id: true },
  })
  if (generations.length === 0) {
    return new Map()
  }

  const scholarIdByGenerationId = new Map(
    generations.map((generation) => [generation.id, generation.scholar_id]),
  )
  const rows = await client.scholar_research_periods.findMany({
    where: { generation_id: { in: generations.map((generation) => generation.id) } },
    orderBy: [
      { scholar_id: 'asc' },
      { period_start_year: 'asc' },
      { period_end_year: 'asc' },
      { id: 'asc' },
    ],
  })
  const sourceRows = await client.scholar_research_period_papers.findMany({
    where: { period_id: { in: rows.map((row) => row.id) } },
    orderBy: [{ period_id: 'asc' }, { display_order: 'asc' }, { id: 'asc' }],
  })
  const sourcePapersByPeriodId = new Map<bigint, ScholarResearchSourcePaper[]>()

  for (const row of sourceRows) {
    const sourcePaper: ScholarResearchSourcePaper = {
      year: row.year,
      title: row.title_snapshot,
      doi: row.doi_snapshot,
      has_abstract: row.has_abstract,
      source_status: row.source_status,
    }
    sourcePapersByPeriodId.set(row.period_id, [
      ...(sourcePapersByPeriodId.get(row.period_id) ?? []),
      sourcePaper,
    ])
  }

  const researchTimelines = new Map<string, ScholarResearchPeriod[]>()
  for (const row of rows) {
    const scholarId = scholarIdByGenerationId.get(row.generation_id)
    if (!scholarId) {
      continue
    }

    const item: ScholarResearchPeriod = {
      period_start_year: row.period_start_year,
      period_end_year: row.period_end_year,
      paper_count: row.paper_count,
      papers_with_abstract: row.papers_with_abstract,
      papers_without_abstract: row.papers_without_abstract,
      focus_summary: row.focus_summary,
      focus_tags: row.focus_tags,
      source_papers: sourcePapersByPeriodId.get(row.id) ?? [],
    }
    researchTimelines.set(scholarId, [...(researchTimelines.get(scholarId) ?? []), item])
  }

  return researchTimelines
}

export const replaceScholarResearchTimeline = async (
  client: ResearchPeriodClient,
  scholarId: string,
  value: unknown,
  options: ReplaceTimelineOptions = {},
): Promise<ScholarResearchPeriod[]> => {
  const researchTimeline = normalizeScholarResearchTimeline(value)
  assertValidScholarResearchTimeline(value, researchTimeline)
  const now = new Date()
  const sourceDois = [
    ...new Set(
      researchTimeline.flatMap((period) => {
        return period.source_papers.map((paper) => normalizeDoi(paper.doi)).filter(Boolean)
      }),
    ),
  ]
  const papers = await client.papers.findMany({
    where: { normalized_doi: { in: sourceDois } },
    select: { id: true, normalized_doi: true },
  })
  const paperIdByDoi = new Map(papers.map((paper) => [paper.normalized_doi, paper.id]))
  const sourcePaperCount = researchTimeline.reduce((total, period) => {
    return total + period.source_papers.length
  }, 0)
  const resolvedPaperCount = researchTimeline.reduce((total, period) => {
    return (
      total +
      period.source_papers.filter((paper) => {
        return paperIdByDoi.has(normalizeDoi(paper.doi))
      }).length
    )
  }, 0)

  await client.scholar_research_timeline_generations.updateMany({
    where: { scholar_id: scholarId, status: 'published' },
    data: {
      status: 'archived',
      progress_stage: 'archived',
      updatedAt: now,
    },
  })
  const generation = await client.scholar_research_timeline_generations.create({
    data: {
      scholar_id: scholarId,
      source_type: options.sourceType ?? 'manual',
      status: 'published',
      requested_by: options.actorId ?? null,
      reviewed_by: options.actorId ?? null,
      source_fingerprint: timelineFingerprint(researchTimeline),
      model: options.model ?? 'manual',
      prompt_version: options.promptVersion ?? 'manual-v1',
      source_paper_count: sourcePaperCount,
      resolved_paper_count: resolvedPaperCount,
      unresolved_paper_count: sourcePaperCount - resolvedPaperCount,
      progress_stage: 'published',
      completed_periods: researchTimeline.length,
      total_periods: researchTimeline.length,
      completed_at: now,
      reviewed_at: now,
      published_at: now,
      updatedAt: now,
    },
  })

  for (const period of researchTimeline) {
    const createdPeriod = await client.scholar_research_periods.create({
      data: {
        generation_id: generation.id,
        scholar_id: scholarId,
        period_start_year: period.period_start_year,
        period_end_year: period.period_end_year,
        paper_count: period.paper_count,
        papers_with_abstract: period.papers_with_abstract,
        papers_without_abstract: period.papers_without_abstract,
        focus_summary: period.focus_summary,
        focus_tags: period.focus_tags,
        createdAt: now,
      },
    })
    if (period.source_papers.length > 0) {
      await client.scholar_research_period_papers.createMany({
        data: period.source_papers.map((paper, index) => ({
          period_id: createdPeriod.id,
          paper_id: paperIdByDoi.get(normalizeDoi(paper.doi)) ?? null,
          year: paper.year,
          title_snapshot: paper.title,
          doi_snapshot: normalizeDoi(paper.doi),
          has_abstract: paper.has_abstract,
          source_status: paper.source_status || 'manual',
          display_order: index + 1,
        })),
      })
      const unmatchedPapers = period.source_papers.filter((paper) => {
        return !paperIdByDoi.has(normalizeDoi(paper.doi))
      })
      if (unmatchedPapers.length > 0) {
        await client.scholar_research_timeline_issues.createMany({
          data: unmatchedPapers.map((paper) => ({
            generation_id: generation.id,
            paper_id: null,
            doi: normalizeDoi(paper.doi),
            issue_type: 'paper_not_matched',
            existing_year: paper.year,
            candidate_year: null,
            metadata_source: null,
            message: `Timeline paper snapshot could not be matched by DOI: ${paper.title}`,
          })),
        })
      }
    }
  }

  return researchTimeline
}
