<template>
  <div class="settings-page">
    <div class="settings-container">
      <header class="settings-header">
        <h1 class="settings-title">{{ $t('settings.title') }}</h1>
        <p class="settings-description">{{ $t('settings.pageHint') }}</p>
      </header>

      <div v-if="!profileLoaded" class="section-card profile-state" :aria-busy="isLoading">
        <template v-if="loadError">
          <p role="alert">{{ $t('settings.loadFailed') }}</p>
          <a-button type="outline" @click="fillProfile">{{ $t('settings.retryLoad') }}</a-button>
        </template>
        <template v-else>
          <a-spin />
          <p role="status">{{ $t('common.loading') }}</p>
        </template>
      </div>

      <a-tabs v-else v-model:active-key="activeTab" class="settings-tabs">
        <a-tab-pane key="profile" :title="$t('settings.profileTab')">
          <div class="profile-content">
            <div class="section-card profile-overview">
              <div class="profile-summary">
                <div class="avatar-circle">
                  <img v-if="avatarPreview" :src="avatarPreview" :alt="$t('settings.avatarAlt')" />
                  <span v-else>{{ profileForm.name?.slice(0, 1) || 'U' }}</span>
                </div>
                <div class="profile-summary-main">
                  <p class="profile-name">{{ profileForm.name || $t('settings.profileTab') }}</p>
                  <dl class="profile-contact">
                    <dt>{{ $t('settings.email') }} · {{ $t('settings.readOnly') }}</dt>
                    <dd>{{ profileForm.email || $t('settings.notBound') }}</dd>
                  </dl>
                  <a-upload :show-file-list="false" :custom-request="handleAvatarUpload" accept="image/*">
                    <template #upload-button>
                      <a-button type="outline" size="small">{{ $t('common.changeAvatar') }}</a-button>
                    </template>
                  </a-upload>
                </div>
              </div>
              <ProfileInstitutionIdentity :identity="institutionIdentity" :memberships="institutionMemberships" />
            </div>

            <section class="section-card" aria-labelledby="basic-info-title">
              <div class="section-header">
                <div>
                  <h2 id="basic-info-title" class="section-title">{{ $t('settings.basicInfo') }}</h2>
                  <p class="section-description">{{ $t('settings.basicInfoHint') }}</p>
                </div>
              </div>
              <a-form :model="profileForm" layout="vertical" class="profile-form">
                <div class="grid-row">
                  <a-form-item field="name" :label="$t('settings.name')">
                    <a-input v-model="profileForm.name" :placeholder="$t('settings.namePlaceholder')" />
                  </a-form-item>
                  <a-form-item field="gender" :label="$t('settings.gender')">
                    <a-select v-model="profileForm.gender" :placeholder="$t('settings.genderPlaceholder')" allow-clear>
                      <a-option value="male">{{ $t('settings.genders.male') }}</a-option>
                      <a-option value="female">{{ $t('settings.genders.female') }}</a-option>
                      <a-option value="other">{{ $t('settings.genders.other') }}</a-option>
                    </a-select>
                  </a-form-item>
                  <a-form-item field="college" :label="$t('common.college')">
                    <a-input v-model="profileForm.college" :placeholder="$t('settings.collegePlaceholder')" />
                  </a-form-item>
                  <a-form-item field="major" :label="$t('settings.major')">
                    <a-input v-model="profileForm.major" :placeholder="$t('settings.majorPlaceholder')" />
                  </a-form-item>
                  <a-form-item field="grade" :label="$t('settings.grade')">
                    <a-input v-model="profileForm.grade" :placeholder="$t('settings.gradePlaceholder')" />
                  </a-form-item>
                  <a-form-item field="degree" :label="$t('settings.degree')">
                    <a-input v-model="profileForm.degree" :placeholder="$t('settings.degreePlaceholder')" />
                  </a-form-item>
                  <a-form-item field="laboratory" :label="$t('settings.lab')" class="grid-full">
                    <a-input v-model="profileForm.laboratory" :placeholder="$t('settings.labPlaceholder')" />
                  </a-form-item>
                </div>
              </a-form>
            </section>

            <section class="section-card" aria-labelledby="academic-info-title">
              <div class="section-header">
                <div>
                  <h2 id="academic-info-title" class="section-title">{{ $t('settings.academicInfo') }}</h2>
                  <p class="section-description">{{ $t('settings.academicInfoHint') }}</p>
                </div>
              </div>
              <a-form :model="profileForm" layout="vertical" class="profile-form">
                <div class="grid-row">
                  <a-form-item field="bio" :label="$t('settings.bio')">
                    <a-textarea
                      v-model="profileForm.bio"
                      :max-length="1000"
                      :auto-size="{ minRows: 5, maxRows: 8 }"
                      :placeholder="$t('settings.bioPlaceholder')"
                      allow-clear
                      show-word-limit
                    />
                  </a-form-item>
                  <a-form-item field="research_interests" :label="$t('settings.researchInterests')">
                    <a-textarea
                      v-model="profileForm.research_interests"
                      :max-length="2000"
                      :auto-size="{ minRows: 5, maxRows: 8 }"
                      :placeholder="$t('settings.researchInterestsPlaceholder')"
                      allow-clear
                      show-word-limit
                    />
                  </a-form-item>
                </div>
              </a-form>
            </section>

            <section class="section-card" aria-labelledby="projects-title">
              <div class="section-header">
                <div>
                  <h2 id="projects-title" class="section-title">{{ $t('settings.projects') }}</h2>
                  <p class="section-description">{{ $t('settings.projectsHint') }}</p>
                </div>
                <a-button type="outline" size="small" @click="addProject">{{ $t('settings.addProject') }}</a-button>
              </div>
              <div class="list-editor">
                <div v-for="(item, index) in profileForm.project_experiences" :key="item.id" class="list-row project-row">
                  <div class="editor-field">
                    <label :for="'project-title-' + item.id">{{ $t('settings.projectNamePlaceholder') }}</label>
                    <a-input
                      v-model="item.title"
                      :input-attrs="{ id: 'project-title-' + item.id }"
                      :placeholder="$t('settings.projectNamePlaceholder')"
                    />
                  </div>
                  <div class="editor-field">
                    <label :for="'project-period-' + item.id">{{ $t('settings.projectPeriod') }}</label>
                    <a-input
                      v-model="item.period"
                      :input-attrs="{ id: 'project-period-' + item.id }"
                      :placeholder="$t('settings.projectPeriodPlaceholder')"
                    />
                  </div>
                  <a-button class="remove-item" type="text" status="danger" size="small" :aria-label="$t('settings.removeProject', { index: index + 1 })" @click="removeProject(index)">{{ $t('common.delete') }}</a-button>
                </div>
                <p v-if="!profileForm.project_experiences.length" class="compact-empty">{{ $t('settings.noProjects') }}</p>
              </div>
            </section>

            <section class="section-card" aria-labelledby="publications-title">
              <div class="section-header">
                <div>
                  <h2 id="publications-title" class="section-title">{{ $t('settings.publications') }}</h2>
                  <p class="section-description">{{ $t('settings.publicationsHint') }}</p>
                </div>
                <a-button type="outline" size="small" @click="addPublication">{{ $t('settings.addPublication') }}</a-button>
              </div>
              <div class="list-editor">
                <div v-for="(item, index) in profileForm.publications" :key="item.id" class="list-row publication-row">
                  <div class="editor-field">
                    <label :for="'publication-title-' + item.id">{{ $t('settings.publicationTitlePlaceholder') }}</label>
                    <a-input
                      v-model="item.title"
                      :input-attrs="{ id: 'publication-title-' + item.id }"
                      :placeholder="$t('settings.publicationTitlePlaceholder')"
                    />
                  </div>
                  <a-button class="remove-item" type="text" status="danger" size="small" :aria-label="$t('settings.removePublication', { index: index + 1 })" @click="removePublication(index)">{{ $t('common.delete') }}</a-button>
                </div>
                <p v-if="!profileForm.publications.length" class="compact-empty">{{ $t('settings.noPublications') }}</p>
              </div>
            </section>

            <section v-if="institutionIdentity" class="section-card linked-papers-section" aria-labelledby="linked-papers-title">
              <div class="section-header">
                <div>
                  <div class="section-heading-line">
                    <h2 id="linked-papers-title" class="section-title">{{ $t('settings.institutionPapersTitle') }}</h2>
                    <span class="readonly-label">{{ $t('settings.readOnly') }}</span>
                  </div>
                  <p class="section-description">{{ $t('settings.institutionPapersHint') }}</p>
                </div>
                <router-link v-if="institutionIdentity.scholarId" :to="'/scholars/' + institutionIdentity.scholarId" class="identity-link">
                  {{ $t('settings.viewScholarProfile') }}
                </router-link>
              </div>
              <div v-if="institutionPapers.length" id="institution-paper-list" class="institution-paper-list">
                <router-link v-for="paper in visibleInstitutionPapers" :key="paper.id" :to="'/papers/' + paper.id" class="institution-paper-item">
                  <span class="institution-paper-title">{{ paper.title }}</span>
                  <span class="institution-paper-meta">
                    {{ paper.authorName }}<template v-if="paper.publishYear"> · {{ paper.publishYear }}</template>
                  </span>
                </router-link>
              </div>
              <p v-else class="compact-empty">{{ $t('settings.noInstitutionPapers') }}</p>
              <a-button
                v-if="institutionPapers.length > PAPER_PREVIEW_LIMIT"
                class="paper-toggle"
                type="text"
                :aria-expanded="showAllInstitutionPapers"
                aria-controls="institution-paper-list"
                @click="showAllInstitutionPapers = !showAllInstitutionPapers"
              >
                {{ showAllInstitutionPapers ? $t('settings.collapsePapers') : $t('settings.showAllPapers', { count: institutionPapers.length }) }}
              </a-button>
            </section>
          </div>
        </a-tab-pane>

        <a-tab-pane key="password" :title="$t('settings.passwordTab')">
          <section class="section-card security-card" aria-labelledby="security-title">
            <div class="section-header">
              <div>
                <h2 id="security-title" class="section-title">{{ $t('settings.passwordTab') }}</h2>
                <p class="section-description">{{ $t('settings.securityHint') }}</p>
              </div>
            </div>
            <div class="security-item">
              <div class="security-item-main">
                <h3 class="security-item-title">{{ $t('settings.accountSecurity') }}</h3>
                <p class="security-item-desc">{{ $t('settings.accountSecurityHint') }}</p>
              </div>
              <a-button type="outline" size="small" @click="showPasswordModal = true">{{ $t('common.changePassword') }}</a-button>
            </div>
            <div class="security-item">
              <div class="security-item-main">
                <h3 class="security-item-title">{{ $t('settings.phone') }}</h3>
                <p class="security-item-desc">{{ $t('settings.boundPrefix', { value: maskedPhone }) }}</p>
              </div>
              <a-button type="text" size="small" @click="showBindTip">{{ $t('common.switchBinding') }}</a-button>
            </div>
            <div class="security-item">
              <div class="security-item-main">
                <h3 class="security-item-title">{{ $t('settings.emailBinding') }}</h3>
                <p class="security-item-desc">{{ $t('settings.boundPrefix', { value: maskedEmail }) }}</p>
              </div>
              <a-button type="text" size="small" @click="showBindTip">{{ $t('common.switchBinding') }}</a-button>
            </div>
          </section>
        </a-tab-pane>
      </a-tabs>

      <div v-if="profileLoaded && activeTab === 'profile'" class="action-row">
        <p>{{ $t('settings.saveProfileHint') }}</p>
        <a-button type="primary" :loading="savingProfile" @click="() => saveProfile()">{{ $t('settings.saveProfile') }}</a-button>
      </div>

      <a-modal
        v-model:visible="showPasswordModal"
        :title="$t('settings.passwordModalTitle')"
        :footer="false"
        width="min(460px, calc(100vw - 32px))"
        unmount-on-close
      >
        <a-form :model="passwordForm" layout="vertical">
          <a-form-item :label="$t('settings.oldPassword')">
            <a-input-password v-model="passwordForm.oldPassword" :placeholder="$t('settings.oldPasswordPlaceholder')" allow-clear />
          </a-form-item>
          <a-form-item :label="$t('settings.newPassword')">
            <a-input-password v-model="passwordForm.newPassword" :placeholder="$t('settings.newPasswordPlaceholder')" allow-clear />
          </a-form-item>
          <a-form-item :label="$t('settings.confirmPassword')">
            <a-input-password v-model="passwordForm.confirmPassword" :placeholder="$t('settings.confirmPasswordPlaceholder')" allow-clear />
          </a-form-item>
        </a-form>
        <div class="password-modal-actions">
          <a-button @click="showPasswordModal = false">{{ $t('common.cancel') }}</a-button>
          <a-button type="primary" :loading="savingPassword" @click="savePassword">{{ $t('common.confirmUpdate') }}</a-button>
        </div>
      </a-modal>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { Message, type RequestOption, type UploadRequest } from '@arco-design/web-vue'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/composables/useAuth'
import ProfileInstitutionIdentity from '@/components/ProfileInstitutionIdentity.vue'
import {
  changeMyPassword,
  getMyProfile,
  updateMyProfile,
  uploadAvatar,
  type ProjectExperienceItem,
  type PublicationItem,
  type UserInstitutionIdentity,
  type UserInstitutionMembershipItem,
  type UserInstitutionPaper,
} from '@/api/users'

const activeTab = ref('profile')
const isLoading = ref(false)
const savingProfile = ref(false)
const savingPassword = ref(false)
const showPasswordModal = ref(false)
const avatarPreview = ref('')
const institutionIdentity = ref<UserInstitutionIdentity | null>(null)
const institutionMemberships = ref<UserInstitutionMembershipItem[]>([])
const profileLoaded = ref(false)
const loadError = ref(false)
const PAPER_PREVIEW_LIMIT = 3
const showAllInstitutionPapers = ref(false)
const institutionPapers = ref<UserInstitutionPaper[]>([])
const visibleInstitutionPapers = computed(() => showAllInstitutionPapers.value
  ? institutionPapers.value
  : institutionPapers.value.slice(0, PAPER_PREVIEW_LIMIT))
const { updateName, updateAvatar } = useAuth()
const { t } = useI18n()

const profileForm = reactive({
  name: '',
  email: '',
  phone: '',
  avatar: '',
  gender: '',
  grade: '',
  degree: '',
  college: '',
  major: '',
  laboratory: '',
  bio: '',
  research_interests: '',
  project_experiences: [] as ProjectExperienceItem[],
  publications: [] as PublicationItem[],
})

const passwordForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
})

const createItemId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const normalizeGender = (value: string | null | undefined): string => {
  const normalized = value?.trim().toLowerCase()

  if (!normalized) {
    return ''
  }

  if (normalized === 'male' || normalized === '男') {
    return 'male'
  }

  if (normalized === 'female' || normalized === '女') {
    return 'female'
  }

  if (normalized === 'other' || normalized === '其他') {
    return 'other'
  }

  return ''
}

const maskedPhone = computed(() => {
  const value = profileForm.phone.trim()
  if (!value) {
    return t('settings.notBound')
  }
  if (value.length < 7) {
    return value
  }
  return `${value.slice(0, 3)}****${value.slice(-4)}`
})

const maskedEmail = computed(() => {
  const value = profileForm.email.trim()
  if (!value) {
    return t('settings.notBound')
  }
  const [name, domain = ''] = value.split('@')
  if (!name || !domain) {
    return value
  }
  if (name.length <= 2) {
    return `${name[0] ?? '*'}***@${domain}`
  }
  return `${name.slice(0, 2)}***@${domain}`
})

const showBindTip = (): void => {
  Message.info(t('settings.changeBindingInProgress'))
}

const fillProfile = async (): Promise<void> => {
  isLoading.value = true
  loadError.value = false
  try {
    const data = await getMyProfile()
    profileForm.name = data.name ?? ''
    profileForm.email = data.email ?? ''
    profileForm.phone = data.phone ?? ''
    profileForm.avatar = data.avatar ?? ''
    avatarPreview.value = data.avatar_url ?? data.avatar ?? ''
    profileForm.gender = normalizeGender(data.gender)
    profileForm.grade = data.grade ?? ''
    profileForm.degree = data.degree ?? ''
    profileForm.college = data.college ?? ''
    profileForm.major = data.major ?? ''
    profileForm.laboratory = data.laboratory ?? ''
    profileForm.bio = data.bio ?? ''
    profileForm.research_interests = data.research_interests ?? ''
    profileForm.project_experiences = (data.project_experiences ?? []).map((item) => ({
      id: item.id || createItemId(),
      title: item.title || '',
      period: item.period || '',
    }))
    profileForm.publications = (data.publications ?? []).map((item) => ({
      id: item.id || createItemId(),
      title: item.title || '',
    }))
    institutionIdentity.value = data.institution_identity ?? null
    institutionMemberships.value = data.institution_memberships ?? []
    institutionPapers.value = data.institution_papers ?? []
    profileLoaded.value = true
    updateAvatar(avatarPreview.value)
  } catch {
    loadError.value = true
  } finally {
    isLoading.value = false
  }
}

const uploadAvatarFile = async (option: RequestOption): Promise<void> => {
  const file = option.fileItem.file
  if (!file) {
    option.onError(new Error('Avatar file is missing'))
    return
  }

  try {
    const result = await uploadAvatar(file)
    profileForm.avatar = result.id
    avatarPreview.value = result.signatureUrl
    const saved = await saveProfile({ silentSuccess: true })
    if (saved) {
      Message.success(t('settings.avatarUploadSaved'))
    } else {
      Message.warning(t('settings.avatarUploadPendingSave'))
    }
    option.onSuccess()
  } catch (error) {
    option.onError(error)
    Message.error(t('settings.avatarUploadFailed'))
  }
}

const handleAvatarUpload = (option: RequestOption): UploadRequest => {
  void uploadAvatarFile(option)
  return {}
}

const addProject = (): void => {
  profileForm.project_experiences.push({ id: createItemId(), title: '', period: '' })
}

const removeProject = (index: number): void => {
  profileForm.project_experiences.splice(index, 1)
}

const addPublication = (): void => {
  profileForm.publications.push({ id: createItemId(), title: '' })
}

const removePublication = (index: number): void => {
  profileForm.publications.splice(index, 1)
}

const saveProfile = async (options?: { silentSuccess?: boolean }): Promise<boolean> => {
  savingProfile.value = true
  try {
    const message = await updateMyProfile({
      name: profileForm.name.trim(),
      avatar: profileForm.avatar.trim(),
      gender: profileForm.gender.trim(),
      grade: profileForm.grade.trim(),
      degree: profileForm.degree.trim(),
      college: profileForm.college.trim(),
      major: profileForm.major.trim(),
      laboratory: profileForm.laboratory.trim(),
      bio: profileForm.bio.trim(),
      research_interests: profileForm.research_interests.trim(),
      project_experiences: profileForm.project_experiences
        .map((item) => ({
          id: item.id,
          title: item.title.trim(),
          period: item.period.trim(),
        }))
        .filter((item) => item.title),
      publications: profileForm.publications
        .map((item) => ({
          id: item.id,
          title: item.title.trim(),
        }))
        .filter((item) => item.title),
    })
    updateName(profileForm.name.trim())
    updateAvatar(avatarPreview.value)
    if (!options?.silentSuccess) {
      Message.success(message || t('settings.saveSuccess'))
    }
    return true
  } catch {
    if (!options?.silentSuccess) {
      Message.error(t('settings.saveFailed'))
    }
    return false
  } finally {
    savingProfile.value = false
  }
}

const savePassword = async (): Promise<void> => {
  if (!passwordForm.oldPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
    Message.warning(t('settings.passwordIncomplete'))
    return
  }

  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    Message.warning(t('settings.passwordMismatch'))
    return
  }
  if (passwordForm.newPassword.trim().length < 12) {
    Message.warning(t('settings.passwordTooShort'))
    return
  }

  savingPassword.value = true
  try {
    const message = await changeMyPassword(passwordForm.oldPassword, passwordForm.newPassword)
    Message.success(message || t('settings.passwordUpdated'))
    showPasswordModal.value = false
    passwordForm.oldPassword = ''
    passwordForm.newPassword = ''
    passwordForm.confirmPassword = ''
  } catch {
    Message.error(t('settings.passwordUpdateFailed'))
  } finally {
    savingPassword.value = false
  }
}

onMounted(() => {
  void fillProfile()
})
</script>

<style lang="sass" scoped>
.settings-page
  display: flex
  justify-content: center
  padding: 32px 28px 48px
  background: var(--scholar-bg-sidebar)
  min-height: 100%

.settings-container
  width: 1000px
  max-width: 100%
  min-width: 0
  :deep(.arco-btn)
    border-radius: 8px
  :deep(.arco-btn-primary:not(.arco-btn-disabled))
    background-color: var(--scholar-primary)
    border-color: var(--scholar-primary)
    &:hover
      background-color: var(--scholar-primary-hover)
      border-color: var(--scholar-primary-hover)
  :deep(.arco-btn-outline:not(.arco-btn-disabled))
    color: var(--scholar-primary)
    border-color: var(--scholar-primary)
    &:hover
      background-color: var(--scholar-primary-light)
  :deep(.arco-btn-text:not(.arco-btn-status-danger):not(.arco-btn-disabled))
    color: var(--scholar-primary)

.settings-header
  margin-bottom: 20px

.settings-title
  margin: 0 0 8px
  font-size: 28px
  line-height: 1.3
  font-weight: 650
  color: var(--scholar-text-1)

.settings-description, .section-description
  margin: 0
  font-size: 13px
  line-height: 1.65
  color: var(--scholar-text-desc)

.settings-tabs
  :deep(.arco-tabs-tab)
    font-size: 15px
    font-weight: 500
  :deep(.arco-tabs-tab-active)
    color: var(--scholar-primary)
  :deep(.arco-tabs-nav-ink)
    background-color: var(--scholar-primary)
  :deep(.arco-tabs-content)
    padding-top: 20px

.profile-content
  display: grid
  gap: 20px

.section-card
  min-width: 0
  padding: 24px
  border: 1px solid var(--scholar-border-medium)
  border-radius: var(--scholar-radius-md)
  background: var(--scholar-bg-white)

.section-header
  display: flex
  align-items: flex-start
  justify-content: space-between
  gap: 16px
  margin-bottom: 20px
  > div
    min-width: 0
  > .arco-btn, > .identity-link
    flex-shrink: 0

.section-title
  margin: 0
  font-size: 16px
  line-height: 1.5
  font-weight: 600
  color: var(--scholar-text-1)

.section-description
  margin-top: 5px

.section-heading-line
  display: flex
  align-items: center
  flex-wrap: wrap
  gap: 10px

.readonly-label
  padding: 2px 7px
  border-radius: 5px
  background: var(--scholar-bg-sidebar)
  color: var(--scholar-text-desc)
  font-size: 12px
  line-height: 1.5

.profile-overview
  display: grid
  grid-template-columns: 216px minmax(0, 1fr)
  gap: 28px

.profile-summary
  padding-right: 24px
  border-right: 1px solid var(--scholar-border-medium)

.profile-summary-main
  min-width: 0

.avatar-circle
  width: 72px
  height: 72px
  margin-bottom: 16px
  border-radius: 50%
  background: var(--scholar-primary-light)
  overflow: hidden
  display: flex
  align-items: center
  justify-content: center
  flex-shrink: 0
  font-size: 28px
  font-weight: 600
  color: var(--scholar-primary)
  img
    width: 100%
    height: 100%
    object-fit: cover

.profile-name
  margin: 0 0 12px
  font-size: 20px
  line-height: 1.4
  font-weight: 600
  overflow-wrap: anywhere
  color: var(--scholar-text-1)

.profile-contact
  margin: 0 0 16px
  font-size: 13px
  line-height: 1.6
  dt
    color: var(--scholar-text-desc)
    margin-bottom: 4px
  dd
    margin: 0
    color: var(--scholar-text-2)
    overflow-wrap: anywhere

.profile-form
  :deep(.arco-form-item)
    margin-bottom: 0
    min-width: 0
  :deep(.arco-form-item-label-col)
    padding-bottom: 8px
  :deep(.arco-form-item-label)
    color: var(--scholar-text-2)
    font-size: 13px
  :deep(.arco-input-wrapper), :deep(.arco-select-view-single)
    min-height: 38px
  :deep(.arco-select-view-single)
    border-color: var(--scholar-border-input)
    border-radius: var(--scholar-radius-sm)
    &:hover, &:focus-within
      border-color: var(--scholar-primary)

.grid-row
  display: grid
  grid-template-columns: repeat(2, minmax(0, 1fr))
  gap: 20px 24px

.grid-full
  grid-column: 1 / -1

.list-editor
  display: flex
  flex-direction: column
  gap: 12px

.list-row
  display: grid
  gap: 12px
  align-items: end
  padding: 16px
  border: 1px solid var(--scholar-border-medium)
  border-radius: var(--scholar-radius-sm)
  background: var(--scholar-bg-sidebar)

.project-row
  grid-template-columns: minmax(0, 1fr) minmax(180px, 0.6fr) auto

.publication-row
  grid-template-columns: minmax(0, 1fr) auto

.editor-field
  min-width: 0
  label
    display: block
    margin-bottom: 8px
    font-size: 13px
    color: var(--scholar-text-2)

.compact-empty
  margin: 0
  padding: 20px
  border: 1px dashed var(--scholar-border-input)
  border-radius: var(--scholar-radius-sm)
  background: var(--scholar-bg-sidebar)
  color: var(--scholar-text-desc)
  font-size: 13px
  line-height: 1.6
  text-align: center

.identity-link
  color: var(--scholar-primary)
  font-size: 13px
  line-height: 1.6
  font-weight: 500
  text-decoration: none
  &:hover
    text-decoration: underline

.institution-paper-list
  display: flex
  flex-direction: column

.institution-paper-item
  display: flex
  flex-direction: column
  gap: 6px
  padding: 14px 12px
  border-bottom: 1px solid var(--scholar-border-light)
  border-radius: 6px
  text-decoration: none
  &:last-child
    border-bottom: none
  &:hover
    background: var(--scholar-primary-light)

.institution-paper-title
  color: var(--scholar-text-1)
  font-size: 14px
  line-height: 1.65
  overflow-wrap: anywhere

.institution-paper-meta
  color: var(--scholar-text-desc)
  font-size: 12px
  line-height: 1.6
  overflow-wrap: anywhere

.paper-toggle
  margin-top: 12px

.security-item
  display: flex
  align-items: center
  justify-content: space-between
  gap: 24px
  padding: 24px 0
  border-top: 1px solid var(--scholar-border-medium)
  > .arco-btn
    flex-shrink: 0
  &:last-child
    padding-bottom: 0

.security-item-main
  min-width: 0

.security-item-title
  margin: 0 0 6px
  font-size: 14px
  font-weight: 600
  color: var(--scholar-text-1)

.security-item-desc
  margin: 0
  font-size: 13px
  line-height: 1.6
  color: var(--scholar-text-desc)
  overflow-wrap: anywhere

.password-modal-actions
  display: flex
  justify-content: flex-end
  gap: 10px
  margin-top: 8px

.action-row
  position: sticky
  bottom: 16px
  z-index: 5
  display: flex
  justify-content: space-between
  align-items: center
  gap: 20px
  margin-top: 20px
  padding: 16px 24px
  background: var(--scholar-bg-white)
  border: 1px solid var(--scholar-border-medium)
  border-radius: var(--scholar-radius-md)
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06)
  p
    margin: 0
    font-size: 13px
    line-height: 1.6
    color: var(--scholar-text-desc)
  > .arco-btn
    flex-shrink: 0

.profile-state
  display: flex
  flex-direction: column
  align-items: center
  justify-content: center
  gap: 16px
  min-height: 280px
  color: var(--scholar-text-desc)
  font-size: 14px

.identity-link:focus-visible, .institution-paper-item:focus-visible
  outline: 2px solid var(--scholar-primary)
  outline-offset: 3px

@media (max-width: 900px)
  .profile-overview
    grid-template-columns: minmax(0, 1fr)
    gap: 24px
  .profile-summary
    display: flex
    align-items: center
    gap: 20px
    padding: 0 0 24px
    border-right: 0
    border-bottom: 1px solid var(--scholar-border-medium)
  .avatar-circle
    margin-bottom: 0
  .profile-contact
    margin-bottom: 12px

@media (max-width: 640px)
  .settings-page
    padding: 24px 16px 32px
  .settings-title
    font-size: 24px
  .profile-content
    gap: 16px
  .section-card
    padding: 20px 16px
  .section-header
    flex-wrap: wrap
    gap: 12px
    margin-bottom: 16px
  .grid-row, .project-row, .publication-row
    grid-template-columns: minmax(0, 1fr)
  .grid-row
    gap: 18px
  .list-row
    padding: 12px
  .remove-item
    justify-self: end
  .profile-summary
    align-items: flex-start
    gap: 16px
  .avatar-circle
    width: 56px
    height: 56px
    font-size: 24px
  .profile-name
    font-size: 18px
    margin-bottom: 8px
  .action-row
    bottom: 8px
    flex-wrap: wrap
    gap: 10px
    padding: 12px 16px calc(12px + env(safe-area-inset-bottom, 0px))
    > .arco-btn
      width: 100%
  .security-item
    flex-wrap: wrap
    gap: 12px
    padding: 20px 0
</style>
