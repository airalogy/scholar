<template>
  <div class="settings-page">
    <div class="settings-container">
      <h1 class="settings-title">{{ $t('settings.title') }}</h1>

      <a-tabs v-model:active-key="activeTab" class="settings-tabs">
        <a-tab-pane key="profile" :title="$t('settings.profileTab')">
          <div class="section-card profile-section profile-section--first">
            <div class="section-title">{{ $t('settings.basicInfo') }}</div>

            <div class="profile-top">
              <div class="avatar-box">
                <div class="avatar-circle">
                  <img v-if="avatarPreview" :src="avatarPreview" :alt="$t('settings.avatarAlt')" />
                  <span v-else>{{ profileForm.name?.slice(0, 1) || 'U' }}</span>
                </div>
                <a-upload
                  :show-file-list="false"
                  :custom-request="handleAvatarUpload"
                  accept="image/*"
                >
                  <template #upload-button>
                    <a-button type="text" size="mini">{{ $t('common.changeAvatar') }}</a-button>
                  </template>
                </a-upload>
              </div>

              <div class="basic-grid">
                <a-form :model="profileForm" layout="vertical">
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
                  </div>

                  <div class="grid-row">
                    <a-form-item field="grade" :label="$t('settings.grade')">
                      <a-input v-model="profileForm.grade" :placeholder="$t('settings.gradePlaceholder')" />
                    </a-form-item>
                    <a-form-item field="degree" :label="$t('settings.degree')">
                      <a-input v-model="profileForm.degree" :placeholder="$t('settings.degreePlaceholder')" />
                    </a-form-item>
                  </div>

                  <div class="grid-row">
                    <a-form-item field="college" :label="$t('common.college')">
                      <a-input v-model="profileForm.college" :placeholder="$t('settings.collegePlaceholder')" />
                    </a-form-item>
                    <a-form-item field="major" :label="$t('settings.major')">
                      <a-input v-model="profileForm.major" :placeholder="$t('settings.majorPlaceholder')" />
                    </a-form-item>
                  </div>

                  <div class="grid-row">
                    <a-form-item field="laboratory" :label="$t('settings.lab')">
                      <a-input v-model="profileForm.laboratory" :placeholder="$t('settings.labPlaceholder')" />
                    </a-form-item>
                    <a-form-item field="email" :label="$t('settings.email')">
                      <a-input :model-value="profileForm.email" disabled />
                    </a-form-item>
                  </div>
                </a-form>
              </div>
            </div>
          </div>

          <div class="section-card profile-section">
            <div class="section-title">{{ $t('settings.academicInfo') }}</div>

            <a-form :model="profileForm" layout="vertical">
              <a-form-item :label="$t('settings.bio')">
                <a-textarea
                  v-model="profileForm.bio"
                  :max-length="1000"
                  :auto-size="{ minRows: 4, maxRows: 6 }"
                  :placeholder="$t('settings.bioPlaceholder')"
                  allow-clear
                />
              </a-form-item>

              <a-form-item :label="$t('settings.researchInterests')">
                <a-textarea
                  v-model="profileForm.research_interests"
                  :max-length="2000"
                  :auto-size="{ minRows: 4, maxRows: 6 }"
                  :placeholder="$t('settings.researchInterestsPlaceholder')"
                  allow-clear
                />
              </a-form-item>
            </a-form>
          </div>

          <div class="section-card profile-section">
            <div class="section-header">
              <div class="section-title">{{ $t('settings.projects') }}</div>
              <a-button type="text" size="mini" @click="addProject">{{ $t('settings.addProject') }}</a-button>
            </div>
            <div class="list-editor">
              <div v-for="(item, index) in profileForm.project_experiences" :key="item.id" class="list-row">
                <a-input
                  v-model="item.title"
                  :placeholder="$t('settings.projectNamePlaceholder')"
                  class="list-row-title"
                />
                <a-input
                  v-model="item.period"
                  :placeholder="$t('settings.projectPeriodPlaceholder')"
                  class="list-row-period"
                />
                <a-button type="text" status="danger" size="mini" @click="removeProject(index)">{{ $t('common.delete') }}</a-button>
              </div>
              <a-empty v-if="!profileForm.project_experiences.length" :description="$t('settings.noProjects')" />
            </div>
          </div>

          <div class="section-card profile-section">
            <div class="section-header">
              <div class="section-title">{{ $t('settings.publications') }}</div>
              <a-button type="text" size="mini" @click="addPublication">{{ $t('settings.addPublication') }}</a-button>
            </div>
            <div class="list-editor">
              <div v-for="(item, index) in profileForm.publications" :key="item.id" class="list-row">
                <a-input v-model="item.title" :placeholder="$t('settings.publicationTitlePlaceholder')" class="list-row-title" />
                <a-button type="text" status="danger" size="mini" @click="removePublication(index)">{{ $t('common.delete') }}</a-button>
              </div>
              <a-empty v-if="!profileForm.publications.length" :description="$t('settings.noPublications')" />
            </div>
          </div>

          <div class="action-row">
            <a-button type="primary" :loading="savingProfile" @click="() => saveProfile()">{{ $t('settings.saveProfile') }}</a-button>
          </div>
        </a-tab-pane>

        <a-tab-pane key="password" :title="$t('settings.passwordTab')">
          <div class="section-card security-card">
            <div class="security-item">
              <div class="security-item-main">
                <div class="security-item-title">{{ $t('settings.accountSecurity') }}</div>
                <div class="security-item-desc">{{ $t('settings.accountSecurityHint') }}</div>
              </div>
              <button class="security-link" type="button" @click="showPasswordModal = true">{{ $t('common.changePassword') }}</button>
            </div>

            <div class="security-item">
              <div class="security-item-main">
                <div class="security-item-title">{{ $t('settings.phone') }}</div>
                <div class="security-item-desc">{{ $t('settings.boundPrefix', { value: maskedPhone }) }}</div>
              </div>
              <button class="security-link" type="button" @click="showBindTip">{{ $t('common.switchBinding') }}</button>
            </div>

            <div class="security-item security-item--last">
              <div class="security-item-main">
                <div class="security-item-title">{{ $t('settings.emailBinding') }}</div>
                <div class="security-item-desc">{{ $t('settings.boundPrefix', { value: maskedEmail }) }}</div>
              </div>
              <button class="security-link" type="button" @click="showBindTip">{{ $t('common.switchBinding') }}</button>
            </div>
          </div>
        </a-tab-pane>
      </a-tabs>

      <a-modal
        v-model:visible="showPasswordModal"
        :title="$t('settings.passwordModalTitle')"
        :footer="false"
        width="460px"
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

      <div v-if="isLoading" class="mask-loading">
        <a-spin />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { Message, type RequestOption, type UploadRequest } from '@arco-design/web-vue'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/composables/useAuth'
import {
  changeMyPassword,
  getMyProfile,
  updateMyProfile,
  uploadAvatar,
  type ProjectExperienceItem,
  type PublicationItem,
} from '@/api/users'

const activeTab = ref('profile')
const isLoading = ref(false)
const savingProfile = ref(false)
const savingPassword = ref(false)
const showPasswordModal = ref(false)
const avatarPreview = ref('')
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
    updateAvatar(avatarPreview.value)
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
  padding: 32px 24px 60px

.settings-container
  width: 920px
  max-width: 100%
  position: relative

.settings-title
  margin: 0 0 18px
  font-size: 28px
  font-weight: 700
  color: var(--scholar-text-1)

.settings-tabs
  :deep(.arco-tabs-tab)
    font-size: 16px
    font-weight: 500

.section-card
  padding: 20px 0
  margin-bottom: 0

.section-title
  font-size: 16px
  font-weight: 600
  color: var(--scholar-text-1)
  margin-bottom: 14px

.profile-section
  border-top: 1px solid var(--scholar-border-light)

.profile-section--first
  margin-top: 8px

.section-header
  display: flex
  align-items: center
  justify-content: space-between

.profile-top
  display: flex
  gap: 20px

.avatar-box
  width: 120px
  display: flex
  flex-direction: column
  align-items: center
  gap: 8px

.avatar-circle
  width: 88px
  height: 88px
  border-radius: 50%
  background: #edf2f7
  overflow: hidden
  display: flex
  align-items: center
  justify-content: center
  font-size: 30px
  color: var(--scholar-primary)

.avatar-circle img
  width: 100%
  height: 100%
  object-fit: cover

.basic-grid
  flex: 1

.grid-row
  display: grid
  grid-template-columns: repeat(2, minmax(0, 1fr))
  gap: 16px

.list-editor
  display: flex
  flex-direction: column
  gap: 10px

.list-row
  display: flex
  align-items: center
  gap: 10px

.list-row-title
  flex: 1

.list-row-period
  width: 220px

.security-card
  background: transparent
  border: none
  border-radius: 0
  padding: 0
  margin-top: 8px
  margin-bottom: 0
  border-top: 1px solid var(--scholar-border-light)

.security-item
  display: flex
  align-items: center
  justify-content: space-between
  gap: 24px
  min-height: 98px
  padding: 18px 0
  border-bottom: 1px solid var(--scholar-border-light)

.security-item--last
  border-bottom: none

.security-item-main
  display: flex
  flex-direction: column
  gap: 4px

.security-item-title
  font-size: 16px
  font-weight: 600
  color: var(--scholar-text-1)

.security-item-desc
  font-size: 14px
  color: var(--scholar-text-3)

.security-link
  border: none
  background: transparent
  color: var(--scholar-primary)
  font-size: 14px
  font-weight: 600
  cursor: pointer
  padding: 0
  flex-shrink: 0

.security-link:hover
  color: var(--scholar-primary-hover)

.password-modal-actions
  display: flex
  justify-content: flex-end
  gap: 10px
  margin-top: 8px

.action-row
  margin-top: 20px

.mask-loading
  position: absolute
  inset: 0
  background: rgba(255, 255, 255, 0.6)
  display: flex
  align-items: center
  justify-content: center

@media (max-width: 900px)
  .profile-top
    flex-direction: column

  .avatar-box
    width: 100%
    flex-direction: row
    justify-content: flex-start

  .grid-row
    grid-template-columns: 1fr

  .list-row
    flex-direction: column
    align-items: stretch

  .list-row-period
    width: 100%

  .security-item
    align-items: flex-start
    min-height: unset
    padding: 16px 0

  .security-item-title
    font-size: 15px

  .security-item-desc,
  .security-link
    font-size: 14px
</style>
