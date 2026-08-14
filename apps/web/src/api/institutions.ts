import { apiClient } from './client'

export type ReviewWorkflowContentType = 'paper' | 'degree_thesis'

export interface ReviewWorkflowStep {
  order: number
  name: string
  reviewer_roles: string[]
}

export interface ReviewWorkflow {
  id: string
  content_type: ReviewWorkflowContentType
  name: string
  steps: ReviewWorkflowStep[]
  updated_at: string
}

interface ReviewWorkflowResponse {
  code: 0
  data: { workflow: ReviewWorkflow | null }
}

export const getReviewWorkflow = async (
  slug: string,
  contentType: ReviewWorkflowContentType,
): Promise<ReviewWorkflow | null> => {
  const response = await apiClient.get<ReviewWorkflowResponse>(
    `/v1/institutions/${encodeURIComponent(slug)}/review-workflows/${contentType}`,
  )
  return response.data.data.workflow
}

export const saveReviewWorkflow = async (
  slug: string,
  contentType: ReviewWorkflowContentType,
  body: { name: string; steps: Array<{ name: string; reviewer_roles: string[] }> },
): Promise<ReviewWorkflow | null> => {
  const response = await apiClient.put<ReviewWorkflowResponse>(
    `/v1/institutions/${encodeURIComponent(slug)}/review-workflows/${contentType}`,
    body,
  )
  return response.data.data.workflow
}

export type InstitutionRole = 'owner' | 'admin' | 'member'
export type InstitutionListRole = InstitutionRole | 'reviewer' | 'platform_admin'

export interface InstitutionAccess {
  platform_role: 'member' | 'platform_admin'
  institution_role: InstitutionRole | null
  can_edit_content: boolean
  can_manage_members: boolean
  can_review_content: boolean
  can_import_data: boolean
}

export interface InstitutionListItem {
  id: string
  name: string
  slug: string
  summary: string | null
  website: string | null
  role: InstitutionListRole
  labCount: number
  memberCount: number
}

export interface InstitutionCatalogItem {
  id: string
  name: string
  slug: string
  summary: string | null
  website: string | null
  labCount: number
  collegeCount: number
}

export interface InstitutionLabItem {
  id: string
  name: string
  slug: string
  college: string | null
  location: string | null
  memberCount: number
}

export interface InstitutionMembershipItem {
  userId: string
  name: string
  email: string
  avatar: string | null
  degree: string | null
  major: string | null
  role: InstitutionRole
  canReviewContent: boolean
  canImportData: boolean
  paperCount: number
  approvedPaperCount: number
}

export interface InstitutionPaperBoundMember {
  bindingId: string
  paperId: string
  userId: string
  name: string
  avatar: string | null
  authorId: string
  authorName: string
}

export type InstitutionProvisionStatus = 'pending_activation' | 'claimed' | 'disabled'
export type InstitutionJoinRequestStatus = 'pending' | 'approved' | 'rejected'

export interface InstitutionProvisionItem {
  id: string
  email: string
  name: string
  role: InstitutionRole
  canReviewContent: boolean
  canImportData: boolean
  externalId: string | null
  college: string | null
  major: string | null
  laboratory: string | null
  status: InstitutionProvisionStatus
  inviteToken: string | null
  claimedUserId: string | null
  claimedUserName: string | null
  claimedAt: string | null
  expiresAt: string | null
  createdAt: string
  updatedAt: string
}

export interface InstitutionJoinRequestItem {
  id: string
  userId: string
  userName: string
  userEmail: string
  userAvatar: string | null
  userDegree: string | null
  userMajor: string | null
  userCollege: string | null
  userLaboratory: string | null
  status: InstitutionJoinRequestStatus
  reason: string | null
  reviewNotes: string | null
  reviewedBy: string | null
  reviewedByName: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface InstitutionDetailResponse {
  id: string
  name: string
  slug: string
  summary: string | null
  website: string | null
  labCount: number
  memberCount: number
  access: InstitutionAccess
  labs: InstitutionLabItem[]
}

interface InstitutionListResponse {
  items: InstitutionListItem[]
}

interface InstitutionCatalogResponse {
  items: InstitutionCatalogItem[]
}

interface InstitutionMembershipListResponse {
  items: InstitutionMembershipItem[]
}

interface InstitutionProvisionListResponse {
  items: InstitutionProvisionItem[]
}

interface InstitutionJoinRequestListResponse {
  items: InstitutionJoinRequestItem[]
}

interface InstitutionPaperBoundMemberListResponse {
  items: InstitutionPaperBoundMember[]
}

interface MyInstitutionJoinRequestResponse {
  item: InstitutionJoinRequestItem | null
}

export interface UpdateInstitutionBody {
  summary?: string
  website?: string
}

export interface UpsertInstitutionProvisionBody {
  email: string
  name: string
  role: InstitutionRole
  can_review_content?: boolean
  can_import_data?: boolean
  externalId?: string
  college?: string
  major?: string
  laboratory?: string
  expiresInDays?: number
}

export interface CreateInstitutionJoinRequestBody {
  reason?: string
}

export interface ReviewInstitutionJoinRequestBody {
  status: 'approved' | 'rejected'
  notes?: string
}

export interface BindInstitutionPaperAuthorBody {
  paperId: string
  authorId: string
  userId: string
}

export type InstitutionImportKind = 'papers' | 'scholars'
export type InstitutionImportStatus =
  | 'processing'
  | 'pending_review'
  | 'completed'
  | 'completed_with_errors'
  | 'rejected'
  | 'failed'
export type InstitutionImportItemAction = 'created' | 'updated' | 'unchanged' | 'pending' | 'error'
export type InstitutionImportItemStatus = 'completed' | 'pending' | 'rejected' | 'error'

export interface PaperImportItem {
  title: string
  doi: string
  publish_year?: number
  paper_type?: number
  language?: number
  abstract?: string
  journal_name?: string
  publish_date?: string
  citation_count?: number
  pages?: string
  link?: string
  keywords?: string[]
}

export interface ScholarImportItem {
  external_id: string
  name: string
  avatar?: string
  college?: string[]
  title?: string
  lab?: string
  office?: string
  email?: string
  phone?: string
  bio?: string
  join_year?: number
  research_directions?: Array<{ name: string, description?: string }>
  education?: Array<{ school: string, degree: string, period: string }>
  achievements?: Array<{
    phase: string
    label: string
    years: Array<{
      year: string
      items: Array<{ title: string, description?: string }>
    }>
  }>
  research_timeline?: Array<{
    period_start_year: number
    period_end_year: number
    paper_count: number
    papers_with_abstract: number
    papers_without_abstract: number
    focus_summary: string
    focus_tags?: unknown
    source_papers?: unknown
  }>
  letter_index?: string
  subjects?: string[]
  subject_codes?: string[]
  paper_dois?: string[]
}

export interface InstitutionImportResultItem {
  index: number
  key: string | null
  targetId: string | null
  action: InstitutionImportItemAction
  status: InstitutionImportItemStatus
  message: string | null
}

export interface InstitutionImportRecord {
  id: string
  institutionId: string
  kind: InstitutionImportKind
  status: InstitutionImportStatus
  actorType: 'user' | 'integration'
  summary: {
    total: number
    created: number
    updated: number
    unchanged: number
    pending: number
    errors: number
  }
  reviewedBy: string | null
  reviewNotes: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
  items: InstitutionImportResultItem[]
}

export type InstitutionApiCredentialScope =
  | 'papers:import'
  | 'scholars:import'
  | 'imports:read'

export interface InstitutionApiCredential {
  id: string
  name: string
  clientId: string
  scopes: InstitutionApiCredentialScope[]
  status: 'active' | 'expired' | 'revoked'
  expiresAt: string
  revokedAt: string | null
  lastUsedAt: string | null
  lastUsedIp: string | null
  createdAt: string
  updatedAt: string
}

interface ApiDataResponse<T> {
  code: 0
  data: T
}

export const listInstitutions = (): Promise<InstitutionListItem[]> => {
  return apiClient.get<InstitutionListResponse>('/institutions').then((r) => r.data.items)
}

export const listInstitutionCatalog = (): Promise<InstitutionCatalogItem[]> => {
  return apiClient.get<InstitutionCatalogResponse>('/institutions/catalog').then((r) => r.data.items)
}

export const getInstitution = (slug: string): Promise<InstitutionDetailResponse> => {
  return apiClient.get<InstitutionDetailResponse>(`/institutions/${encodeURIComponent(slug)}`).then((r) => r.data)
}

export const updateInstitution = (
  slug: string,
  body: UpdateInstitutionBody,
): Promise<InstitutionDetailResponse> => {
  return apiClient.put<InstitutionDetailResponse>(`/institutions/${encodeURIComponent(slug)}`, body)
    .then((r) => r.data)
}

export const listInstitutionMemberships = (slug: string): Promise<InstitutionMembershipItem[]> => {
  return apiClient.get<InstitutionMembershipListResponse>(
    `/institutions/${encodeURIComponent(slug)}/memberships`,
  ).then((r) => r.data.items)
}

export const upsertInstitutionMembership = (
  slug: string,
  payload: {
    userId: string
    role: InstitutionRole
    can_review_content?: boolean
    can_import_data?: boolean
  },
): Promise<InstitutionMembershipItem[]> => {
  return apiClient.post<InstitutionMembershipListResponse>(
    `/institutions/${encodeURIComponent(slug)}/memberships`,
    payload,
  ).then((r) => r.data.items)
}

export const removeInstitutionMembership = (
  slug: string,
  userId: string,
): Promise<InstitutionMembershipItem[]> => {
  return apiClient.delete<InstitutionMembershipListResponse>(
    `/institutions/${encodeURIComponent(slug)}/memberships/${encodeURIComponent(userId)}`,
  ).then((r) => r.data.items)
}

export const bindInstitutionPaperAuthor = (
  slug: string,
  payload: BindInstitutionPaperAuthorBody,
): Promise<InstitutionPaperBoundMember[]> => {
  return apiClient.post<InstitutionPaperBoundMemberListResponse>(
    `/institutions/${encodeURIComponent(slug)}/paper-author-bindings`,
    payload,
  ).then((r) => r.data.items)
}

export const removeInstitutionPaperAuthorBinding = (
  slug: string,
  bindingId: string,
): Promise<InstitutionPaperBoundMember[]> => {
  return apiClient.delete<InstitutionPaperBoundMemberListResponse>(
    `/institutions/${encodeURIComponent(slug)}/paper-author-bindings/${encodeURIComponent(bindingId)}`,
  ).then((r) => r.data.items)
}

export const importInstitutionPapers = async (
  slug: string,
  items: PaperImportItem[],
  idempotencyKey: string,
): Promise<InstitutionImportRecord> => {
  const response = await apiClient.post<ApiDataResponse<InstitutionImportRecord>>(
    `/v1/institutions/${encodeURIComponent(slug)}/imports/papers`,
    { items },
    {
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
      timeout: 120_000,
    },
  )
  return response.data.data
}

export const importInstitutionScholars = async (
  slug: string,
  items: ScholarImportItem[],
  idempotencyKey: string,
): Promise<InstitutionImportRecord> => {
  const response = await apiClient.post<ApiDataResponse<InstitutionImportRecord>>(
    `/v1/institutions/${encodeURIComponent(slug)}/imports/scholars`,
    { items },
    {
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
      timeout: 120_000,
    },
  )
  return response.data.data
}

export const listInstitutionImports = async (
  slug: string,
  params?: { limit?: number, offset?: number, kind?: InstitutionImportKind },
): Promise<{ items: Omit<InstitutionImportRecord, 'items'>[], total: number }> => {
  const response = await apiClient.get<ApiDataResponse<{
    items: Omit<InstitutionImportRecord, 'items'>[]
    total: number
  }>>(
    `/v1/institutions/${encodeURIComponent(slug)}/imports`,
    { params },
  )
  return response.data.data
}

export const getInstitutionImport = async (
  slug: string,
  importId: string,
): Promise<InstitutionImportRecord> => {
  const response = await apiClient.get<ApiDataResponse<InstitutionImportRecord>>(
    `/v1/institutions/${encodeURIComponent(slug)}/imports/${encodeURIComponent(importId)}`,
  )
  return response.data.data
}

export const reviewInstitutionImport = async (
  slug: string,
  importId: string,
  payload: {
    status: 'approved' | 'rejected'
    notes?: string
  },
): Promise<InstitutionImportRecord> => {
  const response = await apiClient.post<ApiDataResponse<InstitutionImportRecord>>(
    `/v1/institutions/${encodeURIComponent(slug)}/imports/${encodeURIComponent(importId)}/review`,
    payload,
  )
  return response.data.data
}

export const listInstitutionApiCredentials = async (
  slug: string,
): Promise<InstitutionApiCredential[]> => {
  const response = await apiClient.get<ApiDataResponse<{ items: InstitutionApiCredential[] }>>(
    `/institutions/${encodeURIComponent(slug)}/api-credentials`,
  )
  return response.data.data.items
}

export const createInstitutionApiCredential = async (
  slug: string,
  payload: {
    name: string
    scopes: InstitutionApiCredentialScope[]
    expiresInDays?: number
  },
): Promise<{ credential: InstitutionApiCredential, clientSecret: string }> => {
  const response = await apiClient.post<ApiDataResponse<{
    credential: InstitutionApiCredential
    clientSecret: string
  }>>(
    `/institutions/${encodeURIComponent(slug)}/api-credentials`,
    payload,
  )
  return response.data.data
}

export const rotateInstitutionApiCredential = async (
  slug: string,
  credentialId: string,
  expiresInDays?: number,
): Promise<{ credential: InstitutionApiCredential, clientSecret: string }> => {
  const response = await apiClient.post<ApiDataResponse<{
    credential: InstitutionApiCredential
    clientSecret: string
  }>>(
    `/institutions/${encodeURIComponent(slug)}/api-credentials/${encodeURIComponent(credentialId)}/rotate`,
    expiresInDays ? { expiresInDays } : {},
  )
  return response.data.data
}

export const revokeInstitutionApiCredential = async (
  slug: string,
  credentialId: string,
): Promise<InstitutionApiCredential[]> => {
  const response = await apiClient.delete<ApiDataResponse<{ items: InstitutionApiCredential[] }>>(
    `/institutions/${encodeURIComponent(slug)}/api-credentials/${encodeURIComponent(credentialId)}`,
  )
  return response.data.data.items
}

export const listInstitutionProvisions = (slug: string): Promise<InstitutionProvisionItem[]> => {
  return apiClient.get<InstitutionProvisionListResponse>(
    `/institutions/${encodeURIComponent(slug)}/provisions`,
  ).then((r) => r.data.items)
}

export const getMyInstitutionJoinRequest = (
  slug: string,
): Promise<InstitutionJoinRequestItem | null> => {
  return apiClient.get<MyInstitutionJoinRequestResponse>(
    `/institutions/${encodeURIComponent(slug)}/join-requests/me`,
  ).then((r) => r.data.item)
}

export const createInstitutionJoinRequest = (
  slug: string,
  payload: CreateInstitutionJoinRequestBody,
): Promise<InstitutionJoinRequestItem | null> => {
  return apiClient.post<MyInstitutionJoinRequestResponse>(
    `/institutions/${encodeURIComponent(slug)}/join-requests`,
    payload,
  ).then((r) => r.data.item)
}

export const listInstitutionJoinRequests = (slug: string): Promise<InstitutionJoinRequestItem[]> => {
  return apiClient.get<InstitutionJoinRequestListResponse>(
    `/institutions/${encodeURIComponent(slug)}/join-requests`,
  ).then((r) => r.data.items)
}

export const reviewInstitutionJoinRequest = (
  slug: string,
  requestId: string,
  payload: ReviewInstitutionJoinRequestBody,
): Promise<InstitutionJoinRequestItem[]> => {
  return apiClient.post<InstitutionJoinRequestListResponse>(
    `/institutions/${encodeURIComponent(slug)}/join-requests/${encodeURIComponent(requestId)}/review`,
    payload,
  ).then((r) => r.data.items)
}

export const upsertInstitutionProvision = (
  slug: string,
  payload: UpsertInstitutionProvisionBody,
): Promise<InstitutionProvisionItem[]> => {
  return apiClient.post<InstitutionProvisionListResponse>(
    `/institutions/${encodeURIComponent(slug)}/provisions`,
    payload,
  ).then((r) => r.data.items)
}

export const disableInstitutionProvision = (
  slug: string,
  provisionId: string,
): Promise<InstitutionProvisionItem[]> => {
  return apiClient.delete<InstitutionProvisionListResponse>(
    `/institutions/${encodeURIComponent(slug)}/provisions/${encodeURIComponent(provisionId)}`,
  ).then((r) => r.data.items)
}
