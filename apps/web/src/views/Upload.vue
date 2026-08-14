<template>
  <div class="upload-page">
    <div class="upload-container">
      <div class="upload-header">
        <h1 class="upload-title">{{ $t('upload.title') }}</h1>
      </div>

      <div v-if="uploadedPaper" class="success-banner">
        <IconCheckCircle />
        <span>{{ $t('upload.success') }}</span>
        <router-link :to="`/papers/${uploadedPaper.id}`" class="success-link">{{ $t('common.viewPaper') }}</router-link>
        <button class="success-close" type="button" @click="uploadedPaper = null">×</button>
      </div>

      <div class="upload-body">
        <div class="upload-left">
          <div
            class="drop-zone"
            :class="{ 'drop-zone--over': isDragOver, 'drop-zone--has-file': selectedFile }"
            @dragover.prevent="isDragOver = true"
            @dragleave.prevent="isDragOver = false"
            @drop.prevent="onDrop"
            @click="triggerFilePicker"
          >
            <input
              ref="fileInput"
              type="file"
              accept=".pdf,application/pdf"
              style="display:none"
              @change="onFileChange"
            />
            <template v-if="!selectedFile">
              <IconUpload class="drop-icon" />
              <p class="drop-text">{{ $t('upload.dropText') }}</p>
              <p class="drop-hint">{{ $t('upload.dropHint') }}</p>
            </template>
            <template v-else>
              <IconFile class="file-icon" />
              <p class="file-name">{{ selectedFile.name }}</p>
              <p class="file-size">{{ formatFileSize(selectedFile.size) }}</p>
              <button class="remove-file-btn" type="button" @click.stop="removeFile">{{ $t('upload.selectAgain') }}</button>
            </template>
          </div>
        </div>

        <div class="upload-right">
          <form class="meta-form" @submit.prevent="handleSubmit">
            <div class="form-row">
              <label class="form-label">{{ $t('upload.titleLabel') }} <span class="required">*</span></label>
              <input v-model="form.title" class="form-input" type="text" :placeholder="$t('upload.titlePlaceholder')" />
            </div>

            <div class="form-row">
              <label class="form-label">DOI <span class="required">*</span></label>
              <input v-model="form.doi" class="form-input" type="text" :placeholder="$t('upload.doiExample')" />
            </div>

            <div class="form-row-2col">
              <div class="form-row">
                <label class="form-label">{{ $t('upload.publishYear') }} <span class="required">*</span></label>
                <input v-model.number="form.publish_year" class="form-input" type="number" :placeholder="$t('upload.publishYearExample')" min="1900" max="2100" />
              </div>
              <div class="form-row">
                <label class="form-label">{{ $t('upload.languageLabel') }} <span class="required">*</span></label>
                <select v-model.number="form.language" class="form-select">
                  <option v-for="(label, val) in LANG_MAP" :key="val" :value="Number(val)">{{ label }}</option>
                </select>
              </div>
            </div>

            <div class="form-row">
              <label class="form-label">{{ $t('upload.paperTypeLabel') }} <span class="required">*</span></label>
              <select v-model.number="form.paper_type" class="form-select">
                <option v-for="(label, val) in PAPER_TYPE_MAP" :key="val" :value="Number(val)">{{ label }}</option>
              </select>
            </div>

            <div class="form-row">
              <label class="form-label">{{ $t('upload.institutionLabel') }} <span class="required">*</span></label>
              <select v-model="form.institution_id" class="form-select" :disabled="isScopeLoading || !institutionOptions.length">
                <option value="" disabled>{{ $t('upload.institutionPlaceholder') }}</option>
                <option v-for="institution in institutionOptions" :key="institution.id" :value="institution.id">
                  {{ institution.name }}
                </option>
              </select>
              <div v-if="!institutionOptions.length" class="form-hint form-hint--warning">
                {{ $t('upload.noInstitutionMembership') }}
              </div>
            </div>

            <div class="form-row">
              <label class="form-label">{{ $t('upload.labLabel') }}</label>
              <select v-model="form.lab_id" class="form-select" :disabled="!form.institution_id || isScopeLoading">
                <option value="">{{ $t('upload.noLab') }}</option>
                <option v-for="lab in allowedLabOptions" :key="lab.id" :value="lab.id">
                  {{ lab.name }}
                </option>
              </select>
              <div class="form-hint">{{ $t('upload.labPlaceholder') }}</div>
              <div v-if="scopeLoadError" class="form-error">{{ scopeLoadError }}</div>
            </div>

            <div class="form-row">
              <label class="form-label">{{ $t('upload.journalLabel') }}</label>
              <input v-model="form.journal_name" class="form-input" type="text" :placeholder="$t('upload.optional')" />
            </div>

            <div class="form-row-2col">
              <div class="form-row">
                <label class="form-label">{{ $t('upload.citationCount') }}</label>
                <input v-model.number="form.citation_count" class="form-input" type="number" :placeholder="$t('upload.optional')" min="0" />
              </div>
              <div class="form-row">
                <label class="form-label">{{ $t('upload.pages') }}</label>
                <input v-model="form.pages" class="form-input" type="text" :placeholder="$t('upload.pagesExample')" />
              </div>
            </div>

            <div class="form-row">
              <label class="form-label">{{ $t('upload.abstract') }}</label>
              <textarea v-model="form.abstract" class="form-textarea" :placeholder="$t('upload.optional')" rows="4" />
            </div>

            <div class="form-row">
              <label class="form-label">{{ $t('upload.keywords') }}</label>
              <div class="keywords-input-area">
                <div class="keywords-tags">
                  <span v-for="(kw, i) in keywords" :key="i" class="kw-tag">
                    {{ kw }}
                    <button class="kw-remove" type="button" @click="removeKeyword(i)">×</button>
                  </span>
                </div>
                <input
                  v-model="keywordInput"
                  class="keywords-input"
                  type="text"
                  :placeholder="$t('upload.keywordPlaceholder')"
                  @keydown="onKeywordKeydown"
                />
              </div>
            </div>

            <div v-if="errorMsg" class="form-error">{{ errorMsg }}</div>

            <div class="form-footer">
              <button
                class="submit-btn"
                type="submit"
                :disabled="isUploading || !canSubmit"
              >
                {{ isUploading ? $t('upload.uploading') : $t('upload.submit') }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { IconCheckCircle, IconFile, IconUpload } from '@arco-design/web-vue/es/icon'
import { useI18n } from 'vue-i18n'
import { uploadPaper, type PaperResponse } from '@/api/papers'
import {
  getInstitution,
  listInstitutionCatalog,
  type InstitutionLabItem,
} from '@/api/institutions'
import { LANGUAGE_LABEL_KEYS, PAPER_TYPE_LABEL_KEYS } from '@/i18n/helpers'
import {
  getMyProfile,
  type UserInstitutionMembershipItem,
  type UserLabMembershipItem,
} from '@/api/users'

const { t } = useI18n()
const PAPER_TYPE_MAP = computed<Record<number, string>>(() => {
  return Object.fromEntries(
    Object.entries(PAPER_TYPE_LABEL_KEYS).map(([value, key]) => [Number(value), t(key)]),
  )
})
const LANG_MAP = computed<Record<number, string>>(() => {
  return Object.fromEntries(
    Object.entries(LANGUAGE_LABEL_KEYS).map(([value, key]) => [Number(value), t(key)]),
  )
})

const fileInput = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const isDragOver = ref(false)
const isUploading = ref(false)
const errorMsg = ref('')
const uploadedPaper = ref<PaperResponse | null>(null)
const keywordInput = ref('')
const keywords = ref<string[]>([])
const institutionMemberships = ref<UserInstitutionMembershipItem[]>([])
const labMemberships = ref<UserLabMembershipItem[]>([])
const availableLabs = ref<InstitutionLabItem[]>([])
const isScopeLoading = ref(false)
const scopeLoadError = ref('')

const form = ref({
  title: '',
  doi: '',
  publish_year: new Date().getFullYear(),
  paper_type: 0,
  language: 0,
  institution_id: '',
  lab_id: '',
  journal_name: '',
  citation_count: undefined as number | undefined,
  pages: '',
  abstract: '',
})

const institutionOptions = computed(() => {
  return [...institutionMemberships.value].sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
})

const selectedInstitutionMembership = computed(() => {
  return institutionMemberships.value.find((item) => item.id === form.value.institution_id) ?? null
})

const allowedLabOptions = computed(() => {
  const institutionId = form.value.institution_id
  if (!institutionId) {
    return []
  }

  const selectedMembership = selectedInstitutionMembership.value
  if (!selectedMembership) {
    return []
  }

  if (selectedMembership.role === 'owner' || selectedMembership.role === 'admin') {
    return availableLabs.value
  }

  const allowedLabIds = new Set(
    labMemberships.value
      .filter((membership) => membership.institutionId === institutionId)
      .map((membership) => membership.id),
  )

  return availableLabs.value.filter((lab) => allowedLabIds.has(lab.id))
})

const canSubmit = computed(() =>
  selectedFile.value !== null &&
  form.value.title.trim() !== '' &&
  form.value.doi.trim() !== '' &&
  form.value.publish_year > 0 &&
  form.value.institution_id !== '',
)

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

function triggerFilePicker() {
  fileInput.value?.click()
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files?.[0]) setFile(input.files[0])
}

function onDrop(e: DragEvent) {
  isDragOver.value = false
  const file = e.dataTransfer?.files[0]
  if (file && file.type === 'application/pdf') {
    setFile(file)
  } else if (file) {
    errorMsg.value = t('upload.pdfOnly')
  }
}

function setFile(file: File) {
  selectedFile.value = file
  errorMsg.value = ''
}

function removeFile() {
  selectedFile.value = null
  if (fileInput.value) fileInput.value.value = ''
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function addKeyword() {
  const kw = keywordInput.value.trim()
  if (kw && !keywords.value.includes(kw)) {
    keywords.value.push(kw)
  }
  keywordInput.value = ''
}

function onKeywordKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' || event.key === ',') {
    event.preventDefault()
    addKeyword()
  }
}

function removeKeyword(index: number) {
  keywords.value.splice(index, 1)
}

async function loadInstitutionLabs(institutionId: string) {
  const membership = institutionMemberships.value.find((item) => item.id === institutionId)
  if (!membership) {
    availableLabs.value = []
    scopeLoadError.value = ''
    return
  }

  isScopeLoading.value = true
  scopeLoadError.value = ''

  try {
    const institution = await getInstitution(membership.slug)
    availableLabs.value = institution.labs

    if (form.value.lab_id && !allowedLabOptions.value.some((lab) => lab.id === form.value.lab_id)) {
      form.value.lab_id = ''
    }
  } catch (error) {
    availableLabs.value = []
    scopeLoadError.value = getErrorMessage(error, t('upload.institutionLoadFailed'))
  } finally {
    isScopeLoading.value = false
  }
}

async function loadSubmissionScopes() {
  isScopeLoading.value = true
  scopeLoadError.value = ''

  try {
    const profile = await getMyProfile()
    institutionMemberships.value = profile.institution_memberships
    labMemberships.value = profile.lab_memberships

    if (profile.platform_role === 'platform_admin' && profile.institution_memberships.length === 0) {
      const catalog = await listInstitutionCatalog()
      institutionMemberships.value = catalog.map((institution) => ({
        id: institution.id,
        name: institution.name,
        slug: institution.slug,
        role: 'admin',
        can_review_content: true,
        can_import_data: true,
      }))
    }

    if (institutionMemberships.value.length === 1) {
      form.value.institution_id = institutionMemberships.value[0].id
    }
  } catch (error) {
    scopeLoadError.value = getErrorMessage(error, t('upload.institutionLoadFailed'))
  } finally {
    isScopeLoading.value = false
  }
}

async function handleSubmit() {
  if (!canSubmit.value || isUploading.value) return
  if (!form.value.institution_id) {
    errorMsg.value = t('upload.institutionRequired')
    return
  }

  errorMsg.value = ''
  isUploading.value = true
  try {
    const institutionId = form.value.institution_id
    const labId = form.value.lab_id
    const paper = await uploadPaper(selectedFile.value!, {
      title: form.value.title.trim(),
      doi: form.value.doi.trim(),
      publish_year: form.value.publish_year,
      paper_type: form.value.paper_type,
      language: form.value.language,
      institution_id: institutionId,
      abstract: form.value.abstract.trim() || undefined,
      journal_name: form.value.journal_name.trim() || undefined,
      citation_count: form.value.citation_count,
      pages: form.value.pages.trim() || undefined,
      keywords: keywords.value.length ? keywords.value : undefined,
      lab_id: labId || undefined,
    })
    uploadedPaper.value = paper
    // 重置表单
    selectedFile.value = null
    if (fileInput.value) fileInput.value.value = ''
    form.value = {
      title: '',
      doi: '',
      publish_year: new Date().getFullYear(),
      paper_type: 0,
      language: 0,
      institution_id: institutionId,
      lab_id: labId,
      journal_name: '',
      citation_count: undefined, pages: '', abstract: '',
    }
    keywords.value = []
    keywordInput.value = ''
  } catch (err: unknown) {
    errorMsg.value = getErrorMessage(err, t('upload.uploadFailed'))
  } finally {
    isUploading.value = false
  }
}

watch(
  () => form.value.institution_id,
  (institutionId, previousInstitutionId) => {
    if (institutionId === previousInstitutionId) {
      return
    }

    form.value.lab_id = ''

    if (!institutionId) {
      availableLabs.value = []
      scopeLoadError.value = ''
      return
    }

    void loadInstitutionLabs(institutionId)
  },
)

onMounted(() => {
  void loadSubmissionScopes()
})
</script>

<style lang="sass" scoped>
.upload-page
  display: flex
  justify-content: center
  padding: 32px 0 60px

.upload-container
  width: 960px
  max-width: 100%
  padding: 0 30px

.upload-header
  margin-bottom: 24px

.upload-title
  font-size: 26px
  font-weight: 600
  color: var(--scholar-text-1)
  margin: 0
  letter-spacing: -0.5px

.success-banner
  display: flex
  align-items: center
  gap: 8px
  padding: 12px 16px
  background: #f0fdf4
  border: 1px solid #bbf7d0
  border-radius: 12px
  margin-bottom: 20px
  font-size: 14px
  color: #16a34a

  :deep(.arco-icon)
    font-size: 18px

.success-link
  color: var(--scholar-primary)
  font-weight: 500
  text-decoration: none
  margin-left: 4px

.success-link:hover
  text-decoration: underline

.success-close
  margin-left: auto
  background: none
  border: none
  font-size: 16px
  color: #16a34a
  cursor: pointer
  padding: 0 4px

.upload-body
  display: flex
  gap: 28px
  align-items: flex-start

.upload-left
  flex-shrink: 0
  width: 260px

.drop-zone
  border: 2px dashed var(--scholar-border-input)
  border-radius: 16px
  padding: 36px 20px
  display: flex
  flex-direction: column
  align-items: center
  justify-content: center
  text-align: center
  cursor: pointer
  transition: all 0.2s
  min-height: 220px
  background: #fafbfc

.drop-zone:hover
  border-color: var(--scholar-primary)
  background: rgba(0, 73, 143, 0.02)

.drop-zone--over
  border-color: var(--scholar-primary)
  background: rgba(0, 73, 143, 0.04)

.drop-zone--has-file
  border-style: solid
  border-color: #F18B1C
  background: #fffcf8

.drop-icon
  margin-bottom: 12px
  opacity: 0.6
  font-size: 40px
  color: #8592a6

.drop-text
  font-size: 14px
  color: var(--scholar-text-2)
  margin: 0 0 6px
  font-weight: 500

.drop-hint
  font-size: 12px
  color: var(--scholar-text-3)
  margin: 0

.file-icon
  margin-bottom: 10px
  font-size: 36px
  color: #f18b1c

.file-name
  font-size: 13px
  color: var(--scholar-text-1)
  font-weight: 500
  word-break: break-all
  margin: 0 0 4px

.file-size
  font-size: 12px
  color: var(--scholar-text-3)
  margin: 0 0 12px

.remove-file-btn
  height: 30px
  padding: 0 14px
  border-radius: 8px
  border: 1px solid var(--scholar-border-light)
  background: #fff
  font-size: 12px
  color: var(--scholar-text-2)
  cursor: pointer

.remove-file-btn:hover
  border-color: var(--scholar-primary)
  color: var(--scholar-primary)

.upload-right
  flex: 1
  min-width: 0

.meta-form
  display: flex
  flex-direction: column
  gap: 16px

.form-row
  display: flex
  flex-direction: column
  gap: 6px

.form-row-2col
  display: grid
  grid-template-columns: 1fr 1fr
  gap: 16px

.form-label
  font-size: 13px
  font-weight: 500
  color: var(--scholar-text-2)

.form-hint
  font-size: 12px
  color: var(--scholar-text-3)

.form-hint--warning
  color: #b45309

.required
  color: #ef4444

.form-input,
.form-select,
.form-textarea
  width: 100%
  border: 1px solid var(--scholar-border-input)
  border-radius: 10px
  padding: 0 12px
  font-size: 14px
  color: var(--scholar-text-1)
  box-sizing: border-box
  outline: none
  font-family: inherit
  background: #fff

.form-input,
.form-select
  height: 38px

.form-select
  cursor: pointer

.form-textarea
  padding: 10px 12px
  resize: vertical
  line-height: 1.6

.form-input:focus,
.form-select:focus,
.form-textarea:focus
  border-color: var(--scholar-primary)

.keywords-input-area
  border: 1px solid var(--scholar-border-input)
  border-radius: 10px
  padding: 8px 12px
  background: #fff
  display: flex
  flex-wrap: wrap
  gap: 6px
  align-items: center
  min-height: 38px

.keywords-input-area:focus-within
  border-color: var(--scholar-primary)

.keywords-tags
  display: contents

.kw-tag
  display: inline-flex
  align-items: center
  gap: 4px
  height: 24px
  padding: 0 8px
  border-radius: 999px
  background: rgba(0, 73, 143, 0.08)
  color: var(--scholar-primary)
  font-size: 12px

.kw-remove
  border: none
  background: none
  cursor: pointer
  font-size: 13px
  color: inherit
  padding: 0
  line-height: 1
  opacity: 0.7

.kw-remove:hover
  opacity: 1

.keywords-input
  flex: 1
  min-width: 120px
  border: none
  outline: none
  font-size: 13px
  color: var(--scholar-text-1)
  font-family: inherit
  background: transparent

.form-error
  font-size: 13px
  color: #ef4444
  padding: 8px 12px
  background: #fef2f2
  border-radius: 8px

.form-footer
  display: flex
  justify-content: flex-end
  padding-top: 4px

.submit-btn
  height: 40px
  padding: 0 32px
  border-radius: 12px
  border: none
  background: var(--scholar-primary)
  color: #fff
  font-size: 15px
  font-weight: 500
  cursor: pointer
  transition: background 0.2s

.submit-btn:hover:not(:disabled)
  background: var(--scholar-primary-hover, #003d7a)

.submit-btn:disabled
  opacity: 0.45
  cursor: not-allowed
</style>
