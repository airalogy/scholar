// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, ref, h, type App } from 'vue'
import { createMemoryHistory, createRouter, RouterView, type Router } from 'vue-router'
import i18n from '@/i18n'
import Scholars from '@/views/Scholars.vue'
import { getScholarDirectory, type ScholarDirectoryData } from '@/api/scholars'
import { parseDirectoryQuery, directoryQuery } from '@/composables/useScholarDirectory'

vi.mock('@/api/scholars', () => ({ getScholarDirectory: vi.fn() }))
vi.mock('@/components/RagChatFloat.vue', () => ({ default: { template: '<div data-chat />' } }))
vi.mock('@/composables/useAuth', () => ({ useAuth: () => ({ isLoggedIn: ref(false) }) }))
vi.mock('@/composables/usePublicConfig', () => ({
  usePublicConfig: () => ({ features: ref({ aiChat: false }), paperLibrary }),
}))
const paperLibrary = ref({ fixedInstitutionSlug: 'example-university' })
const subjectId = '00000000-0000-4000-8000-000000000010'
const childSubjectId = '00000000-0000-4000-8000-000000000011'
const fixture = (overrides: Partial<ScholarDirectoryData> = {}): ScholarDirectoryData => ({
  items: [
    {
      id: '00000000-0000-4000-8000-000000000001',
      name: '示例学者',
      avatar: null,
      title: 'Professor',
      units: [{ id: 'org:department', name: '示例物理系' }],
      research: ['光学'],
      summary: 'Example profile',
      letter: 'S',
    },
  ],
  total: 1,
  page: 1,
  limit: 24,
  nameOrder: 'pinyin',
  facets: {
    units: [
      { id: 'org:college', name: '示例理学院', kind: 'college', parentId: null, count: 1 },
      {
        id: 'org:department',
        name: '示例物理系',
        kind: 'department',
        parentId: 'org:college',
        count: 1,
      },
    ],
    subjects: [
      {
        id: subjectId,
        code: 'science',
        nameZh: '示例科学',
        nameEn: 'Example science',
        parentId: null,
        count: 1,
      },
      {
        id: childSubjectId,
        code: 'physics',
        nameZh: '示例物理学',
        nameEn: 'Example physics',
        parentId: subjectId,
        count: 1,
      },
    ],
    letters: [{ letter: 'S', count: 1 }],
  },
  ...overrides,
})
let app: App | undefined
let router: Router
const settle = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
const mount = async (url = '/scholars'): Promise<void> => {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/scholars', component: Scholars },
      { path: '/scholars/:id', component: { template: '<p>Example profile</p>' } },
    ],
  })
  await router.push(url)
  await router.isReady()
  const root = document.createElement('div')
  document.body.append(root)
  app = createApp({ render: () => h(RouterView) })
  app.use(router).use(i18n).mount(root)
  await settle()
}
const button = (label: string, scope: ParentNode = document): HTMLButtonElement => {
  const found = [...scope.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === label,
  )
  if (!found) throw new Error(`Button not found: ${label}`)
  return found as HTMLButtonElement
}
const input = async (value: string): Promise<HTMLInputElement> => {
  const field = document.querySelector<HTMLInputElement>('#scholar-search')!
  field.value = value
  field.dispatchEvent(new Event('input', { bubbles: true }))
  await settle()
  return field
}
const deferred = <T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: Error) => void
} => {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  paperLibrary.value = { fixedInstitutionSlug: 'example-university' }
  i18n.global.locale.value = 'zh-CN'
  vi.mocked(getScholarDirectory).mockImplementation(async (query) =>
    fixture({ page: query.page ?? 1 }),
  )
})
afterEach(() => {
  app?.unmount()
  app = undefined
  document.body.replaceChildren()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('scholar directory query state', () => {
  it('validates URL inputs and round-trips supported fields', () => {
    const state = parseDirectoryQuery({
      q: ' Alice ',
      page: '6',
      letter: 'a',
      subject: subjectId,
      unit: 'org:college',
      sort: 'name',
    })
    expect(state).toEqual({
      q: 'Alice',
      page: 6,
      letter: 'A',
      subject: subjectId,
      unit: 'org:college',
      sort: 'name',
    })
    expect(directoryQuery(state)).toEqual({
      q: 'Alice',
      page: '6',
      letter: 'A',
      subject: subjectId,
      unit: 'org:college',
      sort: 'name',
    })
    expect(
      parseDirectoryQuery({
        q: ['a', 'b'],
        page: '-2',
        letter: 'AA',
        subject: 'invalid',
        sort: 'random',
      }),
    ).toEqual({ q: '', page: 1, letter: '', subject: '', unit: '', sort: 'relevance' })
    expect(parseDirectoryQuery({ q: 'a'.repeat(400), page: '1.5' }).q.length).toBe(200)
    expect(parseDirectoryQuery({ page: '100001' }).page).toBe(1)
  })
  it('restores bookmark filters, page and sort and sends only the scoped lightweight request', async () => {
    await mount(
      `/scholars?q=Alice&unit=org%3Adepartment&subject=${subjectId}&letter=A&page=6&sort=name`,
    )
    expect(getScholarDirectory).toHaveBeenLastCalledWith(
      {
        q: 'Alice',
        unit: 'org:department',
        subject_id: subjectId,
        letter: 'A',
        sort: 'name',
        page: 6,
        limit: 24,
        institution_slug: 'example-university',
      },
      expect.any(AbortSignal),
    )
    expect(document.querySelector<HTMLInputElement>('#scholar-search')!.value).toBe('Alice')
    expect(document.querySelectorAll('.active-filters button')).toHaveLength(5)
  })
  it('debounces search and resets pagination', async () => {
    await mount('/scholars?page=6')
    await input('Ali')
    await vi.advanceTimersByTimeAsync(150)
    await input('Alice')
    await vi.advanceTimersByTimeAsync(299)
    expect(getScholarDirectory).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await settle()
    expect(router.currentRoute.value.query).toEqual({ q: 'Alice' })
    expect(getScholarDirectory).toHaveBeenCalledTimes(2)
  })
  it('does not search during Chinese input composition', async () => {
    await mount()
    const field = document.querySelector<HTMLInputElement>('#scholar-search')!
    field.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    await input('shi')
    await vi.advanceTimersByTimeAsync(500)
    expect(getScholarDirectory).toHaveBeenCalledTimes(1)
    field.value = '示例'
    field.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(300)
    await settle()
    expect(vi.mocked(getScholarDirectory).mock.lastCall?.[0].q).toBe('示例')
  })
  it('submits immediately and clears all filters without resetting the chosen sort', async () => {
    await mount('/scholars?unit=org%3Acollege&sort=name')
    await input('Example')
    document
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await settle()
    expect(router.currentRoute.value.query.q).toBe('Example')
    button('重置筛选').click()
    await settle()
    expect(router.currentRoute.value.query).toEqual({ sort: 'name' })
  })
  it('restores directory state after opening a profile and returning', async () => {
    await mount('/scholars?letter=S&page=2')
    document.querySelector<HTMLAnchorElement>('.profile-link')!.click()
    await settle()
    expect(router.currentRoute.value.path).toContain('/scholars/0000')
    router.back()
    await settle()
    expect(router.currentRoute.value.query).toEqual({ letter: 'S', page: '2' })
  })
})

describe('scholar directory feedback and request lifecycle', () => {
  it('shows loading then results, never raw translation keys or employee identifiers', async () => {
    const pending = deferred<ScholarDirectoryData>()
    vi.mocked(getScholarDirectory).mockReturnValueOnce(pending.promise)
    await mount()
    expect(document.querySelector('.skeleton-grid')).not.toBeNull()
    expect(document.querySelector('.directory-results')!.getAttribute('aria-busy')).toBe('true')
    pending.resolve(fixture())
    await settle()
    expect(document.querySelector('.directory-card h2')!.textContent).toBe('示例学者')
    expect(document.body.textContent).not.toContain('scholars.')
    expect(document.body.textContent).not.toContain('工号')
  })
  it('shows a retryable error without losing query state', async () => {
    vi.mocked(getScholarDirectory).mockRejectedValueOnce(new Error('offline'))
    await mount('/scholars?q=Alice')
    expect(document.querySelector('[role=alert]')).not.toBeNull()
    expect(document.querySelector<HTMLInputElement>('#scholar-search')!.value).toBe('Alice')
    button('重新加载').click()
    await settle()
    expect(document.querySelector('[role=alert]')).toBeNull()
    expect(document.querySelector('.directory-card')).not.toBeNull()
  })
  it('distinguishes empty directory from no matching results', async () => {
    vi.mocked(getScholarDirectory).mockResolvedValue(fixture({ total: 0, items: [] }))
    await mount()
    expect(document.querySelector('.directory-state')!.textContent).toContain('暂无学者数据')
    await router.push('/scholars?q=unknown')
    await settle()
    expect(document.querySelector('.directory-state')!.textContent).toContain('没有找到符合条件')
    expect(document.querySelector('.directory-state button')).not.toBeNull()
  })
  it('aborts old requests and ignores late responses', async () => {
    const first = deferred<ScholarDirectoryData>()
    vi.mocked(getScholarDirectory).mockReturnValueOnce(first.promise)
    await mount()
    const signal = vi.mocked(getScholarDirectory).mock.calls[0]![1]!
    await router.push('/scholars?q=Alice')
    await settle()
    expect(signal.aborted).toBe(true)
    first.resolve(fixture({ items: [], total: 0 }))
    await settle()
    expect(document.querySelector('.directory-card')).not.toBeNull()
  })
  it('aborts requests and cancels pending searches on unmount', async () => {
    vi.mocked(getScholarDirectory).mockReturnValueOnce(deferred<ScholarDirectoryData>().promise)
    await mount()
    const signal = vi.mocked(getScholarDirectory).mock.calls[0]![1]!
    await input('Alice')
    app!.unmount()
    app = undefined
    await vi.advanceTimersByTimeAsync(500)
    expect(signal.aborted).toBe(true)
    expect(getScholarDirectory).toHaveBeenCalledTimes(1)
  })
  it('refreshes with the configured institution when configuration changes', async () => {
    await mount()
    paperLibrary.value.fixedInstitutionSlug = 'other-example'
    await settle()
    expect(vi.mocked(getScholarDirectory).mock.lastCall?.[0].institution_slug).toBe('other-example')
  })
  it('corrects out-of-range bookmarks and keeps usable pagination past 100 scholars', async () => {
    vi.mocked(getScholarDirectory).mockImplementation(async (query) =>
      fixture({ total: 145, page: Math.min(query.page ?? 1, 7) }),
    )
    await mount('/scholars?page=999')
    expect(router.currentRoute.value.query.page).toBe('7')
    expect(button('下一页').disabled).toBe(true)
    button('上一页').click()
    await settle()
    expect(router.currentRoute.value.query.page).toBe('6')
    expect(document.activeElement?.className).toBe('results-toolbar')
  })
})

describe('scholar directory navigation and presentation', () => {
  it('collapses filters on small screens, allows manual expansion and cleans up viewport changes', async () => {
    let updateViewport: (() => void) | undefined
    const media = {
      matches: true,
      addEventListener: vi.fn((_type: string, listener: () => void): void => {
        updateViewport = listener
      }),
      removeEventListener: vi.fn(),
    }
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => media),
    )
    await mount()
    const filters = document.querySelector<HTMLDetailsElement>('details')!
    expect(filters.open).toBe(false)
    filters.querySelector('summary')!.click()
    await vi.advanceTimersByTimeAsync(0)
    await settle()
    expect(filters.open).toBe(true)
    media.matches = false
    updateViewport!()
    await settle()
    expect(filters.open).toBe(true)
    media.matches = true
    updateViewport!()
    await settle()
    expect(filters.open).toBe(false)
    app!.unmount()
    app = undefined
    expect(media.removeEventListener).toHaveBeenCalledWith('change', updateViewport)
  })
  it('navigates college and department hierarchy separately from academic subjects', async () => {
    await mount()
    expect(document.querySelector('#filter-unit')!.textContent).toBe('学院')
    button('示例理学院1').click()
    await settle()
    expect(document.querySelector('.filter-breadcrumb')!.textContent).toContain('示例理学院')
    button('示例物理系1').click()
    await settle()
    expect(router.currentRoute.value.query.unit).toBe('org:department')
    button('示例科学1').click()
    await settle()
    button('示例物理学1').click()
    await settle()
    expect(router.currentRoute.value.query.subject).toBe(childSubjectId)
    expect(router.currentRoute.value.query.unit).toBe('org:department')
  })
  it.each(['department', 'unit'] as const)(
    'adapts headings for %s-only institutions',
    async (kind) => {
      const data = fixture()
      data.facets.units = [{ id: 'org:one', name: '示例单位', parentId: null, count: 1, kind }]
      vi.mocked(getScholarDirectory).mockResolvedValue(data)
      await mount()
      expect(document.querySelector('#filter-unit')!.textContent).toBe(
        kind === 'department' ? '系' : '院系 / 单位',
      )
    },
  )
  it('makes long unit lists searchable and expandable', async () => {
    const data = fixture()
    data.facets.units = Array.from({ length: 12 }, (_, index) => ({
      id: `unit:${index}`,
      name: `示例单位${index}`,
      parentId: null,
      count: 1,
      kind: 'unit',
    }))
    vi.mocked(getScholarDirectory).mockResolvedValue(data)
    await mount()
    const section = document.querySelector('#filter-unit')!.closest('section')!
    expect(section.querySelectorAll('.filter-option')).toHaveLength(9)
    button('展开全部（12）', section).click()
    await settle()
    expect(section.querySelectorAll('.filter-option')).toHaveLength(13)
    button('收起', section).click()
    const search = section.querySelector<HTMLInputElement>('input')!
    search.value = '示例单位11'
    search.dispatchEvent(new Event('input', { bubbles: true }))
    await settle()
    expect(section.querySelectorAll('.filter-option')).toHaveLength(2)
    button('示例单位111', section).click()
    await settle()
    expect(router.currentRoute.value.query.unit).toBe('unit:11')
  })
  it('keeps cyclic and orphaned historical subject categories reachable', async () => {
    const data = fixture()
    data.facets.subjects[0]!.parentId = childSubjectId
    vi.mocked(getScholarDirectory).mockResolvedValue(data)
    await mount()
    expect(button('示例科学1')).toBeDefined()
    expect(button('示例物理学1')).toBeDefined()
  })
  it('shows safe avatar fallbacks, missing metadata, English labels and alphabet selection', async () => {
    const data = fixture()
    data.items[0] = {
      ...data.items[0]!,
      avatar: 'javascript:alert(1)',
      units: [],
      research: [],
      summary: '',
    }
    vi.mocked(getScholarDirectory).mockResolvedValue(data)
    i18n.global.locale.value = 'en-US'
    await mount()
    expect(document.querySelector('.scholar-avatar img')).toBeNull()
    expect(document.querySelector('.avatar-fallback')!.textContent).toBe('示')
    expect(document.querySelector('.scholar-units')!.textContent).toContain('not provided')
    expect(document.body.textContent).toContain('Example science')
    expect(document.body.textContent).not.toContain('scholars.')
    button('Other').click()
    await settle()
    expect(router.currentRoute.value.query.letter).toBe('#')
  })
  it('falls back after an avatar load error and supports collapsed filters', async () => {
    const data = fixture()
    data.items[0]!.avatar = 'https://example.invalid/avatar.png'
    vi.mocked(getScholarDirectory).mockResolvedValue(data)
    await mount()
    document.querySelector('img')!.dispatchEvent(new Event('error'))
    await settle()
    expect(document.querySelector('.avatar-fallback')).not.toBeNull()
    const filters = document.querySelector<HTMLDetailsElement>('details')!
    expect(filters.open).toBe(true)
    filters.querySelector('summary')!.click()
    expect(filters.open).toBe(false)
  })
})
