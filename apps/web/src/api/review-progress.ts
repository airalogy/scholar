import { apiClient } from './client'

export interface ProgressTask {
  id: string; kind: string; role: string | null; status: string
  personName: string | null; assignedPersonName: string | null; completedByName: string | null; nodeName: string | null
  hasPerson: boolean; hasAssignee: boolean; hasCompletedBy: boolean; hasNode: boolean
  dueAt: string | null; completedAt: string | null; overdue: boolean
  exception: string | null; canAct: boolean; candidateNames: string[]; candidateCount: number | null
}
export interface ProgressStage {
  id: string; name: string; order: number; status: string; legacy: boolean
  taskCount: number; approvedCount: number; tasks: ProgressTask[]; nextTaskOffset: number | null
}
export interface ProgressRound {
  number: number; versionId: string | null; status: string; executionStatus: string
  createdAt: string | null; completedAt: string | null; workflowName: string | null
  ruleName: string | null; ruleRevision: number | null; stages: ProgressStage[]
}
export interface ReviewProgress {
  caseId: string; title: string; contentType: string; status: string; currentRound: number
  viewer: 'administrator' | 'applicant' | 'reviewer'
  rounds: Array<{ number: number; status: string; createdAt: string | null }>
  nextRoundOffset: number | null; round: ProgressRound | null
}
export interface ProgressEvent {
  id: string; action: string; actorName: string | null; assigneeName: string | null
  roundNumber: number | null; stageName: string | null; taskId: string | null
  notes: string | null; createdAt: string
}
export interface ProgressPage<T> { items: T[]; nextOffset: number | null }
interface Result<T> { code: number; data: T }
const base = (id: string): string => `/v1/reviews/cases/${encodeURIComponent(id)}`
export const loadProgress = async (id: string, roundNumber?: number, signal?: AbortSignal, roundOffset = 0): Promise<ReviewProgress> =>
  (await apiClient.get<Result<ReviewProgress>>(`${base(id)}/progress`, { params: { roundNumber, roundOffset }, signal })).data.data
export const loadProgressHistory = async (id: string, roundNumber: number | undefined, offset: number, signal?: AbortSignal, taskId?: string): Promise<ProgressPage<ProgressEvent>> =>
  (await apiClient.get<Result<ProgressPage<ProgressEvent>>>(`${base(id)}/history`, { params: { roundNumber, offset, taskId }, signal })).data.data
export const loadProgressTasks = async (id: string, stageId: string, offset: number, signal?: AbortSignal): Promise<ProgressPage<ProgressTask>> =>
  (await apiClient.get<Result<ProgressPage<ProgressTask>>>(`${base(id)}/stages/${encodeURIComponent(stageId)}/tasks`, { params: { offset }, signal })).data.data
