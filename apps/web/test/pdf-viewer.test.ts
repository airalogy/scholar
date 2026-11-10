// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref, type App } from 'vue'
import i18n from '@/i18n'
import PdfViewer from '@/components/PdfViewer.vue'
import { FILE_REQUEST_TIMEOUT_MS, loadPdfSource } from '@/api/files'
import { getDocument } from 'pdfjs-dist'
import type { TextContent } from 'pdfjs-dist/types/src/display/api'

const textLayerMocks = vi.hoisted(() => ({ cancel: vi.fn(), finish: vi.fn() }))

vi.mock('@/api/files', () => ({ FILE_REQUEST_TIMEOUT_MS: 180_000, loadPdfSource: vi.fn() }))
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: vi.fn(),
  TextLayer: class {
    textDivs: HTMLElement[] = []
    content: TextContent
    container: HTMLElement
    constructor ({ textContentSource, container }: { textContentSource: TextContent; container: HTMLElement }) {
      this.content = textContentSource
      this.container = container
    }
    render = async (): Promise<void> => {
      this.textDivs = this.content.items.map(item => {
        const span = document.createElement('span')
        span.textContent = 'str' in item ? item.str : ''
        this.container.append(span)
        return span
      })
      await textLayerMocks.finish()
    }
    cancel = textLayerMocks.cancel
  },
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

const mockDocument = (texts: string[][] = [['Scholar beta SCHOLAR']], count = texts.length, lineBreaks: number[] = []): {
  getPage: ReturnType<typeof vi.fn>
  render: ReturnType<typeof vi.fn>
  cancel: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
} => {
  const cancel = vi.fn()
  const render = vi.fn(() => ({ promise: Promise.resolve(), cancel }))
  const getPage = vi.fn(async (page: number) => ({
    getViewport: ({ scale }: { scale: number }): { width: number; height: number; scale: number; userUnit: number } => ({
      width: (page === 2 ? 800 : 600) * scale, height: (page === 2 ? 600 : 800) * scale, scale, userUnit: 1,
    }),
    render,
    getTextContent: async (): Promise<TextContent> => ({
      items: (texts[page - 1] ?? []).map((str, index) => ({ str, dir: 'ltr', transform: [], width: 10, height: 10, fontName: 'test', hasEOL: lineBreaks.includes(index) })),
      styles: {}, lang: null,
    }),
  }))
  const destroy = vi.fn(async (): Promise<void> => {})
  vi.mocked(loadPdfSource).mockResolvedValue({ data: new Uint8Array([37, 80, 68, 70]) })
  vi.mocked(getDocument).mockReturnValue({ promise: Promise.resolve({ numPages: count, getPage }), destroy } as never)
  return { getPage, render, cancel, destroy }
}

const search = async (text: string): Promise<void> => {
  const input = document.querySelector<HTMLInputElement>('input[type="search"]')!
  input.value = text
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await settle()
}
const click = async (key: string): Promise<void> => {
  document.querySelector<HTMLButtonElement>(`button[aria-label="${i18n.global.t(`pdfViewer.${key}`)}"]`)!.click()
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
  HTMLElement.prototype.scrollIntoView = vi.fn()
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
    const page = { getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale, scale, userUnit: 1 }), render, getTextContent: async () => ({ items: [] }) }
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

  it('finds literal, case-insensitive text and navigates individual matches with keyboard and buttons', async () => {
    mockDocument()
    await mount()
    await search('scholar')
    expect(document.querySelectorAll('.highlight')).toHaveLength(2)
    expect(document.querySelector('.pdf-match-count')?.textContent).toBe('1 / 2')
    await click('nextMatch')
    expect(document.querySelector('.pdf-match-count')?.textContent).toBe('2 / 2')
    expect(document.querySelector('.highlight.selected')?.textContent).toBe('SCHOLAR')
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled()
    const input = document.querySelector('input')!
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }))
    await settle()
    expect(document.querySelector('.pdf-match-count')?.textContent).toBe('1 / 2')
    await click('previousMatch')
    expect(document.querySelector('.pdf-match-count')?.textContent).toBe('2 / 2')
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await settle()
    expect(document.querySelectorAll('.highlight')).toHaveLength(0)
    expect(document.querySelector('.textLayer')?.textContent).toBe('Scholar beta SCHOLAR')
  })

  it('handles empty, Chinese, cross-span and regex-special text without injecting markup', async () => {
    mockDocument([['学者', '阅读 (a+b) <img src=x onerror=alert(1)>']])
    await mount()
    await search('  ')
    expect(document.querySelectorAll('.highlight')).toHaveLength(0)
    await search('学者阅读')
    expect(document.querySelector('.pdf-match-count')?.textContent).toBe('1 / 1')
    expect(document.querySelectorAll('.highlight.selected')).toHaveLength(2)
    await search('(a+b)')
    expect(document.querySelector('.highlight')?.textContent).toBe('(a+b)')
    await search('<img src=x onerror=alert(1)>')
    expect(document.querySelector('.highlight')?.textContent).toBe('<img src=x onerror=alert(1)>')
    expect(document.querySelector('img')).toBeNull()
    await search('absent')
    expect(document.querySelector('.pdf-match-count')?.textContent).toBe(i18n.global.t('pdfViewer.noMatches'))
  })

  it('searches only rendered current-page text and preserves mixed page sizes', async () => {
    const doc = mockDocument([['Scholar'], ['Other page']], 80)
    await mount()
    await search('scholar')
    expect(doc.getPage.mock.calls.every(([page]) => page === 1)).toBe(true)
    await click('nextPage')
    expect(document.querySelector('.pdf-page-info')?.textContent).toBe('2 / 80')
    expect(document.querySelectorAll('[data-page="1"] .highlight')).toHaveLength(0)
    expect(document.querySelector('.pdf-match-count')?.textContent).toBe(i18n.global.t('pdfViewer.noMatches'))
    expect(document.querySelector<HTMLElement>('[data-page="2"]')?.style.width).toBe('800px')
    expect(document.querySelector<HTMLElement>('[data-page="2"]')?.style.height).toBe('600px')
    expect(doc.getPage.mock.calls.every(([page]) => page === 1 || page === 2)).toBe(true)
    await click('previousPage')
    expect(document.querySelector('.pdf-match-count')?.textContent).toBe('1 / 1')
  })

  it('matches Latin and CJK phrases across separate empty line-break items', async () => {
    mockDocument([['Scholar', '', 'reader', ' 学者', '', '阅读']], 1, [1, 4])
    await mount()
    await search('Scholar reader')
    expect(document.querySelector('.pdf-match-count')?.textContent).toBe('1 / 1')
    expect([...document.querySelectorAll('.highlight.selected')].map(el => el.textContent).join('')).toBe('Scholarreader')
    await search('学者阅读')
    expect(document.querySelector('.pdf-match-count')?.textContent).toBe('1 / 1')
    expect([...document.querySelectorAll('.highlight.selected')].map(el => el.textContent).join('')).toBe('学者阅读')
  })

  it('reapplies highlights after zoom, keeps text selectable and clears on file change', async () => {
    vi.useFakeTimers()
    const doc = mockDocument()
    await mount()
    await search('scholar')
    await click('zoomIn')
    await vi.advanceTimersByTimeAsync(200)
    await settle()
    expect(document.querySelector('.pdf-scale-info')?.textContent).toBe('120%')
    expect(document.querySelectorAll('.highlight')).toHaveLength(2)
    expect(document.querySelector<HTMLElement>('.textLayer')?.style.getPropertyValue('--total-scale-factor')).toBe('1.2')
    const range = document.createRange()
    range.selectNodeContents(document.querySelector('.textLayer')!)
    expect(range.toString()).toBe('Scholar beta SCHOLAR')
    expect(textLayerMocks.cancel).toHaveBeenCalled()
    fileId.value = 'file-2'
    await settle()
    expect(doc.destroy).toHaveBeenCalledOnce()
    expect(document.querySelector<HTMLInputElement>('input')?.value).toBe('')
    expect(document.querySelectorAll('.highlight')).toHaveLength(0)
  })

  it('reports scanned pages as unsearchable in both locales and labels every control', async () => {
    mockDocument([[]])
    await mount()
    await search('Scholar')
    expect(document.querySelector('.pdf-match-count')?.textContent).toBe(i18n.global.t('pdfViewer.noText'))
    i18n.global.locale.value = 'en-US'
    await settle()
    expect(document.querySelector('.pdf-match-count')?.textContent).toBe('No searchable text on this page')
    for (const button of document.querySelectorAll('button')) {
      expect(button.getAttribute('aria-label') || button.textContent?.trim()).toBeTruthy()
      expect(button.type).toBe('button')
    }
    expect(document.querySelector('input')?.closest('label')?.textContent).toContain('Find on this page')
  })

  it('cancels pending canvas rendering on close and ignores late completion', async () => {
    const doc = mockDocument()
    let finish!: () => void
    doc.render.mockReturnValue({ promise: new Promise<void>(resolve => { finish = resolve }), cancel: doc.cancel })
    await mount()
    app!.unmount()
    app = undefined
    expect(doc.cancel).toHaveBeenCalledOnce()
    expect(doc.destroy).toHaveBeenCalledOnce()
    finish()
    await settle()
    expect(textLayerMocks.finish).not.toHaveBeenCalled()
  })

  it('ignores stale text-layer completion after switching documents', async () => {
    mockDocument()
    let finish!: () => void
    textLayerMocks.finish.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
    await mount()
    await search('Scholar')
    expect(document.querySelector('.pdf-match-count')?.textContent).toBe(i18n.global.t('pdfViewer.searchLoading'))
    mockDocument([['New document']])
    fileId.value = 'file-2'
    await settle()
    finish()
    await settle()
    await search('Scholar')
    expect(document.querySelector('.pdf-match-count')?.textContent).toBe(i18n.global.t('pdfViewer.noMatches'))
    expect(document.querySelector('.textLayer')?.textContent).toBe('New document')
  })
})
