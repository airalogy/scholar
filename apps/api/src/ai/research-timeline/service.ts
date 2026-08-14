import type { FastifyInstance } from 'fastify'
import {
  buildResearchTimelineFingerprint,
  cleanResearchPaperTitle,
  groupResearchPapersIntoCalendarWindows,
} from './periodizer'
import { resolvePublicationMetadata } from './publication-metadata'
import { summarizeResearchTimelinePeriod } from './summarizer'
import {
  TIMELINE_PROMPT_VERSION,
  TIMELINE_WINDOW_SIZE_YEARS,
  type TimelineIssueInput,
  type TimelinePaperInput,
} from './types'

interface TimelineSourceData {
  scholar: {
    id: string
    name: string
  }
  papers: TimelinePaperInput[]
}

interface TimelineMetadataDependencies {
  resolver?: typeof resolvePublicationMetadata
}

const parsePublicationDate = (value: string | null): Date | null => {
  if (!value) {
    return null
  }
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

const datesConflict = (existing: Date | null, candidate: Date | null): boolean => {
  if (!existing || !candidate) {
    return false
  }
  return existing.toISOString().slice(0, 10) !== candidate.toISOString().slice(0, 10)
}

export const loadTimelineSourceData = async (
  fastify: FastifyInstance,
  scholarId: string,
): Promise<TimelineSourceData> => {
  const scholar = await fastify.prisma.scholars.findUnique({
    where: { id: scholarId },
    select: { id: true, name: true },
  })
  if (!scholar) {
    throw fastify.httpErrors.notFound('Scholar not found')
  }

  const links = await fastify.prisma.scholar_papers.findMany({
    where: { scholarId },
    orderBy: [{ display_order: 'asc' }, { id: 'asc' }],
    select: { paperId: true },
  })
  const paperIds = links.map((link) => link.paperId)
  const papers = await fastify.prisma.papers.findMany({
    where: { id: { in: paperIds } },
  })
  const paperById = new Map(papers.map((paper) => [paper.id, paper]))

  return {
    scholar,
    papers: paperIds.flatMap((paperId) => {
      const paper = paperById.get(paperId)
      if (!paper) {
        return []
      }
      return [
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
    }),
  }
}

export const resolveTimelinePaperMetadata = async (
  fastify: FastifyInstance,
  papers: TimelinePaperInput[],
  dependencies: TimelineMetadataDependencies = {},
): Promise<{ papers: TimelinePaperInput[]; issues: TimelineIssueInput[] }> => {
  const candidates = await (dependencies.resolver ?? resolvePublicationMetadata)(
    papers.map((paper) => paper.normalizedDoi),
    {
      mailto: fastify.config.OPENALEX_MAILTO,
      onWarning: (message) => fastify.log.warn({ message }, 'Publication metadata warning'),
    },
  )
  const checkedAt = new Date()
  const issues: TimelineIssueInput[] = []
  const resolvedPapers: TimelinePaperInput[] = []

  for (const paper of papers) {
    const candidate = candidates.get(paper.normalizedDoi)
    const candidateDate = parsePublicationDate(candidate?.publicationDate ?? null)
    let year = paper.year
    let publicationDate = paper.publicationDate
    let sourceStatus = paper.sourceStatus
    let updatedAt = paper.updatedAt
    const hasDateConflict = datesConflict(paper.publicationDate, candidateDate)

    if (candidate?.year && paper.year === null) {
      year = candidate.year
      publicationDate = paper.publicationDate ?? candidateDate
      sourceStatus = `${candidate.source}_filled`
      await fastify.prisma.papers.update({
        where: { id: paper.id },
        data: {
          publish_year: candidate.year,
          ...(paper.publicationDate === null && candidateDate
            ? { publish_date: candidateDate }
            : {}),
          publication_metadata_source: candidate.source,
          publication_metadata_checked: checkedAt,
          updatedAt: checkedAt,
        },
      })
      updatedAt = checkedAt
      if (hasDateConflict) {
        issues.push({
          paperId: paper.id,
          doi: paper.normalizedDoi,
          issueType: 'metadata_conflict',
          existingYear: paper.publicationDate?.getUTCFullYear() ?? null,
          candidateYear: candidate.year,
          metadataSource: candidate.source,
          message: `Database publication date ${paper.publicationDate?.toISOString().slice(0, 10)} conflicts with ${candidate.source} date ${candidate.publicationDate}`,
        })
      }
    } else if (candidate?.year && (paper.year !== candidate.year || hasDateConflict)) {
      issues.push({
        paperId: paper.id,
        doi: paper.normalizedDoi,
        issueType: 'metadata_conflict',
        existingYear: paper.year,
        candidateYear: candidate.year,
        metadataSource: candidate.source,
        message:
          paper.year !== candidate.year
            ? `Database year ${paper.year} conflicts with ${candidate.source} year ${candidate.year}`
            : `Database publication date ${paper.publicationDate?.toISOString().slice(0, 10)} conflicts with ${candidate.source} date ${candidate.publicationDate}`,
      })
      await fastify.prisma.papers.update({
        where: { id: paper.id },
        data: { publication_metadata_checked: checkedAt },
      })
    } else if (candidate) {
      await fastify.prisma.papers.update({
        where: { id: paper.id },
        data: { publication_metadata_checked: checkedAt },
      })
    }

    if (year === null) {
      issues.push({
        paperId: paper.id,
        doi: paper.normalizedDoi,
        issueType: 'publication_year_not_found',
        existingYear: null,
        candidateYear: null,
        metadataSource: candidate?.source ?? null,
        message: 'Publication year could not be resolved',
      })
    }
    resolvedPapers.push({
      ...paper,
      year,
      publicationDate,
      sourceStatus,
      updatedAt,
    })
  }

  return { papers: resolvedPapers, issues }
}

export const executeTimelineGeneration = async (
  fastify: FastifyInstance,
  generationId: string,
  leaseOwner?: string,
): Promise<void> => {
  const generation = await fastify.prisma.scholar_research_timeline_generations.findUnique({
    where: { id: generationId },
  })
  if (
    !generation ||
    generation.status !== 'running' ||
    (leaseOwner !== undefined && generation.lease_owner !== leaseOwner)
  ) {
    return
  }

  const assertLease = async (): Promise<void> => {
    if (leaseOwner === undefined) {
      return
    }
    const owned = await fastify.prisma.scholar_research_timeline_generations.findFirst({
      where: { id: generationId, status: 'running', lease_owner: leaseOwner },
      select: { id: true },
    })
    if (!owned) {
      throw new Error('Timeline generation lease was lost')
    }
  }

  await fastify.prisma.scholar_research_timeline_generations.update({
    where: { id: generationId },
    data: { progress_stage: 'resolving_metadata', updatedAt: new Date() },
  })
  const source = await loadTimelineSourceData(fastify, generation.scholar_id)
  const resolved = await resolveTimelinePaperMetadata(fastify, source.papers)
  const groups = groupResearchPapersIntoCalendarWindows(
    resolved.papers,
    generation.window_size_years || TIMELINE_WINDOW_SIZE_YEARS,
  )
  const resolvedPaperCount = resolved.papers.filter((paper) => paper.year !== null).length
  const sourceFingerprint = buildResearchTimelineFingerprint(
    generation.scholar_id,
    resolved.papers,
    generation.model,
    generation.prompt_version,
    generation.window_size_years,
  )
  const now = new Date()
  await assertLease()

  await fastify.prisma.$transaction(async (tx) => {
    await tx.scholar_research_timeline_issues.deleteMany({ where: { generation_id: generationId } })
    if (resolved.issues.length > 0) {
      await tx.scholar_research_timeline_issues.createMany({
        data: resolved.issues.map((issue) => ({
          generation_id: generationId,
          paper_id: issue.paperId,
          doi: issue.doi,
          issue_type: issue.issueType,
          existing_year: issue.existingYear,
          candidate_year: issue.candidateYear,
          metadata_source: issue.metadataSource,
          message: issue.message,
        })),
      })
    }
    await tx.scholar_research_periods.deleteMany({ where: { generation_id: generationId } })
    await tx.scholar_research_timeline_generations.update({
      where: { id: generationId },
      data: {
        source_paper_count: resolved.papers.length,
        source_fingerprint: sourceFingerprint,
        resolved_paper_count: resolvedPaperCount,
        unresolved_paper_count: resolved.papers.length - resolvedPaperCount,
        progress_stage: 'summarizing',
        completed_periods: 0,
        total_periods: groups.length,
        error_code: null,
        error_message: null,
        updatedAt: now,
      },
    })
  })

  let inputTokens = 0
  let outputTokens = 0
  for (const [groupIndex, group] of groups.entries()) {
    await assertLease()
    const summary = await summarizeResearchTimelinePeriod(fastify, source.scholar.name, group)
    await assertLease()
    inputTokens += summary.inputTokens
    outputTokens += summary.outputTokens

    await fastify.prisma.$transaction(async (tx) => {
      const period = await tx.scholar_research_periods.create({
        data: {
          generation_id: generationId,
          scholar_id: source.scholar.id,
          period_start_year: group.startYear,
          period_end_year: group.endYear,
          paper_count: group.papers.length,
          papers_with_abstract: group.papers.filter((paper) => Boolean(paper.abstract?.trim()))
            .length,
          papers_without_abstract: group.papers.filter((paper) => !paper.abstract?.trim()).length,
          focus_summary: summary.focus_summary,
          focus_tags: summary.focus_tags,
        },
      })
      await tx.scholar_research_period_papers.createMany({
        data: group.papers.map((paper, index) => ({
          period_id: period.id,
          paper_id: paper.id,
          year: paper.year,
          title_snapshot: cleanResearchPaperTitle(paper.title),
          doi_snapshot: paper.normalizedDoi,
          has_abstract: Boolean(paper.abstract?.trim()),
          source_status: paper.sourceStatus,
          display_order: index + 1,
        })),
      })
      await tx.scholar_research_timeline_generations.update({
        where: { id: generationId },
        data: {
          completed_periods: groupIndex + 1,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          updatedAt: new Date(),
        },
      })
    })
  }

  await assertLease()
  await fastify.prisma.scholar_research_timeline_generations.update({
    where: { id: generationId },
    data: {
      status: 'ready',
      progress_stage: 'ready',
      completed_at: new Date(),
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      lease_owner: null,
      lease_expires_at: null,
      updatedAt: new Date(),
    },
  })
}

export { TIMELINE_PROMPT_VERSION }
