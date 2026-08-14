<template>
  <div class="admin-page">
    <div class="admin-container">
      <header class="admin-header">
        <p class="admin-eyebrow">{{ consoleEyebrow }}</p>
        <h1 class="admin-title">{{ $t('adminHome.title') }}</h1>
        <p class="admin-subtitle">{{ consoleSubtitle }}</p>
      </header>

      <div v-if="isLoading" class="admin-state">{{ $t('common.loading') }}</div>
      <div v-else-if="loadError" class="admin-state admin-state--error">{{ loadError }}</div>
      <template v-else-if="profile">
        <section class="stats-grid" :aria-label="$t('adminHome.accessOverview')">
          <article class="stat-card">
            <div class="stat-label">{{ $t('adminHome.platformRole') }}</div>
            <div class="stat-value stat-value--text">{{ platformRoleLabel }}</div>
          </article>
          <article class="stat-card">
            <div class="stat-label">{{ $t('adminHome.manageableInstitutions') }}</div>
            <div class="stat-value">{{ institutions.length }}</div>
          </article>
          <article class="stat-card">
            <div class="stat-label">{{ $t('adminHome.directLabs') }}</div>
            <div class="stat-value">{{ profile.manageable_labs.length }}</div>
          </article>
          <article class="stat-card">
            <div class="stat-label">{{ $t('adminHome.grantedCapabilities') }}</div>
            <div class="stat-value">{{ grantedCapabilityCount }}</div>
          </article>
        </section>

        <section v-if="isPlatformAdmin" class="admin-section">
          <div class="section-head">
            <div>
              <p class="section-kicker">{{ $t('adminHome.platformSectionKicker') }}</p>
              <h2 class="section-title">{{ $t('adminHome.platformSectionTitle') }}</h2>
              <p class="section-subtitle">{{ $t('adminHome.platformSectionSubtitle') }}</p>
            </div>
          </div>
          <div class="tool-grid">
            <router-link to="/admin/feedback" class="tool-card">
              <span class="tool-card-label">{{ $t('adminHome.enterFeedback') }}</span>
              <span class="tool-card-description">{{ $t('adminHome.feedbackDescription') }}</span>
              <span class="tool-card-arrow" aria-hidden="true">&rarr;</span>
            </router-link>
            <router-link to="/admin/academic-subjects" class="tool-card">
              <span class="tool-card-label">{{ $t('adminHome.enterAcademicSubjects') }}</span>
              <span class="tool-card-description">{{ $t('adminHome.subjectCatalogDescription') }}</span>
              <span class="tool-card-arrow" aria-hidden="true">&rarr;</span>
            </router-link>
          </div>
        </section>

        <section v-if="canReviewContent" class="admin-section">
          <div class="section-head">
            <div>
              <p class="section-kicker">{{ $t('adminHome.reviewSectionKicker') }}</p>
              <h2 class="section-title">{{ $t('adminHome.reviewSectionTitle') }}</h2>
              <p class="section-subtitle">{{ $t('adminHome.reviewSectionSubtitle') }}</p>
            </div>
          </div>
          <div class="tool-grid">
            <router-link to="/admin/papers" class="tool-card">
              <span class="tool-card-label">{{ $t('adminHome.enterPaperReview') }}</span>
              <span class="tool-card-description">{{ $t('adminHome.paperReviewDescription') }}</span>
              <span class="tool-card-arrow" aria-hidden="true">&rarr;</span>
            </router-link>
            <router-link v-if="canAccessDegreeThesisAdmin" to="/admin/theses" class="tool-card">
              <span class="tool-card-label">{{ $t('adminHome.enterDegreeTheses') }}</span>
              <span class="tool-card-description">{{ $t('adminHome.degreeThesisDescription') }}</span>
              <span class="tool-card-arrow" aria-hidden="true">&rarr;</span>
            </router-link>
            <router-link
              v-if="canManageScholarTimelines"
              to="/admin/scholar-timelines"
              class="tool-card"
            >
              <span class="tool-card-label">{{ $t('adminHome.enterScholarTimelines') }}</span>
              <span class="tool-card-description">{{ $t('adminHome.timelineDescription') }}</span>
              <span class="tool-card-arrow" aria-hidden="true">&rarr;</span>
            </router-link>
          </div>
        </section>

        <section class="admin-section">
          <div class="section-head">
            <div>
              <p class="section-kicker">{{ $t('adminHome.institutionSectionKicker') }}</p>
              <h2 class="section-title">{{ $t('adminHome.institutionsTitle') }}</h2>
              <p class="section-subtitle">{{ $t('adminHome.institutionsSubtitle') }}</p>
            </div>
          </div>

          <div v-if="institutions.length" class="resource-grid">
            <article v-for="institution in institutions" :key="institution.id" class="resource-card">
              <div class="resource-head">
                <div>
                  <h3 class="resource-title">{{ institution.name }}</h3>
                  <div class="resource-meta">
                    <span>{{ $t('common.counts.members', { count: institution.memberCount }) }}</span>
                    <span>{{ $t('common.counts.labs', { count: institution.labCount }) }}</span>
                  </div>
                </div>
                <span class="resource-badge">{{ formatInstitutionRole(institution.role) }}</span>
              </div>
              <div class="capability-list">
                <span
                  v-for="capability in getInstitutionCapabilities(institution)"
                  :key="capability"
                  class="capability-chip"
                >
                  {{ capability }}
                </span>
              </div>
              <p class="resource-summary">
                {{ institution.summary || $t('adminHome.institutionSummaryFallback') }}
              </p>
              <div class="resource-actions">
                <router-link
                  :to="`/admin/institutions/${institution.slug}`"
                  class="primary-action"
                >
                  {{ $t('adminHome.enterInstitutionContent') }}
                </router-link>
                <router-link
                  v-if="canManageInstitution(institution)"
                  :to="`/admin/institutions/${institution.slug}/members`"
                  class="secondary-action"
                >
                  {{ $t('adminHome.enterInstitutionMembers') }}
                </router-link>
                <router-link
                  v-if="canManageInstitution(institution)"
                  :to="`/admin/academic-subjects?institution=${encodeURIComponent(institution.slug)}`"
                  class="secondary-action"
                >
                  {{ $t('adminHome.enterAcademicSubjects') }}
                </router-link>
                <a
                  v-if="resolveSafeHttpUrl(institution.website)"
                  :href="resolveSafeHttpUrl(institution.website)"
                  target="_blank"
                  rel="noopener"
                  class="text-action"
                >
                  {{ $t('adminHome.visitWebsite') }}
                </a>
              </div>
            </article>
          </div>
          <div v-else class="empty-card">
            {{ $t('adminHome.noInstitutionAccess') }}
          </div>
        </section>

        <section v-if="profile.manageable_labs.length" class="admin-section">
          <div class="section-head">
            <div>
              <p class="section-kicker">{{ $t('adminHome.labSectionKicker') }}</p>
              <h2 class="section-title">{{ $t('adminHome.labsTitle') }}</h2>
              <p class="section-subtitle">{{ $t('adminHome.labsSubtitle') }}</p>
            </div>
          </div>

          <div class="resource-grid">
            <article v-for="lab in profile.manageable_labs" :key="lab.id" class="resource-card">
              <div class="resource-head">
                <div>
                  <h3 class="resource-title">{{ lab.name }}</h3>
                  <div class="resource-meta">
                    <span>{{ lab.slug }}</span>
                  </div>
                </div>
                <span class="resource-badge">{{ formatLabRole(lab.role) }}</span>
              </div>
              <p class="resource-summary">{{ $t('adminHome.labSummary') }}</p>
              <div class="resource-actions">
                <router-link :to="`/admin/labs/${lab.slug}/settings`" class="primary-action">
                  {{ $t('adminHome.labSettings') }}
                </router-link>
              </div>
            </article>
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
import { resolveSafeHttpUrl } from '@/utils/url'

const profile = ref<UserProfile | null>(null)
const institutions = ref<InstitutionListItem[]>([])
const isLoading = ref(true)
const loadError = ref('')
const { t } = useI18n()
const { updateAdminAccess } = useAuth()
const { publicConfig, features, scholarTimeline } = usePublicConfig()

const platformRoleLabel = computed(() => {
  if (!profile.value) {
    return ''
  }

  return t(PLATFORM_ROLE_LABEL_KEYS[profile.value.platform_role as 'platform_admin' | 'member'])
})

const isPlatformAdmin = computed(() => profile.value?.admin_access.manage_platform === true)
const canReviewContent = computed(() => profile.value?.admin_access.review_content === true)
const consoleEyebrow = computed(() => {
  return t(
    isPlatformAdmin.value
      ? 'adminHome.platformConsoleEyebrow'
      : 'adminHome.institutionConsoleEyebrow',
  )
})
const consoleSubtitle = computed(() => {
  return t(
    isPlatformAdmin.value
      ? 'adminHome.platformConsoleSubtitle'
      : 'adminHome.institutionConsoleSubtitle',
  )
})
const grantedCapabilityCount = computed(() => {
  if (!profile.value) {
    return 0
  }

  const access = profile.value.admin_access
  return [
    access.manage_platform,
    access.manage_institutions,
    access.manage_labs,
    access.review_content,
    access.import_data,
  ].filter(Boolean).length
})
const isTimelineGenerationEnabled = computed(() => {
  return scholarTimeline.value.generationMode !== 'disabled'
})
const canManageScholarTimelines = computed(() => {
  if (!isTimelineGenerationEnabled.value || !profile.value) {
    return false
  }

  return (
    profile.value.admin_access.manage_platform ||
    (publicConfig.value.deploymentMode === 'private' &&
      profile.value.admin_access.manage_institutions)
  )
})
const canAccessDegreeThesisAdmin = computed(() => {
  return features.value.degreeTheses && canReviewContent.value
})
const institutionMembershipBySlug = computed(() => {
  return new Map(
    (profile.value?.institution_memberships ?? []).map((membership) => [
      membership.slug,
      membership,
    ]),
  )
})

const formatInstitutionRole = (role: string): string => {
  const key = INSTITUTION_ROLE_LABEL_KEYS[role as keyof typeof INSTITUTION_ROLE_LABEL_KEYS]
  return key ? t(key) : t('common.roles.institution.member')
}

const formatLabRole = (role: string): string => {
  const key = LAB_ROLE_LABEL_KEYS[role as keyof typeof LAB_ROLE_LABEL_KEYS]
  return key ? t(key) : t('common.roles.lab.member')
}

const canManageInstitution = (institution: InstitutionListItem): boolean => {
  if (isPlatformAdmin.value) {
    return true
  }

  const membership = institutionMembershipBySlug.value.get(institution.slug)
  return membership?.role === 'owner' || membership?.role === 'admin'
}

const getInstitutionCapabilities = (institution: InstitutionListItem): string[] => {
  if (isPlatformAdmin.value) {
    return [t('adminHome.capabilityPlatformManagement')]
  }

  const membership = institutionMembershipBySlug.value.get(institution.slug)
  if (!membership) {
    return []
  }

  const managesInstitution = membership.role === 'owner' || membership.role === 'admin'
  const capabilities: string[] = []
  if (managesInstitution) {
    capabilities.push(t('adminHome.capabilityInstitutionManagement'))
  }
  if (managesInstitution || membership.can_review_content) {
    capabilities.push(t('adminHome.capabilityContentReview'))
  }
  if (managesInstitution || membership.can_import_data) {
    capabilities.push(t('adminHome.capabilityDataImport'))
  }
  return capabilities
}

const load = async (): Promise<void> => {
  isLoading.value = true
  loadError.value = ''

  try {
    const [profileData, institutionItems] = await Promise.all([
      getMyProfile(),
      listInstitutions(),
    ])
    profile.value = profileData
    institutions.value = institutionItems
    updateAdminAccess(profileData.admin_access)
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : t('adminHome.loadFailed')
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  void load()
})
</script>

<style lang="sass" scoped>
.admin-page
  min-height: calc(100vh - var(--scholar-navbar-height))
  padding: 32px 0 56px
  background: linear-gradient(180deg, #f7f9fc 0%, #ffffff 100%)

.admin-container
  width: 1120px
  max-width: 100%
  padding: 0 30px
  margin: 0 auto

.admin-header
  margin-bottom: 24px

.admin-eyebrow, .section-kicker
  margin: 0
  font-size: 12px
  font-weight: 650
  letter-spacing: 0.14em
  text-transform: uppercase
  color: #60728a

.admin-title
  margin: 10px 0 0
  font-size: 32px
  font-weight: 720
  color: #172b4d

.admin-subtitle
  max-width: 720px
  margin: 10px 0 0
  font-size: 15px
  line-height: 1.7
  color: #667085

.stats-grid
  display: grid
  grid-template-columns: repeat(4, minmax(0, 1fr))
  gap: 14px

.stat-card
  padding: 20px 22px
  border-radius: 20px
  border: 1px solid rgba(15, 47, 87, 0.08)
  background: #fff
  box-shadow: 0 12px 30px rgba(15, 47, 87, 0.05)

.stat-label
  font-size: 13px
  color: #667085

.stat-value
  margin-top: 9px
  font-size: 28px
  font-weight: 720
  color: #0f2f57

.stat-value--text
  font-size: 20px

.admin-section
  margin-top: 28px

.section-head
  margin-bottom: 14px

.section-title
  margin: 6px 0 0
  font-size: 21px
  color: #1f2937

.section-subtitle
  margin: 7px 0 0
  font-size: 14px
  line-height: 1.6
  color: #667085

.tool-grid, .resource-grid
  display: grid
  grid-template-columns: repeat(2, minmax(0, 1fr))
  gap: 14px

.tool-card
  position: relative
  display: flex
  flex-direction: column
  min-height: 142px
  padding: 22px 56px 22px 22px
  border: 1px solid rgba(15, 47, 87, 0.09)
  border-radius: 20px
  background: #fff
  color: inherit
  text-decoration: none
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease

.tool-card:hover
  transform: translateY(-2px)
  border-color: rgba(15, 98, 254, 0.25)
  box-shadow: 0 16px 38px rgba(15, 47, 87, 0.08)

.tool-card-label
  font-size: 17px
  font-weight: 680
  color: #172b4d

.tool-card-description
  margin-top: 10px
  font-size: 14px
  line-height: 1.7
  color: #667085

.tool-card-arrow
  position: absolute
  top: 20px
  right: 22px
  font-size: 20px
  color: #0f62fe

.resource-card, .empty-card
  padding: 22px
  border-radius: 20px
  border: 1px solid rgba(15, 47, 87, 0.08)
  background: #fff
  box-shadow: 0 12px 30px rgba(15, 47, 87, 0.05)

.resource-head
  display: flex
  align-items: flex-start
  justify-content: space-between
  gap: 12px

.resource-title
  margin: 0
  font-size: 18px
  font-weight: 680
  color: #1f2937

.resource-meta
  display: flex
  flex-wrap: wrap
  gap: 8px 12px
  margin-top: 8px
  font-size: 13px
  color: #667085

.resource-badge, .capability-chip
  display: inline-flex
  align-items: center
  padding: 5px 10px
  border-radius: 999px
  font-size: 12px
  font-weight: 600

.resource-badge
  background: #eef4ff
  color: #0f62fe

.capability-list
  display: flex
  flex-wrap: wrap
  gap: 7px
  margin-top: 15px

.capability-chip
  background: #f2f7f5
  color: #34705c

.resource-summary
  min-height: 44px
  margin: 15px 0 0
  font-size: 14px
  line-height: 1.7
  color: #475467

.resource-actions
  display: flex
  align-items: center
  flex-wrap: wrap
  gap: 10px
  margin-top: 18px

.primary-action, .secondary-action
  display: inline-flex
  align-items: center
  justify-content: center
  min-height: 38px
  padding: 0 14px
  border-radius: 999px
  text-decoration: none
  font-size: 13px
  font-weight: 600

.primary-action
  background: #0f2f57
  color: #fff

.secondary-action
  background: #eef4ff
  color: #0f2f57

.text-action
  color: #0f62fe
  text-decoration: none
  font-size: 13px

.empty-card
  color: #667085
  line-height: 1.7

.admin-state
  min-height: 280px
  display: flex
  align-items: center
  justify-content: center
  color: #667085
  font-size: 15px

.admin-state--error
  color: #b42318

@media (max-width: 900px)
  .stats-grid
    grid-template-columns: repeat(2, minmax(0, 1fr))

@media (max-width: 720px)
  .admin-container
    padding: 0 18px

  .tool-grid, .resource-grid
    grid-template-columns: 1fr

@media (max-width: 480px)
  .stats-grid
    grid-template-columns: 1fr

  .resource-actions
    align-items: stretch
    flex-direction: column
</style>
