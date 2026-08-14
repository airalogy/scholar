<template>
  <div class="scholars-page">
    <div class="scholars-container">
      <h1 class="scholars-title">{{ $t('scholars.title') }}</h1>

      <div class="scholars-search">
        <a-input
          v-model="query"
          class="scholars-search-input"
          :placeholder="$t('scholars.searchPlaceholder')"
          allow-clear
          @press-enter="onSearch"
        />
        <button class="scholars-search-btn" type="button" @click="onSearch">
          {{ $t('common.search') }}
        </button>
      </div>

      <div class="scholars-filters">
        <div v-if="subjectOptions.length" class="filter-row">
          <div class="filter-label">{{ $t('scholars.subjectFilter') }}</div>
          <div class="filter-content">
            <div class="filter-pills">
              <button
                class="filter-pill"
                :class="{ 'filter-pill--active': selectedSubject === '' }"
                type="button"
                @click="selectedSubject = ''"
              >
                {{ $t('common.all') }}
              </button>
              <button
                v-for="item in rootSubjectOptions"
                :key="item.id"
                class="filter-pill"
                :class="{ 'filter-pill--active': activeRootSubjectId === item.id }"
                type="button"
                @click="selectedSubject = item.id"
              >
                <span>{{ subjectLabel(item) }}</span>
                <small>{{ item.count }}</small>
              </button>
            </div>
          </div>
        </div>

        <div
          v-if="selectedSubject && (subjectNavigationOptions.length || subjectBreadcrumb.length > 1)"
          class="filter-row"
        >
          <div class="filter-label">{{ $t('scholars.subSubjectFilter') }}</div>
          <div class="filter-content filter-content--subject-navigation">
            <nav v-if="subjectBreadcrumb.length" class="subject-breadcrumb" :aria-label="$t('scholars.subjectBreadcrumb')">
              <template v-for="(item, index) in subjectBreadcrumb" :key="item.id">
                <span v-if="index" aria-hidden="true">/</span>
                <button type="button" @click="selectedSubject = item.id">
                  {{ subjectLabel(item) }}
                </button>
              </template>
            </nav>
            <div v-if="subjectNavigationOptions.length" class="filter-pills">
              <button
                v-for="item in subjectNavigationOptions"
                :key="item.id"
                class="filter-pill"
                type="button"
                @click="selectedSubject = item.id"
              >
                <span>{{ subjectLabel(item) }}</span>
                <small>{{ item.count }}</small>
              </button>
            </div>
          </div>
        </div>

        <div v-if="collegeOptions.length" class="filter-row">
          <div class="filter-label">{{ $t('scholars.collegeFilter') }}</div>
          <div class="filter-content">
            <div class="filter-pills">
              <button
                class="filter-pill"
                :class="{ 'filter-pill--active': selectedCollege === '' }"
                type="button"
                @click="selectedCollege = ''"
              >
                {{ $t('common.all') }}
              </button>
              <button
                v-for="item in collegeOptions"
                :key="item"
                class="filter-pill filter-pill--text"
                :class="{ 'filter-pill--active': selectedCollege === item }"
                type="button"
                @click="selectedCollege = item"
              >
                {{ item }}
              </button>
            </div>
          </div>
        </div>

        <div v-if="letters.length" class="filter-row">
          <div class="filter-label">{{ $t('scholars.letterFilter') }}</div>
          <div class="filter-content">
            <div class="filter-pills filter-pills--letters">
              <button
                class="filter-pill"
                :class="{ 'filter-pill--active': selectedLetter === '' }"
                type="button"
                @click="selectedLetter = ''"
              >
                {{ $t('common.all') }}
              </button>
              <button
                v-for="letter in letters"
                :key="letter"
                class="filter-pill filter-pill--letter"
                :class="{ 'filter-pill--active': selectedLetter === letter }"
                type="button"
                @click="selectedLetter = letter"
              >
                {{ letter }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="isLoading" class="scholars-loading">{{ $t('common.loading') }}</div>

      <div v-else-if="!scholars.length" class="scholars-empty">
        <span>{{ $t('scholars.empty') }}</span>
        <button
          v-if="hasActiveFilters"
          class="scholars-empty-reset"
          type="button"
          @click="resetFilters"
        >
          {{ $t('scholars.resetFilters') }}
        </button>
      </div>

      <div v-else class="scholars-grid">
        <div
          v-for="prof in scholars"
          :key="prof.id"
          class="scholar-card"
        >
          <div class="scholar-avatar-wrapper">
            <img
              v-if="prof.avatar"
              class="scholar-avatar"
              :src="prof.avatar"
              :alt="prof.name"
            />
            <div v-else class="scholar-avatar-placeholder">
              {{ prof.name.charAt(0) }}
            </div>
          </div>
          <div class="scholar-name">{{ prof.name }}</div>
          <div class="scholar-college">{{ formatScholarCollege(prof.college, '—') }}</div>
          <div class="scholar-year">{{ prof.join_year ? $t('scholars.joinedInYear', { year: prof.join_year }) : '' }}</div>
          <div class="scholar-research">{{ prof.bio ?? (prof.research_directions[0]?.name ?? '') }}</div>
          <router-link :to="`/scholars/${prof.id}`" class="scholar-more">{{ $t('scholars.viewMore') }}</router-link>
        </div>
      </div>
    </div>
  </div>

  <!-- Floating RAG chat -->
  <RagChatFloat v-if="features.aiChat && isLoggedIn" />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  getScholarFacets,
  listScholars,
  type ScholarResponse,
  type ScholarSubjectFacet,
} from '@/api/scholars'
import RagChatFloat from '@/components/RagChatFloat.vue'
import { usePublicConfig } from '@/composables/usePublicConfig'
import { useAuth } from '@/composables/useAuth'
import { formatScholarCollege } from '@/utils/scholars'

const query = ref('')
const selectedSubject = ref('')
const selectedCollege = ref('')
const selectedLetter = ref('')
const isLoading = ref(false)
const scholars = ref<ScholarResponse[]>([])
const subjectOptions = ref<ScholarSubjectFacet[]>([])
const collegeOptions = ref<string[]>([])
const letters = ref<string[]>([])
const { locale } = useI18n()
const { features, paperLibrary } = usePublicConfig()
const { isLoggedIn } = useAuth()

const subjectLabel = (subject: ScholarSubjectFacet): string => {
  return locale.value.startsWith('en') ? (subject.nameEn || subject.nameZh) : subject.nameZh
}

const subjectById = computed(() => {
  return new Map(subjectOptions.value.map((subject) => [subject.id, subject]))
})

const rootSubjectOptions = computed(() => {
  return subjectOptions.value.filter((subject) => {
    return !subject.parentId || !subjectById.value.has(subject.parentId)
  })
})

const subjectBreadcrumb = computed(() => {
  const result: ScholarSubjectFacet[] = []
  const visited = new Set<string>()
  let current = subjectById.value.get(selectedSubject.value)
  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    result.unshift(current)
    current = current.parentId ? subjectById.value.get(current.parentId) : undefined
  }
  return result
})

const activeRootSubjectId = computed(() => subjectBreadcrumb.value[0]?.id ?? '')

const subjectNavigationOptions = computed(() => {
  return subjectOptions.value.filter((subject) => subject.parentId === selectedSubject.value)
})

const hasActiveFilters = computed(() => {
  return Boolean(
    query.value.trim() ||
    selectedSubject.value ||
    selectedCollege.value ||
    selectedLetter.value,
  )
})

let searchTimer: ReturnType<typeof setTimeout> | null = null
let scholarRequestId = 0
let facetRequestId = 0

async function load(): Promise<void> {
  const requestId = ++scholarRequestId
  isLoading.value = true
  try {
    const res = await listScholars({
      q: query.value.trim() || undefined,
      college: selectedCollege.value || undefined,
      subject_id: selectedSubject.value || undefined,
      letter: selectedLetter.value || undefined,
      institution_slug: paperLibrary.value.fixedInstitutionSlug || undefined,
      limit: 100,
    })
    if (requestId === scholarRequestId) {
      scholars.value = res.items
    }
  } finally {
    if (requestId === scholarRequestId) {
      isLoading.value = false
    }
  }
}

async function loadFacets(): Promise<void> {
  const requestId = ++facetRequestId
  try {
    const facets = await getScholarFacets({
      q: query.value.trim() || undefined,
      college: selectedCollege.value || undefined,
      subject_id: selectedSubject.value || undefined,
      letter: selectedLetter.value || undefined,
      institution_slug: paperLibrary.value.fixedInstitutionSlug || undefined,
    })
    if (requestId === facetRequestId) {
      subjectOptions.value = facets.subjects
      collegeOptions.value = facets.colleges
      letters.value = facets.letters
    }
  } catch {
    if (requestId === facetRequestId) {
      subjectOptions.value = []
      collegeOptions.value = []
      letters.value = []
    }
  }
}

const refresh = async (): Promise<void> => {
  await Promise.all([loadFacets(), load()])
}

const resetFilters = (): void => {
  query.value = ''
  selectedSubject.value = ''
  selectedCollege.value = ''
  selectedLetter.value = ''
}

watch([selectedSubject, selectedCollege, selectedLetter], () => {
  void refresh()
})
watch(query, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    void refresh()
  }, 300)
})

void refresh()

const onSearch = (): void => {
  if (searchTimer) clearTimeout(searchTimer)
  void refresh()
}
</script>

<style lang="sass" scoped>
.scholars-page
  display: flex
  justify-content: center
  padding: 24px 0 40px

.scholars-container
  width: 1060px
  max-width: 100%
  padding: 0 30px

.scholars-title
  font-size: 28px
  font-weight: 600
  color: var(--scholar-text-1)
  text-align: center
  margin: 0 0 24px
  letter-spacing: -0.5px

.scholars-search
  width: 720px
  position: relative
  height: 52px
  margin: 0 auto 22px

.scholars-search-input
  height: 52px
  border: 1px solid var(--scholar-border-input)
  border-radius: 14px
  padding-left: 14px
  padding-right: 86px
  box-sizing: border-box
  background-color: #fff !important

.scholars-search-btn
  position: absolute
  right: 6px
  top: 50%
  transform: translateY(-50%)
  width: 68px
  height: 40px
  border-radius: 10px
  border: none
  background: var(--scholar-primary)
  color: #fff
  font-size: 14px
  font-weight: 400
  cursor: pointer
  letter-spacing: -0.15px

.scholars-search-btn:hover
  background: var(--scholar-primary-hover)

.scholars-filters
  border: 1px solid var(--scholar-border-light)
  background: #fcfdfd
  border-radius: 16px
  padding: 18px 22px

.filter-row
  display: flex
  gap: 22px
  padding: 14px 0

.filter-row + .filter-row
  border-top: 1px solid var(--scholar-border-light)

.filter-label
  width: 68px
  flex-shrink: 0
  font-size: 14px
  font-weight: 500
  color: var(--scholar-text-2)
  padding-top: 5px
  letter-spacing: -0.15px

.filter-content
  flex: 1
  display: flex
  align-items: flex-start
  gap: 12px
  flex-wrap: wrap

.filter-content--subject-navigation
  flex-direction: column
  align-items: stretch

.subject-breadcrumb
  display: flex
  align-items: center
  gap: 8px
  color: var(--scholar-text-3)
  font-size: 12px

.subject-breadcrumb button
  padding: 0
  border: 0
  background: transparent
  color: var(--scholar-primary)
  cursor: pointer

.filter-pills
  display: flex
  align-items: center
  flex-wrap: wrap
  gap: 8px

.filter-pills--letters
  gap: 6px 10px

.filter-pill
  height: 30px
  padding: 0 12px
  border-radius: 999px
  border: 1px solid transparent
  background: transparent
  font-size: 14px
  color: var(--scholar-text-2)
  cursor: pointer
  letter-spacing: -0.15px

.filter-pill small
  margin-left: 5px
  color: var(--scholar-text-3)
  font-size: 11px

.filter-pill--active small
  color: rgba(255, 255, 255, 0.8)

.filter-pill:hover
  background: var(--scholar-primary-light)

.filter-pill--active
  background: var(--scholar-primary)
  color: #fff

.filter-pill--active:hover
  background: var(--scholar-primary)

.filter-pill--text
  padding: 0 8px
  border: none
  border-radius: 0
  color: var(--scholar-text-2)

.filter-pill--text:hover
  background: transparent
  color: var(--scholar-primary)

.filter-pill--text.filter-pill--active
  background: transparent
  color: var(--scholar-primary)
  font-weight: 500

.filter-pill--letter
  width: 36px
  height: 30px
  padding: 0
  display: flex
  align-items: center
  justify-content: center
  border-radius: 999px

.scholars-loading,
.scholars-empty
  margin-top: 40px
  text-align: center
  font-size: 14px
  color: var(--scholar-text-3)

.scholars-empty-reset
  display: block
  margin: 14px auto 0
  padding: 7px 16px
  border: 1px solid var(--scholar-primary)
  border-radius: 6px
  background: transparent
  color: var(--scholar-primary)
  cursor: pointer

.scholars-empty-reset:hover
  background: var(--scholar-primary-light)

.scholars-grid
  display: grid
  grid-template-columns: repeat(4, 1fr)
  gap: 22px
  margin-top: 30px

.scholar-card
  background: #fff
  border: 1px solid var(--scholar-border-light)
  border-radius: 16px
  padding: 24px 20px
  display: flex
  flex-direction: column
  align-items: center
  text-align: center

.scholar-avatar-wrapper
  width: 83px
  height: 83px
  border-radius: 50%
  overflow: hidden
  margin-bottom: 12px

.scholar-avatar
  width: 100%
  height: 100%
  object-fit: cover
  border-radius: 50%

.scholar-avatar-placeholder
  width: 100%
  height: 100%
  border-radius: 50%
  background: var(--scholar-primary-light)
  color: var(--scholar-primary)
  font-size: 32px
  font-weight: 600
  display: flex
  align-items: center
  justify-content: center

.scholar-name
  font-size: 20px
  font-weight: 500
  color: #364153
  margin-bottom: 6px

.scholar-college
  font-size: 14px
  font-weight: 500
  color: var(--scholar-primary)
  letter-spacing: -0.15px
  margin-bottom: 4px

.scholar-year
  font-size: 12px
  color: var(--scholar-text-2)
  letter-spacing: -0.15px
  margin-bottom: 8px
  min-height: 16px

.scholar-research
  font-size: 12px
  color: var(--scholar-text-2)
  letter-spacing: -0.15px
  line-height: 1.6
  margin-bottom: 16px
  min-height: 38px
  overflow: hidden
  display: -webkit-box
  -webkit-line-clamp: 3
  -webkit-box-orient: vertical

.scholar-more
  width: 80%
  height: 40px
  border-radius: 10px
  border: none
  background: rgba(0, 73, 143, 0.05)
  color: var(--scholar-text-2)
  font-size: 14px
  cursor: pointer
  letter-spacing: -0.15px
  display: flex
  align-items: center
  justify-content: center
  text-decoration: none

.scholar-more:hover
  background: rgba(0, 73, 143, 0.1)
</style>
