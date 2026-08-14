import { isDevAuthBypassEnabled } from '@/utils/devAuth'

type QueryValue = string | number | boolean | null | undefined

export interface ApiRequestConfig {
  params?: object
  headers?: HeadersInit
  timeout?: number
  signal?: AbortSignal
}

export interface ApiStreamRequestConfig {
  headers?: HeadersInit
  signal?: AbortSignal
}

export interface ApiResponse<T> {
  data: T
  status: number
  headers: Headers
}

export class ApiError<T = unknown> extends Error {
  readonly response: {
    status: number
    data: T
  }

  constructor(message: string, status: number, data: T) {
    super(message)
    this.name = 'ApiError'
    this.response = { status, data }
  }
}

interface ApiClientDependencies {
  baseUrl: string
  fetcher: typeof fetch
  getToken: () => string | null
  onUnauthorized: () => void
}

interface ApiClient {
  get<T>(path: string, config?: ApiRequestConfig): Promise<ApiResponse<T>>
  post<T>(path: string, body?: unknown, config?: ApiRequestConfig): Promise<ApiResponse<T>>
  put<T>(path: string, body?: unknown, config?: ApiRequestConfig): Promise<ApiResponse<T>>
  patch<T>(path: string, body?: unknown, config?: ApiRequestConfig): Promise<ApiResponse<T>>
  delete<T>(path: string, config?: ApiRequestConfig): Promise<ApiResponse<T>>
  postStream(path: string, body: unknown, config?: ApiStreamRequestConfig): Promise<Response>
}

const DEFAULT_TIMEOUT_MS = 30_000

const buildRequestUrl = (
  baseUrl: string,
  path: string,
  params?: ApiRequestConfig['params'],
): string => {
  const normalizedBaseUrl = baseUrl.replace(/\/$/u, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const url = `${normalizedBaseUrl}${normalizedPath}`

  if (!params) {
    return url
  }

  const query = new URLSearchParams()
  for (const [key, rawValue] of Object.entries(params as Record<
    string,
    QueryValue | QueryValue[]
  >)) {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue]
    for (const value of values) {
      if (value !== null && value !== undefined) {
        query.append(key, String(value))
      }
    }
  }

  const queryString = query.toString()
  return queryString ? `${url}?${queryString}` : url
}

const parseResponseBody = async (response: Response): Promise<unknown> => {
  const text = await response.text()
  if (!text) {
    return undefined
  }

  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

const buildRequestBody = (
  body: unknown,
  headers: Headers,
): BodyInit | null | undefined => {
  if (body === undefined || body === null) {
    return body
  }

  if (body instanceof FormData || body instanceof Blob || typeof body === 'string') {
    if (body instanceof FormData) {
      headers.delete('Content-Type')
    }
    return body
  }

  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  return JSON.stringify(body)
}

export const createApiClient = (dependencies: ApiClientDependencies): ApiClient => {
  const createHeaders = (providedHeaders?: HeadersInit): Headers => {
    const headers = new Headers(providedHeaders)
    const token = dependencies.getToken()
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }
    return headers
  }

  const assertResponseOk = async (response: Response): Promise<void> => {
    if (response.ok) {
      return
    }

    const data = await parseResponseBody(response)
    if (response.status === 401) {
      dependencies.onUnauthorized()
    }

    const message =
      typeof data === 'object' && data !== null && 'message' in data
        ? String(data.message)
        : `HTTP ${response.status}`
    throw new ApiError(message, response.status, data)
  }

  const request = async <T>(
    method: string,
    path: string,
    body?: unknown,
    config: ApiRequestConfig = {},
  ): Promise<ApiResponse<T>> => {
    const headers = createHeaders(config.headers)

    const controller = new AbortController()
    const abortRequest = (): void => controller.abort()
    config.signal?.addEventListener('abort', abortRequest, { once: true })
    const timeout = globalThis.setTimeout(
      () => controller.abort(),
      config.timeout ?? DEFAULT_TIMEOUT_MS,
    )

    try {
      const response = await dependencies.fetcher(
        buildRequestUrl(dependencies.baseUrl, path, config.params),
        {
          method,
          headers,
          body: buildRequestBody(body, headers),
          signal: controller.signal,
        },
      )
      await assertResponseOk(response)
      const data = await parseResponseBody(response)

      return {
        data: data as T,
        status: response.status,
        headers: response.headers,
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new ApiError(config.signal?.aborted ? 'Request cancelled' : 'Request timed out', 0, null)
      }
      throw error
    } finally {
      globalThis.clearTimeout(timeout)
      config.signal?.removeEventListener('abort', abortRequest)
    }
  }

  const postStream = async (
    path: string,
    body: unknown,
    config: ApiStreamRequestConfig = {},
  ): Promise<Response> => {
    const headers = createHeaders(config.headers)
    const response = await dependencies.fetcher(buildRequestUrl(dependencies.baseUrl, path), {
      method: 'POST',
      headers,
      body: buildRequestBody(body, headers),
      signal: config.signal,
    })
    await assertResponseOk(response)
    return response
  }

  return {
    get: <T>(path: string, config?: ApiRequestConfig) => request<T>('GET', path, undefined, config),
    post: <T>(path: string, body?: unknown, config?: ApiRequestConfig) =>
      request<T>('POST', path, body, config),
    put: <T>(path: string, body?: unknown, config?: ApiRequestConfig) =>
      request<T>('PUT', path, body, config),
    patch: <T>(path: string, body?: unknown, config?: ApiRequestConfig) =>
      request<T>('PATCH', path, body, config),
    delete: <T>(path: string, config?: ApiRequestConfig) =>
      request<T>('DELETE', path, undefined, config),
    postStream,
  }
}

export const apiClient = createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL?.trim() || '/api',
  fetcher: globalThis.fetch.bind(globalThis),
  getToken: () => localStorage.getItem('token'),
  onUnauthorized: () => {
    if (isDevAuthBypassEnabled) {
      return
    }
    localStorage.removeItem('token')
    window.dispatchEvent(new CustomEvent('auth:unauthorized'))
  },
})
