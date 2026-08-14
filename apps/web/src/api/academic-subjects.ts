import { apiClient } from './client'

export interface AcademicSubjectAlias {
  alias: string
  locale: string | null
}

export interface AcademicSubjectItem {
  id: string
  code: string
  parent_id: string | null
  institution_id: string | null
  institution_slug: string | null
  name_zh: string
  name_en: string | null
  source: string
  taxonomy_version: string | null
  is_active: boolean
  sort_order: number
  aliases: AcademicSubjectAlias[]
  local_code: string | null
  scholar_count: number
  can_edit: boolean
  created_at: string
  updated_at: string
}

interface AcademicSubjectListResponse {
  code: 0
  data: { items: AcademicSubjectItem[] }
}

interface AcademicSubjectResponse {
  code: 0
  data: AcademicSubjectItem
}

export interface AcademicSubjectWriteBody {
  institution_slug?: string
  code?: string
  parent_id?: string | null
  name_zh: string
  name_en?: string | null
  aliases?: Array<{ alias: string; locale?: string }>
  sort_order?: number
  is_active?: boolean
  local_code?: string | null
}

export const listAcademicSubjects = async (options: {
  institutionSlug?: string
  includeInactive?: boolean
}): Promise<AcademicSubjectItem[]> => {
  const response = await apiClient.get<AcademicSubjectListResponse>('/v1/academic-subjects', {
    params: {
      institution_slug: options.institutionSlug,
      include_inactive: options.includeInactive,
    },
  })
  return response.data.data.items
}

export const createAcademicSubject = async (
  body: AcademicSubjectWriteBody,
): Promise<AcademicSubjectItem> => {
  const response = await apiClient.post<AcademicSubjectResponse>('/v1/academic-subjects', body)
  return response.data.data
}

export const updateAcademicSubject = async (
  id: string,
  body: Omit<AcademicSubjectWriteBody, 'institution_slug' | 'code' | 'name_zh'> & {
    name_zh?: string
  },
): Promise<AcademicSubjectItem> => {
  const response = await apiClient.patch<AcademicSubjectResponse>(
    `/v1/academic-subjects/${encodeURIComponent(id)}`,
    body,
  )
  return response.data.data
}
