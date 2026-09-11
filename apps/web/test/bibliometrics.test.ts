// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import i18n from '@/i18n'
import AdminJournals from '@/views/AdminJournals.vue'
import * as api from '@/api/bibliometrics'

vi.mock('@/api/bibliometrics', () => ({
  listBibliometricEditions: vi.fn(), getBibliometricEdition: vi.fn(), listBibliometricJournals: vi.fn(),
  createBibliometricEdition: vi.fn(), saveJournalRanking: vi.fn(), savePaperIndicator: vi.fn(),
  publishBibliometricEdition: vi.fn(), reviseBibliometricEdition: vi.fn(), withdrawBibliometricObservation: vi.fn(),
}))
const edition: api.BibliometricEdition = { id: 'edition-1', system: 'jcr', version: 'Anonymous edition', revision: 1, content_revision: 7, metric_year: 2025, released_on: '2026-06-01', observed_on: null, source: 'Anonymous catalog', source_url: 'https://example.org', status: 'draft', createdAt: '2026-09-11T00:00:00Z', publishedAt: null, ranking_count: 1, indicator_count: 0 }
const ranking: api.JournalRanking = { id: 'ranking-1', journalId: 'journal-1', journal_name: 'Anonymous journal', category_level: 'category', category: 'Science', metric: 'jif', quartile: 1, is_top: false, source: edition.source }
const detail: api.EditionDetail = { edition, rankings: [ranking], indicators: [], events: [] }
let app: App | undefined
const settle = async (): Promise<void> => { for (let i = 0; i < 40; i++) { await Promise.resolve(); await nextTick() } }
const button = (text: string): HTMLButtonElement => {
  const found = [...document.querySelectorAll<HTMLButtonElement>('button')].find(element => element.textContent?.trim() === text)
  if (!found) throw new Error(`Missing button: ${text}`)
  return found
}
const mount = async (): Promise<void> => {
  const root = document.createElement('div')
  document.body.append(root)
  app = createApp(AdminJournals).use(i18n)
  app.mount(root)
  await settle()
}
const open = async (): Promise<void> => { button('Anonymous edition · r1').click(); await settle() }
const setNote = async (): Promise<void> => {
  const input = document.querySelector<HTMLInputElement>('.change-notes input')!
  input.value = 'Verified fixture'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await settle()
}
beforeEach(() => {
  vi.resetAllMocks()
  i18n.global.locale.value = 'zh-CN'
  vi.mocked(api.listBibliometricEditions).mockResolvedValue({ items: [structuredClone(edition)], total: 1 })
  vi.mocked(api.getBibliometricEdition).mockResolvedValue(structuredClone(detail))
  vi.mocked(api.listBibliometricJournals).mockResolvedValue({ items: [], total: 0 })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => { app?.unmount(); app = undefined; document.body.replaceChildren(); vi.restoreAllMocks() })

describe('journal edition administration', () => {
  it('shows dated edition metadata and requires a note and confirmation before publishing', async () => {
    await mount(); await open()
    expect(document.body.textContent).toContain('2026-06-01')
    expect(document.body.textContent).toContain('Anonymous journal')
    expect(button('发布版本').disabled).toBe(true)
    await setNote()
    vi.mocked(window.confirm).mockReturnValueOnce(false)
    button('发布版本').click(); await settle()
    expect(api.publishBibliometricEdition).not.toHaveBeenCalled()
    vi.mocked(api.publishBibliometricEdition).mockResolvedValue({ ...edition, status: 'published' })
    button('发布版本').click(); await settle()
    expect(api.publishBibliometricEdition).toHaveBeenCalledWith('edition-1', { expected_revision: 7, notes: 'Verified fixture' }, expect.any(AbortSignal))
  })
  it('keeps published editions read-only and selects a newly created revision', async () => {
    vi.mocked(api.getBibliometricEdition).mockResolvedValue({ ...detail, edition: { ...edition, status: 'published' } })
    await mount(); await open()
    expect(document.body.textContent).toContain('此版本已冻结')
    expect([...document.querySelectorAll('button')].some(element => element.textContent === '编辑')).toBe(false)
    expect(button('创建修订版').disabled).toBe(true)
    await setNote()
    vi.mocked(api.reviseBibliometricEdition).mockResolvedValue({ ...edition, id: 'edition-2', revision: 2 })
    button('创建修订版').click(); await settle()
    expect(api.reviseBibliometricEdition).toHaveBeenCalledWith('edition-1', { expected_revision: 7, notes: 'Verified fixture' }, expect.any(AbortSignal))
    expect(api.getBibliometricEdition).toHaveBeenLastCalledWith('edition-2', 0, expect.any(AbortSignal))
  })
  it('saves explicit false and null as typed values rather than strings', async () => {
    await mount(); await open(); await setNote()
    button('编辑').click(); await settle()
    const quartile = document.querySelector<HTMLSelectElement>('[name="quartile"]')!
    quartile.selectedIndex = 0
    quartile.dispatchEvent(new Event('change', { bubbles: true })); await settle()
    vi.mocked(api.saveJournalRanking).mockResolvedValue({ ...edition, content_revision: 8 })
    document.querySelector<HTMLFormElement>('.editor')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await settle()
    expect(api.saveJournalRanking).toHaveBeenCalledWith('edition-1', expect.objectContaining({ expected_revision: 7, is_top: false, quartile: null, notes: 'Verified fixture' }), expect.any(AbortSignal))
  })
  it('retains the editor on stale-write errors and renders source links safely', async () => {
    vi.mocked(api.getBibliometricEdition).mockResolvedValue({ ...detail, edition: { ...edition, source_url: 'javascript:alert(1)' } })
    await mount(); await open(); await setNote()
    expect(document.querySelector('a')).toBeNull()
    button('编辑').click(); await settle()
    vi.mocked(api.saveJournalRanking).mockRejectedValue(new Error('Edition changed; reload before proceeding'))
    document.querySelector<HTMLFormElement>('.editor')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await settle()
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Edition changed')
    expect(document.querySelector('[name="quartile"]')).not.toBeNull()
  })
  it('does not default missing ESI observations to false', async () => {
    vi.mocked(api.getBibliometricEdition).mockResolvedValue({ ...detail, edition: { ...edition, system: 'esi', ranking_count: 0 }, rankings: [] })
    await mount(); await open(); await setNote()
    button('新增记录').click(); await settle()
    document.querySelector<HTMLFormElement>('.editor')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await settle()
    expect(api.savePaperIndicator).not.toHaveBeenCalled()
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('请选择是或否')
  })
  it('cancels requests on unmount and supports English labels', async () => {
    i18n.global.locale.value = 'en-US'
    await mount()
    expect(document.querySelector('h1')?.textContent).toBe('Journals and metric editions')
    const signal = vi.mocked(api.listBibliometricEditions).mock.calls[0][1]!
    app?.unmount(); app = undefined
    expect(signal.aborted).toBe(true)
  })
})
