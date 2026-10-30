// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, nextTick, ref, type App } from 'vue'
import i18n from '@/i18n'
import AdminHome from '@/views/AdminHome.vue'
import { getMyProfile, type UserProfile } from '@/api/users'
import { listInstitutions, type InstitutionListItem } from '@/api/institutions'
import type { PublicAppConfig } from '@/api/public-config'
import { EMPTY_ADMIN_ACCESS } from '@/utils/adminAccess'

vi.mock('@/api/users', () => ({ getMyProfile: vi.fn() }))
vi.mock('@/api/institutions', () => ({ listInstitutions: vi.fn() }))
vi.mock('@/composables/useAuth', () => ({ useAuth: () => ({ updateAdminAccess }) }))
vi.mock('@/composables/usePublicConfig', () => ({
  usePublicConfig: () => ({
    publicConfig: config,
    features: computed(() => config.value.features),
    scholarTimeline: computed(() => config.value.scholarTimeline),
  }),
}))

const updateAdminAccess = vi.fn()
const publicConfig = (): PublicAppConfig => ({
  tenancyMode: 'single_institution', managementMode: 'self_hosted', contentAccess: 'public',
  institution: { slug: 'example-university' },
  auth: {
    enablePasswordSignin: true, enablePublicSignup: false, enableAiralogyOauth: false,
    enableInstitutionLogin: true, enableInstitutionProvisionLogin: false, enableInstitutionSso: false,
  },
  features: { aiChat: false, paperUpload: true, degreeTheses: true, forum: false },
  branding: {
    appName: 'Example Scholar', showBrandLogo: true, showInstitutionLogo: false,
    brandLogoUrl: null, institutionLogoUrl: null, institutionWatermarkUrl: null,
  },
  navigation: { defaultHomePath: '/papers' },
  paperLibrary: { defaultPath: '/papers', fixedInstitutionSlug: 'example-university' },
  scholarTimeline: { generationMode: 'admin' },
})
const config = ref<PublicAppConfig>(publicConfig())
const institution = (): InstitutionListItem => ({
  id: 'example-institution', name: '示例研究大学', slug: 'example-university',
  summary: 'Fictional institution summary for testing only', website: 'https://example.invalid',
  role: 'admin', memberCount: 25, labCount: 3,
})
const profile = (): UserProfile => ({
  id: 'original-account', username: 'example', name: 'Example Person', email: 'example@example.invalid',
  phone: null, avatar: null, avatar_url: null, gender: null, grade: null, degree: null,
  college: null, major: null, laboratory: null, bio: null, research_interests: null,
  project_experiences: [], publications: [], platform_role: 'member',
  admin_access: { ...EMPTY_ADMIN_ACCESS, can_access: true, manage_institutions: true, review_content: true, import_data: true },
  manageable_labs: [{ id: 'example-lab', name: '示例实验室', slug: 'example-lab', role: 'admin' }],
  manageable_institutions: [], lab_memberships: [],
  institution_memberships: [{
    id: 'example-institution', name: '示例研究大学', slug: 'example-university',
    role: 'admin', can_import_data: false, can_review_content: false,
  }],
  institution_identity: {
    id: 'example-person', institutionId: 'example-institution', institutionName: '示例研究大学',
    internalId: 'DEMO-PRIMARY-001', scholarId: 'example-scholar',
    identifiers: [
      { id: 'primary', value: 'DEMO-PRIMARY-001', isPrimary: true, kind: 'formal' },
      { id: 'other', value: 'DEMO-OTHER-001', isPrimary: false, kind: 'unknown' },
    ],
  },
  institution_papers: [{ id: 'example-paper', title: 'Example historical paper', doi: null, publishYear: 2026, authorName: 'Example Person' }],
})

let app: App | undefined
const settle = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
const mount = async (): Promise<void> => {
  const root = document.createElement('div')
  document.body.append(root)
  app = createApp(AdminHome)
  app.component('router-link', { props: ['to'], template: '<a :href="to"><slot /></a>' })
  app.use(i18n).mount(root)
  await settle()
}
const links = (): string[] => Array.from(document.querySelectorAll('a')).map((link) => link.getAttribute('href')!).sort()
const sectionLinks = (id: string): string[] => Array.from(document.querySelectorAll(`[aria-labelledby="section-${id}"] a`)).map((link) => link.getAttribute('href')!)

// Keep the pre-redesign visibility rules as the regression baseline.
const originalLinks = (data: UserProfile, items: InstitutionListItem[], settings: PublicAppConfig): string[] => {
  const result: string[] = []
  const access = data.admin_access
  if (access.manage_platform) result.push('/admin/feedback', '/admin/academic-subjects')
  if (access.manage_platform || (settings.managementMode === 'self_hosted' && access.manage_institutions)) result.push('/admin/journals')
  if (access.review_content) {
    result.push('/admin/papers')
    if (settings.features.degreeTheses) result.push('/admin/theses')
    if (settings.scholarTimeline.generationMode !== 'disabled' && (access.manage_platform || (settings.managementMode === 'self_hosted' && access.manage_institutions))) result.push('/admin/scholar-timelines')
  }
  for (const item of items) {
    result.push(`/admin/institutions/${item.slug}`)
    const membership = data.institution_memberships.find((entry) => entry.slug === item.slug)
    if (access.manage_platform || membership?.role === 'owner' || membership?.role === 'admin') {
      result.push(`/admin/institutions/${item.slug}/members`, `/admin/academic-subjects?institution=${encodeURIComponent(item.slug)}`)
    }
  }
  for (const lab of data.manageable_labs) result.push(`/admin/labs/${lab.slug}/settings`)
  return result.sort()
}

beforeEach(() => {
  vi.resetAllMocks()
  config.value = publicConfig()
  i18n.global.locale.value = 'zh-CN'
  vi.mocked(getMyProfile).mockResolvedValue(profile())
  vi.mocked(listInstitutions).mockResolvedValue([institution()])
  vi.stubGlobal('fetch', vi.fn())
})
afterEach(() => {
  app?.unmount()
  app = undefined
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

describe('single-institution admin workspace', () => {
  it.each(['zh-CN', 'en-US'] as const)('groups all existing tools without changing account data in %s', async (locale): Promise<void> => {
    i18n.global.locale.value = locale
    const data = profile()
    data.platform_role = 'platform_admin'
    data.admin_access.manage_platform = true
    const item = institution()
    item.role = 'platform_admin'
    const before = structuredClone({ data, item })
    vi.mocked(getMyProfile).mockResolvedValue(data)
    vi.mocked(listInstitutions).mockResolvedValue([item])
    await mount()

    expect(document.querySelector('h1')?.textContent).toBe(i18n.global.t('adminHome.title'))
    expect(document.querySelector('.institution-name')?.textContent).toContain(item.name)
    expect(Array.from(document.querySelectorAll('h2')).map((heading) => heading.textContent)).toEqual([
      i18n.global.t('adminHome.contentTitle'), i18n.global.t('adminHome.institutionsTitle'), i18n.global.t('adminHome.systemTitle'),
    ])
    expect(sectionLinks('content')).toEqual(['/admin/institutions/example-university', '/admin/papers', '/admin/theses', '/admin/scholar-timelines'])
    expect(sectionLinks('institution')).toEqual(['/admin/institutions/example-university/members', '/admin/academic-subjects?institution=example-university', '/admin/labs/example-lab/settings'])
    expect(sectionLinks('system')).toEqual(['/admin/feedback', '/admin/academic-subjects', '/admin/journals'])
    expect(links()).toEqual(originalLinks(data, [item], config.value))
    expect(document.querySelector('.role-list')?.textContent).toContain(i18n.global.t('common.roles.platformAdmin'))
    expect(document.querySelector('.role-list')?.textContent).toContain(i18n.global.t('common.roles.institution.admin'))
    expect(Array.from(document.querySelectorAll('.stat-item dd')).map((item) => item.textContent)).toEqual(['25', '3'])
    expect(document.querySelector('.lab-count')?.textContent).toBe(i18n.global.t('common.counts.labs', { count: 1 }))
    expect(document.querySelector('.lab-role')?.textContent).toBe(i18n.global.t('common.roles.lab.admin'))
    expect(document.body.textContent).not.toContain(item.summary)
    expect(document.body.textContent).not.toMatch(/adminHome\.|common\.roles\./)
    expect(document.querySelector('.resource-grid, .stats-grid, select')).toBeNull()
    expect({ data, item }).toEqual(before)
    expect(updateAdminAccess).toHaveBeenCalledExactlyOnceWith(data.admin_access)
    expect(getMyProfile).toHaveBeenCalledOnce()
    expect(listInstitutions).toHaveBeenCalledOnce()
    expect(fetch).not.toHaveBeenCalled()
  })

  const roles = ['platform', 'owner', 'admin', 'reviewer', 'importer', 'lab-only', 'member'] as const
  for (const mode of ['airalogy_managed', 'self_hosted'] as const) {
    it.each(roles)(`preserves the original entry permissions for %s in ${mode}`, async (role): Promise<void> => {
      config.value.managementMode = mode
      const data = profile()
      const membership = data.institution_memberships[0]!
      const isInstitutionAdmin = role === 'owner' || role === 'admin'
      data.platform_role = role === 'platform' ? 'platform_admin' : 'member'
      data.admin_access = {
        can_access: role !== 'member', manage_platform: role === 'platform',
        manage_institutions: role === 'platform' || isInstitutionAdmin,
        manage_labs: role === 'lab-only', review_content: role === 'platform' || isInstitutionAdmin || role === 'reviewer',
        import_data: role === 'platform' || isInstitutionAdmin || role === 'importer',
      }
      membership.role = isInstitutionAdmin ? role : 'member'
      membership.can_review_content = role === 'reviewer'
      membership.can_import_data = role === 'importer'
      if (role !== 'lab-only') data.manageable_labs = []
      const items = role === 'member' || role === 'lab-only' ? [] : [institution()]
      vi.mocked(getMyProfile).mockResolvedValue(data)
      vi.mocked(listInstitutions).mockResolvedValue(items)
      await mount()
      expect(links()).toEqual(originalLinks(data, items, config.value))
      if (role === 'reviewer' || role === 'importer') {
        expect(document.querySelector('.role-badge--delegated')?.textContent).toBe(i18n.global.t(role === 'reviewer' ? 'adminHome.capabilityContentReview' : 'adminHome.capabilityDataImport'))
        expect(document.querySelector('#section-institution')).toBeNull()
      }
      if (role === 'lab-only') {
        expect(document.querySelector('.institution-name')?.textContent).toContain(membership.name)
        expect(document.querySelector('.institution-stats')).toBeNull()
        expect(document.querySelector('.access-note')).not.toBeNull()
      }
      if (role === 'member') expect(document.querySelectorAll('.admin-section')).toHaveLength(0)
      for (const section of document.querySelectorAll('.admin-section')) expect(section.querySelector('a')).not.toBeNull()
    })
  }

  for (const mode of ['disabled', 'request_only', 'preview', 'admin'] as const) {
    it.each([true, false])(`preserves degree-thesis and timeline switches (${mode}, degree theses %s)`, async (degreeTheses): Promise<void> => {
      config.value.features.degreeTheses = degreeTheses
      config.value.scholarTimeline.generationMode = mode
      await mount()
      expect(links()).toEqual(originalLinks(profile(), [institution()], config.value))
    })
  }

  it('does not infer review access from a platform role or institution management', async (): Promise<void> => {
    const data = profile()
    data.platform_role = 'platform_admin'
    data.admin_access.manage_platform = false
    data.admin_access.review_content = false
    vi.mocked(getMyProfile).mockResolvedValue(data)
    await mount()
    expect(links()).toEqual(originalLinks(data, [institution()], config.value))
    expect(links()).not.toContain('/admin/feedback')
    expect(links()).not.toContain('/admin/scholar-timelines')
    expect(links()).not.toContain('/admin/papers')
    expect(links()).not.toContain('/admin/theses')
  })

  it('does not present platform-wide access as an institution role assignment', async (): Promise<void> => {
    const data = profile()
    data.platform_role = 'platform_admin'
    data.admin_access.manage_platform = true
    data.institution_memberships = []
    const item = { ...institution(), role: 'platform_admin' as const }
    vi.mocked(getMyProfile).mockResolvedValue(data)
    vi.mocked(listInstitutions).mockResolvedValue([item])
    await mount()
    expect(document.querySelectorAll('.role-badge')).toHaveLength(1)
    expect(links()).toEqual(originalLinks(data, [item], config.value))
  })

  it('uses the configured institution instead of the first item and keeps the institution subject scope encoded', async (): Promise<void> => {
    const item = { ...institution(), slug: '示例机构', name: 'Example Institute with a deliberately long name for layout testing' }
    config.value.institution.slug = item.slug
    const data = profile()
    data.institution_memberships[0]!.slug = item.slug
    vi.mocked(getMyProfile).mockResolvedValue(data)
    vi.mocked(listInstitutions).mockResolvedValue([{ ...institution(), name: 'Unrelated institution' }, item])
    await mount()
    expect(document.querySelector('.institution-name')?.textContent).toContain(item.name)
    expect(document.body.textContent).not.toContain('Unrelated institution')
    expect(links()).toEqual(originalLinks(data, [item], config.value))
    expect(links()).toContain('/admin/academic-subjects?institution=' + encodeURIComponent(item.slug))
  })

  it('does not fall back to another institution or invent unavailable totals', async (): Promise<void> => {
    const data = profile()
    data.institution_memberships = []
    vi.mocked(getMyProfile).mockResolvedValue(data)
    vi.mocked(listInstitutions).mockResolvedValue([{ ...institution(), slug: 'other-institution', name: 'Unrelated institution' }])
    await mount()
    expect(document.querySelector('.institution-name, .institution-stats')).toBeNull()
    expect(document.querySelector('.access-note')).not.toBeNull()
    expect(document.body.textContent).not.toContain('Unrelated institution')
    expect(links()).toEqual(originalLinks(data, [], config.value))
  })

  it('distinguishes zero counts from unavailable counts', async (): Promise<void> => {
    vi.mocked(listInstitutions).mockResolvedValue([{ ...institution(), memberCount: 0, labCount: Number.NaN }])
    await mount()
    expect(Array.from(document.querySelectorAll('.stat-item dd')).map((item) => item.textContent)).toEqual(['0', '—'])
  })

  it('shows only the loading state until both read-only requests finish', async (): Promise<void> => {
    let finish: (items: InstitutionListItem[]) => void = (): void => {}
    vi.mocked(listInstitutions).mockReturnValue(new Promise<InstitutionListItem[]>((resolve) => { finish = resolve }))
    await mount()
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(document.querySelector('[role="status"]')?.textContent).toBe(i18n.global.t('common.loading'))
    expect(links()).toEqual([])
    expect(updateAdminAccess).not.toHaveBeenCalled()
    finish([institution()])
    await settle()
    expect(document.querySelector('[aria-busy="false"]')).not.toBeNull()
    expect(links()).toEqual(originalLinks(profile(), [institution()], config.value))
  })

  it.each(['profile', 'institutions'] as const)('hides partial access on %s request failure and supports a read-only retry', async (request): Promise<void> => {
    const failingRequest = request === 'profile' ? vi.mocked(getMyProfile) : vi.mocked(listInstitutions)
    failingRequest.mockRejectedValueOnce(new Error('Example connection failure'))
    await mount()
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Example connection failure')
    expect(document.querySelector('.institution-stats, .role-list')).toBeNull()
    expect(links()).toEqual([])
    expect(updateAdminAccess).not.toHaveBeenCalled()
    document.querySelector<HTMLButtonElement>('.retry-button')!.click()
    await settle()
    expect(document.querySelector('[role="alert"]')).toBeNull()
    expect(links()).toEqual(originalLinks(profile(), [institution()], config.value))
    expect(getMyProfile).toHaveBeenCalledTimes(2)
    expect(listInstitutions).toHaveBeenCalledTimes(2)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('uses the translated error fallback for an unknown failure', async (): Promise<void> => {
    vi.mocked(getMyProfile).mockRejectedValueOnce(null)
    await mount()
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(i18n.global.t('adminHome.loadFailed'))
    expect(links()).toEqual([])
  })
})
