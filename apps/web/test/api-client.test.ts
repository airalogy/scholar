import { describe, expect, it } from 'vitest'
import { createApiClient } from '../src/api/client'

describe('API client', () => {
  it('adds query parameters and the access token', async () => {
    let requestUrl = ''
    let requestHeaders = new Headers()
    const fetcher: typeof fetch = async (input, init) => {
      requestUrl = String(input)
      requestHeaders = new Headers(init?.headers)
      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    const client = createApiClient({
      baseUrl: '/api/',
      fetcher,
      getToken: () => 'test-token',
      onUnauthorized: () => undefined,
    })

    const response = await client.get<{ items: unknown[] }>('/papers', {
      params: { q: 'gene therapy', limit: 20, empty: undefined },
    })

    expect(requestUrl).toBe('/api/papers?q=gene+therapy&limit=20')
    expect(requestHeaders.get('Authorization')).toBe('Bearer test-token')
    expect(response.data).toEqual({ items: [] })
  })

  it('serializes JSON while preserving browser-generated multipart boundaries', async () => {
    const requests: RequestInit[] = []
    const fetcher: typeof fetch = async (_input, init) => {
      requests.push(init ?? {})
      return new Response('{}', { status: 200 })
    }
    const client = createApiClient({
      baseUrl: '/api',
      fetcher,
      getToken: () => null,
      onUnauthorized: () => undefined,
    })

    await client.post('/json', { name: 'Scholar' })
    const formData = new FormData()
    formData.append('file', new Blob(['paper']), 'paper.pdf')
    await client.post('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })

    expect(new Headers(requests[0].headers).get('Content-Type')).toBe('application/json')
    expect(requests[0].body).toBe(JSON.stringify({ name: 'Scholar' }))
    expect(new Headers(requests[1].headers).has('Content-Type')).toBe(false)
    expect(requests[1].body).toBe(formData)
  })

  it('reports API errors and triggers unauthorized handling', async () => {
    let unauthorizedCount = 0
    const client = createApiClient({
      baseUrl: '/api',
      fetcher: async () =>
        new Response(JSON.stringify({ message: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      getToken: () => null,
      onUnauthorized: () => {
        unauthorizedCount += 1
      },
    })

    await expect(client.get('/users/me')).rejects.toMatchObject({
      message: 'Unauthorized',
      response: { status: 401 },
    })
    expect(unauthorizedCount).toBe(1)
  })

  it('can suppress sign-in prompts for background session checks', async () => {
    let unauthorizedCount = 0
    const client = createApiClient({
      baseUrl: '/api',
      fetcher: async () => new Response(null, { status: 401 }),
      getToken: () => 'stale-token',
      onUnauthorized: () => {
        unauthorizedCount += 1
      },
    })

    await expect(
      client.get('/users/me', { promptOnUnauthorized: false }),
    ).rejects.toMatchObject({ response: { status: 401 } })
    expect(unauthorizedCount).toBe(0)
  })

  it('opens authenticated streams against the configured API base URL', async () => {
    let requestUrl = ''
    let requestHeaders = new Headers()
    const client = createApiClient({
      baseUrl: 'https://api.example.test/v1',
      fetcher: async (input, init) => {
        requestUrl = String(input)
        requestHeaders = new Headers(init?.headers)
        return new Response('data: [DONE]\n\n', { status: 200 })
      },
      getToken: () => 'stream-token',
      onUnauthorized: () => undefined,
    })

    await client.postStream('/chat', { stream: true })

    expect(requestUrl).toBe('https://api.example.test/v1/chat')
    expect(requestHeaders.get('Authorization')).toBe('Bearer stream-token')
    expect(requestHeaders.get('Content-Type')).toBe('application/json')
  })

  it('propagates caller cancellation to polling requests', async () => {
    const controller = new AbortController()
    let receivedAbort = false
    const client = createApiClient({
      baseUrl: '/api',
      fetcher: async (_input, init) => {
        const receivedSignal = init?.signal as AbortSignal
        return await new Promise<Response>((_resolve, reject) => {
          receivedSignal.addEventListener('abort', () => {
            receivedAbort = true
            reject(new DOMException('Aborted', 'AbortError'))
          })
        })
      },
      getToken: () => 'preview-token',
      onUnauthorized: () => undefined,
    })

    const request = client.get('/v1/scholars/id/research-timeline/generations/job', {
      signal: controller.signal,
    })
    controller.abort()

    await expect(request).rejects.toMatchObject({
      message: 'Request cancelled',
      response: { status: 0 },
    })
    expect(receivedAbort).toBe(true)
  })
})
