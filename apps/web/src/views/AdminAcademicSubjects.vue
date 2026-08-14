<template>
  <div class="admin-page">
    <div class="admin-container">
      <header class="admin-header">
        <div>
          <h1>{{ $t('academicSubjects.title') }}</h1>
          <p>{{ $t('academicSubjects.subtitle') }}</p>
        </div>
        <div class="header-actions">
          <router-link to="/admin" class="text-link">{{ $t('academicSubjects.back') }}</router-link>
          <a-button type="primary" :disabled="!selectedScope" @click="openCreate">
            {{ $t('academicSubjects.create') }}
          </a-button>
        </div>
      </header>

      <section class="catalog-toolbar">
        <label for="subject-scope">{{ $t('academicSubjects.scope') }}</label>
        <a-select
          id="subject-scope"
          v-model="selectedScope"
          class="scope-select"
          :placeholder="$t('academicSubjects.selectScope')"
          @change="onScopeChange"
        >
          <a-option v-for="scope in scopes" :key="scope.value" :value="scope.value">
            {{ scope.label }}
          </a-option>
        </a-select>
        <span class="catalog-count">{{ $t('academicSubjects.count', { count: subjects.length }) }}</span>
      </section>

      <div v-if="isLoading" class="state-card">{{ $t('common.loading') }}</div>
      <div v-else-if="loadError" class="state-card state-card--error">{{ loadError }}</div>
      <div v-else-if="!subjects.length" class="state-card">{{ $t('academicSubjects.empty') }}</div>
      <section v-else class="subject-list">
        <article
          v-for="subject in subjects"
          :key="subject.id"
          class="subject-row"
          :class="{ 'subject-row--inactive': !subject.is_active }"
        >
          <div class="subject-main" :style="{ paddingLeft: `${subjectDepth(subject) * 22}px` }">
            <div class="subject-title-row">
              <strong>{{ locale.startsWith('en') ? (subject.name_en || subject.name_zh) : subject.name_zh }}</strong>
              <span v-if="subject.institution_id" class="badge badge--institution">
                {{ $t('academicSubjects.institutionSubject') }}
              </span>
              <span v-if="!subject.is_active" class="badge">{{ $t('academicSubjects.inactive') }}</span>
            </div>
            <div class="subject-meta">
              <span>{{ subject.local_code || subject.code }}</span>
              <span>{{ $t('academicSubjects.scholarCount', { count: subject.scholar_count }) }}</span>
              <span v-if="subject.aliases.length">
                {{ $t('academicSubjects.aliases') }}：{{ aliasSummary(subject) }}
              </span>
            </div>
          </div>
          <a-button v-if="subject.can_edit" type="text" @click="openEdit(subject)">
            {{ $t('common.edit') }}
          </a-button>
        </article>
      </section>
    </div>

    <a-modal
      v-model:visible="modalVisible"
      :title="editingId ? $t('academicSubjects.edit') : $t('academicSubjects.create')"
      :ok-loading="isSaving"
      :ok-text="$t('common.save')"
      :cancel-text="$t('common.cancel')"
      @ok="save"
    >
      <a-form :model="form" layout="vertical">
        <a-form-item :label="$t('academicSubjects.nameZh')" required>
          <a-input v-model="form.nameZh" :placeholder="$t('academicSubjects.nameZhPlaceholder')" />
        </a-form-item>
        <a-form-item :label="$t('academicSubjects.nameEn')">
          <a-input v-model="form.nameEn" :placeholder="$t('academicSubjects.nameEnPlaceholder')" />
        </a-form-item>
        <a-form-item v-if="isGlobalScope && !editingId" :label="$t('academicSubjects.code')" required>
          <a-input v-model="form.code" :placeholder="$t('academicSubjects.codePlaceholder')" />
        </a-form-item>
        <a-form-item v-else-if="!isGlobalScope" :label="$t('academicSubjects.localCode')">
          <a-input v-model="form.localCode" :placeholder="$t('academicSubjects.localCodePlaceholder')" />
        </a-form-item>
        <a-form-item :label="$t('academicSubjects.parent')">
          <a-select v-model="form.parentId" allow-clear :placeholder="$t('academicSubjects.noParent')">
            <a-option
              v-for="option in parentOptions"
              :key="option.id"
              :value="option.id"
            >
              {{ option.name_zh }}{{ option.name_en ? ` / ${option.name_en}` : '' }}
            </a-option>
          </a-select>
        </a-form-item>
        <a-form-item :label="$t('academicSubjects.aliases')">
          <a-textarea
            v-model="form.aliasesText"
            :placeholder="$t('academicSubjects.aliasesPlaceholder')"
            :auto-size="{ minRows: 3, maxRows: 6 }"
          />
        </a-form-item>
        <a-form-item :label="$t('academicSubjects.sortOrder')">
          <a-input-number v-model="form.sortOrder" :min="0" :max="100000" />
        </a-form-item>
        <a-form-item>
          <a-checkbox v-model="form.isActive">{{ $t('academicSubjects.active') }}</a-checkbox>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import {
  createAcademicSubject,
  listAcademicSubjects,
  updateAcademicSubject,
  type AcademicSubjectItem,
} from '@/api/academic-subjects'
import { listInstitutions, type InstitutionListItem } from '@/api/institutions'
import { getMyProfile, type UserProfile } from '@/api/users'

interface ScopeOption {
  value: string
  label: string
}

const GLOBAL_SCOPE = '__global__'
const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const profile = ref<UserProfile | null>(null)
const institutions = ref<InstitutionListItem[]>([])
const selectedScope = ref('')
const subjects = ref<AcademicSubjectItem[]>([])
const isLoading = ref(true)
const loadError = ref('')
const modalVisible = ref(false)
const isSaving = ref(false)
const editingId = ref<string | null>(null)
const form = ref({
  nameZh: '',
  nameEn: '',
  code: '',
  localCode: '',
  parentId: '',
  aliasesText: '',
  sortOrder: 10000,
  isActive: true,
})

const scopes = computed<ScopeOption[]>(() => {
  const result: ScopeOption[] = []
  if (profile.value?.platform_role === 'platform_admin') {
    result.push({ value: GLOBAL_SCOPE, label: t('academicSubjects.platformScope') })
  }
  for (const institution of institutions.value) {
    if (
      profile.value?.platform_role === 'platform_admin' ||
      institution.role === 'owner' ||
      institution.role === 'admin'
    ) {
      result.push({ value: institution.slug, label: institution.name })
    }
  }
  return result
})

const isGlobalScope = computed(() => selectedScope.value === GLOBAL_SCOPE)
const parentOptions = computed(() => subjects.value.filter((item) => item.id !== editingId.value && item.is_active))

const subjectDepth = (subject: AcademicSubjectItem): number => {
  const byId = new Map(subjects.value.map((item) => [item.id, item]))
  const visited = new Set<string>([subject.id])
  let parentId = subject.parent_id
  let depth = 0
  while (parentId && depth < 6 && !visited.has(parentId)) {
    visited.add(parentId)
    depth += 1
    parentId = byId.get(parentId)?.parent_id ?? null
  }
  return depth
}

const aliasSummary = (subject: AcademicSubjectItem): string => {
  return subject.aliases
    .map((item) => item.alias)
    .filter((alias) => alias !== subject.name_zh && alias !== subject.name_en)
    .slice(0, 4)
    .join('、') || '—'
}

const scopeInstitutionSlug = (): string | undefined => {
  return isGlobalScope.value ? undefined : selectedScope.value || undefined
}

const loadSubjects = async (): Promise<void> => {
  if (!selectedScope.value) {
    subjects.value = []
    return
  }
  isLoading.value = true
  loadError.value = ''
  try {
    subjects.value = await listAcademicSubjects({
      institutionSlug: scopeInstitutionSlug(),
      includeInactive: true,
    })
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : t('academicSubjects.loadFailed')
  } finally {
    isLoading.value = false
  }
}

const resetForm = (): void => {
  form.value = {
    nameZh: '',
    nameEn: '',
    code: '',
    localCode: '',
    parentId: '',
    aliasesText: '',
    sortOrder: 10000,
    isActive: true,
  }
}

const openCreate = (): void => {
  editingId.value = null
  resetForm()
  modalVisible.value = true
}

const openEdit = (subject: AcademicSubjectItem): void => {
  editingId.value = subject.id
  form.value = {
    nameZh: subject.name_zh,
    nameEn: subject.name_en ?? '',
    code: subject.code,
    localCode: subject.local_code ?? '',
    parentId: subject.parent_id ?? '',
    aliasesText: subject.aliases
      .map((item) => item.alias)
      .filter((alias) => alias !== subject.name_zh && alias !== subject.name_en)
      .join('\n'),
    sortOrder: subject.sort_order,
    isActive: subject.is_active,
  }
  modalVisible.value = true
}

const parseAliases = (): Array<{ alias: string }> => {
  return [...new Set(form.value.aliasesText.split('\n').map((item) => item.trim()).filter(Boolean))]
    .map((alias) => ({ alias }))
}

const save = async (): Promise<boolean> => {
  if (!form.value.nameZh.trim() || (isGlobalScope.value && !editingId.value && !form.value.code.trim())) {
    Message.warning(t('academicSubjects.requiredFields'))
    return false
  }
  isSaving.value = true
  try {
    const body = {
      parent_id: form.value.parentId || null,
      name_zh: form.value.nameZh.trim(),
      name_en: form.value.nameEn.trim() || null,
      aliases: parseAliases(),
      sort_order: form.value.sortOrder,
      is_active: form.value.isActive,
      local_code: form.value.localCode.trim() || null,
    }
    if (editingId.value) {
      await updateAcademicSubject(editingId.value, body)
    } else {
      await createAcademicSubject({
        ...body,
        institution_slug: scopeInstitutionSlug(),
        code: isGlobalScope.value ? form.value.code.trim() : undefined,
      })
    }
    modalVisible.value = false
    Message.success(t('academicSubjects.saveSuccess'))
    await loadSubjects()
    return true
  } catch (error) {
    Message.error(error instanceof Error ? error.message : t('academicSubjects.saveFailed'))
    return false
  } finally {
    isSaving.value = false
  }
}

const onScopeChange = async (): Promise<void> => {
  await router.replace({
    query: selectedScope.value === GLOBAL_SCOPE ? {} : { institution: selectedScope.value },
  })
  await loadSubjects()
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
    const requestedScope = typeof route.query.institution === 'string' ? route.query.institution : ''
    selectedScope.value = scopes.value.some((scope) => scope.value === requestedScope)
      ? requestedScope
      : (scopes.value[0]?.value ?? '')
    await loadSubjects()
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : t('academicSubjects.loadFailed')
    isLoading.value = false
  }
}

onMounted(() => {
  void load()
})
</script>

<style scoped lang="sass">
.admin-page
  min-height: calc(100vh - var(--scholar-navbar-height))
  padding: 28px 0 48px
  background: linear-gradient(180deg, #f8fafc 0%, #fff 100%)

.admin-container
  width: 1040px
  max-width: 100%
  margin: 0 auto
  padding: 0 30px

.admin-header
  display: flex
  justify-content: space-between
  align-items: flex-start
  gap: 20px
  margin-bottom: 24px

.admin-header h1
  margin: 0 0 8px
  color: var(--scholar-text-1)

.admin-header p
  margin: 0
  color: var(--scholar-text-2)

.header-actions,
.catalog-toolbar
  display: flex
  align-items: center
  gap: 12px

.text-link
  color: var(--scholar-primary)
  text-decoration: none

.catalog-toolbar
  padding: 16px 18px
  margin-bottom: 16px
  border: 1px solid var(--scholar-border-light)
  border-radius: 14px
  background: #fff

.catalog-toolbar label,
.catalog-count
  white-space: nowrap
  flex-shrink: 0

.scope-select
  width: 260px

.catalog-count
  margin-left: auto
  color: var(--scholar-text-3)

.subject-list,
.state-card
  border: 1px solid var(--scholar-border-light)
  border-radius: 14px
  background: #fff
  overflow: hidden

.state-card
  padding: 40px
  text-align: center
  color: var(--scholar-text-3)

.state-card--error
  color: #c53b3b

.subject-row
  min-height: 72px
  display: flex
  align-items: center
  gap: 16px
  padding: 12px 18px

.subject-row + .subject-row
  border-top: 1px solid var(--scholar-border-light)

.subject-row--inactive
  opacity: .6

.subject-main
  flex: 1
  min-width: 0

.subject-title-row,
.subject-meta
  display: flex
  align-items: center
  flex-wrap: wrap
  gap: 8px 14px

.subject-title-row
  margin-bottom: 7px

.subject-meta
  font-size: 12px
  color: var(--scholar-text-3)

.badge
  padding: 2px 8px
  border-radius: 999px
  background: #f1f3f6
  color: var(--scholar-text-2)
  font-size: 11px

.badge--institution
  background: var(--scholar-primary-light)
  color: var(--scholar-primary)

@media (max-width: 720px)
  .admin-header,
  .catalog-toolbar
    align-items: stretch
    flex-direction: column

  .header-actions
    justify-content: space-between

  .scope-select
    width: 100%

  .catalog-count
    margin-left: 0
</style>
