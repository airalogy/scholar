// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref, type App } from 'vue'
import i18n from '@/i18n'
import PdfViewer from '@/components/PdfViewer.vue'
import { FILE_REQUEST_TIMEOUT_MS, loadPdfSource } from '@/api/files'
import { getDocument } from 'pdfjs-dist'

vi.mock('@/api/files', () => ({ FILE_REQUEST_TIMEOUT_MS: 180_000, loadPdfSource: vi.fn() }))
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: vi.fn(),
  TextLayer: class { render = async (): Promise<void> => {}; cancel = (): void => {} },
}))

let app: App | undefined
let resize: (() => void) | undefined
const fileId = ref('file-1')
const settle = async (): Promise<void> => { for (let i = 0; i < 30; i++) { await Promise.resolve(); await nextTick() } }
const mount = async (): Promise<void> => {
  const root = document.createElement('div')
  document.body.append(root)
  app = createApp({ render: () => h(PdfViewer, { fileUrl: '/api/files/access/file?token=stale', fileId: fileId.value }) })
  app.use(i18n).component('a-spin', { render: () => h('span', 'loading') }).mount(root)
  await settle()
}

beforeEach(() => {
  vi.resetAllMocks()
  fileId.value = 'file-1'
  i18n.global.locale.value = 'zh-CN'
  vi.stubGlobal('IntersectionObserver', class { observe = vi.fn(); disconnect = vi.fn() })
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resize = callback }
    observe = vi.fn(); disconnect = vi.fn()
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as never)
})
afterEach(() => {
  app?.unmount(); app = undefined
  document.body.replaceChildren()
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers()
})

describe('PDF reader', () => {
  it('hides signed URLs and tokens in errors, and retries with a fresh source', async () => {
    vi.mocked(loadPdfSource).mockRejectedValue(new Error('Failed at /api/files/access/id?token=SECRET'))
    await mount()
    expect(document.body.textContent).toContain(i18n.global.t('pdfViewer.loadFailed'))
    expect(document.body.textContent).not.toContain('SECRET')
    expect(document.body.textContent).not.toContain('/files/access')
    document.querySelector<HTMLButtonElement>('.pdf-retry')!.click()
    await settle()
    expect(loadPdfSource).toHaveBeenCalledTimes(2)
    expect(vi.mocked(loadPdfSource).mock.calls[0][2].aborted).toBe(true)
  })

  it('renders a first page from authenticated bytes and destroys the document on close', async () => {
    vi.useFakeTimers()
    const render = vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() }))
    const page = { getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }), render, getTextContent: async () => ({ items: [] }) }
    const destroy = vi.fn(async () => {})
    vi.mocked(loadPdfSource).mockResolvedValue({ data: new Uint8Array([37, 80, 68, 70]) })
    vi.mocked(getDocument).mockReturnValue({ promise: Promise.resolve({ numPages: 1, getPage: async () => page }), destroy } as never)
    await mount()
    expect(document.querySelector('.pdf-page-info')?.textContent).toBe('1 / 1')
    expect(render).toHaveBeenCalledOnce()
    expect(getDocument).toHaveBeenCalledWith({ data: new Uint8Array([37, 80, 68, 70]) })
    resize!()
    expect(vi.getTimerCount()).toBe(0)
    Object.defineProperty(document.querySelector('.pdf-pages'), 'clientWidth', { value: 900 })
    resize!()
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(200)
    expect(vi.getTimerCount()).toBe(0)
    app!.unmount(); app = undefined
    expect(destroy).toHaveBeenCalledOnce()
    expect(vi.mocked(loadPdfSource).mock.calls[0][2].aborted).toBe(true)
  })

  it('cancels an old request on file changes and ignores its late completion', async () => {
    let finishOld!: (source: { url: string }) => void
    vi.mocked(loadPdfSource).mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve }))
    vi.mocked(loadPdfSource).mockRejectedValue(new Error('new file error'))
    await mount()
    fileId.value = 'file-2'
    await settle()
    expect(vi.mocked(loadPdfSource).mock.calls[0][2].aborted).toBe(true)
    expect(vi.mocked(loadPdfSource).mock.calls[1][1]).toBe('file-2')
    finishOld({ url: 'https://example.test/old.pdf' })
    await settle()
    expect(getDocument).not.toHaveBeenCalled()
    expect(document.querySelector('.pdf-retry')).not.toBeNull()
  })

  it('bounds external PDF loading and cleans up its pending task and timers', async () => {
    vi.useFakeTimers()
    const destroy = vi.fn(async () => {})
    vi.mocked(loadPdfSource).mockResolvedValue({ url: 'https://storage.example.test/slow.pdf' })
    vi.mocked(getDocument).mockReturnValue({ promise: new Promise(() => {}), destroy } as never)
    await mount()
    await vi.advanceTimersByTimeAsync(FILE_REQUEST_TIMEOUT_MS)
    expect(document.querySelector('.pdf-retry')).not.toBeNull()
    expect(destroy).toHaveBeenCalled()
    app!.unmount(); app = undefined
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels pending source requests and timers when the reader is closed', async () => {
    vi.useFakeTimers()
    vi.mocked(loadPdfSource).mockImplementation(() => new Promise(() => {}))
    await mount()
    app!.unmount(); app = undefined
    expect(vi.mocked(loadPdfSource).mock.calls[0][2].aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
})
