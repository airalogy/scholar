// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import ArcoVue, { Message } from '@arco-design/web-vue'
import i18n from '@/i18n'
import Members from '@/views/AdminInstitutionMembers.vue'
import {
  getInstitution, listInstitutionMemberships, listInstitutionProvisions, removeInstitutionMembership, upsertInstitutionMembership,
  type InstitutionAccess, type InstitutionMembershipItem, type InstitutionRole,
} from '@/api/institutions'
import { searchUsers } from '@/api/users'

vi.mock('vue-router', () => ({ useRoute: () => ({ params: { slug: 'example' } }) }))
vi.mock('@/api/institutions')
vi.mock('@/api/users')
vi.mock('@/components/AdministratorGovernancePanel.vue', () => ({ default: { template: '<aside>Handoff</aside>' } }))
vi.mock('@/components/InstitutionIdentifiersPanel.vue', () => ({ default: { template: '<aside />' } }))
vi.mock('@/components/InstitutionIdentityRequestsPanel.vue', () => ({ default: { template: '<aside />' } }))

const member = (id: string, role: InstitutionRole): InstitutionMembershipItem => ({
  userId: id, name: id, email: `${id}@example.invalid`, role, institutionPersonId: `person-${id}`,
  internalId: `DEMO-${id}`, avatar: null, major: null, degree: null, paperCount: 0,
  approvedPaperCount: 0, canReviewContent: false, canImportData: false,
})
const roster = [member('Alex', 'owner'), member('Blair', 'admin'), member('Casey', 'member')]
let app: App | undefined
const settle = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await nextTick()
}
const mount = async (role: InstitutionRole, platform = false, manage = true): Promise<void> => {
  const access: InstitutionAccess = {
    institution_role: role, platform_role: platform ? 'platform_admin' : 'member',
    can_manage_members: manage, can_edit_content: manage, can_review_content: manage, can_import_data: manage,
  }
  vi.mocked(getInstitution).mockResolvedValue({
    id: 'example', slug: 'example', name: 'Example University', access, labs: [], labCount: 0,
    memberCount: roster.length, website: null, summary: null,
  })
  vi.mocked(listInstitutionMemberships).mockResolvedValue(structuredClone(roster))
  vi.mocked(listInstitutionProvisions).mockResolvedValue([])
  const root = document.createElement('div')
  document.body.append(root)
  app = createApp(Members)
  app.component('RouterLink', { template: '<a><slot /></a>' })
  app.use(ArcoVue).use(i18n).mount(root)
  await settle()
}
const el = <T extends HTMLElement = HTMLElement>(selector: string): T => {
  const found = document.querySelector<T>(selector)
  if (!found) throw new Error(`Missing element: ${selector}`)
  return found
}
const rows = (): string[] => Array.from(document.querySelectorAll('.member-identity strong'), node => node.textContent ?? '')
const input = async (selector: string, value: string): Promise<void> => {
  const element = el<HTMLInputElement | HTMLTextAreaElement>(selector)
  element.value = value
  element.dispatchEvent(new Event('input', { bubbles: true }))
  await settle()
}
const appoint = async (): Promise<void> => {
  el('.appoint-admin').click()
  await settle()
}
beforeEach(() => {
  vi.clearAllMocks()
  i18n.global.locale.value = 'zh-CN'
  vi.spyOn(Message, 'success').mockReturnValue({ close: vi.fn() })
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  vi.stubGlobal('ResizeObserver', class { observe (): void {} unobserve (): void {} disconnect (): void {} })
})
afterEach(() => {
  app?.unmount()
  app = undefined
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('explains roles in both languages without loading a roster or granting access', async () => {
  await mount('member', false, false)
  const toggle = el<HTMLButtonElement>('.role-guide-toggle')
  const panel = el(`#${toggle.getAttribute('aria-controls')}`)
  expect(toggle.textContent).toBe('角色说明')
  expect(toggle.getAttribute('aria-expanded')).toBe('false')
  expect(panel.style.display).toBe('none')
  toggle.click()
  await settle()
  expect(toggle.getAttribute('aria-expanded')).toBe('true')
  expect(panel.style.display).not.toBe('none')
  const labels = (): string[] => Array.from(panel.querySelectorAll('dt'), node => node.textContent ?? '')
  expect(labels()).toEqual(['平台管理员', '机构负责人', '机构管理员'])
  expect(panel.textContent).toContain('执行图书馆终审需要单独授权')
  expect(panel.querySelector('a')?.getAttribute('href')).toBe('/docs/zh/administration/administrator-governance')

  i18n.global.locale.value = 'en-US'
  await settle()
  expect(toggle.textContent).toBe('Role guide')
  expect(labels()).toEqual(['Platform Admin', 'Institution Owner', 'Institution Administrator'])
  expect(panel.textContent).toContain('Reviewers need a separate grant')
  expect(panel.querySelector('a')?.getAttribute('href')).toBe('/docs/en/administration/administrator-governance')
  toggle.click()
  await settle()
  expect(toggle.getAttribute('aria-expanded')).toBe('false')
  expect(panel.style.display).toBe('none')
  expect(document.querySelector('.appoint-admin, .member-list')).toBeNull()
  expect(listInstitutionMemberships).not.toHaveBeenCalled()
  expect(upsertInstitutionMembership).not.toHaveBeenCalled()
})

it('searches the local roster first and distinguishes existing managers from candidates', async () => {
  await mount('owner')
  expect(el('h2').textContent).toBe('成员与权限')
  expect(el('.admin-header .role-badge').textContent).toContain('机构负责人')
  expect(el<HTMLDetailsElement>('.directory-disclosure').open).toBe(false)
  for (const query of ['case', 'CASEY@EXAMPLE', 'demo-casey']) {
    await input('.roster-search input', query)
    expect(rows()).toEqual(['Casey'])
  }
  el('.roster-filters button:last-child').click()
  await settle()
  expect(rows()).toEqual([])
  expect(el('[role="status"]').textContent).toContain('没有符合条件的成员')
  await input('.roster-search input', '')
  expect(rows()).toEqual(['Alex', 'Blair'])
  expect(searchUsers).not.toHaveBeenCalled()
  expect(upsertInstitutionMembership).not.toHaveBeenCalled()
})

it.each([false, true])('adds a second administrator after explicit confirmation (platform: %s)', async platform => {
  if (platform) i18n.global.locale.value = 'en-US'
  await mount(platform ? 'member' : 'owner', platform)
  await appoint()
  const form = el<HTMLFormElement>('.change-form')
  expect(form.textContent).toContain('Casey · Example University')
  expect(form.textContent).toContain(platform ? 'Institution Member → Institution Administrator' : '机构成员 → 机构管理员')
  expect(form.textContent).toContain(platform ? 'final approval' : '终审资格')
  expect(el<HTMLButtonElement>('.change-form button[type="submit"]').disabled).toBe(true)
  expect(upsertInstitutionMembership).not.toHaveBeenCalled()
  await input('#member-change-reason', '  Verified appointment  ')
  let complete!: (members: InstitutionMembershipItem[]) => void
  vi.mocked(upsertInstitutionMembership).mockReturnValue(new Promise(resolve => { complete = resolve }))
  form.dispatchEvent(new Event('submit', { cancelable: true }))
  form.dispatchEvent(new Event('submit', { cancelable: true }))
  expect(upsertInstitutionMembership).toHaveBeenCalledExactlyOnceWith('example', {
    userId: 'Casey', role: 'admin', reason: 'Verified appointment', can_review_content: false, can_import_data: false,
  })
  expect(Message.success).not.toHaveBeenCalled()
  complete([...roster.slice(0, 2), member('Casey', 'admin')])
  await settle()
  el('.roster-filters button:last-child').click()
  await settle()
  expect(rows()).toEqual(['Alex', 'Blair', 'Casey'])
  expect(document.querySelector('.appoint-admin')).toBeNull()
  expect(Message.success).toHaveBeenCalledOnce()
})

it('does not save on cancel and leaves the original role intact after a rejected appointment', async () => {
  await mount('owner')
  await appoint()
  await input('#member-change-reason', 'First reason')
  el('.change-form button[type="button"]').click()
  await settle()
  expect(upsertInstitutionMembership).not.toHaveBeenCalled()
  await appoint()
  expect(el<HTMLTextAreaElement>('#member-change-reason').value).toBe('')
  vi.mocked(upsertInstitutionMembership).mockRejectedValueOnce(new Error('Person is inactive'))
  await input('#member-change-reason', 'Second reason')
  el('.change-form button[type="submit"]').click()
  await settle()
  expect(el('.change-form [role="alert"]').textContent).toBe('Person is inactive')
  expect(el('.member-card:last-child .role-badge').textContent).toBe('机构成员')
  expect(Message.success).not.toHaveBeenCalled()
})

it('explains why an institution administrator cannot appoint a peer', async () => {
  await mount('admin')
  expect(el('.admin-panel .permission-note').textContent).toContain('请联系机构负责人或平台管理员')
  expect(document.querySelector('.appoint-admin, .inline-role-select')).toBeNull()
  expect(document.querySelectorAll('.row-disclosure')).toHaveLength(1)
  expect(rows()).toHaveLength(3)
  expect(upsertInstitutionMembership).not.toHaveBeenCalled()
})

it('does not load or expose the roster without member-management access', async () => {
  await mount('member', false, false)
  expect(document.querySelector('.roster-toolbar, .member-list, .directory-disclosure')).toBeNull()
  expect(listInstitutionMemberships).not.toHaveBeenCalled()
  expect(listInstitutionProvisions).not.toHaveBeenCalled()
})

it('keeps privileged targets protected when an administrator searches the separate directory', async () => {
  await mount('admin')
  el('.directory-disclosure summary').click()
  vi.mocked(searchUsers).mockResolvedValue([{
    id: 'Alex', username: 'alex', name: 'Alex', email: 'alex@example.invalid',
    avatar: null, degree: null, college: null, major: null, laboratory: null,
  }])
  await input('.member-search input', 'Alex')
  el('.member-search button').click()
  await settle()
  expect(searchUsers).toHaveBeenCalledWith('Alex')
  expect(el<HTMLButtonElement>('.search-card button').disabled).toBe(true)
  expect(document.querySelector('.change-form')).toBeNull()
  expect(upsertInstitutionMembership).not.toHaveBeenCalled()
})

it('retains the last owner when removal is refused by the server', async () => {
  await mount('owner')
  el('.member-card:first-child .row-disclosure summary').click()
  el('.member-card:first-child .row-options button').click()
  await settle()
  expect(el('.change-form').textContent).toContain('机构负责人 → 非本机构成员')
  await input('#member-change-reason', 'Review removal')
  vi.mocked(removeInstitutionMembership).mockRejectedValueOnce(new Error('Last active owner'))
  el('.change-form button[type="submit"]').click()
  await settle()
  expect(removeInstitutionMembership).toHaveBeenCalledExactlyOnceWith('example', 'Alex', 'Review removal')
  expect(el('.change-form [role="alert"]').textContent).toBe('Last active owner')
  expect(rows()).toEqual(['Alex', 'Blair', 'Casey'])
  expect(Message.success).not.toHaveBeenCalled()
})
