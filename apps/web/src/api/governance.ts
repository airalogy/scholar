import { apiClient } from './client'

interface Result<T> { code: number; data: T }
export interface DirectorySource {
  id: string; key: string; name: string; enabled: boolean; authoritative: boolean
  deactivateMissing: boolean; maxDeactivationPercent: number; expectedIntervalHours: number
  lastSequence: number; lastAppliedAt: string | null; overdue: boolean
}
export interface DirectoryRun {
  id: string; sourceId: string; sequence: number; mode: string; status: string
  expectedRows: number; createdCount: number; updatedCount: number; deactivatedCount: number
  error: string | null; createdAt: string
}
export interface DirectoryState {
  policy: { admissionMode: 'sso' | 'directory'; requireAppointment: boolean }
  sources: DirectorySource[]; runs: DirectoryRun[]
}
export interface ReviewTask {
  id: string; kind: string; role: string | null; status: string; dueAt: string | null
  stage: string; round: number; material: Record<string, unknown>; canAct: boolean
}
export interface ReviewTaskDetail extends ReviewTask {
  caseId: string
  versionId: string; digest: string; previousMaterial: Record<string, unknown> | null
  history: Array<{ action: string; notes: string | null; createdAt: string }>
}
export interface ReviewApplication {
  id: string; contentType: string; subjectId: string; status: string
  rounds: Array<{ id: string; versionId: string; number: number; status: string; executionStatus: string; material: Record<string, unknown>; stages: Array<{ name: string; status: string; tasks: Array<{ id: string; status: string; exception: string | null }> }> }>
}
export interface ReviewGrant {
  id: string; personId: string; role: string; nodeId: string | null; endsAt: string | null; revokedAt: string | null
  person: { name: string; userId: string | null; is_active: boolean }
}
export interface ReviewGroup { kind: 'role' | 'authors' | 'departments'; role?: string; nodeId?: string }
export interface ReviewStage { name: string; groups: ReviewGroup[]; deadlineHours: number; ccPersonIds?: string[] }
export interface ReviewAdminState {
  nextOffset: number | null
  executionFailures: Array<{ id: string; kind: string; error: string | null; caseId: string }>
  grants: ReviewGrant[]; nodes: Array<{ id: string; name: string }>
  workflows: Array<{ key: string; name: string; steps: Array<{ resolver_config: ReviewStage }> }>
  tasks: Array<ReviewTask & { caseId: string; versionId: string; exception: string | null; personId: string | null; assignedPersonId: string | null; nodeId: string | null }>
  notifications: Array<{ status: string; _count: number }>
}
interface Page<T> { items: T[]; nextOffset: number | null }
export const governanceBase = (slug: string): string => `/v1/institutions/${encodeURIComponent(slug)}`
export const loadDirectory = async (slug: string, signal?: AbortSignal): Promise<DirectoryState> => (await apiClient.get<Result<DirectoryState>>(`${governanceBase(slug)}/directory`, { signal })).data.data
export const loadReviewAdmin = async (slug: string, signal?: AbortSignal, offset = 0, nodeSearch = ''): Promise<ReviewAdminState> => (await apiClient.get<Result<ReviewAdminState>>(`${governanceBase(slug)}/review-governance`, { signal, params: { offset, nodeSearch } })).data.data
export const loadReviewParticipants = async (slug: string, caseId: string, signal?: AbortSignal): Promise<{ versionId: string; people: Array<{ id: string; name: string }> }> => (await apiClient.get<Result<{ versionId: string; people: Array<{ id: string; name: string }> }>>(`${governanceBase(slug)}/review-governance/cases/${encodeURIComponent(caseId)}/participants`, { signal })).data.data
export const governancePost = async <T = null>(path: string, body: unknown, signal?: AbortSignal): Promise<T> => (await apiClient.post<Result<T>>(path, body, { signal, timeout: 150000 })).data.data
export const governancePut = async (path: string, body: unknown, signal?: AbortSignal): Promise<void> => { await apiClient.put(path, body, { signal }) }
export const loadReviewTasks = async (offset: number, signal?: AbortSignal): Promise<Page<ReviewTask>> => (await apiClient.get<Result<Page<ReviewTask>>>('/v1/reviews/tasks', { params: { offset }, signal })).data.data
export const loadReviewApplications = async (offset: number, signal?: AbortSignal): Promise<Page<ReviewApplication>> => (await apiClient.get<Result<Page<ReviewApplication>>>('/v1/reviews/applications', { params: { offset }, signal })).data.data
export const loadReviewTask = async (id: string, signal?: AbortSignal): Promise<ReviewTaskDetail> => (await apiClient.get<Result<ReviewTaskDetail>>(`/v1/reviews/tasks/${encodeURIComponent(id)}`, { signal })).data.data

export const stageDirectorySnapshot = async (slug: string, source: DirectorySource, rows: unknown[], mode: 'full' | 'incremental', signal?: AbortSignal): Promise<DirectoryRun> => {
  const base = `${governanceBase(slug)}/directory/sources/${source.id}/runs`
  const pageCount = Math.max(1, Math.ceil(rows.length / 500))
  const run = (await apiClient.post<Result<DirectoryRun>>(base, { sequence: source.lastSequence + 1, mode, expectedPages: pageCount, expectedRows: rows.length }, { headers: { 'Idempotency-Key': crypto.randomUUID() }, signal })).data.data
  for (let page = 1; page <= pageCount; page++) await apiClient.put(`${base}/${run.id}/pages/${page}`, { rows: rows.slice((page - 1) * 500, page * 500) }, { signal })
  return governancePost<DirectoryRun>(`${base}/${run.id}/validate`, {}, signal)
}
