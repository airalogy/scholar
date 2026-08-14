<template>
  <div class="admin-page">
    <div class="admin-container">
      <div class="admin-header">
        <div>
          <div class="admin-eyebrow">{{ $t('adminLabSettings.eyebrow') }}</div>
          <h1 class="admin-title">{{ lab?.name || $t('adminLabSettings.defaultTitle') }}</h1>
          <p class="admin-subtitle">
            {{ $t('adminLabSettings.subtitle') }}
          </p>
        </div>
        <router-link to="/admin" class="back-link">{{ $t('adminLabSettings.backToAdmin') }}</router-link>
      </div>

      <div v-if="isLoading" class="admin-state">{{ $t('common.loading') }}</div>
      <div v-else-if="loadError" class="admin-state">{{ loadError }}</div>
      <template v-else-if="lab">
        <section class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">{{ $t('adminLabSettings.institutionLabel') }}</div>
            <div class="stat-value stat-value--small">{{ lab.institutionName || $t('adminLabSettings.noInstitution') }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">{{ $t('adminLabSettings.scholarCountLabel') }}</div>
            <div class="stat-value">{{ lab.scholarCount }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">{{ $t('adminLabSettings.memberCountLabel') }}</div>
            <div class="stat-value">{{ lab.memberCount }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">{{ $t('adminLabSettings.representativePaperCountLabel') }}</div>
            <div class="stat-value">{{ lab.representativePaperCount }}</div>
          </div>
        </section>

        <section class="admin-panel">
          <div class="panel-head">
            <div>
              <h2 class="panel-title">{{ $t('adminLabSettings.homepageTitle') }}</h2>
              <p class="panel-subtitle">{{ $t('adminLabSettings.homepageSubtitle') }}</p>
            </div>
            <span class="role-badge">{{ labRoleLabel }}</span>
          </div>

          <a-form layout="vertical" :model="formState" class="content-form">
            <a-form-item field="summary" :label="$t('adminLabSettings.summaryLabel')">
              <a-textarea
                v-model="formState.summary"
                :max-length="5000"
                :auto-size="{ minRows: 4, maxRows: 8 }"
                :disabled="!lab.access.can_edit_content"
                :placeholder="$t('adminLabSettings.summaryPlaceholder')"
              />
            </a-form-item>
            <div class="field-grid">
              <a-form-item field="college" :label="$t('common.college')">
                <a-input
                  v-model="formState.college"
                  :disabled="!lab.access.can_edit_content"
                  :placeholder="$t('adminLabSettings.collegePlaceholder')"
                />
              </a-form-item>
              <a-form-item field="location" :label="$t('common.location')">
                <a-input
                  v-model="formState.location"
                  :disabled="!lab.access.can_edit_content"
                  :placeholder="$t('adminLabSettings.locationPlaceholder')"
                />
              </a-form-item>
            </div>
            <a-form-item field="website" :label="$t('common.website')">
              <a-input
                v-model="formState.website"
                :disabled="!lab.access.can_edit_content"
                placeholder="https://"
              />
            </a-form-item>
          </a-form>

          <div class="panel-actions">
            <a-button
              type="primary"
              :loading="isSavingContent"
              :disabled="!lab.access.can_edit_content"
              @click="saveLabContent"
            >
              {{ $t('adminLabSettings.saveHomepage') }}
            </a-button>
            <span v-if="!lab.access.can_edit_content" class="permission-note">
              {{ $t('adminLabSettings.contentReadOnly') }}
            </span>
          </div>
        </section>

        <section class="admin-panel">
          <div class="panel-head">
            <div>
              <h2 class="panel-title">{{ $t('adminLabSettings.memberPermissionsTitle') }}</h2>
              <p class="panel-subtitle">{{ $t('adminLabSettings.memberPermissionsSubtitle') }}</p>
            </div>
          </div>

          <template v-if="lab.access.can_manage_members">
            <div class="member-toolbar">
              <a-input-search
                v-model="searchQuery"
                class="member-search"
                :placeholder="$t('adminLabSettings.memberSearchPlaceholder')"
                allow-clear
                @search="searchDirectory"
                @press-enter="searchDirectory"
              />
              <a-select v-model="searchRole" class="role-select">
                <a-option v-for="item in roleOptions" :key="item.value" :value="item.value">{{ item.label }}</a-option>
              </a-select>
            </div>

            <div v-if="searchResults.length" class="search-grid">
              <article v-for="user in searchResults" :key="user.id" class="search-card">
                <div class="search-user">
                  <div class="avatar">
                    <img v-if="user.avatar" :src="user.avatar" :alt="user.name" />
                    <span v-else>{{ user.name.charAt(0) }}</span>
                  </div>
                  <div>
                    <div class="search-name">{{ user.name }}</div>
                    <div class="search-meta">{{ user.email }}</div>
                    <div class="search-meta">
                      {{ [user.college, user.major, user.laboratory].filter(Boolean).join(' / ') || $t('common.noAdditionalInfo') }}
                    </div>
                  </div>
                </div>
                <a-button
                  type="outline"
                  :loading="actionUserId === user.id"
                  @click="upsertMember(user.id, searchRole)"
                >
                  {{ memberIdSet.has(user.id) ? $t('common.updateRole') : $t('common.addToLab') }}
                </a-button>
              </article>
            </div>
            <div v-else-if="isSearching" class="search-state">{{ $t('common.searching') }}</div>
            <div v-else class="search-state">{{ $t('adminLabSettings.memberSearchHint') }}</div>

            <div v-if="isMembershipLoading" class="table-state">{{ $t('adminLabSettings.memberListLoading') }}</div>
            <div v-else-if="memberships.length" class="member-list">
              <article v-for="member in memberships" :key="member.userId" class="member-card">
                <div class="search-user">
                  <div class="avatar">
                    <img v-if="member.avatar" :src="member.avatar" :alt="member.name" />
                    <span v-else>{{ member.name.charAt(0) }}</span>
                  </div>
                  <div>
                    <div class="search-name">{{ member.name }}</div>
                    <div class="search-meta">{{ member.email }}</div>
                    <div class="search-meta">
                      {{ [member.degree, member.major].filter(Boolean).join(' / ') || $t('common.noAdditionalInfo') }}
                    </div>
                  </div>
                </div>

                <div class="member-actions">
                  <a-select
                    :model-value="member.role"
                    size="small"
                    class="inline-role-select"
                    @change="handleRoleChange(member.userId, $event)"
                  >
                    <a-option v-for="item in roleOptions" :key="item.value" :value="item.value">{{ item.label }}</a-option>
                  </a-select>
                  <a-button
                    status="danger"
                    type="outline"
                    size="small"
                    :loading="actionUserId === member.userId"
                    @click="removeMember(member.userId)"
                  >
                    {{ $t('common.remove') }}
                  </a-button>
                </div>
              </article>
            </div>
            <div v-else class="table-state">{{ $t('adminLabSettings.noMembers') }}</div>
          </template>

          <div v-else class="table-state">
            {{ $t('adminLabSettings.noMemberPermission') }}
          </div>
        </section>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import { useI18n } from 'vue-i18n'
import {
  getLab,
  listLabMemberships,
  removeLabMembership,
  updateLab,
  upsertLabMembership,
  type LabDetailResponse,
  type LabMembershipItem,
  type LabRole,
} from '@/api/labs'
import { searchUsers, type UserSearchItem } from '@/api/users'
import { INSTITUTION_ROLE_LABEL_KEYS, LAB_ROLE_LABEL_KEYS, PLATFORM_ROLE_LABEL_KEYS } from '@/i18n/helpers'

const route = useRoute()
const { t } = useI18n()

const lab = ref<LabDetailResponse | null>(null)
const memberships = ref<LabMembershipItem[]>([])
const searchResults = ref<UserSearchItem[]>([])
const searchQuery = ref('')
const searchRole = ref<LabRole>('member')
const isLoading = ref(false)
const isSavingContent = ref(false)
const isMembershipLoading = ref(false)
const isSearching = ref(false)
const actionUserId = ref('')
const loadError = ref('')

const formState = reactive({
  summary: '',
  college: '',
  location: '',
  website: '',
})

const memberIdSet = computed(() => new Set(memberships.value.map((member) => member.userId)))
const roleOptions = computed(() => {
  return [
    { value: 'member' as const, label: t('common.roles.lab.member') },
    { value: 'admin' as const, label: t('common.roles.lab.admin') },
    { value: 'owner' as const, label: t('common.roles.lab.owner') },
  ]
})

const labRoleLabel = computed(() => {
  const access = lab.value?.access
  if (!access) {
    return ''
  }

  if (access.platform_role === 'platform_admin') {
    return t(PLATFORM_ROLE_LABEL_KEYS.platform_admin)
  }
  if (access.lab_role === 'owner') {
    return t(LAB_ROLE_LABEL_KEYS.owner)
  }
  if (access.lab_role === 'admin') {
    return t(LAB_ROLE_LABEL_KEYS.admin)
  }
  if (access.institution_role === 'owner') {
    return t(INSTITUTION_ROLE_LABEL_KEYS.owner)
  }
  if (access.institution_role === 'admin') {
    return t(INSTITUTION_ROLE_LABEL_KEYS.admin)
  }
  return t(LAB_ROLE_LABEL_KEYS.member)
})

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as {
      response?: { data?: { message?: string } }
    }).response
    if (response?.data?.message) {
      return response.data.message
    }
  }

  return error instanceof Error ? error.message : fallback
}

const syncFormState = (): void => {
  formState.summary = lab.value?.summary ?? ''
  formState.college = lab.value?.college ?? ''
  formState.location = lab.value?.location ?? ''
  formState.website = lab.value?.website ?? ''
}

const loadMemberships = async (slug: string): Promise<void> => {
  if (!lab.value?.access.can_manage_members) {
    memberships.value = []
    return
  }

  isMembershipLoading.value = true
  try {
    memberships.value = await listLabMemberships(slug)
  } finally {
    isMembershipLoading.value = false
  }
}

const load = async (slug: string): Promise<void> => {
  isLoading.value = true
  loadError.value = ''
  searchResults.value = []

  try {
    lab.value = await getLab(slug)
    syncFormState()
    await loadMemberships(slug)
  } catch (error) {
    lab.value = null
    memberships.value = []
    loadError.value = getErrorMessage(error, t('adminLabSettings.loadFailed'))
  } finally {
    isLoading.value = false
  }
}

const saveLabContent = async (): Promise<void> => {
  const slug = String(route.params.slug ?? '')
  if (!slug || !lab.value) {
    return
  }

  isSavingContent.value = true
  try {
    lab.value = await updateLab(slug, {
      summary: formState.summary.trim(),
      college: formState.college.trim(),
      location: formState.location.trim(),
      website: formState.website.trim(),
    })
    syncFormState()
    Message.success(t('adminLabSettings.saveHomepageSuccess'))
  } catch (error) {
    Message.error(getErrorMessage(error, t('adminLabSettings.saveHomepageFailed')))
  } finally {
    isSavingContent.value = false
  }
}

const searchDirectory = async (): Promise<void> => {
  const keyword = searchQuery.value.trim()
  if (!keyword) {
    searchResults.value = []
    return
  }

  isSearching.value = true
  try {
    searchResults.value = await searchUsers(keyword)
  } catch (error) {
    Message.error(getErrorMessage(error, t('adminLabSettings.searchUsersFailed')))
  } finally {
    isSearching.value = false
  }
}

const upsertMember = async (userId: string, role: LabRole): Promise<void> => {
  const slug = String(route.params.slug ?? '')
  if (!slug) {
    return
  }

  actionUserId.value = userId
  try {
    memberships.value = await upsertLabMembership(slug, { userId, role })
    Message.success(t('adminLabSettings.memberUpdated'))
  } catch (error) {
    Message.error(getErrorMessage(error, t('adminLabSettings.memberUpdateFailed')))
  } finally {
    actionUserId.value = ''
  }
}

const handleRoleChange = (
  userId: string,
  value: unknown,
): void => {
  if (typeof value !== 'string') {
    return
  }

  void upsertMember(userId, value as LabRole)
}

const removeMember = async (userId: string): Promise<void> => {
  const slug = String(route.params.slug ?? '')
  if (!slug) {
    return
  }

  actionUserId.value = userId
  try {
    memberships.value = await removeLabMembership(slug, userId)
    Message.success(t('adminLabSettings.memberRemoved'))
  } catch (error) {
    Message.error(getErrorMessage(error, t('adminLabSettings.memberRemoveFailed')))
  } finally {
    actionUserId.value = ''
  }
}

watch(
  () => String(route.params.slug ?? ''),
  (slug) => {
    if (!slug) {
      lab.value = null
      memberships.value = []
      return
    }
    void load(slug)
  },
  { immediate: true },
)
</script>

<style lang="sass" scoped>
.admin-page
  min-height: calc(100vh - var(--scholar-navbar-height))
  padding: 28px 0 48px
  background: linear-gradient(180deg, #f6f8fb 0%, #ffffff 100%)

.admin-container
  width: 1120px
  max-width: 100%
  margin: 0 auto
  padding: 0 30px

.admin-header
  display: flex
  align-items: flex-start
  justify-content: space-between
  gap: 20px
  margin-bottom: 22px

.admin-eyebrow
  font-size: 12px
  letter-spacing: 0.22em
  text-transform: uppercase
  color: #7d8ca3

.admin-title
  margin: 10px 0 0
  font-size: 30px
  font-weight: 700
  color: #1f2937

.admin-subtitle
  margin: 10px 0 0
  font-size: 14px
  color: #667085

.back-link
  color: #0f62fe
  text-decoration: none
  font-weight: 600

.stats-grid
  display: grid
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr))
  gap: 16px
  margin-bottom: 20px

.stat-card
  padding: 20px 22px
  border-radius: 20px
  border: 1px solid rgba(15, 47, 87, 0.08)
  background: #fff
  box-shadow: 0 14px 34px rgba(15, 47, 87, 0.06)

.stat-label
  font-size: 13px
  color: #667085

.stat-value
  margin-top: 10px
  font-size: 30px
  font-weight: 700
  color: #0f2f57

.stat-value--small
  font-size: 18px
  line-height: 1.4

.admin-panel
  padding: 24px
  border-radius: 22px
  border: 1px solid rgba(15, 47, 87, 0.08)
  background: #fff
  box-shadow: 0 14px 34px rgba(15, 47, 87, 0.06)

.admin-panel + .admin-panel
  margin-top: 20px

.panel-head
  display: flex
  align-items: flex-start
  justify-content: space-between
  gap: 16px

.panel-title
  margin: 0
  font-size: 20px
  color: #1f2937

.panel-subtitle
  margin: 8px 0 0
  font-size: 14px
  color: #667085

.role-badge
  padding: 6px 12px
  border-radius: 999px
  background: #eef4ff
  color: #0f62fe
  font-size: 12px
  font-weight: 600

.content-form
  margin-top: 18px

.field-grid
  display: grid
  grid-template-columns: repeat(2, minmax(0, 1fr))
  gap: 16px

.panel-actions
  display: flex
  align-items: center
  gap: 14px

.permission-note
  font-size: 13px
  color: #98a2b3

.member-toolbar
  display: flex
  gap: 12px
  margin-top: 18px

.member-search
  flex: 1

.role-select
  width: 160px

.search-grid
  display: grid
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr))
  gap: 14px
  margin-top: 16px

.search-card, .member-card
  display: flex
  align-items: center
  justify-content: space-between
  gap: 16px
  padding: 16px 18px
  border-radius: 18px
  background: #f8fafc

.search-user
  display: flex
  align-items: center
  gap: 12px
  min-width: 0

.avatar
  width: 44px
  height: 44px
  border-radius: 50%
  background: #dce8f8
  color: #0f2f57
  display: flex
  align-items: center
  justify-content: center
  overflow: hidden
  font-weight: 700
  flex-shrink: 0

.avatar img
  width: 100%
  height: 100%
  object-fit: cover

.search-name
  font-size: 15px
  font-weight: 700
  color: #1f2937

.search-meta
  margin-top: 4px
  font-size: 13px
  color: #667085
  line-height: 1.5

.member-list
  display: flex
  flex-direction: column
  gap: 12px
  margin-top: 18px

.member-actions
  display: flex
  align-items: center
  gap: 10px

.inline-role-select
  width: 140px

.search-state, .table-state, .admin-state
  display: flex
  align-items: center
  justify-content: center
  min-height: 120px
  color: #667085
  text-align: center

.admin-state
  min-height: 280px

@media (max-width: 768px)
  .admin-container
    padding: 0 18px

  .admin-header, .panel-head, .member-toolbar, .search-card, .member-card
    flex-direction: column
    align-items: stretch

  .field-grid
    grid-template-columns: minmax(0, 1fr)

  .role-select, .inline-role-select
    width: 100%
</style>
