// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import i18n from '@/i18n'
import AdministratorGovernancePanel from '@/components/AdministratorGovernancePanel.vue'
import { completeAdministratorHandoff, loadAdministratorAudit, previewAdministratorHandoff, type HandoffPreview } from '@/api/administrators'
import type { InstitutionMembershipItem } from '@/api/institutions'
import en from '@/locales/administrators-en-US'
import zh from '@/locales/administrators-zh-CN'

vi.mock('@/api/administrators', () => ({
  loadAdministratorAudit: vi.fn(),
  previewAdministratorHandoff: vi.fn(),
  completeAdministratorHandoff: vi.fn(),
}))
let app: App | undefined
const completion = vi.fn()
const settle = async (): Promise<void> => {
  for (let i = 0; i < 25; i++) { await Promise.resolve(); await nextTick() }
}
const member = (userId: string, role: InstitutionMembershipItem['role']): InstitutionMembershipItem => ({
  userId, role, institutionPersonId: `person-${userId}`, internalId: `ID-${userId}`, name: userId, email: `${userId}@example.invalid`, avatar: null, degree: null, major: null, canReviewContent: false, canImportData: false, paperCount: 0, approvedPaperCount: 0,
})
const snapshot: HandoffPreview = {
  digest: 'a'.repeat(64), from: { userId: 'old', role: 'owner', user: { name: 'Departing' } }, to: { userId: 'new', role: 'member', user: { name: 'Successor' } }, labs: [{ labId: 'lab' }], grants: [{ id: 'grant', role: 'library_final' }], tasks: [{ id: 'task', kind: 'role', status: 'pending', step: { caseId: 'case' } }], invitations: [{ id: 'invite' }], credentials: [{ id: 'credential' }],
}
const mount = async (): Promise<void> => {
  const root = document.createElement('div')
  document.body.append(root)
  app = createApp(AdministratorGovernancePanel, { slug: 'example', memberships: [member('old', 'owner'), member('new', 'member'), member('other', 'member')], onCompleted: completion })
  app.component('RouterLink', { props: ['to'], template: '<a :href="to"><slot /></a>' })
  app.use(i18n).mount(root)
  await settle()
}
const choose = async (index: number, value: string): Promise<void> => {
  const select = document.querySelectorAll('select')[index]!
  select.value = value
  select.dispatchEvent(new Event('change', { bubbles: true }))
  await settle()
}
const submit = async (selector: string): Promise<void> => {
  document.querySelector(selector)!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await settle()
}
const preview = async (): Promise<void> => {
  await choose(0, 'old'); await choose(1, 'new')
  await submit('.handoff-form')
}
const acknowledge = async (): Promise<void> => {
  const textarea = document.querySelector('textarea')!
  textarea.value = '  Verified departure ticket 123  '
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
  document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click()
  await settle()
}
beforeEach(() => {
  vi.clearAllMocks()
  i18n.global.locale.value = 'en-US'
  vi.mocked(loadAdministratorAudit).mockResolvedValue({ activeOwners: 1, items: [] })
  vi.mocked(previewAdministratorHandoff).mockResolvedValue(structuredClone(snapshot))
  vi.mocked(completeAdministratorHandoff).mockResolvedValue(undefined)
})
afterEach(async () => {
  app?.unmount(); app = undefined
  document.body.replaceChildren()
  await settle()
})

it('requires current preview, reason and explicit acknowledgement; preserves separate reviewer qualification', async () => {
  await mount()
  expect(document.body.textContent).toContain('Active owners: 1')
  expect([...document.querySelectorAll('select')[0]!.options].map((option) => option.value)).not.toContain('new')
  await preview()
  expect(document.body.textContent).toContain('Reviewer qualifications are not copied')
  expect(document.querySelector('a')!.getAttribute('href')).toBe('/reviews/cases/case')
  await submit('.handoff-preview form')
  expect(completeAdministratorHandoff).not.toHaveBeenCalled()
  await acknowledge()
  await submit('.handoff-preview form')
  expect(completeAdministratorHandoff).toHaveBeenCalledWith('example', { fromUserId: 'old', toUserId: 'new', digest: snapshot.digest, reason: 'Verified departure ticket 123', acknowledgeOutstanding: true }, expect.any(AbortSignal))
  expect(completion).toHaveBeenCalledOnce()
  expect(document.querySelector('.handoff-preview')).toBeNull()
  expect(document.body.textContent).toContain('Handoff completed')
})

it('invalidates preview when the successor changes and discards failed/stale submissions', async () => {
  await mount(); await preview(); await acknowledge()
  await choose(1, 'other')
  expect(document.querySelector('.handoff-preview')).toBeNull()
  expect(completeAdministratorHandoff).not.toHaveBeenCalled()
  await choose(1, 'new'); await submit('.handoff-form'); await acknowledge()
  vi.mocked(completeAdministratorHandoff).mockRejectedValueOnce(new Error('Permissions changed; preview again'))
  await submit('.handoff-preview form')
  expect(document.querySelector('[role="alert"]')?.textContent).toBe('Permissions changed; preview again')
  expect(document.querySelector('.handoff-preview')).toBeNull()
  expect(completion).not.toHaveBeenCalled()
})

it('escapes audit content, keeps pagination on read failure and aborts pending requests on unmount', async () => {
  vi.mocked(loadAdministratorAudit).mockResolvedValue({ activeOwners: 2, items: Array.from({ length: 50 }, (_, index) => ({ id: String(index), entity: 'institution_memberships', entityId: 'member', actorUserId: 'actor', actorLabel: '<img src=x onerror=alert(1)>', source: 'membership', reason: '<script>danger()</script>', before: { role: 'member' }, after: { role: 'admin' }, createdAt: '2026-10-27T00:00:00Z' })) })
  await mount()
  expect(document.querySelector('img, script')).toBeNull()
  expect(document.body.textContent).toContain('<script>danger()</script>')
  vi.mocked(loadAdministratorAudit).mockRejectedValueOnce(new Error('Read failed'))
  document.querySelectorAll<HTMLButtonElement>('nav button')[1]!.click()
  await settle()
  expect(document.querySelector('nav span')?.textContent).toBe('1–50')
  expect(document.querySelector('[role="alert"]')?.textContent).toBe('Read failed')
  const signal = vi.mocked(loadAdministratorAudit).mock.calls[0]![2]
  app!.unmount(); app = undefined
  expect(signal.aborted).toBe(true)
})

it('provides matching Chinese and English administrator maintenance messages', () => {
  expect(Object.keys(zh.administrators).sort()).toEqual(Object.keys(en.administrators).sort())
  for (const value of Object.values(zh.administrators)) expect(value.trim()).not.toBe('')
})
