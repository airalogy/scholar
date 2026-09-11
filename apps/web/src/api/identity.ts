import { apiClient, ApiError } from './client'

export type IdentityStatus = 'pending' | 'needs_information' | 'approved' | 'rejected'
export interface IdentityConflict {
  reason: 'institution_identity_conflict'
  proofToken: string
  expiresAt: string
}
export interface IdentityRequest {
  id: string
  status: IdentityStatus
  previousInternalId: string
  explanation: string
  applicantMessage: string | null
  createdAt: string
  updatedAt: string
}
export interface AdminIdentityRequest extends IdentityRequest {
  internalId: string
  name: string
  email: string
  personId: string | null
  reviewedAt: string | null
}
export interface IdentityPerson {
  id: string
  name: string
  email: string | null
  internalId: string
  userId: string | null
  is_active: boolean
}
export interface IdentityIdentifier {
  id: string
  value: string
  isPrimary: boolean
  source: string
  version: number
  revokedAt: string | null
  createdAt: string
}
export interface IdentityEvent {
  id: string
  action: string
  notes: string
  actorUserId: string | null
  createdAt: string
}
export interface IdentityPersonDetail {
  person: IdentityPerson
  identifiers: IdentityIdentifier[]
  events: IdentityEvent[]
}
export interface IdentityRequestDetail {
  request: AdminIdentityRequest
  events: IdentityEvent[]
}
interface Result<T> {
  code: number
  data: T
}
interface Page<T> {
  items: T[]
  total: number
}
export interface ApplicantIdentityData {
  internalId: string
  request: IdentityRequest | null
}

export const getIdentityConflict = (error: unknown): IdentityConflict | null => {
  if (!(error instanceof ApiError) || error.response.status !== 409) return null
  const data = (error.response.data as { data?: Partial<IdentityConflict> } | null)?.data
  if (
    data?.reason !== 'institution_identity_conflict' ||
    typeof data.proofToken !== 'string' ||
    data.proofToken.length !== 43 ||
    typeof data.expiresAt !== 'string' ||
    !Number.isFinite(Date.parse(data.expiresAt))
  )
    return null
  return { reason: data.reason, proofToken: data.proofToken, expiresAt: data.expiresAt }
}

const PROOF_CACHE_KEY = 'scholar.identity-proof'
export const cacheIdentityConflict = (conflict: IdentityConflict | null): void => {
  try {
    if (conflict) sessionStorage.setItem(PROOF_CACHE_KEY, JSON.stringify(conflict))
    else sessionStorage.removeItem(PROOF_CACHE_KEY)
  } catch {
    /* A blocked browser store must not prevent submitting a request. */
  }
}
export const restoreIdentityConflict = (): IdentityConflict | null => {
  try {
    const raw = sessionStorage.getItem(PROOF_CACHE_KEY)
    if (!raw) return null
    const candidate = getIdentityConflict(new ApiError('conflict', 409, { data: JSON.parse(raw) }))
    if (candidate && Date.parse(candidate.expiresAt) > Date.now()) return candidate
    cacheIdentityConflict(null)
  } catch {
    cacheIdentityConflict(null)
  }
  return null
}
export const identityErrorKey = (error: unknown): string => {
  const status = error instanceof ApiError ? error.response.status : 0
  return status === 401
    ? 'identity.expired'
    : status === 403
      ? 'identity.forbidden'
      : status === 409
        ? 'identity.conflict'
        : status === 429
          ? 'identity.rateLimited'
          : 'identity.failed'
}
export const getApplicantIdentityStatus = async (
  proofToken: string,
  signal?: AbortSignal,
): Promise<ApplicantIdentityData> => {
  const response = await apiClient.post<Result<ApplicantIdentityData>>(
    '/auth/institution-identity-requests/status',
    { proofToken },
    { signal, promptOnUnauthorized: false },
  )
  return response.data.data
}
export const submitApplicantIdentityRequest = async (
  body: {
    proofToken: string
    previousInternalId: string
    explanation: string
    confirmsOwnAccount: true
  },
  signal?: AbortSignal,
): Promise<ApplicantIdentityData> => {
  const response = await apiClient.post<Result<ApplicantIdentityData>>(
    '/auth/institution-identity-requests',
    body,
    { signal, promptOnUnauthorized: false },
  )
  return response.data.data
}
const base = (slug: string): string => `/v1/institutions/${encodeURIComponent(slug)}/identity`
export const listIdentityPeople = async (
  slug: string,
  search = '',
  offset = 0,
  signal?: AbortSignal,
): Promise<Page<IdentityPerson>> => {
  return (
    await apiClient.get<Result<Page<IdentityPerson>>>(`${base(slug)}/people`, {
      params: { search, offset },
      signal,
    })
  ).data.data
}
export const getIdentityPerson = async (
  slug: string,
  id: string,
  signal?: AbortSignal,
): Promise<IdentityPersonDetail> => {
  return (
    await apiClient.get<Result<IdentityPersonDetail>>(
      `${base(slug)}/people/${encodeURIComponent(id)}`,
      { signal },
    )
  ).data.data
}
export const addIdentityIdentifier = async (
  slug: string,
  personId: string,
  value: string,
  notes: string,
  signal?: AbortSignal,
): Promise<void> => {
  await apiClient.post(
    `${base(slug)}/people/${encodeURIComponent(personId)}/identifiers`,
    { value, notes },
    { signal },
  )
}
export const revokeIdentityIdentifier = async (
  slug: string,
  personId: string,
  identifierId: string,
  notes: string,
  signal?: AbortSignal,
): Promise<void> => {
  await apiClient.post(
    `${base(slug)}/people/${encodeURIComponent(personId)}/identifiers/${encodeURIComponent(identifierId)}/revoke`,
    { notes },
    { signal },
  )
}
export const listIdentityRequests = async (
  slug: string,
  status?: IdentityStatus,
  offset = 0,
  signal?: AbortSignal,
): Promise<Page<AdminIdentityRequest>> => {
  return (
    await apiClient.get<Result<Page<AdminIdentityRequest>>>(`${base(slug)}/requests`, {
      params: { status, offset },
      signal,
    })
  ).data.data
}
export const getIdentityRequest = async (
  slug: string,
  id: string,
  signal?: AbortSignal,
): Promise<IdentityRequestDetail> => {
  return (
    await apiClient.get<Result<IdentityRequestDetail>>(
      `${base(slug)}/requests/${encodeURIComponent(id)}`,
      { signal },
    )
  ).data.data
}
export const decideIdentityRequest = async (
  slug: string,
  id: string,
  body: {
    action: 'approve' | 'reject' | 'request_information'
    personId?: string
    notes: string
    applicantMessage?: string
  },
  signal?: AbortSignal,
): Promise<void> => {
  await apiClient.post(`${base(slug)}/requests/${encodeURIComponent(id)}/decision`, body, {
    signal,
  })
}
