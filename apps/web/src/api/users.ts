import { apiClient } from './client'
import type { AdminAccess } from '@/utils/adminAccess'

export interface ProjectExperienceItem {
  id: string
  title: string
  period: string
}

export interface PublicationItem {
  id: string
  title: string
}

export interface ManageableLabItem {
  id: string
  name: string
  slug: string
  role: string
}

export interface ManageableInstitutionItem {
  id: string
  name: string
  slug: string
  role: string
}

export interface UserInstitutionMembershipItem {
  id: string
  name: string
  slug: string
  role: string
  can_review_content: boolean
  can_import_data: boolean
}

export interface UserLabMembershipItem {
  id: string
  institutionId: string | null
  name: string
  slug: string
  role: string
}

export interface UserSearchItem {
  id: string
  username: string
  name: string
  email: string
  avatar: string | null
  degree: string | null
  college: string | null
  major: string | null
  laboratory: string | null
}

export interface UserProfile {
  id: string
  username: string
  email: string
  phone: string | null
  name: string
  avatar: string | null
  avatar_url: string | null
  gender: string | null
  grade: string | null
  degree: string | null
  college: string | null
  major: string | null
  laboratory: string | null
  bio: string | null
  research_interests: string | null
  project_experiences: ProjectExperienceItem[]
  publications: PublicationItem[]
  platform_role: string
  admin_access: AdminAccess
  manageable_labs: ManageableLabItem[]
  manageable_institutions: ManageableInstitutionItem[]
  institution_memberships: UserInstitutionMembershipItem[]
  lab_memberships: UserLabMembershipItem[]
}

export interface UpdateUserProfileBody {
  name: string
  avatar: string
  gender: string
  grade: string
  degree: string
  college: string
  major: string
  laboratory: string
  bio: string
  research_interests: string
  project_experiences: ProjectExperienceItem[]
  publications: PublicationItem[]
}

interface UserProfileResponse {
  code: 0
  data: UserProfile
}

interface CommonResponse {
  code: 0
  message: string
}

interface UserSearchResponse {
  items: UserSearchItem[]
}

interface UploadFileResponse {
  id: string
  oss_key: string
  signatureUrl: string
}

export async function getMyProfile(): Promise<UserProfile> {
  const res = await apiClient.get<UserProfileResponse>('/users/me')
  return res.data.data
}

export async function updateMyProfile(body: UpdateUserProfileBody): Promise<string> {
  const res = await apiClient.put<CommonResponse>('/users/me', body)
  return res.data.message
}

export async function changeMyPassword(oldPassword: string, newPassword: string): Promise<string> {
  const res = await apiClient.put<CommonResponse>('/users/me/password', {
    oldPassword,
    newPassword,
  })
  return res.data.message
}

export async function searchUsers(q: string, limit = 10): Promise<UserSearchItem[]> {
  const keyword = q.trim()
  if (!keyword) {
    return []
  }

  const res = await apiClient.get<UserSearchResponse>('/users/search', {
    params: {
      q: keyword,
      limit,
    },
  })
  return res.data.items
}

export async function uploadAvatar(file: File): Promise<UploadFileResponse> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('purpose', 'avatar')
  const res = await apiClient.post<UploadFileResponse>('/files/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
  return res.data
}
