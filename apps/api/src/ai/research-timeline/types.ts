export const TIMELINE_PROMPT_VERSION = 'research-timeline-v1'
export const TIMELINE_POLICY = 'fixed_calendar_windows'
export const TIMELINE_WINDOW_SIZE_YEARS = 5
export const TIMELINE_MAX_ABSTRACT_CHARS = 1800
export const TIMELINE_MAX_PROMPT_CHARS = 60_000

export type TimelineGenerationStatus =
  | 'requested'
  | 'queued'
  | 'running'
  | 'ready'
  | 'published'
  | 'failed'
  | 'rejected'
  | 'archived'

export interface TimelinePaperInput {
  id: string
  doi: string
  normalizedDoi: string
  title: string
  abstract: string | null
  year: number | null
  publicationDate: Date | null
  updatedAt: Date
  sourceStatus: string
}

export interface TimelinePaper extends TimelinePaperInput {
  year: number
}

export interface TimelinePeriodGroup {
  startYear: number
  endYear: number
  label: string
  papers: TimelinePaper[]
}

export interface TimelineSummary {
  focus_summary: string
  focus_tags: string[]
}

export interface TimelineSummaryResult extends TimelineSummary {
  inputTokens: number
  outputTokens: number
}

export interface PublicationMetadataCandidate {
  doi: string
  year: number | null
  publicationDate: string | null
  title: string | null
  source: 'crossref' | 'openalex'
}

export interface TimelineIssueInput {
  paperId: string | null
  doi: string
  issueType: 'metadata_conflict' | 'publication_year_not_found'
  existingYear: number | null
  candidateYear: number | null
  metadataSource: 'crossref' | 'openalex' | null
  message: string
}
