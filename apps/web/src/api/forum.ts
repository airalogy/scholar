import { apiClient } from './client'

export interface ForumPost {
  id: string
  paperId: string
  userId: string
  title: string
  content: string
  like_count: number
  comment_count: number
  liked: boolean
  createdAt: string
  updatedAt: string
}

export interface ForumPostList {
  items: ForumPost[]
  total: number
}

export interface ForumComment {
  id: string
  postId: string
  userId: string
  content: string
  parentCommentId: string | null
  createdAt: string
}

export interface ForumCommentList {
  items: ForumComment[]
  total: number
}

export function listPosts(paperId: string, limit = 20, offset = 0): Promise<ForumPostList> {
  return apiClient
    .get<ForumPostList>(`/forum/papers/${paperId}/posts`, { params: { limit, offset } })
    .then((r) => r.data)
}

export function createPost(paperId: string, title: string, content: string): Promise<ForumPost> {
  return apiClient
    .post<ForumPost>(`/forum/papers/${paperId}/posts`, { title, content })
    .then((r) => r.data)
}

export function deletePost(postId: string): Promise<{ message: string }> {
  return apiClient.delete<{ message: string }>(`/forum/posts/${postId}`).then((r) => r.data)
}

export function toggleLike(postId: string): Promise<{ liked: boolean; like_count: number }> {
  return apiClient
    .post<{ liked: boolean; like_count: number }>(`/forum/posts/${postId}/like`)
    .then((r) => r.data)
}

export function listComments(postId: string, limit = 50, offset = 0): Promise<ForumCommentList> {
  return apiClient
    .get<ForumCommentList>(`/forum/posts/${postId}/comments`, { params: { limit, offset } })
    .then((r) => r.data)
}

export function createComment(
  postId: string,
  content: string,
  parentCommentId?: string,
): Promise<ForumComment> {
  return apiClient
    .post<ForumComment>(`/forum/posts/${postId}/comments`, { content, parentCommentId })
    .then((r) => r.data)
}
