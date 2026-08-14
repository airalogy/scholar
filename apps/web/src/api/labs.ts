import { apiClient } from './client'
import type { ResearchDirection } from './scholars'

export type LabRole = 'owner' | 'admin' | 'member'

export interface LabScholar {
  id: string
  name: string
  avatar: string | null
  title: string | null
  college: string[]
  research_directions: ResearchDirection[]
}

export interface LabMember {
  id: string
  name: string
  avatar: string | null
  degree: string | null
  major: string | null
  research_interests: string | null
}

export interface LabPaper {
  id: string
  title: string
  journal_name: string | null
  publish_year: number | null
  doi: string
  keywords: string[]
  authors: string[]
}

export interface LabAccess {
  platform_role: string
  institution_role: string | null
  lab_role: string | null
  can_edit_content: boolean
  can_manage_members: boolean
  can_review_content: boolean
}

export interface LabMembershipItem {
  userId: string
  name: string
  email: string
  avatar: string | null
  degree: string | null
  major: string | null
  role: LabRole
}

export interface LabDetailResponse {
  id: string
  institutionId: string | null
  institutionName: string | null
  name: string
  slug: string
  summary: string | null
  college: string | null
  location: string | null
  website: string | null
  scholarCount: number
  memberCount: number
  representativePaperCount: number
  access: LabAccess
  scholars: LabScholar[]
  members: LabMember[]
  representativePapers: LabPaper[]
}

interface LabMembershipListResponse {
  items: LabMembershipItem[]
}

export interface UpdateLabBody {
  summary?: string
  college?: string
  location?: string
  website?: string
}

export const getLab = (slug: string): Promise<LabDetailResponse> => {
  return apiClient.get<LabDetailResponse>(`/labs/${encodeURIComponent(slug)}`).then((r) => r.data)
}

export const updateLab = (slug: string, body: UpdateLabBody): Promise<LabDetailResponse> => {
  return apiClient.put<LabDetailResponse>(`/labs/${encodeURIComponent(slug)}`, body).then((r) => r.data)
}

export const listLabMemberships = (slug: string): Promise<LabMembershipItem[]> => {
  return apiClient.get<LabMembershipListResponse>(`/labs/${encodeURIComponent(slug)}/memberships`)
    .then((r) => r.data.items)
}

export const upsertLabMembership = (
  slug: string,
  payload: { userId: string, role: LabRole },
): Promise<LabMembershipItem[]> => {
  return apiClient.post<LabMembershipListResponse>(`/labs/${encodeURIComponent(slug)}/memberships`, payload)
    .then((r) => r.data.items)
}

export const removeLabMembership = (slug: string, userId: string): Promise<LabMembershipItem[]> => {
  return apiClient.delete<LabMembershipListResponse>(
    `/labs/${encodeURIComponent(slug)}/memberships/${encodeURIComponent(userId)}`,
  ).then((r) => r.data.items)
}
