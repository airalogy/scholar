// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref, type App, type Component } from 'vue'
import i18n from '@/i18n'
import { useAuth } from '@/composables/useAuth'
import PaperBibliography from '@/components/PaperBibliography.vue'
import PaperBibliometrics from '@/components/PaperBibliometrics.vue'
import * as api from '@/api/paper-bibliography'

vi.mock('@/api/paper-bibliography', () => ({ getPaperBibliography: vi.fn(), listPaperMetricEditions: vi.fn(), getPaperMetrics: vi.fn() }))
const details: api.PaperBibliography = {
  paper_id: 'paper-1', titles: [{ language: 'zh', title: '匿名题名', kind: 'translated', is_primary: false }],
  language_tags: ['en', 'fr'], document_type: 'article', publication_status: 'published',
  identifiers: [{ scheme: 'scopus', value: '2-s2.0-123456789' }],
  authors: [{ id: 1, author_id: 'author-1', name: 'Anonymous author', order: 2, order_verified: false, corresponding: true, equal_contribution: false, contributor_type: 'person', orcid: null, affiliation_ids: ['affiliation-1'] }],
  affiliations: [{ id: 'affiliation-1', raw_name: 'Anonymous affiliation', organization_name: null, department: null, country_code: null, ror_id: null }],
  funding: [{ id: 'funding-1', funder_name: null, funder_identifier: null, award_number: 'G-1', raw_text: 'Example grant' }],
  sources: [], journal: { id: 'journal-1', name: 'Journal', identifiers: [{ scheme: 'issn', value: '1234-5679' }] },
  institution: {
    owning_units: [], secondary_units: [], signature_type: null, reported_affiliation_count: 0, cooperation_types: [], cooperation_description: null,
    custom_fields: [
      { key: 'flag', label: '标记', label_en: 'Flag', field_type: 'boolean', value: false },
      { key: 'unknown', label: '未知标记', label_en: 'Unknown flag', field_type: 'boolean', value: null },
      { key: 'number', label: '数量', label_en: 'Count', field_type: 'number', value: 0 },
    ],
  },
}
const edition: api.PaperMetricEdition = { id: 'edition-1', system: 'cas', version: '2025 fixture', revision: 1, metric_year: 2025, source: 'Anonymous catalog', source_url: 'https://example.org', released_on: '2026-01-01', observed_on: null }
const metrics: api.PaperMetrics = { edition, rankings: [{ id: 'ranking-1', category: 'Science', category_level: 'broad', metric: 'cas', quartile: 2, is_top: false }], indicators: [{ id: 'indicator-1', kind: 'hot', category: '', value: false }], ranking_total: 1, indicator_total: 1 }
let app: App | undefined
const paperId = ref('paper-1')
const settle = async (): Promise<void> => { for (let i = 0; i < 30; i++) { await Promise.resolve(); await nextTick() } }
const mount = async (component: Component): Promise<void> => {
  const root = document.createElement('div')
  document.body.append(root)
  app = createApp({ render: () => h(component, { paperId: paperId.value }) }).use(i18n)
  app.mount(root)
  await settle()
}
const selectEdition = async (id = edition.id): Promise<void> => {
  const select = document.querySelector<HTMLSelectElement>('select')!
  select.value = id
  select.dispatchEvent(new Event('change', { bubbles: true }))
  await settle()
}
beforeEach(() => {
  vi.resetAllMocks()
  useAuth().logout()
  paperId.value = 'paper-1'
  i18n.global.locale.value = 'zh-CN'
  vi.mocked(api.getPaperBibliography).mockResolvedValue(structuredClone(details))
  vi.mocked(api.listPaperMetricEditions).mockResolvedValue({ items: [], total: 0 })
  vi.mocked(api.getPaperMetrics).mockResolvedValue(structuredClone(metrics))
})
afterEach(() => { app?.unmount(); app = undefined; document.body.replaceChildren(); useAuth().logout() })

describe('paper bibliography details', () => {
  it('localizes accepted document types and early-access status in both languages', async () => {
    vi.mocked(api.getPaperBibliography).mockResolvedValue({ ...details, document_type: 'meeting_abstract', publication_status: 'early_access' })
    await mount(PaperBibliography)
    expect(document.body.textContent).toContain('会议摘要')
    expect(document.body.textContent).toContain('在线优先出版')
    i18n.global.locale.value = 'en-US'
    await nextTick()
    expect(document.body.textContent).toContain('Meeting abstract')
    expect(document.body.textContent).toContain('Early access')
    for (const locale of ['zh-CN', 'en-US'] as const) {
      for (const code of ['article', 'review', 'letter', 'editorial', 'correction', 'news', 'note', 'conference_paper', 'meeting_abstract', 'thesis', 'report', 'other']) {
        expect(i18n.global.te(`paperBibliography.documentTypes.${code}`, locale)).toBe(true)
      }
    }
  })
  it('shows languages, author flags, affiliation and typed false/null/zero values', async () => {
    await mount(PaperBibliography)
    expect(document.body.textContent).toContain('匿名题名')
    expect(document.body.textContent).toContain('通讯作者')
    expect(document.body.textContent).not.toContain('同等贡献')
    expect(document.body.textContent).toContain('顺序未核验')
    expect(document.querySelector('li')?.value).toBe(2)
    expect(document.body.textContent).toContain('Anonymous affiliation')
    expect(document.body.textContent).toContain('G-1')
    const facts = new Map([...document.querySelectorAll('dt')].map(element => [element.textContent, element.nextElementSibling?.textContent]))
    expect(facts.get('标记')).toBe('否')
    expect(facts.get('未知标记')).toBe('未提供')
    expect(facts.get('数量')).toBe('0')
    expect(facts.get('来源所报机构数')).toBe('0')
  })
  it('escapes source strings and clears privileged data immediately when account identity changes', async () => {
    useAuth().login('test-token', 'Example')
    vi.mocked(api.getPaperBibliography).mockResolvedValue({ ...details, sources: [{ provider: '<img src=x onerror=alert(1)>', external_id: 'private-id', collected_on: '2026-09-01' }] })
    await mount(PaperBibliography)
    expect(document.querySelector('img')).toBeNull()
    expect(document.body.textContent).toContain('private-id')
    const previousSignal = vi.mocked(api.getPaperBibliography).mock.calls[0][1]!
    vi.mocked(api.getPaperBibliography).mockImplementation(() => new Promise(() => {}))
    useAuth().logout()
    await nextTick()
    expect(previousSignal.aborted).toBe(true)
    expect(document.body.textContent).not.toContain('private-id')
    const signal = vi.mocked(api.getPaperBibliography).mock.lastCall![1]!
    app?.unmount(); app = undefined
    expect(signal.aborted).toBe(true)
  })
  it('ignores a stale response after changing papers and supports English labels', async () => {
    let resolveOld!: (value: api.PaperBibliography) => void
    vi.mocked(api.getPaperBibliography).mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve }))
    i18n.global.locale.value = 'en-US'
    await mount(PaperBibliography)
    paperId.value = 'paper-2'
    await settle()
    resolveOld({ ...details, titles: [{ language: 'en', title: 'Stale title', kind: 'original', is_primary: false }] })
    await settle()
    expect(document.body.textContent).not.toContain('Stale title')
    expect(document.body.textContent).toContain('Corresponding author')
    expect(document.body.textContent).toContain('Flag')
  })
  it('shows a recoverable load error instead of reporting success', async () => {
    vi.mocked(api.getPaperBibliography).mockRejectedValueOnce(new Error('Unavailable'))
    await mount(PaperBibliography)
    expect(document.querySelector('[role="alert"]')).not.toBeNull()
    document.querySelector<HTMLButtonElement>('[role="alert"] button')!.click()
    await settle()
    expect(document.querySelector('[role="alert"]')).toBeNull()
    expect(document.body.textContent).toContain('Anonymous author')
  })
})

describe('published metric editions on paper details', () => {
  it('requires an explicit edition and distinguishes CAS zones, false and unknown Top flags', async () => {
    vi.mocked(api.listPaperMetricEditions).mockResolvedValue({ items: [edition], total: 1 })
    await mount(PaperBibliometrics)
    expect(api.getPaperMetrics).not.toHaveBeenCalled()
    await selectEdition()
    expect(api.getPaperMetrics).toHaveBeenCalledWith('paper-1', edition.id, 0, expect.any(AbortSignal))
    expect(document.body.textContent).toContain('2 区')
    expect(document.body.textContent).toContain('热点: 否')
    expect(document.querySelector('tbody tr')?.textContent).toContain('否')
    expect(document.querySelector('a')?.href).toBe('https://example.org/')
  })
  it('preserves edition selection, paginates observations and blocks unsafe source links', async () => {
    vi.mocked(api.listPaperMetricEditions).mockResolvedValue({ items: [edition], total: 1 })
    vi.mocked(api.getPaperMetrics).mockResolvedValue({ ...metrics, edition: { ...edition, source_url: 'javascript:alert(1)' }, ranking_total: 21 })
    await mount(PaperBibliometrics)
    await selectEdition()
    expect(document.querySelector('a')).toBeNull()
    const next = [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '下一页')!
    next.click(); await settle()
    expect(api.getPaperMetrics).toHaveBeenLastCalledWith('paper-1', edition.id, 20, expect.any(AbortSignal))
    expect(document.querySelector('select')?.value).toBe(edition.id)
    const signal = vi.mocked(api.getPaperMetrics).mock.lastCall![3]!
    app?.unmount(); app = undefined
    expect(signal.aborted).toBe(true)
  })
  it('loads older editions without selecting one automatically', async () => {
    vi.mocked(api.listPaperMetricEditions).mockResolvedValueOnce({ items: [edition], total: 2 }).mockResolvedValueOnce({ items: [{ ...edition, id: 'older', revision: 2 }], total: 2 })
    await mount(PaperBibliometrics)
    const more = [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '更多版本')!
    more.click(); await settle()
    expect(api.listPaperMetricEditions).toHaveBeenLastCalledWith('paper-1', 1, expect.any(AbortSignal))
    expect(document.querySelectorAll('option')).toHaveLength(3)
    expect(api.getPaperMetrics).not.toHaveBeenCalled()
  })
})
