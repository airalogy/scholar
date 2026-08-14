import { apiClient } from './client'

export interface BookmarkStatus {
  bookmarked: boolean
}

export interface BookmarkItem {
  id: string
  paperId: string
  createdAt: string
}

export interface BookmarkListResponse {
  items: BookmarkItem[]
  total: number
}

export function getBookmarkStatus(paperId: string): Promise<BookmarkStatus> {
  return apiClient.get<BookmarkStatus>(`/bookmarks/${paperId}`).then((r) => r.data)
}

export function addBookmark(paperId: string): Promise<BookmarkStatus> {
  return apiClient.post<BookmarkStatus>(`/bookmarks/${paperId}`).then((r) => r.data)
}

export function removeBookmark(paperId: string): Promise<BookmarkStatus> {
  return apiClient.delete<BookmarkStatus>(`/bookmarks/${paperId}`).then((r) => r.data)
}

export function listBookmarks(limit = 20, offset = 0): Promise<BookmarkListResponse> {
  return apiClient
    .get<BookmarkListResponse>('/bookmarks', { params: { limit, offset } })
    .then((r) => r.data)
}
