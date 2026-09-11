// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import i18n from '@/i18n'
import BibliographyImportPanel from '@/components/BibliographyImportPanel.vue'
import * as api from '@/api/bibliography'

vi.mock('@/api/bibliography', async importOriginal => ({ ...await importOriginal<typeof import('@/api/bibliography')>(), createBibliographyPreview: vi.fn(), getBibliographyImport: vi.fn(), listBibliographyImports: vi.fn(), getBibliographyItem: vi.fn(), applyBibliographyImport: vi.fn(), reviewBibliographyImport: vi.fn(), getBibliographyFields: vi.fn() }))

const row: api.BibliographyItem = { id: 'row-1', index: 0, source_row: 2, title: 'Anonymous paper', action: 'created', status: 'ready', paper_id: null, target_id: null, decision: null, message: null, issues: [] }
const record: api.BibliographyImport = { id: 'import-1', schema_version: 2, institution_id: 'institution-1', source: 'fixture', status: 'ready', created_at: '2026-09-11T00:00:00Z', updated_at: '2026-09-11T00:00:00Z', summary: { total: 1, ready: 1, pending_review: 0, completed: 0, errors: 0, rejected: 0 }, items: [row] }
const input: api.BibliographyInput = { schema_version: 2, source: 'fixture', items: [{ paper: { title: 'Anonymous paper', doi: '10.1234/example' } }] }
let app: App | undefined
const settle = async (): Promise<void> => { for (let i = 0; i < 40; i++) { await Promise.resolve(); await nextTick() } }
const button = (label: string): HTMLButtonElement => {
  const result = [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.startsWith(label))
  if (!result) throw new Error(`Missing button ${label}`)
  return result
}
const mount = async (platformAdmin = false): Promise<void> => {
  const root = document.createElement('div'); document.body.appendChild(root)
  app = createApp(BibliographyImportPanel, { slug: 'anonymous', platformAdmin })
  app.use(i18n).mount(root); await settle()
}
const upload = async (): Promise<void> => {
  const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]')!
  Object.defineProperty(fileInput, 'files', { configurable: true, value: [{ name: 'fixture.json', size: 200, text: async () => JSON.stringify(input) }] })
  fileInput.dispatchEvent(new Event('change', { bubbles: true })); await settle()
  button('检查并预览').click(); await settle()
}
beforeEach(() => {
  vi.resetAllMocks(); i18n.global.locale.value = 'zh-CN'
  vi.mocked(api.getBibliographyFields).mockResolvedValue([])
  vi.mocked(api.listBibliographyImports).mockResolvedValue({ items: [], total: 0 })
  vi.mocked(api.createBibliographyPreview).mockResolvedValue(structuredClone(record))
  vi.mocked(api.getBibliographyImport).mockResolvedValue(structuredClone(record))
  vi.mocked(api.applyBibliographyImport).mockResolvedValue({ ...record, status: 'completed', summary: { ...record.summary, ready: 0, completed: 1 }, items: [{ ...row, status: 'completed', paper_id: 'paper-1' }] })
})
afterEach(async () => { app?.unmount(); app = undefined; await settle(); document.body.replaceChildren(); vi.useRealTimers() })

describe('structured bibliography import UI', () => {
  it('previews before writing and confirms only selected rows', async () => {
    await mount(); await upload()
    expect(api.createBibliographyPreview).toHaveBeenCalledWith('anonymous', input, expect.any(String), expect.any(AbortSignal))
    expect(api.applyBibliographyImport).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Anonymous paper')
    button('确认导入').click(); await settle()
    expect(api.applyBibliographyImport).toHaveBeenCalledExactlyOnceWith('anonymous', 'import-1', { item_ids: ['row-1'], acknowledge_warnings: false }, expect.any(AbortSignal))
    expect(document.body.textContent).toContain('已导入 1')
  })
  it('requires warning acknowledgement and never silently applies a row with warnings', async () => {
    vi.mocked(api.createBibliographyPreview).mockResolvedValue({ ...record, items: [{ ...row, issues: [{ severity: 'warning', code: 'invalid_custom_field', field: 'flag', message: 'Unknown value' }] }] })
    await mount(); await upload()
    expect(button('确认导入').disabled).toBe(true)
    const acknowledgement = [...document.querySelectorAll('label')].find(label => label.textContent?.includes('接受所选条目的警告'))!.querySelector<HTMLInputElement>('input')!
    acknowledgement.click(); await settle()
    expect(button('确认导入').disabled).toBe(false)
    button('确认导入').click(); await settle()
    expect(api.applyBibliographyImport).toHaveBeenCalledWith('anonymous', 'import-1', { item_ids: ['row-1'], acknowledge_warnings: true }, expect.any(AbortSignal))
  })
  it('reuses the request key after a preview network failure', async () => {
    vi.mocked(api.createBibliographyPreview).mockRejectedValueOnce(new Error('Network unavailable'))
    await mount(); await upload()
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Network unavailable')
    button('检查并预览').click(); await settle()
    expect(vi.mocked(api.createBibliographyPreview).mock.calls[0][2]).toBe(vi.mocked(api.createBibliographyPreview).mock.calls[1][2])
  })
  it('renders stored changes as text, including null and false, without interpreting HTML', async () => {
    vi.mocked(api.getBibliographyItem).mockResolvedValue({ ...row, paper: input.items[0].paper, changes: [{ field: 'title', before: null, after: '<img src=x onerror=alert(1)>' }, { field: 'flag', before: null, after: false }], claim_review_status: null, decisions: [{ id: 'decision-1', decision: 'rejected', notes: 'Verified fixture', actor_type: 'user', actor_name: 'Fixture Reviewer', created_at: '2026-09-11T00:00:00Z' }] })
    await mount(); await upload(); button('查看差异').click(); await settle()
    expect(document.querySelectorAll('img')).toHaveLength(0)
    expect(document.body.textContent).toContain('<img src=x onerror=alert(1)>')
    expect(document.body.textContent).toContain('false')
    expect(document.body.textContent).toContain('Fixture Reviewer')
    expect(document.body.textContent).toContain('Verified fixture')
  })
  it('hides review actions for ordinary importers and requires notes for administrators', async () => {
    const pending = { ...record, status: 'pending_review', summary: { ...record.summary, ready: 0, pending_review: 1 }, items: [{ ...row, status: 'pending_review' }] }
    vi.mocked(api.createBibliographyPreview).mockResolvedValue(pending)
    await mount(); await upload()
    expect(document.body.textContent).not.toContain('核准导入')
    app?.unmount(); document.body.replaceChildren()
    await mount(true); await upload()
    expect(button('核准导入').disabled).toBe(true)
    const notes = document.querySelector<HTMLInputElement>('.review-notes input')!
    notes.value = 'Verified'; notes.dispatchEvent(new Event('input', { bubbles: true })); await settle()
    vi.mocked(api.reviewBibliographyImport).mockResolvedValue({ ...pending, status: 'completed' })
    button('核准导入').click(); await settle()
    expect(api.reviewBibliographyImport).toHaveBeenCalledWith('anonymous', 'import-1', { item_ids: ['row-1'], acknowledge_warnings: false, decision: 'approve', notes: 'Verified' }, expect.any(AbortSignal))
  })
  it('cancels polling and in-flight requests when unmounted', async () => {
    vi.useFakeTimers()
    vi.mocked(api.createBibliographyPreview).mockResolvedValue({ ...record, status: 'previewing' })
    await mount(); await upload()
    const signal = vi.mocked(api.createBibliographyPreview).mock.calls[0][3]!
    app?.unmount(); app = undefined
    expect(signal.aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(3000)
    expect(api.getBibliographyImport).not.toHaveBeenCalled()
  })
  it('supports the English interface', async () => {
    i18n.global.locale.value = 'en-US'
    await mount()
    expect(document.body.textContent).toContain('Paper data import')
    expect(document.body.textContent).not.toContain('论文数据导入')
  })
})
