import { API_BASE_URL, apiClient } from './client'
import { resolveSafeHttpUrl } from '@/utils/url'

export const FILE_REQUEST_TIMEOUT_MS = 180_000
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024

export interface UploadedFile {
  id: string
  oss_key: string
  signatureUrl: string
  original_name: string
  file_size: number
  mime_type: string
}

export const uploadFile = async (
  file: File,
  purpose: 'paper' | 'thesis' | 'avatar',
  institutionId?: string,
  signal?: AbortSignal,
): Promise<UploadedFile> => {
  const formData = new FormData()
  formData.append('purpose', purpose)
  if (institutionId) formData.append('institution_id', institutionId)
  // Some browsers omit PDF MIME metadata. The server still checks the content signature.
  const upload = purpose !== 'avatar' && file.type === '' && /\.pdf$/iu.test(file.name)
    ? new File([file], file.name, { type: 'application/pdf', lastModified: file.lastModified })
    : file
  formData.append('file', upload)
  const response = await apiClient.post<UploadedFile>('/files/upload', formData, {
    timeout: FILE_REQUEST_TIMEOUT_MS,
    signal,
  })
  return response.data
}

export const loadPdfSource = async (
  fileUrl: string,
  fileId: string | null | undefined,
  signal: AbortSignal,
): Promise<{ data: Uint8Array } | { url: string }> => {
  let source = fileUrl
  if (fileId) {
    const response = await apiClient.get<{ signatureUrl: string }>(`/files/preview/${encodeURIComponent(fileId)}`, { signal })
    source = response.data.signatureUrl
  }
  const safeUrl = resolveSafeHttpUrl(source)
  if (!safeUrl) throw new Error('Invalid PDF URL')

  const base = new URL(API_BASE_URL, window.location.href)
  const resolved = new URL(safeUrl, window.location.href)
  const prefix = base.pathname.replace(/\/$/u, '')
  let apiPath: string | undefined
  // The API emits canonical relative access links even when deployed on a custom API base.
  if (safeUrl.startsWith('/api/files/access/')) apiPath = safeUrl.slice(4)
  else if (resolved.origin === base.origin && resolved.pathname.startsWith(`${prefix}/files/access/`)) {
    apiPath = resolved.pathname.slice(prefix.length) + resolved.search
  }
  if (apiPath) {
    // Include the login session for authenticated deployments, and fetch the complete
    // watermarked PDF once rather than creating distinct documents for range requests.
    const response = await apiClient.getBinary(apiPath, {
      signal,
      timeout: FILE_REQUEST_TIMEOUT_MS,
      promptOnUnauthorized: false,
    })
    return { data: response.data }
  }
  // External storage URLs must never receive the Scholar session token.
  return { url: safeUrl }
}
