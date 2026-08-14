import { apiClient } from './client'

export type DegreeThesisStatus =
  | 'draft'
  | 'pending_review'
  | 'changes_requested'
  | 'approved'
  | 'archived'
export type DegreeThesisVisibility = 'public' | 'institution' | 'restricted'

export interface DegreeThesisVersion {
  id: string
  version_number: number
  title: string
  title_en: string | null
  author_name: string
  student_id: string | null
  training_unit: string
  major: string
  degree_category: string
  award_year: number
  advisors: string[]
  abstract: string | null
  keywords: string[]
  language: string
  visibility: DegreeThesisVisibility
  confidentiality_until: string | null
  file_id: string | null
  preview_url: string | null
  download_url: string | null
  created_at: string
  submitted_at: string | null
}

export interface ContentReviewStep {
  id: string
  order: number
  name: string
  status: string
  eligible_reviewer_user_ids: string[]
  resolution_notes: string | null
  review_notes: string | null
  reviewed_by: string | null
  reviewed_at: string | null
}

export interface ContentReviewAction {
  id: string
  action: string
  from_status: string | null
  to_status: string
  version_id: string | null
  notes: string | null
  actor_id: string
  actor_name: string
  step_order: number | null
  step_name: string | null
  created_at: string
}

export interface DegreeThesis {
  id: string
  record_code: string
  institution_reference: string | null
  institution_id: string
  institution_name: string
  submitted_by: string | null
  status: DegreeThesisStatus
  current_step: number | null
  decision_notes: string | null
  submitted_at: string | null
  published_at: string | null
  created_at: string
  updated_at: string
  can_edit: boolean
  can_review: boolean
  current_version: DegreeThesisVersion | null
  published_version: DegreeThesisVersion | null
  versions: DegreeThesisVersion[]
  review_steps: ContentReviewStep[]
  review_history: ContentReviewAction[]
}

export interface DegreeThesisInput {
  institution_reference?: string | null
  title: string
  title_en?: string
  author_name: string
  student_id?: string
  training_unit: string
  major: string
  degree_category: string
  award_year: number
  advisors: string[]
  abstract?: string
  keywords: string[]
  language: string
  visibility: DegreeThesisVisibility
  confidentiality_until?: string
  file_id?: string
}

export interface CreateDegreeThesisInput extends DegreeThesisInput {
  institution_id: string
  review_node_id?: string
}

export interface DegreeThesisListQuery {
  q?: string
  institution_id?: string
  training_unit?: string
  major?: string
  degree_category?: string
  year_from?: number
  year_to?: number
  limit?: number
  offset?: number
}

interface ApiEnvelope<T> {
  code: 0
  data: T
}

export interface DegreeThesisList {
  items: DegreeThesis[]
  total: number
}

export interface DegreeThesisFacets {
  training_units: string[]
  majors: string[]
  degree_categories: string[]
  award_years: number[]
}

export const listDegreeTheses = async (
  query: DegreeThesisListQuery,
): Promise<DegreeThesisList> => {
  const response = await apiClient.get<ApiEnvelope<DegreeThesisList>>('/v1/theses', {
    params: query,
  })
  return response.data.data
}

export const getDegreeThesisFacets = async (): Promise<DegreeThesisFacets> => {
  const response = await apiClient.get<ApiEnvelope<DegreeThesisFacets>>('/v1/theses/facets')
  return response.data.data
}

export const listMyDegreeTheses = async (): Promise<DegreeThesisList> => {
  const response = await apiClient.get<ApiEnvelope<DegreeThesisList>>('/v1/theses/mine')
  return response.data.data
}

export const listDegreeThesisReviewQueue = async (
  query: Pick<DegreeThesisListQuery, 'q' | 'institution_id' | 'limit' | 'offset'>,
): Promise<DegreeThesisList> => {
  const response = await apiClient.get<ApiEnvelope<DegreeThesisList>>(
    '/v1/theses/review-queue',
    { params: query },
  )
  return response.data.data
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

export const getDegreeThesis = async (identifier: string): Promise<DegreeThesis> => {
  const path = UUID_PATTERN.test(identifier)
    ? `/v1/theses/${encodeURIComponent(identifier)}`
    : `/v1/theses/by-code/${encodeURIComponent(identifier.toLocaleUpperCase('en-US'))}`
  const response = await apiClient.get<ApiEnvelope<DegreeThesis>>(
    path,
  )
  return response.data.data
}

export const createDegreeThesis = async (
  body: CreateDegreeThesisInput,
): Promise<DegreeThesis> => {
  const response = await apiClient.post<ApiEnvelope<DegreeThesis>>('/v1/theses', body)
  return response.data.data
}

export const updateDegreeThesis = async (
  id: string,
  body: DegreeThesisInput,
): Promise<DegreeThesis> => {
  const response = await apiClient.put<ApiEnvelope<DegreeThesis>>(
    `/v1/theses/${encodeURIComponent(id)}`,
    body,
  )
  return response.data.data
}

export const submitDegreeThesis = async (id: string): Promise<DegreeThesis> => {
  const response = await apiClient.post<ApiEnvelope<DegreeThesis>>(
    `/v1/theses/${encodeURIComponent(id)}/submit`,
  )
  return response.data.data
}

export const reviewDegreeThesis = async (
  id: string,
  decision: 'approve' | 'request_changes',
  notes?: string,
): Promise<DegreeThesis> => {
  const response = await apiClient.post<ApiEnvelope<DegreeThesis>>(
    `/v1/theses/${encodeURIComponent(id)}/review`,
    {
      decision,
      notes,
    },
  )
  return response.data.data
}

export const uploadDegreeThesisFile = async (
  file: File,
  institutionId: string,
): Promise<string> => {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('purpose', 'thesis')
  formData.append('institution_id', institutionId)
  const response = await apiClient.post<{ id: string }>('/files/upload', formData)
  return response.data.id
}
