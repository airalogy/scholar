import { apiClient } from './client'

export type FeedbackType = 'bug_report' | 'feature_request'
export type FeedbackStatus = 'pending' | 'processed'

export interface FeedbackItem {
  id: string
  userId: string | null
  userName: string | null
  userEmail: string | null
  email: string | null
  title: string
  type: FeedbackType
  content: string
  status: FeedbackStatus
  handledBy: string | null
  handledByName: string | null
  handledAt: string | null
  createdAt: string
  updatedAt: string
}

export interface FeedbackStatusTotals {
  pending: number
  processed: number
}

export interface SubmitFeedbackPayload {
  title: string
  type: FeedbackType
  content: string
  email?: string
}

export interface FeedbackListParams {
  status?: FeedbackStatus
  type?: FeedbackType
  q?: string
  limit?: number
  offset?: number
}

export interface FeedbackListData {
  items: FeedbackItem[]
  total: number
  statusTotals: FeedbackStatusTotals
}

interface ApiDataResponse<T> {
  code: 0
  data: T
  message?: string
}

export async function submitFeedback(payload: SubmitFeedbackPayload): Promise<FeedbackItem> {
  const res = await apiClient.post<ApiDataResponse<FeedbackItem>>('/feedback/submit', payload)
  return res.data.data
}

export async function listFeedback(
  params: FeedbackListParams = {},
): Promise<FeedbackListData> {
  const res = await apiClient.get<ApiDataResponse<FeedbackListData>>('/feedback', { params })
  return res.data.data
}

export async function updateFeedbackStatus(
  id: string,
  status: FeedbackStatus,
): Promise<FeedbackItem> {
  const res = await apiClient.patch<ApiDataResponse<FeedbackItem>>(
    `/feedback/${id}/status`,
    { status },
  )
  return res.data.data
}
