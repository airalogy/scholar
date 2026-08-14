import { apiClient } from './client'

export interface AuthorResponse {
  id: string
  name: string
  email: string | null
  paperCount: number
}

export interface AuthorListResponse {
  items: AuthorResponse[]
  total: number
}

export function searchAuthors(q?: string, limit = 20, offset = 0): Promise<AuthorListResponse> {
  return apiClient
    .get<AuthorListResponse>('/authors', { params: { q, limit, offset } })
    .then((r) => r.data)
}

export function getAuthor(id: string): Promise<AuthorResponse> {
  return apiClient.get<AuthorResponse>(`/authors/${id}`).then((r) => r.data)
}
