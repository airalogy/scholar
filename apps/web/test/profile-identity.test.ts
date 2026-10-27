// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref, type App } from 'vue'
import { Button, Empty, Form, Input, Message, Modal, Select, Spin, Tabs, Textarea, Upload } from '@arco-design/web-vue'
import i18n from '@/i18n'
import Settings from '@/views/Settings.vue'
import ProfileInstitutionIdentity from '@/components/ProfileInstitutionIdentity.vue'
import { getMyProfile, updateMyProfile, type UserProfile } from '@/api/users'

vi.mock('@/api/users', () => ({
  getMyProfile: vi.fn(), updateMyProfile: vi.fn(), changeMyPassword: vi.fn(), uploadAvatar: vi.fn(),
}))
vi.mock('@/composables/useAuth', () => ({ useAuth: () => ({ updateName: vi.fn(), updateAvatar: vi.fn() }) }))

let app: App | undefined
const profile = (): UserProfile => ({
  id: 'original-account', username: 'example', name: 'Example Person', email: 'example@example.invalid',
  phone: null, avatar: null, avatar_url: null, gender: null, grade: null, degree: null,
  college: null, major: null, laboratory: null, bio: null, research_interests: null,
  project_experiences: [], publications: [], platform_role: 'platform_admin',
  admin_access: { can_access: true, manage_platform: true, manage_institutions: true, manage_labs: true, review_content: true, import_data: true },
  manageable_labs: [], manageable_institutions: [], lab_memberships: [],
  institution_memberships: [{ id: 'institution', name: 'Example University', slug: 'example', role: 'admin', can_import_data: false, can_review_content: false }],
  institution_identity: {
    id: 'person', institutionId: 'institution', institutionName: 'Example University', internalId: 'FORMAL-001', scholarId: 'scholar',
    identifiers: [
      { id: 'formal', value: 'FORMAL-001', isPrimary: true, kind: 'formal' },
      { id: 'temporary', value: 'TEMP-001', isPrimary: false, kind: 'temporary' },
      { id: 'alias', value: 'ALIAS-001', isPrimary: false, kind: 'unknown' },
    ],
  },
  institution_papers: [{ id: 'paper', title: 'Previously linked paper', doi: null, publishYear: 2026, authorName: 'Example Person' }],
})
const settle = async (): Promise<void> => {
  for (let i = 0; i < 30; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
const mount = async (data: UserProfile | null = profile()): Promise<void> => {
  if (data) vi.mocked(getMyProfile).mockResolvedValue(data)
  const root = document.createElement('div')
  document.body.append(root)
  app = createApp(Settings)
  for (const component of [Button, Empty, Form, Input, Modal, Select, Spin, Tabs, Textarea, Upload]) app.use(component)
  app.component('router-link', { props: ['to'], template: '<a :href="to"><slot /></a>' })
  app.use(i18n).mount(root)
  await settle()
}
const fieldText = (field: string): string => document.querySelector(`[data-field="${field}"]`)?.textContent ?? ''

beforeEach(() => {
  vi.resetAllMocks()
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
  i18n.global.locale.value = 'zh-CN'
  vi.mocked(updateMyProfile).mockResolvedValue('Profile updated')
})
afterEach(async () => {
  app?.unmount()
  app = undefined
  Message.clear()
  await vi.waitFor(() => {
    expect(document.querySelector('.arco-overlay-message')).toBeNull()
  }, { timeout: 2000 })
  await settle()
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

describe('read-only institution identity in personal profile', () => {
  it.each(['zh-CN', 'en-US'] as const)('shows the primary ID and all other linked IDs, institution role and existing papers in %s', async locale => {
    i18n.global.locale.value = locale
    await mount()
    expect(fieldText('primary')).toContain('FORMAL-001')
    expect(fieldText('primary')).toContain(i18n.global.t('settings.identifierKinds.formal'))
    expect(document.querySelector('[data-field="temporary"]')).toBeNull()
    expect(fieldText('other')).toContain(i18n.global.t('settings.otherEmployeeIds'))
    expect(fieldText('other')).toContain('TEMP-001')
    expect(fieldText('other')).toContain(i18n.global.t('settings.identifierKinds.temporary'))
    expect(fieldText('other')).toContain('ALIAS-001')
    expect(fieldText('other')).toContain(i18n.global.t('settings.identifierKinds.unknown'))
    expect(fieldText('other')).not.toContain('FORMAL-001')
    expect(fieldText('role')).toContain(i18n.global.t('settings.institutionRoles.admin'))
    const section = document.querySelector('.profile-identity')!
    expect(section.textContent).toContain('Example University')
    expect(section.querySelectorAll('input, select, textarea, button')).toHaveLength(0)
    expect(document.querySelector('a[href="/papers/paper"]')?.textContent).toContain('Previously linked paper')
    expect(document.querySelector('a[href="/scholars/scholar"]')).not.toBeNull()
    const headings = Array.from(document.querySelectorAll('.section-title, .profile-identity h2')).map(item => item.textContent)
    expect(headings.indexOf(i18n.global.t('settings.institutionIdentityTitle'))).toBeLessThan(headings.indexOf(i18n.global.t('settings.academicInfo')))
  })

  it('does not submit read-only IDs or permissions when saving the editable profile', async () => {
    await mount()
    document.querySelector<HTMLButtonElement>('.action-row button')!.click()
    await settle()
    expect(updateMyProfile).toHaveBeenCalledOnce()
    const payload = vi.mocked(updateMyProfile).mock.calls[0][0]
    expect(Object.keys(payload).sort()).toEqual([
      'name', 'avatar', 'gender', 'grade', 'degree', 'college', 'major', 'laboratory', 'bio',
      'research_interests', 'project_experiences', 'publications',
    ].sort())
    expect(fieldText('primary')).toContain('FORMAL-001')
    expect(fieldText('other')).toContain('TEMP-001')
  })

  it.each(['zh-CN', 'en-US'] as const)('expands and collapses all non-primary ID kinds without changing account data in %s', async locale => {
    i18n.global.locale.value = locale
    const data = profile()
    const identifiers = data.institution_identity!.identifiers!
    identifiers.unshift({ id: 'formal-alias', value: 'DEMO-OTHER-FORMAL-001', isPrimary: false, kind: 'formal' })
    identifiers.push(
      { id: 'alias-long', value: 'DEMO-LONG-OTHER-IDENTIFIER-FOR-LAYOUT-ONLY', isPrimary: false, kind: 'unknown' },
      { id: 'temporary-two', value: 'DEMO-OTHER-002', isPrimary: false, kind: 'temporary' },
    )
    const originalData = structuredClone(data)
    const expectedValues = identifiers.filter(item => !item.isPrimary).map(item => item.value)
    await mount(data)
    const visibleValues = (): (string | null)[] => Array.from(document.querySelectorAll('.identifier-list .identifier-value')).map(item => item.textContent)
    const toggle = document.querySelector<HTMLButtonElement>('.identifier-toggle')!
    expect(visibleValues()).toEqual(expectedValues.slice(0, 3))
    expect(document.querySelector('.identifier-count')?.textContent).toBe(i18n.global.t('settings.identifierCount', { count: 5 }))
    expect(toggle.textContent).toBe(i18n.global.t('settings.showAllIdentifiers', { count: 5 }))
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(document.getElementById(toggle.getAttribute('aria-controls')!)).toBe(document.querySelector('.identifier-list'))
    expect(fieldText('primary')).toContain('FORMAL-001')
    toggle.click()
    await settle()
    expect(visibleValues()).toEqual(expectedValues)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(toggle.textContent).toBe(i18n.global.t('settings.collapseIdentifiers'))
    expect(document.querySelectorAll('.profile-identity input, .profile-identity select, .profile-identity textarea')).toHaveLength(0)
    expect(document.querySelectorAll('.profile-identity button')).toHaveLength(1)
    toggle.click()
    await settle()
    expect(visibleValues()).toEqual(expectedValues.slice(0, 3))
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(data).toEqual(originalData)
    expect(updateMyProfile).not.toHaveBeenCalled()
    expect(getMyProfile).toHaveBeenCalledOnce()
  })

  it.each([0, 1, 3, 4])('shows the appropriate empty state, count and toggle for %i other IDs', async count => {
    const data = profile()
    data.institution_identity!.identifiers = [
      data.institution_identity!.identifiers![0]!,
      ...Array.from({ length: count }, (_, index) => ({
        id: `demo-other-${index}`, value: `DEMO-OTHER-${index}`, isPrimary: false, kind: 'unknown' as const,
      })),
    ]
    await mount(data)
    expect(document.querySelectorAll('.identifier-list li')).toHaveLength(Math.min(count, 3))
    expect(document.querySelectorAll('.identifier-toggle')).toHaveLength(count > 3 ? 1 : 0)
    expect(document.querySelector('.identifier-count')?.textContent).toBe(i18n.global.t('settings.identifierCount', { count }))
    expect(document.querySelectorAll('.identifier-empty')).toHaveLength(count === 0 ? 1 : 0)
    if (count === 0) expect(fieldText('other')).toContain(i18n.global.t('settings.noOtherEmployeeIds'))
    expect(updateMyProfile).not.toHaveBeenCalled()
  })

  it('resets the expanded list when a different institution identity is displayed', async () => {
    const data = profile()
    data.institution_identity!.identifiers!.push(
      { id: 'other-three', value: 'DEMO-OTHER-003', isPrimary: false, kind: 'formal' },
      { id: 'other-four', value: 'DEMO-OTHER-004', isPrimary: false, kind: 'unknown' },
    )
    const identity = ref(data.institution_identity)
    const root = document.createElement('div')
    document.body.append(root)
    app = createApp({ render: () => h(ProfileInstitutionIdentity, { identity: identity.value, memberships: data.institution_memberships }) })
    app.use(Button).use(i18n).mount(root)
    document.querySelector<HTMLButtonElement>('.identifier-toggle')!.click()
    await settle()
    expect(document.querySelectorAll('.identifier-list li')).toHaveLength(4)
    identity.value = { ...data.institution_identity!, id: 'another-demo-person' }
    await settle()
    expect(document.querySelectorAll('.identifier-list li')).toHaveLength(3)
    expect(document.querySelector('.identifier-toggle')?.getAttribute('aria-expanded')).toBe('false')
    expect(updateMyProfile).not.toHaveBeenCalled()
  })

  it('groups the read-only overview before editable sections and linked papers after them', async () => {
    await mount()
    const overview = document.querySelector('.profile-overview')!
    expect(overview.querySelector('.profile-name')?.textContent).toBe('Example Person')
    expect(overview.querySelector('.profile-contact dd')?.textContent).toBe('example@example.invalid')
    expect(overview.querySelector('.profile-contact input')).toBeNull()
    const headings = Array.from(document.querySelectorAll('.profile-content h2')).map(item => item.textContent)
    expect(headings).toEqual([
      'settings.institutionIdentityTitle', 'settings.basicInfo', 'settings.academicInfo',
      'settings.projects', 'settings.publications', 'settings.institutionPapersTitle',
    ].map(key => i18n.global.t(key)))
    expect(document.querySelector('.linked-papers-section input')).toBeNull()
    expect(document.querySelectorAll('.compact-empty')).toHaveLength(2)
    // Keep the sticky save bar outside the tabs' overflow container.
    expect(document.querySelector('.settings-tabs .action-row')).toBeNull()
    expect(document.querySelector('.settings-container > .action-row button')).not.toBeNull()
  })

  it('expands and collapses papers without changing their data or making a save request', async () => {
    const data = profile()
    data.institution_papers = Array.from({ length: 5 }, (_, index) => ({
      id: `paper-${index}`, title: `Linked paper ${index}`, doi: null,
      publishYear: 2026, authorName: 'Example Person',
    }))
    await mount(data)
    const toggle = document.querySelector<HTMLButtonElement>('.paper-toggle')!
    expect(document.querySelectorAll('.institution-paper-item')).toHaveLength(3)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    toggle.click()
    await settle()
    expect(document.querySelectorAll('.institution-paper-item')).toHaveLength(5)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    toggle.click()
    await settle()
    expect(document.querySelectorAll('.institution-paper-item')).toHaveLength(3)
    expect(data.institution_papers).toHaveLength(5)
    expect(updateMyProfile).not.toHaveBeenCalled()
  })

  it('preserves existing profile records when adding and removing draft rows', async () => {
    const data = profile()
    data.bio = 'Existing biography'
    data.research_interests = 'Existing interests'
    data.project_experiences = [{ id: 'existing-project', title: 'Existing project', period: '2020–2026' }]
    data.publications = [{ id: 'existing-publication', title: 'Existing publication' }]
    await mount(data)
    const clickButton = async (text: string): Promise<void> => {
      const button = Array.from(document.querySelectorAll('button')).find(item => item.textContent === text)
      expect(button).toBeDefined()
      button!.click()
      await settle()
    }
    await clickButton(i18n.global.t('settings.addProject'))
    await clickButton(i18n.global.t('settings.addPublication'))
    expect(document.querySelectorAll('.project-row')).toHaveLength(2)
    expect(document.querySelectorAll('.publication-row')).toHaveLength(2)
    const newTitle = document.querySelectorAll<HTMLInputElement>('.project-row input')[2]!
    expect(document.querySelector(`label[for="${newTitle.id}"]`)).not.toBeNull()
    document.querySelectorAll<HTMLButtonElement>('.project-row .remove-item')[1]!.click()
    document.querySelectorAll<HTMLButtonElement>('.publication-row .remove-item')[1]!.click()
    await settle()
    await clickButton(i18n.global.t('settings.saveProfile'))
    const payload = vi.mocked(updateMyProfile).mock.calls[0][0]
    expect(payload.bio).toBe(data.bio)
    expect(payload.research_interests).toBe(data.research_interests)
    expect(payload.project_experiences).toEqual(data.project_experiences)
    expect(payload.publications).toEqual(data.publications)
    expect(fieldText('primary')).toContain('FORMAL-001')
    expect(fieldText('other')).toContain('TEMP-001')
    expect(fieldText('role')).toContain(i18n.global.t('settings.institutionRoles.admin'))
  })

  it('hides profile save actions on the security tab and preserves draft data when returning', async () => {
    const data = profile()
    data.bio = 'Existing biography'
    await mount(data)
    const bio = document.querySelector<HTMLTextAreaElement>('textarea')!
    bio.value = 'Edited biography'
    bio.dispatchEvent(new Event('input', { bubbles: true }))
    const tabs = document.querySelectorAll<HTMLElement>('.arco-tabs-tab')
    tabs[1]!.click()
    await settle()
    expect(document.querySelector('.action-row')).toBeNull()
    expect(document.querySelector('.security-card')).not.toBeNull()
    tabs[0]!.click()
    await settle()
    expect(document.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('Edited biography')
    expect(document.querySelector('.action-row button')).not.toBeNull()
    expect(updateMyProfile).not.toHaveBeenCalled()
  })

  it('shows a safe loading and retry state instead of an empty, saveable profile', async () => {
    let resolveProfile!: (data: UserProfile) => void
    vi.mocked(getMyProfile).mockReturnValueOnce(new Promise(resolve => { resolveProfile = resolve }))
    await mount(null)
    expect(document.querySelector('.profile-state')?.getAttribute('aria-busy')).toBe('true')
    expect(document.querySelector('.action-row')).toBeNull()
    resolveProfile(profile())
    await settle()
    expect(document.querySelector('.profile-state')).toBeNull()
    expect(fieldText('primary')).toContain('FORMAL-001')
  })

  it('retries a failed profile load without any writes', async () => {
    vi.mocked(getMyProfile).mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValueOnce(profile())
    await mount(null)
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(i18n.global.t('settings.loadFailed'))
    expect(document.querySelector('.action-row')).toBeNull()
    expect(document.querySelector('input')).toBeNull()
    document.querySelector<HTMLButtonElement>('.profile-state button')!.click()
    await settle()
    expect(getMyProfile).toHaveBeenCalledTimes(2)
    expect(fieldText('primary')).toContain('FORMAL-001')
    expect(updateMyProfile).not.toHaveBeenCalled()
  })

  it('does not treat platform access as an institution role', async () => {
    const data = profile()
    data.institution_memberships = []
    await mount(data)
    expect(fieldText('role')).toContain(i18n.global.t('settings.noInstitutionRole'))
    expect(fieldText('role')).not.toContain(i18n.global.t('settings.institutionRoles.admin'))
  })

  it('shows a role even without a linked person and does not invent employee IDs', async () => {
    const data = profile()
    data.institution_identity = null
    data.institution_papers = []
    await mount(data)
    expect(fieldText('role')).toContain(i18n.global.t('settings.institutionRoles.admin'))
    expect(fieldText('primary')).toContain(i18n.global.t('settings.noEmployeeId'))
    expect(fieldText('other')).toContain(i18n.global.t('settings.noOtherEmployeeIds'))
    expect(document.querySelector('.identifier-list')).toBeNull()
    expect(document.querySelector('.identifier-toggle')).toBeNull()
  })

  it('handles older APIs without guessing other linked IDs', async () => {
    const data = profile()
    delete data.institution_identity!.identifiers
    await mount(data)
    expect(fieldText('primary')).toContain('FORMAL-001')
    expect(fieldText('other')).toContain(i18n.global.t('settings.noOtherEmployeeIds'))
    expect(fieldText('other')).not.toContain('TEMP-001')
    expect(fieldText('primary')).not.toContain(i18n.global.t('settings.identifierKinds.formal'))
  })

  it('never promotes an alias when the current primary ID is absent', async () => {
    const data = profile()
    data.institution_identity!.identifiers = [
      { id: 'temp', value: 'TEMP-001', isPrimary: false, kind: 'temporary' },
    ]
    await mount(data)
    expect(fieldText('primary')).toContain(i18n.global.t('settings.noEmployeeId'))
    expect(fieldText('primary')).not.toContain('FORMAL-001')
    expect(fieldText('other')).toContain('TEMP-001')
  })

  it.each([true, false])('hides synthetic historical account keys (new API: %s)', async newApi => {
    const data = profile()
    data.institution_identity!.internalId = 'legacy-user:original-account'
    data.institution_identity!.identifiers = newApi
      ? [{ id: 'legacy', value: 'legacy-user:original-account', isPrimary: true, kind: 'unknown' }]
      : undefined
    await mount(data)
    expect(document.querySelector('.profile-identity')?.textContent).not.toContain('legacy-user:')
    expect(fieldText('primary')).toContain(i18n.global.t('settings.noEmployeeId'))
  })
})
