import { apiClient } from './client'

export interface PaperAuthor {
  id: string
  name: string
  email: string | null
  order: number
}

export interface PaperBoundMember {
  bindingId: string
  paperId: string
  userId: string
  name: string
  avatar: string | null
  authorId: string
  authorName: string
}

export type PaperReviewStatus =
  | 'draft'
  | 'pending_review'
  | 'changes_requested'
  | 'approved'
  | 'archived'

export interface PaperResponse {
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
  authors: PaperAuthor[]
  boundMembers: PaperBoundMember[]
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
  reviewStatus: PaperReviewStatus
  reviewNotes: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface PaperStatusTotals {
  draft: number
  pending_review: number
  changes_requested: number
  approved: number
  archived: number
}

export interface PaperListResponse {
  items: PaperResponse[]
  total: number
  statusTotals: PaperStatusTotals
}

export interface SearchResultItem {
  paperId: string
  text: string
  score: number
  paper?: PaperResponse
}

export interface SearchResponse {
  items: SearchResultItem[]
}

export interface ListPapersParams {
  q?: string
  institution_id?: string
  college?: string
  lab_id?: string
  scholar_id?: string
  author_id?: string
  year_from?: number
  year_to?: number
  paper_type?: number
  language?: number
  review_status?: PaperReviewStatus
  scope?: 'public' | 'institution'
  sort?: 'latest' | 'citations' | 'relevance'
  limit?: number
  offset?: number
}

export interface ReviewQueueParams extends ListPapersParams {
  q?: string
  reviewStatus?: PaperReviewStatus
}

export interface InstitutionUploadsParams {
  institution_id: string
  lab_id?: string
  q?: string
  review_status?: PaperReviewStatus
  limit?: number
  offset?: number
}

export function listPapers(params: ListPapersParams = {}): Promise<PaperListResponse> {
  return apiClient.get<PaperListResponse>('/papers', { params }).then((r) => r.data)
}

export function listMyPapers(params: ListPapersParams = {}): Promise<PaperListResponse> {
  return apiClient.get<PaperListResponse>('/papers/my', { params }).then((r) => r.data)
}

export function listReviewQueue(params: ReviewQueueParams = {}): Promise<PaperListResponse> {
  return apiClient.get<PaperListResponse>('/papers/review-queue', { params }).then((r) => r.data)
}

export function listInstitutionUploads(params: InstitutionUploadsParams): Promise<PaperListResponse> {
  return apiClient.get<PaperListResponse>('/papers/institution-uploads', { params }).then((r) => r.data)
}

export function getPaper(id: string): Promise<PaperResponse> {
  return apiClient.get<PaperResponse>(`/papers/${id}`).then((r) => r.data)
}

export function searchPapers(q: string, limit = 50, offset = 0): Promise<SearchResponse> {
  return apiClient.get<SearchResponse>('/papers/search', { params: { q, limit, offset } }).then((r) => r.data)
}

export function reviewPaper(
  id: string,
  payload: {
    decision: 'approve' | 'request_changes'
    notes?: string
  }
): Promise<PaperResponse> {
  return apiClient.post<PaperResponse>(`/papers/claims/${id}/review`, payload).then((r) => r.data)
}

export interface UploadPaperFields {
  title: string
  doi: string
  publish_year: number
  paper_type: number
  language: number
  institution_id: string
  abstract?: string
  journal_name?: string
  citation_count?: number
  pages?: string
  keywords?: string[]
  lab_id?: string
}

interface UploadFileResponse {
  id: string
}

export async function uploadPaper(file: File, fields: UploadPaperFields): Promise<PaperResponse> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('purpose', 'paper')
  formData.append('institution_id', fields.institution_id)

  const uploadRes = await apiClient.post<UploadFileResponse>('/files/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })

  const payload = {
    ...fields,
    oss_file_id: uploadRes.data.id,
  }

  const paperRes = await apiClient.post<PaperResponse>('/papers/create', payload)
  return paperRes.data
}
