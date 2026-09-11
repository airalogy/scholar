// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App, type Component } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { Button, Checkbox, Input, Textarea, Pagination, Popconfirm, Spin } from '@arco-design/web-vue'
import i18n from '@/i18n'
import { ApiError } from '@/api/client'
import * as identity from '@/api/identity'
import { completeOauth } from '@/api/auth'
import { useAuth } from '@/composables/useAuth'
import IdentityReviewRequest from '@/components/IdentityReviewRequest.vue'
import IdentityPersonPicker from '@/components/IdentityPersonPicker.vue'
import InstitutionIdentityRequestsPanel from '@/components/InstitutionIdentityRequestsPanel.vue'
import InstitutionIdentifiersPanel from '@/components/InstitutionIdentifiersPanel.vue'
import AiralogyOauthCallback from '@/views/AiralogyOauthCallback.vue'

vi.mock('@/api/identity', async importOriginal => ({
  ...await importOriginal<typeof import('@/api/identity')>(),
  getApplicantIdentityStatus: vi.fn(), submitApplicantIdentityRequest: vi.fn(),
  listIdentityPeople: vi.fn(), getIdentityPerson: vi.fn(), addIdentityIdentifier: vi.fn(), revokeIdentityIdentifier: vi.fn(),
  listIdentityRequests: vi.fn(), getIdentityRequest: vi.fn(), decideIdentityRequest: vi.fn(),
}))
vi.mock('@/api/auth', async importOriginal => ({ ...await importOriginal<typeof import('@/api/auth')>(), completeOauth: vi.fn() }))

const proof = { reason: 'institution_identity_conflict' as const, proofToken: 'A'.repeat(43), expiresAt: new Date(Date.now() + 900000).toISOString() }
const request: identity.IdentityRequest = { id: 'request-1', status: 'pending', previousInternalId: 'OLD-1', explanation: 'My enrolment changed', applicantMessage: null, createdAt: '2026-09-11T00:00:00Z', updatedAt: '2026-09-11T00:00:00Z' }
const adminRequest: identity.AdminIdentityRequest = { ...request, internalId: 'NEW-1', email: 'person@example.invalid', name: 'Same Name', personId: null, reviewedAt: null }
const person: identity.IdentityPerson = { id: 'person-1', name: 'Same Name', internalId: 'OLD-1', email: 'person@example.invalid', userId: 'user-1', is_active: true }
let app: App | undefined
const settle = async (): Promise<void> => { for (let i = 0; i < 30; i++) { await Promise.resolve(); await nextTick() } }
const element = <T extends HTMLElement>(selector: string): T => {
  const result = document.querySelector<T>(selector)
  if (!result) throw new Error(`Missing element ${selector}`)
  return result
}
const mount = async (component: Component, props: Record<string, unknown> = {}): Promise<void> => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp(component, props)
  for (const component of [Button, Checkbox, Input, Textarea, Pagination, Popconfirm, Spin]) app.use(component)
  app.use(i18n).mount(root)
  await settle()
}
const input = async (selector: string, value: string): Promise<void> => {
  const target = element<HTMLInputElement | HTMLTextAreaElement>(selector)
  target.value = value
  target.dispatchEvent(new Event('input', { bubbles: true }))
  await settle()
}
const submit = async (selector = '.identity-request-form'): Promise<void> => {
  element(selector).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await settle()
}
const fillApplicant = async (): Promise<void> => {
  element<HTMLButtonElement>('.identity-request .arco-btn-primary').click()
  await settle()
  await input('#identity-previous-id', ' OLD-1 ')
  await input('#identity-explanation', ' My enrolment changed ')
  element<HTMLInputElement>('.identity-request-form input[type="checkbox"]').click()
  await settle()
}
const mountCallback = async (url: string): Promise<ReturnType<typeof createRouter>> => {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/institution_sso_callback', component: AiralogyOauthCallback, meta: { oauthProvider: 'institution-sso' } },
  ] })
  await router.push(url)
  const root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp(AiralogyOauthCallback)
  for (const component of [Button, Checkbox, Input, Textarea, Spin]) app.use(component)
  app.use(i18n).use(router).mount(root)
  await settle()
  return router
}

beforeEach(() => {
  vi.resetAllMocks()
  sessionStorage.clear()
  useAuth().logout()
  i18n.global.locale.value = 'zh-CN'
  vi.mocked(identity.getApplicantIdentityStatus).mockResolvedValue({ internalId: 'NEW-1', request: null })
  vi.mocked(identity.submitApplicantIdentityRequest).mockResolvedValue({ internalId: 'NEW-1', request })
  vi.mocked(identity.listIdentityPeople).mockResolvedValue({ items: [person, { ...person, id: 'person-2', internalId: 'OLD-2', userId: null }], total: 2 })
  vi.mocked(identity.listIdentityRequests).mockResolvedValue({ items: [adminRequest], total: 1 })
  vi.mocked(identity.getIdentityRequest).mockResolvedValue({ request: adminRequest, events: [] })
  vi.mocked(identity.getIdentityPerson).mockResolvedValue({ person, identifiers: [], events: [] })
})
afterEach(async () => {
  app?.unmount(); app = undefined
  await settle()
  document.body.replaceChildren()
  vi.useRealTimers()
})

describe('identity verification applicant', () => {
  it('requires the prior ID, explanation and own-account declaration and does not sign in', async () => {
    await mount(IdentityReviewRequest, proof)
    element<HTMLButtonElement>('.identity-request .arco-btn-primary').click()
    await settle()
    await submit()
    expect(identity.submitApplicantIdentityRequest).not.toHaveBeenCalled()
    await input('#identity-previous-id', 'OLD-1')
    await input('#identity-explanation', 'My enrolment changed')
    await submit()
    expect(identity.submitApplicantIdentityRequest).not.toHaveBeenCalled()
    element<HTMLInputElement>('input[type="checkbox"]').click()
    await submit()
    expect(identity.submitApplicantIdentityRequest).toHaveBeenCalledExactlyOnceWith({ proofToken: proof.proofToken, previousInternalId: 'OLD-1', explanation: 'My enrolment changed', confirmsOwnAccount: true }, expect.any(AbortSignal))
    expect(document.querySelector('.identity-request-form')).toBeNull()
    expect(document.body.textContent).toContain('管理员正在核验')
    expect(useAuth().isLoggedIn.value).toBe(false)
  })
  it('retains a failed draft and blocks duplicate requests while submitting', async () => {
    vi.mocked(identity.submitApplicantIdentityRequest).mockRejectedValueOnce(new Error('Unavailable'))
    await mount(IdentityReviewRequest, proof)
    await fillApplicant()
    await submit()
    expect(element<HTMLInputElement>('#identity-previous-id').value).toBe(' OLD-1 ')
    let resolve: (data: identity.ApplicantIdentityData) => void = () => {}
    vi.mocked(identity.submitApplicantIdentityRequest).mockReturnValue(new Promise(done => { resolve = done }))
    await submit(); await submit()
    expect(identity.submitApplicantIdentityRequest).toHaveBeenCalledTimes(2)
    resolve({ internalId: 'NEW-1', request })
    await settle()
    expect(document.querySelector('.identity-request-form')).toBeNull()
  })
  it('supports supplementary information and reauthentication after approval', async () => {
    vi.mocked(identity.getApplicantIdentityStatus).mockResolvedValue({ internalId: 'NEW-1', request: { ...request, status: 'needs_information', applicantMessage: 'Explain the date change' } })
    await mount(IdentityReviewRequest, proof)
    expect(document.body.textContent).toContain('Explain the date change')
    expect(element<HTMLInputElement>('#identity-previous-id').value).toBe('OLD-1')
    app?.unmount(); app = undefined; document.body.replaceChildren()
    vi.mocked(identity.getApplicantIdentityStatus).mockResolvedValue({ internalId: 'NEW-1', request: { ...request, status: 'approved' } })
    const reauthenticate = vi.fn()
    await mount(IdentityReviewRequest, { ...proof, onReauthenticate: reauthenticate })
    element<HTMLButtonElement>('.identity-request .arco-btn-primary').click()
    expect(reauthenticate).toHaveBeenCalledOnce()
    expect(useAuth().isLoggedIn.value).toBe(false)
  })
  it('polls only pending requests, expires safely, and aborts when leaving', async () => {
    vi.useFakeTimers()
    vi.mocked(identity.getApplicantIdentityStatus).mockResolvedValue({ internalId: 'NEW-1', request })
    await mount(IdentityReviewRequest, { ...proof, expiresAt: new Date(Date.now() + 25000).toISOString() })
    await vi.advanceTimersByTimeAsync(10000)
    expect(identity.getApplicantIdentityStatus).toHaveBeenCalledTimes(2)
    const signal = vi.mocked(identity.getApplicantIdentityStatus).mock.calls[0][1]
    await vi.advanceTimersByTimeAsync(15000)
    const count = vi.mocked(identity.getApplicantIdentityStatus).mock.calls.length
    await vi.advanceTimersByTimeAsync(20000)
    expect(identity.getApplicantIdentityStatus).toHaveBeenCalledTimes(count)
    expect(document.body.textContent).toContain('重新统一登录')
    app?.unmount(); app = undefined
    expect(signal?.aborted).toBe(true)
  })
  it('renders English and never exposes an expired proof form', async () => {
    i18n.global.locale.value = 'en-US'
    await mount(IdentityReviewRequest, { ...proof, expiresAt: new Date(0).toISOString() })
    expect(identity.getApplicantIdentityStatus).not.toHaveBeenCalled()
    expect(document.querySelector('form')).toBeNull()
    expect(document.body.textContent).toContain('Sign in with institution again')
  })
})

describe('identity callback and administration', () => {
  it('offers review only for a server-issued conflict and removes SSO secrets from the URL', async () => {
    vi.mocked(completeOauth).mockRejectedValue(new ApiError('conflict', 409, { data: proof }))
    const router = await mountCallback('/institution_sso_callback?code=one-time-code&state=signed-state')
    expect(document.body.textContent).toContain('申请身份核验')
    expect(router.currentRoute.value.query).toEqual({})
    expect(identity.restoreIdentityConflict()).toEqual(proof)
    expect(useAuth().isLoggedIn.value).toBe(false)
  })
  it('does not offer account linking for ordinary SSO errors', async () => {
    vi.mocked(completeOauth).mockRejectedValue(new ApiError('SSO unavailable', 502, { message: 'SSO unavailable' }))
    await mountCallback('/institution_sso_callback?code=code&state=state')
    expect(document.querySelector('.identity-request')).toBeNull()
    expect(identity.getApplicantIdentityStatus).not.toHaveBeenCalled()
  })
  it('restores a tab-scoped proof without reusing a consumed SSO code', async () => {
    identity.cacheIdentityConflict(proof)
    await mountCallback('/institution_sso_callback')
    expect(completeOauth).not.toHaveBeenCalled()
    expect(identity.getApplicantIdentityStatus).toHaveBeenCalledWith(proof.proofToken, expect.any(AbortSignal))
  })
  it('invalidates malformed and expired locally cached proofs', () => {
    identity.cacheIdentityConflict({ ...proof, expiresAt: new Date(0).toISOString() })
    expect(identity.restoreIdentityConflict()).toBeNull()
    sessionStorage.setItem('scholar.identity-proof', '{broken')
    expect(identity.restoreIdentityConflict()).toBeNull()
    expect(identity.getIdentityConflict(new ApiError('error', 409, {}))).toBeNull()
  })
  it('distinguishes same-name people by ID, requires a linked account, and cancels search', async () => {
    const select = vi.fn()
    await mount(IdentityPersonPicker, { slug: 'example', requireAccount: true, onSelect: select })
    expect(document.body.textContent).toContain('OLD-1')
    expect(document.body.textContent).toContain('OLD-2')
    const buttons = document.querySelectorAll<HTMLButtonElement>('.person-results button')
    expect(buttons[1].disabled).toBe(true)
    expect(select).not.toHaveBeenCalled()
    buttons[0].click()
    expect(select).toHaveBeenCalledWith(person)
    const signal = vi.mocked(identity.listIdentityPeople).mock.calls[0][3]
    app?.unmount(); app = undefined
    expect(signal?.aborted).toBe(true)
  })
  it('requires explicit selection and verification before approving; replies require an applicant message', async () => {
    await mount(InstitutionIdentityRequestsPanel, { slug: 'example' })
    element<HTMLButtonElement>('.identity-request-list button').click()
    await settle()
    const approve = element<HTMLButtonElement>('.review-actions .arco-btn-primary')
    expect(approve.disabled).toBe(true)
    await input('#identity-review-notes', 'Checked school register')
    element<HTMLInputElement>('input[type="checkbox"]').click()
    await settle()
    expect(approve.disabled).toBe(true)
    element<HTMLButtonElement>('.person-results button').click()
    await settle()
    expect(approve.disabled).toBe(false)
    const more = document.querySelectorAll<HTMLButtonElement>('.review-actions button')[1]
    expect(more.disabled).toBe(true)
    await input('#identity-applicant-message', 'Please provide dates')
    more.click()
    await settle()
    expect(identity.decideIdentityRequest).toHaveBeenCalledWith('example', request.id, { action: 'request_information', personId: undefined, notes: 'Checked school register', applicantMessage: 'Please provide dates' }, expect.any(AbortSignal))
  })
  it('requires administrator evidence and confirmation before adding an alias', async () => {
    await mount(InstitutionIdentifiersPanel, { slug: 'example' })
    element<HTMLButtonElement>('.person-results button').click()
    await settle()
    await input('#identity-add-value', 'NEW-1')
    await submit('.add-identifier')
    expect(identity.addIdentityIdentifier).not.toHaveBeenCalled()
    await input('#identity-admin-notes', 'Verified school record')
    element<HTMLInputElement>('input[type="checkbox"]').click()
    await submit('.add-identifier')
    expect(identity.addIdentityIdentifier).toHaveBeenCalledWith('example', person.id, 'NEW-1', 'Verified school record', expect.any(AbortSignal))
  })
})
