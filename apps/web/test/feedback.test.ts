// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, type App as VueApp } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { Button, ConfigProvider, Form, Input, Message, Modal, Select, Textarea } from '@arco-design/web-vue'
import App from '@/App.vue'
import i18n from '@/i18n'
import { useAuth } from '@/composables/useAuth'
import { submitFeedback, type FeedbackItem } from '@/api/feedback'

vi.mock('@/api/feedback', () => ({ submitFeedback: vi.fn() }))
vi.mock('@/api/users', () => ({
  getMyProfile: vi.fn().mockResolvedValue({ avatar_url: '', admin_access: null }),
}))
vi.mock('@/components/LoginModal.vue', () => ({ default: { render: (): null => null } }))

let app: VueApp | undefined
const settle = async (): Promise<void> => {
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 60))
}
const getElement = <T extends HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Missing test element: ${selector}`)
  return element
}
const mountApp = async (): Promise<void> => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { render: () => h('textarea', { class: 'page-draft', value: 'Existing work' }) } }],
  })
  await router.push('/papers')
  app = createApp(App)
  for (const component of [Button, ConfigProvider, Form, Input, Modal, Select, Textarea]) app.use(component)
  app.use(i18n)
  app.use(router)
  app.mount(container)
  await settle()
}
const openFeedback = async (): Promise<HTMLButtonElement> => {
  const trigger = getElement<HTMLButtonElement>('.sidebar-bottom button[aria-haspopup="dialog"]')
  trigger.focus()
  trigger.click()
  await vi.waitFor(() => {
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    expect(document.activeElement).toBe(getElement('.feedback-form input'))
  }, { timeout: 2000 })
  return trigger
}
const expectFeedbackClosed = async (trigger?: HTMLElement): Promise<void> => {
  // Vue/Arco finish closing after animation frames, not a fixed wall-clock delay.
  await vi.waitFor(() => {
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    if (trigger) expect(document.activeElement).toBe(trigger)
  }, { timeout: 2000 })
}
const input = async (selector: string, value: string): Promise<void> => {
  const element = getElement<HTMLInputElement | HTMLTextAreaElement>(selector)
  element.value = value
  element.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
}
const fillFeedback = async (email = 'visitor@example.org'): Promise<void> => {
  await input('.feedback-form input', '  Page issue  ')
  await input('.feedback-form textarea', '  What happened  ')
  if (!useAuth().isLoggedIn.value) await input('.feedback-form input[autocomplete="email"]', email)
}
const submit = async (): Promise<void> => {
  getElement<HTMLButtonElement>('.feedback-form .arco-btn-primary').click()
  await settle()
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
  }))
  useAuth().logout()
  localStorage.clear()
  i18n.global.locale.value = 'zh-CN'
  vi.mocked(submitFeedback).mockReset().mockResolvedValue({} as FeedbackItem)
})

afterEach(async () => {
  app?.unmount()
  app = undefined
  Message.clear()
  await vi.waitFor(() => {
    expect(document.querySelector('.arco-overlay-message')).toBeNull()
  }, { timeout: 2000 })
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('sidebar feedback', () => {
  it('uses a quiet, labeled writing icon next to documentation without a floating chat button', async () => {
    await mountApp()
    const support = getElement('.sidebar-support')
    expect(support.textContent).toContain('使用文档')
    expect(support.textContent).toContain('意见反馈')
    expect(support.querySelector('.arco-icon-edit')).not.toBeNull()
    expect(support.querySelector('.arco-icon-message')).toBeNull()
    expect(document.querySelector('.feedback-float-btn')).toBeNull()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('opens a named dialog, focuses the title, and leaves the current page intact', async () => {
    await mountApp()
    await openFeedback()
    const dialog = getElement('[role="dialog"]')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(document.getElementById(dialog.getAttribute('aria-labelledby') ?? '')?.textContent).toBe('意见反馈')
    expect(document.activeElement).toBe(getElement('.feedback-form input'))
    expect(getElement('.app').hasAttribute('inert')).toBe(true)
    expect(getElement<HTMLTextAreaElement>('.page-draft').value).toBe('Existing work')
  })

  it('keeps keyboard focus within the dialog and restores it after Escape', async () => {
    await mountApp()
    const trigger = await openFeedback()
    const close = getElement<HTMLButtonElement>('.feedback-close')
    const send = getElement<HTMLButtonElement>('.feedback-form .arco-btn-primary')
    close.focus()
    close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(send)
    send.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(close)
    close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await expectFeedbackClosed(trigger)
    expect(getElement('.app').hasAttribute('inert')).toBe(false)
  })

  it('retains an unfinished draft when closed and reopened', async () => {
    await mountApp()
    await openFeedback()
    await fillFeedback()
    getElement<HTMLButtonElement>('.feedback-close').click()
    await expectFeedbackClosed()
    await openFeedback()
    expect(getElement<HTMLInputElement>('.feedback-form input').value).toBe('  Page issue  ')
    expect(getElement<HTMLTextAreaElement>('.feedback-form textarea').value).toBe('  What happened  ')
  })

  it('requires title, content and a valid contact email for anonymous submissions', async () => {
    const warning = vi.spyOn(Message, 'warning')
    await mountApp()
    await openFeedback()
    await submit()
    expect(warning).toHaveBeenLastCalledWith('请填写反馈标题')
    await input('.feedback-form input', 'Title')
    await submit()
    expect(warning).toHaveBeenLastCalledWith('请填写反馈内容')
    await input('.feedback-form textarea', 'Details')
    await submit()
    expect(warning).toHaveBeenLastCalledWith('未登录提交需要填写邮箱')
    await input('.feedback-form input[autocomplete="email"]', 'invalid')
    await submit()
    expect(warning).toHaveBeenLastCalledWith('请填写有效邮箱')
    expect(submitFeedback).not.toHaveBeenCalled()
  })

  it('submits anonymous feedback through the existing API and resets only after success', async () => {
    await mountApp()
    const trigger = await openFeedback()
    await fillFeedback('  visitor@example.org  ')
    await submit()
    expect(submitFeedback).toHaveBeenCalledExactlyOnceWith({ title: 'Page issue', type: 'bug_report', content: 'What happened', email: 'visitor@example.org' })
    await expectFeedbackClosed(trigger)
    await openFeedback()
    expect(getElement<HTMLInputElement>('.feedback-form input').value).toBe('')
    expect(getElement<HTMLTextAreaElement>('.feedback-form textarea').value).toBe('')
  })

  it('waits for slower animation frames before asserting successful dismissal', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback): number =>
      window.setTimeout(() => callback(performance.now()), 80))
    vi.stubGlobal('cancelAnimationFrame', (id: number): void => window.clearTimeout(id))
    await mountApp()
    const trigger = await openFeedback()
    await fillFeedback()
    await submit()
    await expectFeedbackClosed(trigger)
    expect(submitFeedback).toHaveBeenCalledTimes(1)
    await openFeedback()
    expect(getElement<HTMLInputElement>('.feedback-form input').value).toBe('')
  })

  it('does not ask signed-in users to reenter an email', async () => {
    useAuth().login('test-token', 'Test User')
    await mountApp()
    await openFeedback()
    expect(document.querySelector('.feedback-form input[autocomplete="email"]')).toBeNull()
    await fillFeedback()
    await submit()
    expect(submitFeedback).toHaveBeenCalledExactlyOnceWith({ title: 'Page issue', type: 'bug_report', content: 'What happened', email: undefined })
  })

  it('keeps the feature-suggestion option working inside the dialog', async () => {
    await mountApp()
    await openFeedback()
    await fillFeedback()
    getElement<HTMLElement>('.feedback-form .arco-select-view').click()
    await settle()
    const suggestion = [...document.querySelectorAll<HTMLElement>('.feedback-dialog .arco-select-option')]
      .find((element) => element.textContent?.includes('功能建议'))
    expect(suggestion).toBeDefined()
    suggestion?.click()
    await settle()
    await submit()
    expect(submitFeedback).toHaveBeenCalledExactlyOnceWith({ title: 'Page issue', type: 'feature_request', content: 'What happened', email: 'visitor@example.org' })
  })

  it('retains the draft and allows retry when submission fails', async () => {
    const error = vi.spyOn(Message, 'error')
    vi.mocked(submitFeedback).mockRejectedValueOnce(new Error('Unavailable'))
    await mountApp()
    await openFeedback()
    await fillFeedback()
    await submit()
    expect(error).toHaveBeenCalledWith('反馈提交失败')
    expect(getElement<HTMLInputElement>('.feedback-form input').value).toBe('  Page issue  ')
    await submit()
    expect(submitFeedback).toHaveBeenCalledTimes(2)
    await expectFeedbackClosed()
  })

  it('blocks duplicate submissions and premature dismissal while a request is pending', async () => {
    let resolveSubmission: (value: FeedbackItem) => void = () => {}
    vi.mocked(submitFeedback).mockReturnValue(new Promise((resolve) => { resolveSubmission = resolve }))
    await mountApp()
    await openFeedback()
    await fillFeedback()
    await submit()
    expect(getElement<HTMLButtonElement>('.feedback-close').disabled).toBe(true)
    await submit()
    getElement('.feedback-dialog').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await settle()
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    expect(submitFeedback).toHaveBeenCalledTimes(1)
    resolveSubmission({} as FeedbackItem)
    await expectFeedbackClosed()
  })

  it('keeps the same feedback entry available from the expanded mobile menu', async () => {
    await mountApp()
    getElement<HTMLButtonElement>('.menu-toggle').click()
    await settle()
    expect(getElement('.sidebar').classList.contains('sidebar--mobile-open')).toBe(true)
    const trigger = await openFeedback()
    getElement<HTMLButtonElement>('.feedback-close').click()
    await expectFeedbackClosed(trigger)
    expect(getElement('.sidebar').classList.contains('sidebar--mobile-open')).toBe(true)
    expect(document.activeElement).toBe(trigger)
  })

  it('switches both the entry and dialog to English', async () => {
    i18n.global.locale.value = 'en-US'
    await mountApp()
    const trigger = await openFeedback()
    expect(trigger.textContent).toBe('Feedback')
    expect(getElement('.feedback-title').textContent).toBe('Feedback')
    expect(getElement('.feedback-close').getAttribute('aria-label')).toBe('Close feedback')
  })
})
