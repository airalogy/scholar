import { apiClient } from './client'

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export type ChatMode = 'general' | 'scholar_recommendation'

export interface ChatResponse {
  id: string
  role: 'assistant'
  content: string
}

export interface ChatListItem {
  id: string
  mode: ChatMode
  title: string
  createdAt: string
  updatedAt: string
}

export interface ChatListResponse {
  items: ChatListItem[]
  total: number
}

export interface ChatDetail {
  id: string
  mode: ChatMode
  messages: ChatMessage[]
  createdAt: string
  updatedAt: string
}

export function sendChat(
  messages: ChatMessage[],
  chatId?: string,
  mode: ChatMode = 'general',
): Promise<ChatResponse> {
  return apiClient
    .post<ChatResponse>('/chat', { messages, id: chatId, mode, stream: false })
    .then((r) => r.data)
}

export async function sendChatStream(
  messages: ChatMessage[],
  chatId: string | undefined,
  callbacks: {
    onId?: (id: string) => void
    onChunk?: (content: string) => void
    onDone?: () => void
    onError?: (err: Error) => void
  },
  mode: ChatMode = 'general',
  signal?: AbortSignal,
): Promise<void> {
  try {
    const response = await apiClient.postStream('/chat', {
      messages,
      id: chatId,
      mode,
      stream: true,
    }, {
      signal,
    })

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No response body')
    }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') {
          callbacks.onDone?.()
          return
        }
        try {
          const parsed = JSON.parse(data) as { id?: unknown; content?: unknown }
          if (typeof parsed.id === 'string') callbacks.onId?.(parsed.id)
          if (typeof parsed.content === 'string') callbacks.onChunk?.(parsed.content)
        } catch {
          // Ignore a malformed event and continue reading subsequent events.
        }
      }
    }

    callbacks.onDone?.()
  } catch (error) {
    if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      return
    }

    callbacks.onError?.(error instanceof Error ? error : new Error(String(error)))
  }
}

export function listChats(
  limit = 20,
  offset = 0,
  mode: ChatMode = 'general',
): Promise<ChatListResponse> {
  return apiClient
    .get<ChatListResponse>('/chat', { params: { limit, offset, mode } })
    .then((r) => r.data)
}

export function getChat(id: string): Promise<ChatDetail> {
  return apiClient.get<ChatDetail>(`/chat/${id}`).then((r) => r.data)
}

export function deleteChat(id: string): Promise<{ message: string }> {
  return apiClient.delete<{ message: string }>(`/chat/${id}`).then((r) => r.data)
}
