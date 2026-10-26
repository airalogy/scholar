// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App, type Component } from 'vue'
import i18n from '@/i18n'
import { useAuth } from '@/composables/useAuth'
import { apiClient } from '@/api/client'
import { uploadFile } from '@/api/files'
import { uploadPaper, PaperSubmissionConflict } from '@/api/papers'
import { governancePost, loadReviewAdmin } from '@/api/governance'
import { personnelGet, type ReviewRoute } from '@/api/personnel-governance'
import ReviewRoutePanel from '@/components/ReviewRoutePanel.vue'
import PersonnelHistoryPanel from '@/components/PersonnelHistoryPanel.vue'

vi.mock('@/api/files', () => ({ uploadFile: vi.fn() }))
vi.mock('@/api/personnel-governance', async (original) => ({
  ...(await original<typeof import('@/api/personnel-governance')>()),
  personnelGet: vi.fn(),
}))
vi.mock('@/api/governance', async (original) => ({
  ...(await original<typeof import('@/api/governance')>()),
  governancePost: vi.fn(),
  loadReviewAdmin: vi.fn(),
}))
vi.mock('@/components/IdentityPersonPicker.vue', () => ({
  default: {
    template:
      "<button type=\"button\" @click=\"$emit('select', {id: 'person', name: 'Example Person'})\">Pick person</button>",
  },
}))
let app: App | undefined
const settle = async (): Promise<void> => {
  for (let i = 0; i < 30; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
const mount = async (component: Component): Promise<void> => {
  const root = document.createElement('div')
  document.body.append(root)
  app = createApp(component, { slug: 'example' })
  app.use(i18n).mount(root)
  await settle()
}
const button = (label: string): HTMLButtonElement => {
  const result = [...document.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === label,
  )
  if (!result) throw new Error(`Missing button: ${label}`)
  return result
}
beforeEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  i18n.global.locale.value = 'en-US'
  useAuth().login('test', 'Example')
  vi.mocked(loadReviewAdmin).mockResolvedValue({
    grants: [],
    nodes: [],
    tasks: [],
    workflows: [],
    notifications: [],
    executionFailures: [],
    nextOffset: null,
  })
  vi.mocked(personnelGet).mockResolvedValue({ items: [], nextOffset: null })
})
afterEach(async () => {
  app?.unmount()
  app = undefined
  useAuth().logout()
  document.body.replaceChildren()
  await settle()
})

it('routing simulation shows blocking explanations without publishing and cancels reads on unmount', async () => {
  vi.mocked(governancePost).mockResolvedValue({
    workflowName: 'Default',
    routing: { error: 'Conflicting rules', selected: null, matched: ['a', 'b'] },
    stages: [],
  })
  await mount(ReviewRoutePanel)
  button('Pick person').click()
  await settle()
  document
    .querySelector('.simulation form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await settle()
  expect(governancePost).toHaveBeenCalledWith(
    '/v1/institutions/example/review-governance/simulate',
    { contentType: 'paper', requestKind: 'submission', personIds: ['person'], nodeIds: [] },
    expect.any(AbortSignal),
  )
  expect(document.body.textContent).toContain('Conflicting rules')
  expect(governancePost).toHaveBeenCalledTimes(1)
  const signal = vi.mocked(personnelGet).mock.calls[0]![2]
  app!.unmount()
  app = undefined
  expect(signal.aborted).toBe(true)
})
it('editing a published rule preserves revision and clones stages without mutating history', async () => {
  const rule: ReviewRoute = {
    id: 'rule',
    key: 'doctoral',
    revision: 3,
    name: 'Doctoral',
    contentType: 'paper',
    priority: 10,
    identityCodes: ['doctoral_student'],
    nodeIds: [],
    requestKinds: ['submission'],
    enabled: true,
    supersededAt: null,
    workflow: {
      steps: [
        {
          resolverConfig: {
            name: 'Final',
            groups: [{ kind: 'role', role: 'library_final' }],
            deadlineHours: 24,
          },
        },
      ],
    },
  }
  vi.mocked(personnelGet).mockResolvedValue({ items: [rule], nextOffset: null })
  await mount(ReviewRoutePanel)
  button('Edit rule').click()
  await settle()
  const reason = document.querySelector<HTMLTextAreaElement>('form textarea')!
  reason.value = 'Reviewed revised rule'
  reason.dispatchEvent(new Event('input', { bubbles: true }))
  await settle()
  document
    .querySelector('form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await settle()
  expect(governancePost).toHaveBeenCalledWith(
    '/v1/institutions/example/review-governance/routes',
    expect.objectContaining({ key: 'doctoral', expectedRevision: 3 }),
    expect.any(AbortSignal),
  )
  expect(rule.workflow.steps[0]!.resolverConfig.name).toBe('Final')
})
it('correction approval requires notes and does not expose an unrestricted source editor', async () => {
  vi.mocked(personnelGet).mockImplementation(async (_slug, path) =>
    path === 'directory/corrections'
      ? {
          items: [
            {
              id: 'correction',
              personId: 'person',
              person: { name: 'Example Person' },
              field: 'admission',
              sourceValue: 'departed',
              value: 'allow',
              status: 'requested',
              reason: 'Verified upstream error',
              expiresAt: new Date(Date.now() + 86400000).toISOString(),
            },
          ],
          nextOffset: null,
        }
      : { items: [], nextOffset: null },
  )
  await mount(PersonnelHistoryPanel)
  expect(button('Verify and approve').disabled).toBe(true)
  const notes = document.querySelector<HTMLInputElement>('.record input')!
  notes.value = 'Independent check completed'
  notes.dispatchEvent(new Event('input', { bubbles: true }))
  await settle()
  button('Verify and approve').click()
  await settle()
  expect(governancePost).toHaveBeenCalledWith(
    '/v1/institutions/example/directory/corrections/correction/decision',
    { decision: 'approve', notes: 'Independent check completed' },
    expect.any(AbortSignal),
  )
  expect(document.querySelector('[name="userId"]')).toBeNull()
})
it('duplicate checks stop before uploading a PDF', async () => {
  vi.spyOn(apiClient, 'post').mockResolvedValue({
    status: 200,
    headers: new Headers(),
    data: { code: 0, data: { action: 'change_request', paperId: 'existing' } },
  })
  await expect(
    uploadPaper(new File(['pdf'], 'example.pdf'), {
      title: 'Example',
      doi: '10.5555/example',
      institution_id: 'institution',
      publish_year: 2026,
      paper_type: 1,
      language: 2,
    }),
  ).rejects.toBeInstanceOf(PaperSubmissionConflict)
  expect(uploadFile).not.toHaveBeenCalled()
})
it('a failed create retries the same file reference and idempotency key', async () => {
  const post = vi
    .spyOn(apiClient, 'post')
    .mockResolvedValueOnce({
      status: 200,
      headers: new Headers(),
      data: { code: 0, data: { action: 'new', paperId: null } },
    })
    .mockRejectedValueOnce(new Error('Network failure'))
    .mockResolvedValueOnce({ status: 200, headers: new Headers(), data: { id: 'created' } })
  vi.mocked(uploadFile).mockResolvedValue({ id: 'file' } as Awaited<ReturnType<typeof uploadFile>>)
  const file = new File(['pdf'], 'example.pdf')
  const fields = {
    title: 'Example',
    doi: '10.5555/example',
    institution_id: 'institution',
    publish_year: 2026,
    paper_type: 1,
    language: 2,
  }
  await expect(uploadPaper(file, fields)).rejects.toThrow('Network failure')
  await uploadPaper(file, fields)
  expect(uploadFile).toHaveBeenCalledTimes(1)
  expect(post.mock.calls[0]![0]).toBe('/v1/papers/submission-check')
  expect(post.mock.calls[0]![1]).toEqual({
    doi: fields.doi,
    institutionId: fields.institution_id,
    labId: undefined,
  })
  // The already-published upload contract retains its original field names.
  expect(post.mock.calls[1]![0]).toBe('/papers/create')
  expect(post.mock.calls[1]![1]).toEqual({ ...fields, oss_file_id: 'file' })
  expect(post.mock.calls[1]![1]).toEqual(post.mock.calls[2]![1])
  expect(new Headers(post.mock.calls[1]![2]?.headers).get('Idempotency-Key')).toBe(
    new Headers(post.mock.calls[2]![2]?.headers).get('Idempotency-Key'),
  )
})
