// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/api/client'
import { FILE_REQUEST_TIMEOUT_MS, loadPdfSource, uploadFile } from '@/api/files'

vi.mock('@/api/client', () => ({ API_BASE_URL: 'https://api.example.test/service', apiClient: { get: vi.fn(), getBinary: vi.fn(), post: vi.fn() } }))
beforeEach(() => vi.resetAllMocks())

describe('file requests', () => {
  it.each(['paper', 'thesis'] as const)('supplies PDF MIME metadata for %s files when browsers omit it', async purpose => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 'file' } } as never)
    const file = new File(['%PDF-1.7'], 'example.PDF', { lastModified: 123 })
    await uploadFile(file, purpose, 'institution')
    const form = vi.mocked(apiClient.post).mock.calls[0][1] as FormData
    const uploaded = form.get('file') as File
    expect(uploaded.name).toBe(file.name)
    expect(uploaded.type).toBe('application/pdf')
    expect(uploaded.size).toBe(file.size)
    expect(uploaded.lastModified).toBe(file.lastModified)
  })

  it.each(['paper', 'thesis', 'avatar'] as const)('sends %s metadata before the file with a dedicated timeout and cancellation', async purpose => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 'file' } } as never)
    const signal = new AbortController().signal
    const file = new File(['%PDF-1.7'], 'example.pdf', { type: 'application/pdf' })
    await uploadFile(file, purpose, purpose === 'avatar' ? undefined : 'institution', signal)
    const [path, body, config] = vi.mocked(apiClient.post).mock.calls[0]
    expect(path).toBe('/files/upload')
    const form = body as FormData
    expect([...form.keys()]).toEqual(purpose === 'avatar' ? ['purpose', 'file'] : ['purpose', 'institution_id', 'file'])
    expect(form.get('file')).toBe(file)
    expect(form.get('purpose')).toBe(purpose)
    expect(config).toEqual({ signal, timeout: FILE_REQUEST_TIMEOUT_MS })
    expect(config?.headers).toBeUndefined()
  })

  it.each(['/api/files/access/file?token=fresh', 'https://api.example.test/service/files/access/file?token=fresh'])('refreshes stale links and downloads internal PDF bytes through the authenticated client: %s', async url => {
    const bytes = new Uint8Array([37, 80, 68, 70])
    const signal = new AbortController().signal
    vi.mocked(apiClient.get).mockResolvedValue({ data: { signatureUrl: url } } as never)
    vi.mocked(apiClient.getBinary).mockResolvedValue({ data: bytes } as never)
    expect(await loadPdfSource('/api/files/access/file?token=expired', 'file', signal)).toEqual({ data: bytes })
    expect(apiClient.get).toHaveBeenCalledWith('/files/preview/file', { signal })
    expect(apiClient.getBinary).toHaveBeenCalledWith('/files/access/file?token=fresh', { signal, timeout: FILE_REQUEST_TIMEOUT_MS, promptOnUnauthorized: false })
  })

  it('never sends the session token to external storage or lookalike hosts', async () => {
    for (const url of ['https://storage.example.test/pdf?signature=value', 'https://api.example.test.attacker.invalid/service/files/access/file']) {
      expect(await loadPdfSource(url, undefined, new AbortController().signal)).toEqual({ url })
    }
    expect(apiClient.get).not.toHaveBeenCalled()
    expect(apiClient.getBinary).not.toHaveBeenCalled()
  })

  it.each(['javascript:alert(1)', '//untrusted.invalid/paper', 'data:application/pdf;base64,secret'])('rejects unsafe URLs: %s', async url => {
    await expect(loadPdfSource(url, undefined, new AbortController().signal)).rejects.toThrow('Invalid PDF URL')
    expect(apiClient.getBinary).not.toHaveBeenCalled()
  })
})
