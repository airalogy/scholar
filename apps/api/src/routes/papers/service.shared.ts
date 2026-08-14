import type { Prisma } from '../../../prisma/generated/client'
import type { InstitutionPaperBoundMember } from '../../utils/institution-paper-bindings'
import type { CreatePaperBody, UpdatePaperBody } from './schema'

export type PaperReviewStatus =
  | 'draft'
  | 'pending_review'
  | 'changes_requested'
  | 'approved'
  | 'archived'

export const NO_MATCH_PAPER_ID = '00000000-0000-0000-0000-000000000000'

export interface PaperScope {
  institutionId: string
  labId: string | null
  reviewNodeId: string | null
}

export interface ClaimRecord {
  id: string
  paperId: string
  institutionId: string
  labId: string | null
  reviewNodeId: string | null
  reviewWorkflowId: string | null
  currentReviewStep: number | null
  reviewCaseId: string
  submittedBy: string
  submissionId: string | null
  review_status: string
  review_notes: string | null
  reviewedBy: string | null
  reviewedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface SubmissionRecord {
  id: string
  paperId: string
  claimId: string | null
  userId: string
  institutionId: string | null
  labId: string | null
  oss_file_id: string | null
  metadata_snapshot: Prisma.JsonValue
  notes: string | null
  createdAt: Date
  updatedAt: Date
}

export interface FormattedPaperAuthor {
  id: string
  name: string
  email: string | null
  order: number
}

export interface FormattedPaper {
  id: string
  claimId: string | null
  submissionId: string | null
  title: string
  abstract: string | null
  doi: string
  journal_name: string | null
  publish_year: number | null
  publish_date: string | null
  paper_type: number | null
  language: number | null
  citation_count: number | null
  pages: string | null
  keywords: string[]
  authors: FormattedPaperAuthor[]
  boundMembers: InstitutionPaperBoundMember[]
  oss_file_id: string | null
  preview_url: string | null
  download_url: string | null
  file_url: string | null
  link: string | null
  uploadUserId: string
  uploadUserName: string | null
  institutionId: string | null
  institutionName: string | null
  labId: string | null
  labName: string | null
  reviewNodeId: string | null
  reviewWorkflowId: string | null
  currentReviewStep: number | null
  reviewStatus: PaperReviewStatus
  reviewNotes: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ReviewStatusTotals {
  draft: number
  pending_review: number
  changes_requested: number
  approved: number
  archived: number
}

export type PaperListSort = 'latest' | 'citations' | 'relevance'
export type PaperBrowseScope = 'public' | 'institution'

export interface ResolvedPaperListScope {
  scope: PaperBrowseScope
  institutionId: string | null
  labId: string | null
}

export const isPendingReviewStatus = (status: PaperReviewStatus): boolean => {
  return status === 'pending_review'
}

export const normalizeReviewStatus = (status: unknown): PaperReviewStatus => {
  if (
    status === 'draft' ||
    status === 'pending_review' ||
    status === 'changes_requested' ||
    status === 'approved' ||
    status === 'archived'
  ) {
    return status
  }

  return 'pending_review'
}

export const buildClaimScopeWhere = (paperId: string, scope: PaperScope) => {
  return {
    paperId,
    institutionId: scope.institutionId,
  }
}

export type ClaimWithReviewCase = Prisma.paper_claimsGetPayload<{
  include: { review_case: true }
}>

export const toClaimRecord = (claim: ClaimWithReviewCase): ClaimRecord => {
  return {
    id: claim.id,
    paperId: claim.paperId,
    institutionId: claim.institutionId,
    labId: claim.labId,
    reviewNodeId: claim.reviewNodeId,
    reviewWorkflowId: claim.review_case.workflowId,
    currentReviewStep: claim.review_case.currentStep,
    reviewCaseId: claim.reviewCaseId,
    submittedBy: claim.submittedBy,
    submissionId: claim.submissionId,
    review_status: claim.review_case.status,
    review_notes: claim.review_case.decision_notes,
    reviewedBy: claim.review_case.decidedBy,
    reviewedAt: claim.review_case.decidedAt,
    createdAt: claim.createdAt,
    updatedAt: claim.updatedAt,
  }
}

export const buildSubmissionSnapshot = (body: CreatePaperBody | UpdatePaperBody) => {
  return {
    title: body.title,
    abstract: body.abstract,
    doi: body.doi,
    journal_name: body.journal_name,
    publish_year: body.publish_year,
    publish_date: body.publish_date ?? null,
    paper_type: body.paper_type,
    language: body.language,
    citation_count: body.citation_count ?? null,
    pages: body.pages ?? null,
    keywords: body.keywords ?? [],
    link: body.link ?? null,
    review_node_id: 'review_node_id' in body ? (body.review_node_id ?? null) : null,
  }
}

export const mergeWhere = (
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): Record<string, unknown> => {
  if (Object.keys(left).length === 0) {
    return right
  }

  if (Object.keys(right).length === 0) {
    return left
  }

  return {
    AND: [left, right],
  }
}

export const normalizePaperListSort = (sort: unknown): PaperListSort => {
  if (sort === 'citations' || sort === 'relevance') {
    return sort
  }

  return 'latest'
}

export const normalizePaperBrowseScope = (scope: unknown): PaperBrowseScope => {
  return scope === 'institution' ? 'institution' : 'public'
}

export const normalizeSearchText = (value?: string | null): string => {
  return value?.trim().toLocaleLowerCase() ?? ''
}

export const includesIgnoreCase = (value: string | null | undefined, keyword: string): boolean => {
  if (!value || !keyword) {
    return false
  }

  return value.toLocaleLowerCase().includes(keyword)
}

export const getPaperSortTimestamp = (item: FormattedPaper): number => {
  const source = item.reviewedAt ?? item.updatedAt ?? item.createdAt
  return source ? new Date(source).getTime() : 0
}

export const matchesPaperKeyword = (item: FormattedPaper, keyword: string): boolean => {
  if (!keyword) {
    return true
  }

  return [
    item.title,
    item.abstract,
    item.doi,
    item.journal_name,
    item.institutionName,
    item.labName,
    item.keywords.join(' '),
    item.authors.map((author) => author.name).join(' '),
  ].some((field) => includesIgnoreCase(field, keyword))
}

export const calculatePaperRelevance = (item: FormattedPaper, keyword: string): number => {
  if (!keyword) {
    return 0
  }

  const normalizedTitle = normalizeSearchText(item.title)
  const normalizedDoi = normalizeSearchText(item.doi)
  const authorNames = item.authors.map((author) => normalizeSearchText(author.name))
  let score = 0

  if (normalizedTitle === keyword) score += 200
  if (normalizedTitle.startsWith(keyword)) score += 120
  if (normalizedTitle.includes(keyword)) score += 80
  if (normalizedDoi === keyword) score += 160
  if (normalizedDoi.includes(keyword)) score += 120
  if (authorNames.some((name) => name === keyword)) score += 100
  if (authorNames.some((name) => name.includes(keyword))) score += 70
  if (includesIgnoreCase(item.journal_name, keyword)) score += 40
  if (includesIgnoreCase(item.abstract, keyword)) score += 30
  if (includesIgnoreCase(item.institutionName, keyword)) score += 24
  if (includesIgnoreCase(item.labName, keyword)) score += 24
  if (item.keywords.some((value) => value.toLocaleLowerCase().includes(keyword))) score += 20
  if ((item.citation_count ?? 0) > 0) score += Math.min(item.citation_count ?? 0, 500) / 50

  return score
}

export const createEmptyReviewStatusTotals = (): ReviewStatusTotals => {
  return {
    draft: 0,
    pending_review: 0,
    changes_requested: 0,
    approved: 0,
    archived: 0,
  }
}

export const buildStatusTotalsFromEntries = <
  T extends { item: Pick<FormattedPaper, 'reviewStatus'> },
>(
  entries: T[],
): ReviewStatusTotals => {
  const totals = createEmptyReviewStatusTotals()

  for (const entry of entries) {
    totals[entry.item.reviewStatus] += 1
  }

  return totals
}

export const buildStatusTotalsFromPaperItems = (
  items: Array<Pick<FormattedPaper, 'reviewStatus'>>,
): ReviewStatusTotals => {
  const totals = createEmptyReviewStatusTotals()

  for (const item of items) {
    totals[item.reviewStatus] += 1
  }

  return totals
}

export const buildPaperClaimKeywordWhere = (paperIds: string[] | null) => {
  if (paperIds === null) {
    return {}
  }

  return {
    paperId: {
      in: paperIds.length > 0 ? paperIds : [NO_MATCH_PAPER_ID],
    },
  }
}
