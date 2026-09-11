// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, type App } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { Button } from '@arco-design/web-vue'
import i18n from '@/i18n'
import About from '@/views/About.vue'
import SideBar from '@/components/layout/SideBar.vue'
import { apiClient } from '@/api/client'
import { getSystemVersion, type SystemVersion } from '@/api/version'
import { webVersion } from '@/utils/version'
import repositoryVersion from '../../../VERSION?raw'

let app: App | undefined
const server: SystemVersion = { version: webVersion, tag: `v${webVersion}`, commit: 'abcdef123456', buildTime: '2026-09-11T00:00:00Z', dirty: false }
const response = (data: unknown): { data: unknown; status: number; headers: Headers } => ({ data, status: 200, headers: new Headers() })
const settle = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) { await Promise.resolve(); await nextTick() }
}
const mount = async (path = '/about'): Promise<void> => {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/about', component: About },
    { path: '/:pathMatch(.*)*', component: { render: (): null => null } },
  ] })
  await router.push(path)
  const root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({ render: () => h('div', [h(SideBar), h(RouterView)]) })
  app.use(Button).use(i18n).use(router).mount(root)
  await settle()
}

beforeEach(() => {
  i18n.global.locale.value = 'zh-CN'
  vi.spyOn(apiClient, 'get').mockResolvedValue(response({ code: 0, data: server }))
})
afterEach(() => {
  app?.unmount()
  app = undefined
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('product version information', () => {
  it('uses the repository product version rather than a separate hardcoded frontend version', () => {
    expect(webVersion).toBe(repositoryVersion.trim())
  })
  it('provides a quiet sidebar entry without making a version request on every page', async () => {
    await mount('/papers')
    const link = document.querySelector<HTMLAnchorElement>('.sidebar-copyright a')
    expect(link?.getAttribute('href')).toBe('/about')
    expect(link?.textContent).toContain(`v${webVersion}`)
    expect(link?.getAttribute('aria-label')).toContain('关于 Airalogy Scholar')
    expect(apiClient.get).not.toHaveBeenCalled()
    link?.click()
    await vi.waitFor(() => { expect(document.querySelector('#about-title')).not.toBeNull() })
    expect(apiClient.get).toHaveBeenCalledOnce()
  })

  it('shows the actual web and server builds without prompting for sign-in', async () => {
    await mount()
    expect(document.body.textContent).toContain('关于 Airalogy Scholar')
    expect(document.querySelectorAll('.version-details dd')[0].textContent).toBe(`v${webVersion}`)
    expect(document.querySelectorAll('.version-details dd')[1].textContent).toBe(`v${webVersion}`)
    expect(document.body.textContent).toContain('abcdef123456')
    expect(document.querySelector('.version-warning')).toBeNull()
    expect(apiClient.get).toHaveBeenCalledWith('/version', { signal: expect.any(AbortSignal), timeout: 8000, promptOnUnauthorized: false })
  })

  it('does not hide mismatched versions or local modifications', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(response({ code: 0, data: { ...server, version: '0.0.0', dirty: true } }))
    await mount()
    expect(document.querySelector('.version-warning')?.textContent).toContain('前端与 API 版本不一致')
    expect(document.body.textContent).toContain('此 API 构建包含未提交的修改')
    expect(document.querySelectorAll('.version-details dd')[1].textContent).toBe('v0.0.0')
  })

  it('localizes the sidebar company name while retaining both names once on the about page', async () => {
    await mount()
    const notice = document.querySelector('.product-notice')
    const footerCompany = document.querySelector('.sidebar-copyright .copyright-line')
    const chinese = '杭州渊楠科技有限公司'
    const english = 'Hangzhou Airalogy Technology Co., Ltd.'
    expect(footerCompany?.textContent).toBe(chinese)
    expect(notice?.textContent).toContain(`Airalogy Scholar © 2026 ${chinese}（${english}）`)
    expect(notice?.textContent?.split(chinese)).toHaveLength(2)
    expect(notice?.textContent?.split(english)).toHaveLength(2)
    expect(notice?.textContent).toContain('Airalogy 是该公司的注册商标。')
    expect(notice?.textContent).not.toContain('registered trademark')
    expect(notice?.textContent).not.toContain('Apache License')
    expect(notice?.querySelector('a')).toBeNull()
    expect(document.querySelector('.about-card a')).toBeNull()
    expect(document.querySelector('.about-card')?.textContent).not.toContain('查看发布记录')

    i18n.global.locale.value = 'en-US'
    await settle()
    expect(footerCompany?.textContent).toBe(english)
    expect(notice?.textContent).toContain(`Airalogy Scholar © 2026 ${english} (${chinese})`)
    expect(notice?.textContent?.split(chinese)).toHaveLength(2)
    expect(notice?.textContent?.split(english)).toHaveLength(2)
    expect(notice?.textContent).toContain('Airalogy is a registered trademark of the company.')
    expect(notice?.textContent).not.toContain('Apache License')
    expect(document.querySelector('.about-card a')).toBeNull()
    expect(document.querySelector('.about-card')?.textContent).not.toContain('View release history')
  })

  it('retains the web version on failure and supports retry without inventing a server version', async () => {
    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('Offline'))
    await mount()
    expect(document.querySelector('.version-error')).not.toBeNull()
    expect(document.querySelectorAll('.version-details dd')[0].textContent).toBe(`v${webVersion}`)
    expect(document.querySelectorAll('.version-details dd')[1].textContent).toBe('暂不可用')
    expect(document.querySelector('.product-notice')?.textContent).toContain('杭州渊楠科技有限公司')
    document.querySelector<HTMLButtonElement>('.version-error button')?.click()
    await settle()
    expect(apiClient.get).toHaveBeenCalledTimes(2)
    expect(document.querySelector('.version-error')).toBeNull()
  })

  it('cancels an in-flight request when leaving the page', async () => {
    let resolve: (result: ReturnType<typeof response>) => void = (): void => undefined
    vi.mocked(apiClient.get).mockReturnValue(new Promise((done) => { resolve = done }))
    await mount()
    const signal = vi.mocked(apiClient.get).mock.calls[0][1]?.signal
    expect(signal?.aborted).toBe(false)
    app?.unmount()
    app = undefined
    expect(signal?.aborted).toBe(true)
    resolve(response({ code: 0, data: server }))
    await settle()
    expect(document.querySelector('#about-title')).toBeNull()
  })

  it('uses English labels and hides missing build details', async () => {
    i18n.global.locale.value = 'en-US'
    vi.mocked(apiClient.get).mockResolvedValue(response({ code: 0, data: { ...server, commit: 'unknown', buildTime: null } }))
    await mount()
    expect(document.querySelector('#about-title')?.textContent).toBe('About Airalogy Scholar')
    expect(document.body.textContent).toContain('Web version')
    expect(document.body.textContent).toContain('API version')
    expect(document.querySelector('.build-commit')).toBeNull()
    expect(document.querySelectorAll('.version-details dd')).toHaveLength(2)
  })

  it('rejects malformed successful responses', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(response({ code: 0, data: { version: '' } }))
    await expect(getSystemVersion()).rejects.toThrow('Version information unavailable')
  })
})
