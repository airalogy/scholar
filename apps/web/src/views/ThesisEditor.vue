<template>
  <div class="editor-page">
    <header class="editor-header">
      <router-link :to="backPath" class="back-link">← {{ $t('common.back') }}</router-link>
      <h1>{{ isEditing ? $t('degreeTheses.editTitle') : $t('degreeTheses.createTitle') }}</h1>
      <p>{{ $t('degreeTheses.editorSubtitle') }}</p>
    </header>

    <div v-if="loading" class="state-card">{{ $t('common.loading') }}</div>
    <form v-else ref="editorForm" class="editor-form" @submit.prevent="save(false)">
      <section class="form-section">
        <h2>{{ $t('degreeTheses.basicInfo') }}</h2>
        <div class="field-grid">
          <label class="field field--wide">
            <span>{{ $t('degreeTheses.titleLabel') }} *</span>
            <input v-model="form.title" required maxlength="500" />
          </label>
          <label class="field field--wide">
            <span>{{ $t('degreeTheses.titleEnLabel') }}</span>
            <input v-model="form.title_en" maxlength="500" />
          </label>
          <label class="field">
            <span>{{ $t('degreeTheses.authorLabel') }} *</span>
            <input v-model="form.author_name" required maxlength="100" />
          </label>
          <label class="field">
            <span>{{ $t('degreeTheses.studentIdLabel') }}</span>
            <input v-model="form.student_id" maxlength="100" />
          </label>
          <label class="field field--wide" v-if="!isEditing">
            <span>{{ $t('degreeTheses.institutionLabel') }} *</span>
            <select v-model="institutionId" required>
              <option value="" disabled>{{ $t('degreeTheses.institutionPlaceholder') }}</option>
              <option v-for="institution in institutions" :key="institution.id" :value="institution.id">
                {{ institution.name }}
              </option>
            </select>
          </label>
          <label class="field">
            <span>{{ $t('degreeTheses.institutionReferenceLabel') }}</span>
            <input
              v-model="form.institution_reference"
              :placeholder="$t('degreeTheses.institutionReferencePlaceholder')"
              maxlength="100"
            />
          </label>
          <label class="field">
            <span>{{ $t('degreeTheses.trainingUnitLabel') }} *</span>
            <input v-model="form.training_unit" required maxlength="200" />
          </label>
          <label class="field">
            <span>{{ $t('degreeTheses.majorLabel') }} *</span>
            <input v-model="form.major" required maxlength="200" />
          </label>
          <label class="field">
            <span>{{ $t('degreeTheses.degreeCategoryLabel') }} *</span>
            <select v-model="form.degree_category" required>
              <option value="" disabled>{{ $t('degreeTheses.degreeCategoryPlaceholder') }}</option>
              <option value="博士">{{ $t('degreeTheses.doctoral') }}</option>
              <option value="硕士">{{ $t('degreeTheses.masters') }}</option>
              <option value="学士">{{ $t('degreeTheses.bachelors') }}</option>
              <option value="其他">{{ $t('common.unknown') }}</option>
            </select>
          </label>
          <label class="field">
            <span>{{ $t('degreeTheses.awardYearLabel') }} *</span>
            <input v-model.number="form.award_year" required type="number" min="1900" max="2100" />
          </label>
          <label class="field field--wide">
            <span>{{ $t('degreeTheses.advisorsLabel') }}</span>
            <input v-model="advisorsText" :placeholder="$t('degreeTheses.multiValueHint')" />
          </label>
          <label class="field field--wide">
            <span>{{ $t('degreeTheses.keywordsLabel') }}</span>
            <input v-model="keywordsText" :placeholder="$t('degreeTheses.multiValueHint')" />
          </label>
          <label class="field field--wide">
            <span>{{ $t('degreeTheses.abstractLabel') }}</span>
            <textarea v-model="form.abstract" rows="8" maxlength="100000" />
          </label>
        </div>
      </section>

      <section class="form-section">
        <h2>{{ $t('degreeTheses.accessAndFile') }}</h2>
        <div class="field-grid">
          <label class="field">
            <span>{{ $t('degreeTheses.languageLabel') }}</span>
            <select v-model="form.language">
              <option value="zh-CN">中文</option>
              <option value="en-US">English</option>
              <option value="other">{{ $t('common.unknown') }}</option>
            </select>
          </label>
          <label class="field">
            <span>{{ $t('degreeTheses.visibilityLabel') }}</span>
            <select v-model="form.visibility">
              <option value="public">{{ $t('degreeTheses.visibilityPublic') }}</option>
              <option value="institution">{{ $t('degreeTheses.visibilityInstitution') }}</option>
              <option value="restricted">{{ $t('degreeTheses.visibilityRestricted') }}</option>
            </select>
          </label>
          <label class="field">
            <span>{{ $t('degreeTheses.confidentialityUntilLabel') }}</span>
            <input v-model="form.confidentiality_until" type="date" />
          </label>
          <label class="field field--wide file-field">
            <span>{{ $t('degreeTheses.fileLabel') }}</span>
            <input type="file" accept="application/pdf,.pdf" @change="onFileChange" />
            <small v-if="selectedFile">{{ selectedFile.name }}</small>
            <small v-else-if="form.file_id">{{ $t('degreeTheses.keepExistingFile') }}</small>
            <small>{{ $t('degreeTheses.fileHint') }}</small>
          </label>
        </div>
      </section>

      <div v-if="errorMessage" class="error-message">{{ errorMessage }}</div>
      <footer class="form-actions">
        <button class="secondary-btn" type="submit" :disabled="saving">
          {{ saving ? $t('degreeTheses.saving') : $t('degreeTheses.saveDraft') }}
        </button>
        <button class="primary-btn" type="button" :disabled="saving" @click="save(true)">
          {{ saving ? $t('degreeTheses.saving') : $t('degreeTheses.saveAndSubmit') }}
        </button>
      </footer>
    </form>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { getMyProfile, type UserInstitutionMembershipItem } from '@/api/users'
import {
  createDegreeThesis,
  getDegreeThesis,
  submitDegreeThesis,
  updateDegreeThesis,
  uploadDegreeThesisFile,
  type DegreeThesisInput,
  type DegreeThesisVisibility,
} from '@/api/theses'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const thesisId = computed(() => String(route.params.id ?? ''))
const isEditing = computed(() => Boolean(thesisId.value))
const backPath = computed(() => (isEditing.value ? `/theses/${thesisId.value}` : '/theses/mine'))
const loading = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const institutions = ref<UserInstitutionMembershipItem[]>([])
const institutionId = ref('')
const selectedFile = ref<File | null>(null)
const editorForm = ref<HTMLFormElement | null>(null)
const advisorsText = ref('')
const keywordsText = ref('')
const form = reactive<DegreeThesisInput>({
  institution_reference: '',
  title: '',
  title_en: '',
  author_name: '',
  student_id: '',
  training_unit: '',
  major: '',
  degree_category: '',
  award_year: new Date().getFullYear(),
  advisors: [],
  abstract: '',
  keywords: [],
  language: 'zh-CN',
  visibility: 'public' as DegreeThesisVisibility,
  confidentiality_until: '',
  file_id: undefined,
})

const splitValues = (value: string): string[] => {
  return [...new Set(value.split(/[，,;；]/u).map((item) => item.trim()).filter(Boolean))]
}

const getErrorMessage = (error: unknown): string => {
  if (typeof error === 'object' && error && 'response' in error) {
    const response = (error as { response?: { data?: { message?: string } } }).response
    return response?.data?.message || t('degreeTheses.saveFailed')
  }
  return t('degreeTheses.saveFailed')
}

const onFileChange = (event: Event): void => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  if (!file) {
    selectedFile.value = null
    return
  }
  if (file.type !== 'application/pdf' && !file.name.toLocaleLowerCase('en-US').endsWith('.pdf')) {
    selectedFile.value = null
    input.value = ''
    errorMessage.value = t('degreeTheses.invalidFileType')
    return
  }
  if (file.size > 25 * 1024 * 1024) {
    selectedFile.value = null
    input.value = ''
    errorMessage.value = t('degreeTheses.fileTooLarge')
    return
  }
  errorMessage.value = ''
  selectedFile.value = file
}

const load = async (): Promise<void> => {
  loading.value = true
  try {
    const profile = await getMyProfile()
    institutions.value = profile.institution_memberships
    if (!isEditing.value) {
      institutionId.value = institutions.value[0]?.id ?? ''
      return
    }
    const thesis = await getDegreeThesis(thesisId.value)
    if (!thesis.can_edit || !thesis.current_version) {
      await router.replace(`/theses/${thesis.id}`)
      return
    }
    institutionId.value = thesis.institution_id
    const version = thesis.current_version
    Object.assign(form, {
      institution_reference: thesis.institution_reference ?? '',
      title: version.title,
      title_en: version.title_en ?? '',
      author_name: version.author_name,
      student_id: version.student_id ?? '',
      training_unit: version.training_unit,
      major: version.major,
      degree_category: version.degree_category,
      award_year: version.award_year,
      abstract: version.abstract ?? '',
      language: version.language,
      visibility: version.visibility,
      confidentiality_until: version.confidentiality_until ?? '',
      file_id: version.file_id ?? undefined,
    })
    advisorsText.value = version.advisors.join('，')
    keywordsText.value = version.keywords.join('，')
  } catch (error) {
    errorMessage.value = getErrorMessage(error)
  } finally {
    loading.value = false
  }
}

const save = async (submitAfterSave: boolean): Promise<void> => {
  if (!editorForm.value?.reportValidity()) {
    return
  }
  if (
    !institutionId.value ||
    !form.title.trim() ||
    !form.author_name.trim() ||
    !form.training_unit.trim() ||
    !form.major.trim() ||
    !form.degree_category.trim()
  ) {
    errorMessage.value = t('degreeTheses.requiredFields')
    return
  }
  saving.value = true
  errorMessage.value = ''
  try {
    let fileId = form.file_id
    if (selectedFile.value) {
      fileId = await uploadDegreeThesisFile(selectedFile.value, institutionId.value)
    }
    const payload: DegreeThesisInput = {
      ...form,
      institution_reference: form.institution_reference?.trim() || null,
      title_en: form.title_en?.trim() || undefined,
      student_id: form.student_id?.trim() || undefined,
      abstract: form.abstract?.trim() || undefined,
      confidentiality_until: form.confidentiality_until || undefined,
      file_id: fileId,
      advisors: splitValues(advisorsText.value),
      keywords: splitValues(keywordsText.value),
    }
    const thesis = isEditing.value
      ? await updateDegreeThesis(thesisId.value, payload)
      : await createDegreeThesis({ ...payload, institution_id: institutionId.value })
    const result = submitAfterSave ? await submitDegreeThesis(thesis.id) : thesis
    Message.success(
      submitAfterSave ? t('degreeTheses.submitSuccess') : t('degreeTheses.saveSuccess'),
    )
    await router.push(`/theses/${result.id}`)
  } catch (error) {
    errorMessage.value = getErrorMessage(error)
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.editor-page { max-width: 980px; margin: 0 auto; padding: 40px 36px 80px; }
.editor-header { margin-bottom: 28px; }
.back-link { color: var(--scholar-text-secondary); text-decoration: none; }
h1 { margin: 0 0 10px; font-size: 32px; }
.editor-header p:last-child { color: var(--scholar-text-secondary); }
.editor-form { display: grid; gap: 20px; }
.form-section { background: #fff; border: 1px solid var(--scholar-border-light); border-radius: 14px; padding: 26px; }
.form-section h2 { margin: 0 0 22px; font-size: 19px; }
.field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.field { display: grid; gap: 8px; color: var(--scholar-text-secondary); font-size: 14px; }
.field--wide { grid-column: 1 / -1; }
.field input, .field select, .field textarea { width: 100%; box-sizing: border-box; border: 1px solid var(--scholar-border-input); border-radius: 8px; padding: 10px 12px; color: var(--scholar-text-primary); background: #fff; font: inherit; }
.field textarea { resize: vertical; }
.file-field small { color: var(--scholar-text-secondary); }
.form-actions { display: flex; justify-content: flex-end; gap: 12px; }
.primary-btn, .secondary-btn { border-radius: 8px; padding: 11px 22px; font-weight: 600; cursor: pointer; }
.primary-btn { border: 1px solid var(--scholar-primary); color: #fff; background: var(--scholar-primary); }
.secondary-btn { border: 1px solid var(--scholar-border-input); background: #fff; }
.primary-btn:disabled, .secondary-btn:disabled { opacity: .55; cursor: not-allowed; }
.state-card, .error-message { padding: 24px; border-radius: 10px; background: #fff; border: 1px solid var(--scholar-border-light); }
.error-message { color: #b42318; background: #fff4f2; border-color: #fecdca; }
@media (max-width: 700px) { .editor-page { padding: 28px 18px 60px; } .field-grid { grid-template-columns: 1fr; } .field--wide { grid-column: auto; } }
</style>
