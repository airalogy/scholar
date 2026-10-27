// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App, type Component } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'
import i18n from '@/i18n'
import { useAuth } from '@/composables/useAuth'
import { apiClient } from '@/api/client'
import * as governance from '@/api/governance'
import ReviewTaskDetail from '@/views/ReviewTaskDetail.vue'
import MyReviewTasks from '@/views/MyReviewTasks.vue'
import ReviewChangeForm from '@/components/ReviewChangeForm.vue'
import DirectorySyncPanel from '@/components/DirectorySyncPanel.vue'
import ReviewGovernancePanel from '@/components/ReviewGovernancePanel.vue'
import * as identity from '@/api/identity'

vi.mock('@/api/governance', async original => ({ ...await original<typeof import('@/api/governance')>(), loadReviewTask: vi.fn(), loadReviewTasks: vi.fn(), loadReviewApplications: vi.fn(), loadDirectory: vi.fn(), loadReviewAdmin: vi.fn(), governancePost: vi.fn(), governancePut: vi.fn() }))
vi.mock('@/api/identity', async original => ({ ...await original<typeof import('@/api/identity')>(), listIdentityPeople: vi.fn() }))
vi.mock('@/components/IdentityPersonPicker.vue', () => ({ default: { template: '<div />' } }))
let app: App | undefined
const settle = async (): Promise<void> => { for (let i = 0; i < 30; i++) { await Promise.resolve(); await nextTick() } }
const mount = async (component: Component, props = {}): Promise<void> => {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/reviews', component: MyReviewTasks }, { path: '/reviews/tasks/:taskId', component: ReviewTaskDetail }] })
  await router.push('/reviews/tasks/task-one')
  const root = document.createElement('div'); document.body.append(root)
  app = createApp(component, props); app.use(i18n).use(router).mount(root); await settle()
}
const button = (text: string): HTMLButtonElement => {
  const found = [...document.querySelectorAll('button')].find(item => item.textContent?.includes(text))
  if (!found) throw new Error(`Missing button ${text}`)
  return found
}
const task: governance.ReviewTaskDetail = { id: 'task-one', caseId: 'case-one', kind: 'role', role: 'library_final', status: 'pending', dueAt: null, stage: 'Final review', round: 2, versionId: 'version-fixed', digest: 'digest', canAct: true, history: [], material: { title: 'Published title', proposal: { kind: 'metadata', title: 'Proposed title' } }, previousMaterial: null }
beforeEach(() => {
  vi.restoreAllMocks(); vi.clearAllMocks(); i18n.global.locale.value = 'en-US'
  useAuth().login('fixture-login', 'Example')
  vi.mocked(governance.loadReviewTask).mockResolvedValue(task)
  vi.mocked(governance.loadReviewTasks).mockResolvedValue({ items: [], nextOffset: null })
  vi.mocked(governance.loadReviewApplications).mockResolvedValue({ items: [], nextOffset: null })
  vi.mocked(governance.governancePost).mockResolvedValue(null)
  vi.mocked(governance.governancePut).mockResolvedValue(undefined)
  vi.mocked(identity.listIdentityPeople).mockResolvedValue({ items: [], total: 0 })
})
afterEach(async () => { app?.unmount(); app = undefined; useAuth().logout(); await settle(); document.body.replaceChildren() })

it('shows published/proposed values and sends the immutable version with a decision', async () => {
  await mount(ReviewTaskDetail)
  expect(document.body.textContent).toContain('Published title')
  expect(document.body.textContent).toContain('Proposed title')
  document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await settle()
  expect(governance.governancePost).toHaveBeenCalledWith('/v1/reviews/tasks/task-one/decision', { decision: 'approve', notes: '', versionId: 'version-fixed' }, expect.any(AbortSignal))
})
it('CC and unavailable tasks have no decision form', async () => {
  vi.mocked(governance.loadReviewTask).mockResolvedValue({ ...task, kind: 'cc', role: null, canAct: false, status: 'notified' })
  await mount(ReviewTaskDetail)
  expect(document.querySelector('form')).toBeNull()
  expect(document.body.textContent).toContain('no longer actionable')
})
it('unmount cancels task loading', async () => {
  vi.mocked(governance.loadReviewTask).mockImplementation(() => new Promise(() => {}))
  await mount(ReviewTaskDetail)
  const signal = vi.mocked(governance.loadReviewTask).mock.calls[0]![1]!
  app!.unmount(); app = undefined
  expect(signal.aborted).toBe(true)
})
it('switching to applications cancels the previous task list and shows application state', async () => {
  await mount(MyReviewTasks)
  const signal = vi.mocked(governance.loadReviewTasks).mock.calls[0]![1]!
  button('My applications').click(); await settle()
  expect(signal.aborted).toBe(true)
  expect(governance.loadReviewApplications).toHaveBeenCalledWith(0, expect.any(AbortSignal))
  expect(document.body.textContent).toContain('no submitted applications')
})
it('proposal retries retain the same idempotency key and never update canonical endpoints', async () => {
  vi.spyOn(apiClient, 'get').mockResolvedValue({ status: 200, headers: new Headers(), data: { data: { canPropose: true, canClaim: false, ownPersonId: 'person', title: 'Original', abstract: '', authors: [] } } })
  const post = vi.spyOn(apiClient, 'post').mockRejectedValueOnce(new Error('Temporary failure')).mockResolvedValueOnce({ status: 200, headers: new Headers(), data: { code: 0 } })
  await mount(ReviewChangeForm, { subjectType: 'paper', subjectId: 'claim' })
  for (let index = 0; index < 2; index++) {
    document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await settle()
  }
  expect(post).toHaveBeenCalledTimes(2)
  expect(post.mock.calls[0]![0]).toBe('/v1/reviews/changes')
  expect(new Headers(post.mock.calls[0]![2]?.headers).get('Idempotency-Key')).toBe(new Headers(post.mock.calls[1]![2]?.headers).get('Idempotency-Key'))
  expect(document.body.textContent).toContain('Request submitted')
  expect(document.querySelector('form')).toBeNull()
})
it('anonymous pages do not request or expose proposal controls', async () => {
  useAuth().logout()
  const get = vi.spyOn(apiClient, 'get')
  await mount(ReviewChangeForm, { subjectType: 'paper', subjectId: 'claim' })
  expect(get).not.toHaveBeenCalled()
  expect(document.querySelector('details')).toBeNull()
})

it('directory application requires explicit confirmation and unmount cancels administration requests', async () => {
  vi.mocked(governance.loadDirectory).mockResolvedValue({ policy: { admissionMode: 'sso', requireAppointment: false }, sources: [], runs: [{ id: 'run', sourceId: 'source', sequence: 1, mode: 'full', status: 'needs_confirmation', expectedRows: 0, createdCount: 0, updatedCount: 0, deactivatedCount: 5, error: null, createdAt: '2026-10-17T00:00:00Z' }] })
  await mount(DirectorySyncPanel, { slug: 'example' })
  button('Apply validated changes').click(); await settle()
  const form = document.querySelector<HTMLFormElement>('.confirmation')!
  expect(form.querySelector<HTMLButtonElement>('button')!.disabled).toBe(true)
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await settle()
  expect(governance.governancePost).not.toHaveBeenCalled()
  const reason = form.querySelector<HTMLInputElement>('input:not([type="checkbox"])')!
  reason.value = 'Verified complete roster'; reason.dispatchEvent(new Event('input', { bubbles: true }))
  form.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(); await settle()
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await settle()
  expect(governance.governancePost).toHaveBeenCalledWith('/v1/institutions/example/directory/sources/source/runs/run/apply', { confirmDeactivation: true, notes: 'Verified complete roster' }, expect.any(AbortSignal))
  const signal = vi.mocked(governance.loadDirectory).mock.calls[0]![1]!
  app!.unmount(); app = undefined
  expect(signal.aborted).toBe(true)
})

it('review administration shows preprovisioned reviewers, saves the three-stage preset and paginates', async () => {
  vi.mocked(governance.loadReviewAdmin).mockResolvedValue({ nextOffset: 100, executionFailures: [], nodes: [], workflows: [], tasks: [], notifications: [], grants: [{ id: 'grant', personId: 'person', role: 'library_final', nodeId: null, endsAt: null, revokedAt: null, person: { name: 'Reviewer without account', userId: null, is_active: true } }] })
  await mount(ReviewGovernancePanel, { slug: 'example' })
  expect(document.body.textContent).toContain('Not yet signed in')
  expect(document.querySelectorAll('fieldset')).toHaveLength(3)
  button('Use for future submissions').closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await settle()
  expect(governance.governancePut).toHaveBeenCalledWith('/v1/institutions/example/review-governance/workflows/paper', expect.objectContaining({ steps: expect.arrayContaining([expect.objectContaining({ groups: [{ kind: 'authors' }, { kind: 'departments' }] })]) }), expect.any(AbortSignal))
  button('More').click(); await settle()
  expect(governance.loadReviewAdmin).toHaveBeenLastCalledWith('example', expect.any(AbortSignal), 100, '')
})
