// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref, type App } from 'vue'
import { createMemoryHistory, createRouter, RouterView, type Router } from 'vue-router'
import i18n from '@/i18n'
import Papers from '@/views/Papers.vue'
import Theses from '@/views/Theses.vue'
import MyTheses from '@/views/MyTheses.vue'
import { getDegreeThesisFacets, listDegreeTheses, listMyDegreeTheses, submitDegreeThesis, type DegreeThesis, type DegreeThesisVersion } from '@/api/theses'
import { listPapers, type PaperResponse } from '@/api/papers'
import { searchAuthors } from '@/api/authors'
import { getInstitution } from '@/api/institutions'
import { getLab } from '@/api/labs'

vi.mock('@/api/theses', () => ({ getDegreeThesisFacets: vi.fn(), listDegreeTheses: vi.fn(), listMyDegreeTheses: vi.fn(), submitDegreeThesis: vi.fn() }))
vi.mock('@/api/papers', () => ({ listPapers: vi.fn() }))
vi.mock('@/api/authors', () => ({ searchAuthors: vi.fn() }))
vi.mock('@/api/bookmarks', () => ({ listBookmarks: vi.fn(), addBookmark: vi.fn(), removeBookmark: vi.fn() }))
vi.mock('@/api/labs', () => ({ getLab: vi.fn() }))
vi.mock('@/composables/useAuth', () => ({ useAuth: () => ({ isLoggedIn: ref(false), token: ref(null) }) }))
vi.mock('@/composables/usePublicConfig', () => ({ usePublicConfig: () => ({ features: ref({ degreeTheses: true }), paperLibrary: ref({ defaultPath: '/papers' }) }) }))
vi.mock('@/api/institutions', () => ({ getInstitution: vi.fn() }))

const version: DegreeThesisVersion = {
  id: 'version-demo', version_number: 1, title: '示例细胞研究', title_en: 'Example cell study',
  author_name: '示例学者', student_id: null, training_unit: '示例学院', major: '示例专业',
  degree_category: '博士', award_year: 2026, advisors: ['示例导师'], abstract: 'Fictional research abstract.',
  keywords: ['细胞'], language: 'zh', visibility: 'public', confidentiality_until: null,
  file_id: null, preview_url: null, download_url: null, created_at: '2026-01-01', submitted_at: null,
}
const thesis = (overrides: Partial<DegreeThesis> = {}): DegreeThesis => ({
  id: 'thesis-demo', record_code: 'TH-DEMO-001', institution_reference: null, institution_id: 'institution-demo',
  institution_name: '示例大学', submitted_by: null, status: 'approved', current_step: null, decision_notes: null,
  submitted_at: null, published_at: '2026-01-01', created_at: '2026-01-01', updated_at: '2026-01-01',
  can_edit: false, can_review: false, current_version: version, published_version: version,
  versions: [], review_steps: [], review_history: [], ...overrides,
})
const paper: PaperResponse = {
  id: 'paper-demo', claimId: null, submissionId: null, title: 'Historical thesis bibliography', abstract: null,
  doi: null, journal_name: null, publish_year: 2020, publish_date: null, paper_type: 3, language: null,
  citation_count: null, pages: null, keywords: [], authors: [], boundMembers: [], oss_file_id: null,
  preview_url: null, download_url: null, file_url: null, link: null, uploadUserId: 'user-demo', uploadUserName: null,
  institutionId: null, institutionName: null, labId: null, labName: null, reviewStatus: 'approved', reviewNotes: null,
  reviewedAt: null, createdAt: '2020-01-01', updatedAt: '2020-01-01',
}
let app: App | undefined
let router: Router
const settle = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
const mount = async (path: string): Promise<void> => {
  router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/papers', name: 'Papers', component: Papers },
    { path: '/institutions/:slug/papers', name: 'InstitutionPapers', component: Papers },
    { path: '/institutions/:slug/colleges/:collegeSlug/papers', name: 'InstitutionCollegePapers', component: Papers },
    { path: '/labs/:slug/papers', name: 'LabPapers', component: Papers },
    { path: '/theses', name: 'Theses', component: Theses },
    { path: '/theses/mine', name: 'MyTheses', component: MyTheses },
    { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
  ] })
  await router.push(path)
  await router.isReady()
  app = createApp({ render: () => h(RouterView) })
  // Native controls keep these tests focused on page behavior, not Arco internals.
  app.component('a-input', { props: ['modelValue'], emits: ['update:modelValue', 'press-enter'], template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" @keydown.enter="$emit(\'press-enter\')" />' })
  app.component('a-select', { props: ['modelValue'], emits: ['update:modelValue'], template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select>' })
  app.component('a-option', { props: ['value'], template: '<option :value="value"><slot /></option>' })
  app.component('a-input-number', { props: ['modelValue'], emits: ['update:modelValue'], template: '<input type="number" :value="modelValue" @input="$emit(\'update:modelValue\', Number($event.target.value))" />' })
  app.component('a-button', { template: '<button><slot /></button>' })
  app.component('a-pagination', { props: ['current'], emits: ['change'], template: '<button class="next-publications" @click="$emit(\'change\', current + 1)">Next</button>' })
  const root = document.createElement('div')
  document.body.append(root)
  app.use(i18n).use(router).mount(root)
  await settle()
}
const input = async (selector: string, value: string): Promise<void> => {
  const element = document.querySelector<HTMLInputElement>(selector)!
  element.value = value
  element.dispatchEvent(new Event('input', { bubbles: true }))
  await settle()
}
const search = async (): Promise<void> => {
  document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await settle()
}
const clickText = async (text: string): Promise<void> => {
  const button = Array.from(document.querySelectorAll('button')).find((element) => element.textContent?.trim() === text)
  expect(button).toBeDefined()
  button!.click()
  await settle()
}

beforeEach(() => {
  vi.resetAllMocks()
  i18n.global.locale.value = 'zh-CN'
  vi.mocked(getDegreeThesisFacets).mockResolvedValue({ training_units: ['示例学院'], majors: ['示例专业'], degree_categories: ['博士'], award_years: [2026] })
  vi.mocked(listDegreeTheses).mockResolvedValue({ items: [thesis()], total: 45 })
  vi.mocked(listMyDegreeTheses).mockResolvedValue({ items: [thesis()], total: 1 })
  vi.mocked(listPapers).mockResolvedValue({ items: [paper], total: 25, statusTotals: { approved: 25, archived: 0, changes_requested: 0, draft: 0, pending_review: 0 } })
  vi.mocked(searchAuthors).mockResolvedValue({ items: [], total: 0 })
})
afterEach(() => {
  app?.unmount()
  app = undefined
  document.body.replaceChildren()
})

describe('paper library pages', () => {
  it.each(['/papers', '/theses'])('has one library heading, no initial reset and collapsed advanced filters on %s', async (path): Promise<void> => {
    await mount(path)
    expect([...document.querySelectorAll('h1')].map((h) => h.textContent)).toEqual([i18n.global.t('nav.papers')])
    expect(document.querySelector('button[aria-controls]')?.getAttribute('aria-expanded')).toBe('false')
    expect(document.querySelector('form')?.textContent).not.toContain(i18n.global.t('papersPage.resetFilters'))
    expect(document.querySelector('article h2 a')).not.toBeNull()
    expect(document.querySelectorAll('article a')).toHaveLength(1)
    if (path === '/theses') {
      for (const value of [version.title_en, version.author_name, version.training_unit, version.major, '2026', '博士', 'TH-DEMO-001']) {
        expect(document.querySelector('article')?.textContent).toContain(value)
      }
    }
  })

  it('keeps the configured institution visible but folds college and lab links', async (): Promise<void> => {
    vi.mocked(getInstitution).mockResolvedValue({ id: 'demo', name: '示例大学', slug: 'demo',
      labs: [{ id: 'lab-demo', slug: 'sample', name: '示例实验室', college: '示例学院' }],
    } as Awaited<ReturnType<typeof getInstitution>>)
    await mount('/institutions/demo/papers')
    expect(document.querySelector('.library-context')?.textContent).toBe('示例大学')
    const browse = document.querySelector('details')!
    expect(browse.open).toBe(false)
    browse.querySelector('summary')!.click()
    expect(browse.open).toBe(true)
    expect([...browse.querySelectorAll('a')].map((a) => a.textContent.trim())).toEqual(['示例学院', '示例实验室'])
    expect(listPapers).toHaveBeenLastCalledWith(expect.objectContaining({ institution_id: 'demo' }))
  })

  it('applies the visible sort to the committed search and supports browser Back', async (): Promise<void> => {
    await mount('/papers?q=history&page=2')
    await input('.papers-search-input', 'unsubmitted')
    const sort = document.querySelector<HTMLSelectElement>('.results-toolbar select')!
    sort.value = 'citations'
    sort.dispatchEvent(new Event('change', { bubbles: true }))
    await settle()
    expect(router.currentRoute.value.query).toEqual({ q: 'history', sort: 'citations' })
    expect(listPapers).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'history', sort: 'citations', offset: 0 }))
    router.back()
    await settle()
    expect(sort.value).toBe('relevance')
    expect(listPapers).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'history', offset: 10 }))
  })

  it('keeps bookmarking separate from reading and does not bypass login', async (): Promise<void> => {
    const login = vi.fn()
    await mount('/papers')
    window.addEventListener('auth:open-login', login, { once: true })
    const button = document.querySelector<HTMLButtonElement>('.paper-bookmark')!
    expect(button.closest('a')).toBeNull()
    expect(button.getAttribute('aria-pressed')).toBe('false')
    button.click()
    expect(login).toHaveBeenCalledOnce()
    expect(router.currentRoute.value.path).toBe('/papers')
    expect(document.querySelector('article')?.textContent?.match(/2020/g)).toHaveLength(1)
  })

  it('restores all thesis filters from the URL, expands them and preserves the original links', async (): Promise<void> => {
    await mount('/theses?q=cell&year=2026&unit=示例学院&degree=博士&major=示例专业&page=2')
    expect(listDegreeTheses).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'cell', training_unit: '示例学院', degree_category: '博士', major: '示例专业', year_from: 2026, year_to: 2026, offset: 20 }))
    expect(document.querySelector('[aria-controls="thesis-filters"]')?.getAttribute('aria-expanded')).toBe('true')
    for (const path of ['/theses/submit', '/theses/mine', '/theses/TH-DEMO-001']) expect(document.querySelector(`a[href="${path}"]`)).not.toBeNull()
    expect(submitDegreeThesis).not.toHaveBeenCalled()
  })

  it('searches on Enter/form submission, paginates applied filters and resets them', async (): Promise<void> => {
    await mount('/theses')
    await input('#thesis-search', 'cell')
    await search()
    expect(router.currentRoute.value.query).toEqual({ q: 'cell' })
    await input('#thesis-search', 'unsubmitted draft')
    await clickText(i18n.global.t('degreeTheses.nextPage'))
    expect(router.currentRoute.value.query).toEqual({ q: 'cell', page: '2' })
    expect(listDegreeTheses).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'cell', offset: 20 }))
    await router.push('/theses?q=cell')
    await settle()
    expect(listDegreeTheses).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 0 }))
    await clickText(i18n.global.t('papersPage.resetFilters'))
    expect(router.currentRoute.value.query).toEqual({})
  })

  it('applies filter selections without losing the keyword', async (): Promise<void> => {
    await mount('/theses?q=cell')
    const select = document.querySelector<HTMLSelectElement>('#thesis-filters select')!
    select.value = '2026'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await search()
    expect(router.currentRoute.value.query).toEqual({ q: 'cell', year: '2026' })
    expect(listDegreeTheses).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'cell', year_from: 2026, year_to: 2026 }))
  })

  it('supports empty results, retry and a failed facets request without leaking errors', async (): Promise<void> => {
    vi.mocked(getDegreeThesisFacets).mockRejectedValueOnce(new Error('internal endpoint'))
    vi.mocked(listDegreeTheses).mockRejectedValueOnce(new Error('private signed URL'))
    await mount('/theses?q=missing&unit=历史示例学院')
    expect(document.querySelector('[role="alert"]')).not.toBeNull()
    expect(document.body.textContent).not.toContain('private signed URL')
    expect(document.querySelector('.filter-hint')).not.toBeNull()
    expect(document.querySelector('option[value="历史示例学院"]')).not.toBeNull()
    vi.mocked(listDegreeTheses).mockResolvedValue({ items: [], total: 0 })
    await clickText(i18n.global.t('paperLibrary.retry'))
    expect(document.body.textContent).toContain(i18n.global.t('paperLibrary.noMatches'))
    expect(document.querySelector('.pagination')).toBeNull()
  })

  it('ignores stale results when the search changes', async (): Promise<void> => {
    let resolveOld!: (value: { items: DegreeThesis[], total: number }) => void
    vi.mocked(listDegreeTheses).mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve }))
    await mount('/theses?q=old')
    await router.push('/theses?q=new')
    await settle()
    resolveOld({ items: [thesis({ published_version: { ...version, title: 'Stale title' } })], total: 1 })
    await settle()
    expect(document.body.textContent).toContain(version.title)
    expect(document.body.textContent).not.toContain('Stale title')
  })

  it('returns an out-of-range page to the beginning without a request loop', async (): Promise<void> => {
    vi.mocked(listDegreeTheses).mockResolvedValue({ items: [], total: 0 })
    await mount('/theses?q=missing&page=9')
    expect(router.currentRoute.value.query).toEqual({ q: 'missing' })
    expect(listDegreeTheses).toHaveBeenCalledTimes(2)
  })

  it('retains historical thesis bibliography records and publication filter URLs', async (): Promise<void> => {
    await mount('/papers?q=history&type=3&author=author-demo&sort=citations&from=2019&to=2026&page=2')
    expect(listPapers).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'history', paper_type: 3, author_id: 'author-demo', sort: 'citations', year_from: 2019, year_to: 2026, offset: 10 }))
    expect(document.body.textContent).toContain(paper.title)
    expect(document.querySelector('a[href="/papers/paper-demo"]')).not.toBeNull()
    expect(document.querySelector('.library-sections a[href="/theses?q=history"]')).not.toBeNull()
    await input('.papers-search-input', 'draft')
    document.querySelector<HTMLButtonElement>('.next-publications')!.click()
    await settle()
    expect(router.currentRoute.value.query.q).toBe('history')
    expect(listPapers).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 20, paper_type: 3 }))
  })

  it('does not imply that an institution-wide thesis list is scoped to a laboratory', async (): Promise<void> => {
    vi.mocked(getLab).mockResolvedValue({ id: 'lab-demo', name: '示例实验室' } as Awaited<ReturnType<typeof getLab>>)
    await mount('/labs/example/papers')
    expect(document.querySelector('.paper-library-navigation')).toBeNull()
    expect(listPapers).toHaveBeenLastCalledWith(expect.objectContaining({ lab_id: 'lab-demo' }))
  })

  it('keeps existing personal submission and edit eligibility', async (): Promise<void> => {
    vi.mocked(listMyDegreeTheses).mockResolvedValue({ items: [thesis({ can_edit: true, status: 'draft' })], total: 1 })
    await mount('/theses/mine')
    expect(document.querySelectorAll('h1')).toHaveLength(1)
    expect(document.querySelector('a[href="/theses/thesis-demo/edit"]')).not.toBeNull()
    expect(document.body.textContent).toContain(i18n.global.t('degreeTheses.submitReview'))
    expect(submitDegreeThesis).not.toHaveBeenCalled()
    expect(document.querySelector('.library-back-link')?.getAttribute('href')).toBe('/theses')
  })

  it('does not expose edit or submit actions for a non-editable record', async (): Promise<void> => {
    await mount('/theses/mine')
    expect(document.querySelector('a[href="/theses/thesis-demo/edit"]')).toBeNull()
    expect(document.querySelector('.card-actions button')).toBeNull()
  })
})
