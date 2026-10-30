<template>
  <div class="admin-page">
    <div class="admin-container" :aria-busy="isLoading">
      <header class="admin-header">
        <div class="header-main">
          <p v-if="institutionName" class="institution-name">
            <span>{{ $t('adminHome.currentInstitution') }}</span>
            {{ institutionName }}
          </p>
          <h1 class="admin-title">{{ $t('adminHome.title') }}</h1>
          <p class="admin-subtitle">{{ $t('adminHome.subtitle') }}</p>
          <div v-if="profile && !isLoading && !loadError" class="role-list" :aria-label="$t('adminHome.accessOverview')">
            <span class="role-badge">
              {{ $t('adminHome.platformRole') }} · {{ platformRoleLabel }}
            </span>
            <span v-if="institutionRole" class="role-badge">
              {{ $t('adminHome.institutionRole') }} · {{ formatInstitutionRole(institutionRole) }}
            </span>
            <span v-for="capability in delegatedCapabilities" :key="capability" class="role-badge role-badge--delegated">
              {{ capability }}
            </span>
          </div>
        </div>
        <dl v-if="currentInstitution && !isLoading && !loadError" class="institution-stats" :aria-label="$t('adminHome.institutionOverview')">
          <div class="stat-item">
            <dt>{{ $t('adminHome.institutionMembers') }}</dt>
            <dd>{{ formatCount(currentInstitution.memberCount) }}</dd>
          </div>
          <div class="stat-item">
            <dt>{{ $t('adminHome.institutionLabs') }}</dt>
            <dd>{{ formatCount(currentInstitution.labCount) }}</dd>
          </div>
        </dl>
      </header>

      <div v-if="isLoading" class="admin-state" role="status">{{ $t('common.loading') }}</div>
      <div v-else-if="loadError" class="admin-state admin-state--error" role="alert">
        <p>{{ loadError }}</p>
        <button type="button" class="retry-button" @click="load">{{ $t('adminHome.retry') }}</button>
      </div>
      <template v-else-if="profile">
        <p v-if="!currentInstitution" class="access-note" role="status">
          {{ $t('adminHome.noInstitutionAccess') }}
        </p>

        <section
          v-for="section in sections"
          :key="section.id"
          class="admin-section"
          :aria-labelledby="'section-' + section.id"
        >
          <div class="section-head">
            <h2 :id="'section-' + section.id" class="section-title">{{ section.title }}</h2>
            <p class="section-subtitle">{{ section.description }}</p>
          </div>
          <div v-if="section.links.length" class="tool-grid">
            <router-link v-for="link in section.links" :key="link.id" :to="link.to" class="tool-card">
              <span class="tool-card-label">{{ link.title }}</span>
              <span class="tool-card-description">{{ link.description }}</span>
              <span class="tool-card-arrow" aria-hidden="true">&rarr;</span>
            </router-link>
          </div>

          <div v-if="section.id === 'institution' && profile.manageable_labs.length" class="lab-panel">
            <div class="lab-panel-head">
              <h3 class="lab-panel-title">{{ $t('adminHome.labsTitle') }}</h3>
              <span class="lab-count">{{ $t('common.counts.labs', { count: profile.manageable_labs.length }) }}</span>
            </div>
            <p class="lab-panel-description">{{ $t('adminHome.labsSubtitle') }}</p>
            <ul class="lab-list">
              <li v-for="lab in profile.manageable_labs" :key="lab.id">
                <router-link :to="'/admin/labs/' + lab.slug + '/settings'" class="lab-link">
                  <span class="lab-identity">
                    <span class="lab-name">{{ lab.name }}</span>
                    <span class="lab-slug">{{ lab.slug }}</span>
                  </span>
                  <span class="lab-role">{{ formatLabRole(lab.role) }}</span>
                  <span class="lab-action">{{ $t('adminHome.labSettings') }} <span aria-hidden="true">&rarr;</span></span>
                </router-link>
              </li>
            </ul>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { getMyProfile, type UserProfile } from '@/api/users'
import { listInstitutions, type InstitutionListItem } from '@/api/institutions'
import { useAuth } from '@/composables/useAuth'
import { usePublicConfig } from '@/composables/usePublicConfig'
import {
  INSTITUTION_ROLE_LABEL_KEYS,
  LAB_ROLE_LABEL_KEYS,
  PLATFORM_ROLE_LABEL_KEYS,
} from '@/i18n/helpers'

interface WorkspaceLink {
  id: string
  to: string
  title: string
  description: string
}

interface WorkspaceSection {
  id: string
  title: string
  description: string
  links: WorkspaceLink[]
}

const profile = ref<UserProfile | null>(null)
const institutions = ref<InstitutionListItem[]>([])
const isLoading = ref(true)
const loadError = ref('')
const { t } = useI18n()
const { updateAdminAccess } = useAuth()
const { publicConfig, features, scholarTimeline } = usePublicConfig()

const currentInstitution = computed((): InstitutionListItem | undefined => {
  return institutions.value.find((institution) => institution.slug === publicConfig.value.institution.slug)
})
const institutionMembershipBySlug = computed((): Map<string, UserProfile['institution_memberships'][number]> => {
  return new Map(
    (profile.value?.institution_memberships ?? []).map((membership) => [membership.slug, membership]),
  )
})
const currentMembership = computed((): UserProfile['institution_memberships'][number] | undefined => institutionMembershipBySlug.value.get(publicConfig.value.institution.slug))
const institutionName = computed((): string => currentInstitution.value?.name ?? currentMembership.value?.name ?? '')
const institutionRole = computed((): string => {
  if (currentMembership.value) return currentMembership.value.role
  const role = currentInstitution.value?.role
  return role && role !== 'platform_admin' ? role : ''
})
const platformRoleLabel = computed((): string => {
  if (!profile.value) return ''
  return t(PLATFORM_ROLE_LABEL_KEYS[profile.value.platform_role as 'platform_admin' | 'member'])
})

const isPlatformAdmin = computed((): boolean => profile.value?.admin_access.manage_platform === true)
const canManageJournals = computed((): boolean => isPlatformAdmin.value || (publicConfig.value.managementMode === 'self_hosted' && profile.value?.admin_access.manage_institutions === true))
const canReviewContent = computed((): boolean => profile.value?.admin_access.review_content === true)
const isTimelineGenerationEnabled = computed((): boolean => scholarTimeline.value.generationMode !== 'disabled')
const canManageScholarTimelines = computed((): boolean => {
  if (!isTimelineGenerationEnabled.value || !profile.value) return false
  return (
    profile.value.admin_access.manage_platform ||
    (publicConfig.value.managementMode === 'self_hosted' && profile.value.admin_access.manage_institutions)
  )
})
const canAccessDegreeThesisAdmin = computed((): boolean => features.value.degreeTheses && canReviewContent.value)

const canManageInstitution = (institution: InstitutionListItem): boolean => {
  if (isPlatformAdmin.value) return true
  const membership = institutionMembershipBySlug.value.get(institution.slug)
  return membership?.role === 'owner' || membership?.role === 'admin'
}

const delegatedCapabilities = computed((): string[] => {
  const membership = currentMembership.value
  if (!membership || isPlatformAdmin.value || membership.role === 'owner' || membership.role === 'admin') return []
  const capabilities: string[] = []
  if (membership.can_review_content) capabilities.push(t('adminHome.capabilityContentReview'))
  if (membership.can_import_data) capabilities.push(t('adminHome.capabilityDataImport'))
  return capabilities
})

const formatInstitutionRole = (role: string): string => {
  const key = INSTITUTION_ROLE_LABEL_KEYS[role as keyof typeof INSTITUTION_ROLE_LABEL_KEYS]
  return key ? t(key) : t('common.roles.institution.member')
}
const formatLabRole = (role: string): string => {
  const key = LAB_ROLE_LABEL_KEYS[role as keyof typeof LAB_ROLE_LABEL_KEYS]
  return key ? t(key) : t('common.roles.lab.member')
}
const formatCount = (count: number): string => Number.isFinite(count) && count >= 0 ? String(count) : '—'
const workspaceLink = (id: string, to: string, titleKey: string, descriptionKey: string): WorkspaceLink => ({
  id, to, title: t(titleKey), description: t(descriptionKey),
})

const sections = computed((): WorkspaceSection[] => {
  const contentLinks: WorkspaceLink[] = []
  const institutionLinks: WorkspaceLink[] = []
  const systemLinks: WorkspaceLink[] = []
  const institution = currentInstitution.value

  if (institution) {
    const basePath = '/admin/institutions/' + institution.slug
    contentLinks.push(workspaceLink('content', basePath, 'adminHome.enterInstitutionContent', 'adminHome.institutionContentDescription'))
    if (canManageInstitution(institution)) {
      institutionLinks.push(
        workspaceLink('members', basePath + '/members', 'adminHome.enterInstitutionMembers', 'adminHome.membersDescription'),
        workspaceLink('institution-subjects', '/admin/academic-subjects?institution=' + encodeURIComponent(institution.slug), 'adminHome.enterInstitutionSubjects', 'adminHome.institutionSubjectsDescription'),
      )
    }
  }
  if (canReviewContent.value) {
    contentLinks.push(workspaceLink('papers', '/admin/papers', 'adminHome.enterPaperReview', 'adminHome.paperReviewDescription'))
    if (canAccessDegreeThesisAdmin.value) {
      contentLinks.push(workspaceLink('theses', '/admin/theses', 'adminHome.enterDegreeTheses', 'adminHome.degreeThesisDescription'))
    }
    if (canManageScholarTimelines.value) {
      contentLinks.push(workspaceLink('timelines', '/admin/scholar-timelines', 'adminHome.enterScholarTimelines', 'adminHome.timelineDescription'))
    }
  }
  if (isPlatformAdmin.value) {
    systemLinks.push(
      workspaceLink('feedback', '/admin/feedback', 'adminHome.enterFeedback', 'adminHome.feedbackDescription'),
      workspaceLink('global-subjects', '/admin/academic-subjects', 'adminHome.enterGlobalSubjects', 'adminHome.subjectCatalogDescription'),
    )
  }
  if (canManageJournals.value) {
    systemLinks.push(workspaceLink('journals', '/admin/journals', 'journals.title', 'journals.description'))
  }

  return [
    { id: 'content', title: t('adminHome.contentTitle'), description: t('adminHome.contentSubtitle'), links: contentLinks },
    { id: 'institution', title: t('adminHome.institutionsTitle'), description: t('adminHome.institutionsSubtitle'), links: institutionLinks },
    { id: 'system', title: t('adminHome.systemTitle'), description: t('adminHome.systemSubtitle'), links: systemLinks },
  ].filter((section) => section.links.length || (section.id === 'institution' && profile.value?.manageable_labs.length))
})

const load = async (): Promise<void> => {
  isLoading.value = true
  loadError.value = ''
  try {
    const [profileData, institutionItems] = await Promise.all([getMyProfile(), listInstitutions()])
    profile.value = profileData
    institutions.value = institutionItems
    updateAdminAccess(profileData.admin_access)
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : t('adminHome.loadFailed')
  } finally {
    isLoading.value = false
  }
}

onMounted(() => { void load() })
</script>

<style lang="sass" scoped>
.admin-page
  min-height: calc(100vh - var(--scholar-navbar-height))
  padding: 36px 0 56px
  background: #f7f9fc

.admin-container
  box-sizing: border-box
  width: 1120px
  max-width: 100%
  padding: 0 30px
  margin: 0 auto

.admin-header
  display: flex
  align-items: center
  justify-content: space-between
  flex-wrap: wrap
  gap: 24px 32px
  padding-bottom: 28px
  border-bottom: 1px solid #e2e8f0

.header-main
  flex: 1 1 380px
  min-width: 0

.institution-name
  display: flex
  align-items: baseline
  flex-wrap: wrap
  gap: 4px 10px
  margin: 0 0 10px
  color: #334a68
  font-size: 14px
  font-weight: 600
  overflow-wrap: anywhere

.institution-name > span
  font-size: 12px
  font-weight: 400
  color: #667085

.admin-title
  margin: 0
  font-size: 30px
  font-weight: 700
  line-height: 1.3
  color: #172b4d

.admin-subtitle, .section-subtitle, .lab-panel-description
  margin: 8px 0 0
  font-size: 14px
  line-height: 1.65
  color: #667085

.role-list
  display: flex
  flex-wrap: wrap
  gap: 8px
  margin-top: 16px

.role-badge, .lab-role
  padding: 4px 9px
  border-radius: 6px
  background: #eaf0f8
  color: #334a68
  font-size: 12px
  line-height: 1.5
  overflow-wrap: anywhere

.role-badge--delegated
  background: #eaf4ef
  color: #34705c

.institution-stats
  display: grid
  grid-template-columns: repeat(2, minmax(0, 1fr))
  gap: 24px
  margin: 0

.stat-item
  min-width: 92px
  padding-left: 20px
  border-left: 1px solid #dce3ed

.stat-item dt
  font-size: 12px
  line-height: 1.5
  color: #667085

.stat-item dd
  margin: 4px 0 0
  font-size: 28px
  font-weight: 650
  font-variant-numeric: tabular-nums
  color: #172b4d

.admin-section
  margin-top: 28px

.section-head
  margin-bottom: 14px

.section-title
  margin: 0
  font-size: 18px
  font-weight: 650
  color: #172b4d

.section-subtitle
  margin-top: 4px
  font-size: 13px

.tool-grid
  display: grid
  grid-template-columns: repeat(2, minmax(0, 1fr))
  gap: 12px

.tool-card
  position: relative
  display: flex
  flex-direction: column
  padding: 20px 48px 20px 20px
  border: 1px solid #e2e8f0
  border-radius: 12px
  background: #fff
  text-decoration: none
  overflow-wrap: anywhere
  transition: border-color 0.15s ease, background-color 0.15s ease

.tool-card:hover
  border-color: #b6c9e6
  background: #fcfdff

.tool-card-label
  font-size: 15px
  font-weight: 650
  line-height: 1.5
  color: #172b4d

.tool-card-description
  margin-top: 6px
  font-size: 13px
  line-height: 1.65
  color: #667085

.tool-card-arrow
  position: absolute
  top: 20px
  right: 20px
  font-size: 18px
  color: #376298

.lab-panel
  margin-top: 14px
  padding: 20px
  border: 1px solid #e2e8f0
  border-radius: 12px
  background: #fff

.lab-panel-head
  display: flex
  align-items: baseline
  flex-wrap: wrap
  gap: 8px 12px

.lab-panel-title
  margin: 0
  font-size: 15px
  font-weight: 650
  color: #172b4d

.lab-count, .lab-slug
  font-size: 12px
  color: #667085

.lab-panel-description
  margin-top: 6px
  font-size: 13px

.lab-list
  margin: 16px 0 0
  padding: 0
  list-style: none

.lab-list > li
  border-top: 1px solid #edf0f5

.lab-link
  display: grid
  grid-template-columns: minmax(0, 1fr) auto auto
  align-items: center
  gap: 12px 20px
  padding: 14px 8px
  border-radius: 6px
  text-decoration: none
  overflow-wrap: anywhere

.lab-link:hover
  background: #f7f9fc

.lab-identity
  display: flex
  flex-direction: column
  gap: 4px
  min-width: 0

.lab-name
  font-size: 14px
  font-weight: 600
  color: #172b4d

.lab-action
  color: #376298
  font-size: 13px

.access-note
  margin: 24px 0 0
  padding: 16px 20px
  border: 1px dashed #cbd5e1
  border-radius: 10px
  color: #667085
  font-size: 14px
  line-height: 1.65

.admin-state
  min-height: 240px
  display: flex
  flex-direction: column
  gap: 16px
  align-items: center
  justify-content: center
  text-align: center
  overflow-wrap: anywhere
  color: #667085
  font-size: 14px

.admin-state p
  margin: 0

.admin-state--error
  color: #b42318

.retry-button
  min-height: 40px
  padding: 8px 18px
  border: 1px solid #cbd5e1
  border-radius: 8px
  background: #fff
  color: #172b4d
  font: inherit
  cursor: pointer

.tool-card:focus-visible, .lab-link:focus-visible, .retry-button:focus-visible
  outline: 2px solid #2563eb
  outline-offset: 3px

@media (max-width: 720px)
  .admin-page
    padding-top: 24px

  .admin-container
    padding: 0 18px

  .admin-title
    font-size: 26px

  .tool-grid
    grid-template-columns: 1fr

  .institution-stats
    width: 100%

  .stat-item
    padding-left: 14px

@media (max-width: 480px)
  .lab-panel
    padding: 16px

  .lab-link
    grid-template-columns: minmax(0, 1fr) auto
    gap: 10px
    padding: 14px 0

  .lab-role
    grid-column: 2
    grid-row: 1

  .lab-action
    grid-column: 1 / -1

@media (prefers-reduced-motion: reduce)
  .tool-card
    transition: none
</style>
