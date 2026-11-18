// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, ref, type App, type Component } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import i18n from '@/i18n'
import PaperLibraryNavigation from '@/components/PaperLibraryNavigation.vue'
import SideBar from '@/components/layout/SideBar.vue'

vi.mock('@/composables/usePublicConfig', () => ({
  usePublicConfig: () => ({ features, paperLibrary }),
}))
const features = ref({ degreeTheses: true })
const paperLibrary = ref({ defaultPath: '/institutions/example-university/papers' })
let app: App | undefined

const mount = async (component: Component, path: string, name: string, props: Record<string, unknown> = {}): Promise<void> => {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: path.split('?')[0]!, name, component: { template: '<div />' } },
    { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
  ] })
  await router.push(path)
  await router.isReady()
  const root = document.createElement('div')
  document.body.append(root)
  app = createApp(component, props)
  app.use(i18n).use(router).mount(root)
  await nextTick()
}

beforeEach(() => {
  features.value.degreeTheses = true
  i18n.global.locale.value = 'zh-CN'
})
afterEach(() => {
  app?.unmount()
  document.body.replaceChildren()
})

describe('unified paper library navigation', () => {
  it.each(['zh-CN', 'en-US'] as const)('uses configured institution entry and carries only the keyword in %s', async (locale): Promise<void> => {
    i18n.global.locale.value = locale
    await mount(PaperLibraryNavigation, '/theses?q=cell&year=2026&unit=Example&page=2', 'Theses', { active: 'theses' })
    const links = Array.from(document.querySelectorAll('nav a'))
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/institutions/example-university/papers?q=cell', '/theses?q=cell',
    ])
    expect(links[0]?.textContent).toBe(i18n.global.t('paperLibrary.publications'))
    expect(links[1]?.getAttribute('aria-current')).toBe('page')
    expect(links[0]?.getAttribute('aria-current')).toBeNull()
  })

  it('renders the library heading only when the parent delegates the page title', async (): Promise<void> => {
    await mount(PaperLibraryNavigation, '/papers', 'Papers', { active: 'publications', heading: true, context: '示例大学', hint: '示例说明' })
    expect(document.querySelector('h1')?.textContent).toBe(i18n.global.t('nav.papers'))
    expect(document.querySelector('.library-context')?.textContent).toBe('示例大学')
    expect(document.querySelector('.library-hint')?.textContent).toBe('示例说明')
  })

  it('hides the thesis category when the existing feature switch is off', async (): Promise<void> => {
    features.value.degreeTheses = false
    await mount(PaperLibraryNavigation, '/papers', 'Papers', { active: 'publications' })
    expect(document.querySelector('h1')).toBeNull()
    expect(document.querySelector('nav')).toBeNull()
    expect(document.body.textContent).toContain(i18n.global.t('nav.papers'))
  })

  it.each([
    ['Theses', '/theses'], ['ThesisSubmit', '/theses/submit'], ['MyTheses', '/theses/mine'],
    ['ThesisEdit', '/theses/example/edit'], ['ThesisDetail', '/theses/TH-DEMO-001'],
    ['Papers', '/papers'], ['PaperDetail', '/papers/example'],
  ])('keeps one sidebar entry active on %s', async (name, path): Promise<void> => {
    await mount(SideBar, path!, name!, { showDegreeTheses: true })
    expect(document.querySelector('.nav-item--active')?.textContent).toContain(i18n.global.t('nav.papers'))
    expect(document.querySelectorAll('a[href="/theses"]')).toHaveLength(0)
    expect(document.querySelectorAll('.nav-item--active')).toHaveLength(1)
  })

  it('does not grant administrator or upload access through the unified entry', async (): Promise<void> => {
    await mount(SideBar, '/theses', 'Theses', { showDegreeTheses: true, isLoggedIn: false, canAccessAdmin: false, showUpload: false })
    expect(document.querySelector('a[href="/admin"]')).toBeNull()
    expect(document.querySelector('a[href="/upload"]')).toBeNull()
    expect(document.querySelector('a[href="/reviews"]')).toBeNull()
  })
})
