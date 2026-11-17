<template>
  <div class="papers-page">
    <div class="papers-container">
      <PaperLibraryNavigation v-if="isLibraryHome" active="publications" />
      <section class="papers-hero">
        <div class="papers-hero-copy">
          <div v-if="!isLibraryHome" class="papers-eyebrow">{{ $t('papersPage.eyebrow') }}</div>
          <h1 class="papers-title">{{ pageTitle }}</h1>
          <p class="papers-subtitle">{{ pageSubtitle }}</p>
          <p v-if="isLibraryHome && features.degreeTheses" class="papers-subtitle library-scope-note">{{ $t('paperLibrary.publicationsScope') }}</p>
        </div>

        <div v-if="scopeChips.length" class="scope-chip-list">
          <span v-for="chip in scopeChips" :key="chip" class="scope-chip">{{ chip }}</span>
        </div>

        <div class="papers-search-row">
          <a-input
            v-model="queryText"
            class="papers-search-input"
            :placeholder="$t('papersPage.searchPlaceholder')"
            :aria-label="$t('papersPage.searchPlaceholder')"
            allow-clear
            @press-enter="applyFilters"
          />
          <a-button type="primary" class="papers-search-btn" @click="applyFilters">
            {{ $t('common.search') }}
          </a-button>
        </div>

        <div class="filter-toolbar">
          <button type="button" class="filter-toggle" :aria-expanded="filtersExpanded" aria-controls="publication-filters" @click="filtersExpanded = !filtersExpanded">
            {{ $t('paperLibrary.filters') }}<span v-if="filterCount"> ({{ filterCount }})</span>
            <span aria-hidden="true">{{ filtersExpanded ? ' −' : ' +' }}</span>
          </button>
          <a-button class="papers-filter-reset" @click="resetFilters">{{ $t('papersPage.resetFilters') }}</a-button>
        </div>
        <div v-show="filtersExpanded" id="publication-filters" class="papers-filter-grid">
          <a-select
            v-model="selectedAuthorId"
            class="papers-filter-control"
            :placeholder="$t('papersPage.authorFilterPlaceholder')"
            :aria-label="$t('papersPage.authorFilterPlaceholder')"
            allow-clear
            allow-search
            :filter-option="false"
            :loading="isAuthorLoading"
            @search="handleAuthorSearch"
          >
            <a-option v-for="author in authorOptions" :key="author.id" :value="author.id">
              {{ author.name }}<span class="option-meta"> · {{ $t('papersPage.authorOptionCount', { count: author.paperCount }) }}</span>
            </a-option>
          </a-select>

          <a-select
            v-model="selectedPaperType"
            class="papers-filter-control"
            :placeholder="$t('papersPage.paperTypePlaceholder')"
            :aria-label="$t('papersPage.paperTypePlaceholder')"
            allow-clear
          >
            <a-option v-for="item in paperTypeOptions" :key="item.value" :value="item.value">
              {{ item.label }}
            </a-option>
          </a-select>

          <a-select v-model="selectedSort" class="papers-filter-control" :placeholder="$t('papersPage.sortPlaceholder')" :aria-label="$t('papersPage.sortPlaceholder')">
            <a-option value="latest">{{ $t('papersPage.sort.latest') }}</a-option>
            <a-option value="citations">{{ $t('papersPage.sort.citations') }}</a-option>
            <a-option value="relevance">{{ $t('papersPage.sort.relevance') }}</a-option>
          </a-select>

          <a-input-number
            v-model="yearFrom"
            class="papers-filter-control"
            :min="1900"
            :max="2100"
            :placeholder="$t('papersPage.yearFromPlaceholder')"
            :aria-label="$t('papersPage.yearFromPlaceholder')"
            hide-button
          />

          <a-input-number
            v-model="yearTo"
            class="papers-filter-control"
            :min="1900"
            :max="2100"
            :placeholder="$t('papersPage.yearToPlaceholder')"
            :aria-label="$t('papersPage.yearToPlaceholder')"
            hide-button
          />

          <a-button class="papers-filter-reset" @click="applyFilters">
            {{ $t('paperLibrary.applyFilters') }}
          </a-button>
        </div>
      </section>

      <section v-if="institutionQuickBrowse.colleges.length || institutionQuickBrowse.labs.length" class="browse-section">
        <div class="section-head">
          <div>
            <h2 class="section-title">{{ $t('papersPage.organizedBrowseTitle') }}</h2>
            <p class="section-subtitle">{{ $t('papersPage.organizedBrowseSubtitle') }}</p>
          </div>
        </div>

        <div v-if="institutionQuickBrowse.colleges.length" class="browse-group">
          <div class="browse-label">{{ $t('papersPage.collegesLabel') }}</div>
          <div class="browse-chip-list">
            <router-link
              v-for="college in institutionQuickBrowse.colleges"
              :key="college"
              :to="{ name: 'InstitutionCollegePapers', params: { slug: currentInstitutionSlug, collegeSlug: college } }"
              class="browse-chip"
            >
              {{ college }}
            </router-link>
          </div>
        </div>

        <div v-if="institutionQuickBrowse.labs.length" class="browse-group">
          <div class="browse-label">{{ $t('papersPage.labsLabel') }}</div>
          <div class="browse-chip-list">
            <router-link
              v-for="lab in institutionQuickBrowse.labs"
              :key="lab.id"
              :to="{ name: 'LabPapers', params: { slug: lab.slug } }"
              class="browse-chip"
            >
              {{ lab.name }}
            </router-link>
          </div>
        </div>
      </section>

      <div class="papers-meta" role="status" aria-live="polite">
        {{ isLoading ? $t('common.loading') : $t('papersPage.totalResults', { count: total }) }}
      </div>

      <div v-if="isLoading" class="papers-state">{{ $t('common.loading') }}</div>
      <div v-else-if="loadError" class="papers-state" role="alert">
        <p>{{ loadError }}</p>
        <a-button @click="loadPapers">{{ $t('paperLibrary.retry') }}</a-button>
      </div>
      <div v-else-if="!papers.length" class="papers-state">
        <p>{{ $t('papersPage.empty') }}</p>
        <a-button @click="resetFilters">{{ $t('papersPage.resetFilters') }}</a-button>
      </div>

      <div v-else class="papers-list">
        <article v-for="paper in papers" :key="paper.id" class="paper-shell">
          <div class="paper-shell-head">
            <div class="paper-badges">
              <span v-if="showPaperSourceBadges && paper.institutionName" class="paper-badge">{{ paper.institutionName }}</span>
              <span v-if="showPaperSourceBadges && paper.labName" class="paper-badge paper-badge--muted">{{ paper.labName }}</span>
              <span v-if="paper.paper_type != null" class="paper-badge paper-badge--muted">{{ getPaperTypeLabel(paper.paper_type) }}</span>
            </div>
            <button
              class="paper-bookmark"
              type="button"
              :aria-label="bookmarkSet.has(paper.id) ? $t('paperDetail.removeBookmarkAria') : $t('paperDetail.addBookmarkAria')"
              @click="toggleBookmark(paper.id)"
            >
              <IconBookmark
                class="paper-bookmark-icon"
                :class="{ 'paper-bookmark-icon--active': bookmarkSet.has(paper.id) }"
              />
            </button>
          </div>

          <router-link :to="`/papers/${paper.id}`" class="paper-link">
            <PaperInfoCard
              :paper="toPaperInfo(paper)"
              :keywords="paper.keywords.slice(0, 5)"
              class-name="paper-info-card"
            />
          </router-link>

          <div class="paper-foot">
            <div class="paper-foot-meta">
              <span v-if="paper.citation_count !== null">{{ $t('papersPage.citationCount', { count: paper.citation_count }) }}</span>
              <span v-if="hasPublishYear(paper.publish_year)">{{ $t('papersPage.publishedYear', { year: paper.publish_year }) }}</span>
              <span v-if="paper.reviewedAt">{{ $t('common.review.reviewedAt', { date: formatDate(paper.reviewedAt) }) }}</span>
            </div>
          </div>
        </article>
      </div>

      <div v-if="!isLoading && !loadError && total > pageSize" class="papers-pagination">
        <a-pagination
          :total="total"
          :current="page"
          :page-size="pageSize"
          :show-total="true"
          @change="onPageChange"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import { IconBookmark } from '@arco-design/web-vue/es/icon'
import { useI18n } from 'vue-i18n'
import PaperInfoCard, { type PaperInfo } from '@/components/PaperInfoCard.vue'
import PaperLibraryNavigation from '@/components/PaperLibraryNavigation.vue'
import { usePublicConfig } from '@/composables/usePublicConfig'
import {
  listPapers,
  type ListPapersParams,
  type PaperResponse,
} from '@/api/papers'
import { addBookmark, listBookmarks, removeBookmark } from '@/api/bookmarks'
import { searchAuthors, type AuthorResponse } from '@/api/authors'
import {
  getInstitution,
  type InstitutionDetailResponse,
} from '@/api/institutions'
import { getLab } from '@/api/labs'
import { getScholar } from '@/api/scholars'
import { useAuth } from '@/composables/useAuth'
import { PAPER_TYPE_LABEL_KEYS } from '@/i18n/helpers'
import { hasPublishYear } from '@/utils/papers'

const pageSize = 10
const route = useRoute()
const router = useRouter()
const { features } = usePublicConfig()
const isLibraryHome = computed(() => ['Papers', 'InstitutionPapers'].includes(String(route.name)))
const { t, locale } = useI18n()
const { isLoggedIn, token } = useAuth()

type PageScope =
  | { kind: 'default' }
  | { kind: 'institution', name: string }
  | { kind: 'institutionCollege', institutionName: string, college: string }
  | { kind: 'lab', name: string }
  | { kind: 'scholar', name: string }

const page = ref(1)
const total = ref(0)
const papers = ref<PaperResponse[]>([])
const bookmarkSet = ref<Set<string>>(new Set())
const authorOptions = ref<AuthorResponse[]>([])
const isLoading = ref(false)
const isAuthorLoading = ref(false)
const loadError = ref('')

const queryText = ref('')
const selectedAuthorId = ref('')
const selectedPaperType = ref<number | undefined>(undefined)
const selectedSort = ref<'latest' | 'citations' | 'relevance'>('latest')
const yearFrom = ref<number | undefined>(undefined)
const yearTo = ref<number | undefined>(undefined)
const filtersExpanded = ref(false)
const filterCount = computed(() => [selectedAuthorId.value, selectedPaperType.value, yearFrom.value, yearTo.value].filter((value) => value !== undefined && value !== '').length)

const pageScope = ref<PageScope>({ kind: 'default' })
const currentInstitutionSlug = ref('')
const currentInstitution = ref<InstitutionDetailResponse | null>(null)

const paperTypeOptions = computed(() => {
  return Object.entries(PAPER_TYPE_LABEL_KEYS).map(([value, key]) => ({
    label: t(key),
    value: Number(value),
  }))
})

const pageTitle = computed(() => {
  if (isLibraryHome.value && features.value.degreeTheses) return t('paperLibrary.publications')
  if (pageScope.value.kind === 'institution') {
    return t('papersPage.scopeTitles.institution', { name: pageScope.value.name })
  }

  if (pageScope.value.kind === 'institutionCollege') {
    return t('papersPage.scopeTitles.institutionCollege', {
      institution: pageScope.value.institutionName,
      college: pageScope.value.college,
    })
  }

  if (pageScope.value.kind === 'lab') {
    return t('papersPage.scopeTitles.lab', { name: pageScope.value.name })
  }

  if (pageScope.value.kind === 'scholar') {
    return t('papersPage.scopeTitles.scholar', { name: pageScope.value.name })
  }

  return t('papersPage.defaultTitle')
})

const pageSubtitle = computed(() => {
  if (pageScope.value.kind === 'institution') {
    return t('papersPage.scopeSubtitles.institution')
  }

  if (pageScope.value.kind === 'institutionCollege') {
    return t('papersPage.scopeSubtitles.institutionCollege')
  }

  if (pageScope.value.kind === 'lab') {
    return t('papersPage.scopeSubtitles.lab')
  }

  if (pageScope.value.kind === 'scholar') {
    return t('papersPage.scopeSubtitles.scholar')
  }

  return t('papersPage.defaultSubtitle')
})

const scopeChips = computed(() => {
  const chips: string[] = []

  if (currentInstitution.value) {
    chips.push(currentInstitution.value.name)
  }

  if (route.name === 'InstitutionCollegePapers') {
    chips.push(String(route.params.collegeSlug ?? ''))
  }

  if (route.name === 'LabPapers' && papers.value[0]?.labName) {
    chips.push(papers.value[0].labName ?? '')
  }

  if (route.name === 'ScholarPapers' && pageTitle.value) {
    chips.push(t('papersPage.scholarChip'))
  }

  return chips.filter(Boolean)
})

const institutionQuickBrowse = computed(() => {
  const institution = currentInstitution.value
  if (!institution) {
    return {
      colleges: [] as string[],
      labs: [] as InstitutionDetailResponse['labs'],
    }
  }

  const colleges = [...new Set(
    institution.labs
      .map((lab) => lab.college?.trim() ?? '')
      .filter(Boolean),
  )].sort((left, right) => left.localeCompare(right, locale.value))

  return {
    colleges,
    labs: institution.labs,
  }
})

const showPaperSourceBadges = computed(() => {
  return pageScope.value.kind === 'institution' ||
    pageScope.value.kind === 'institutionCollege' ||
    pageScope.value.kind === 'lab'
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

const formatDate = (value: string): string => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10)
  }

  return new Intl.DateTimeFormat(locale.value, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

const getPaperTypeLabel = (value: number): string => {
  const key = PAPER_TYPE_LABEL_KEYS[value as keyof typeof PAPER_TYPE_LABEL_KEYS] ?? 'common.paperTypes.other'
  return t(key)
}

const toPaperInfo = (paper: PaperResponse): PaperInfo => {
  return {
    title: paper.title,
    authors: paper.authors.map((author) => ({
      name: author.name,
      type: 'normal' as const,
    })),
    publishYear: paper.publish_year,
    journal: paper.journal_name ?? t('papersPage.sourceFallback'),
    summary: paper.abstract ?? t('common.noAbstract'),
  }
}

const resetFilters = (): void => {
  queryText.value = ''
  selectedAuthorId.value = ''
  selectedPaperType.value = undefined
  selectedSort.value = 'latest'
  yearFrom.value = undefined
  yearTo.value = undefined
  page.value = 1
  void updateSearchRoute()
}

const applyFilters = (): void => {
  page.value = 1
  void updateSearchRoute()
}

const onPageChange = (next: number): void => {
  void router.push({ path: route.path, query: { ...route.query, page: next > 1 ? String(next) : undefined } })
}

const updateSearchRoute = async (): Promise<void> => {
  const query = {
    q: queryText.value.trim() || undefined,
    author: selectedAuthorId.value || undefined,
    type: selectedPaperType.value === undefined ? undefined : String(selectedPaperType.value),
    sort: selectedSort.value,
    from: yearFrom.value === undefined ? undefined : String(yearFrom.value),
    to: yearTo.value === undefined ? undefined : String(yearTo.value),
    page: page.value > 1 ? String(page.value) : undefined,
  }
  const target = { path: route.path, query }
  if (router.resolve(target).fullPath === route.fullPath) await loadPapers()
  else await router.push(target)
}

let authorRequestId = 0
const handleAuthorSearch = async (keyword: string): Promise<void> => {
  const currentRequest = ++authorRequestId
  isAuthorLoading.value = true
  try {
    const response = await searchAuthors(keyword.trim() || undefined, 20, 0)
    if (currentRequest === authorRequestId) authorOptions.value = response.items
  } catch {
    if (currentRequest === authorRequestId) authorOptions.value = []
  } finally {
    if (currentRequest === authorRequestId) isAuthorLoading.value = false
  }
}

const buildPresetParams = async (currentRequest: number): Promise<Partial<ListPapersParams>> => {
  const routeName = route.name
  const routeParams = { ...route.params }
  currentInstitutionSlug.value = ''
  currentInstitution.value = null
  pageScope.value = { kind: 'default' }

  if (routeName === 'InstitutionPapers' || routeName === 'InstitutionCollegePapers') {
    const institution = await getInstitution(String(routeParams.slug ?? ''))
    if (currentRequest !== requestId) return {}
    currentInstitution.value = institution
    currentInstitutionSlug.value = institution.slug

    const college = routeName === 'InstitutionCollegePapers'
      ? String(routeParams.collegeSlug ?? '').trim()
      : ''

    pageScope.value = college
      ? { kind: 'institutionCollege', institutionName: institution.name, college }
      : { kind: 'institution', name: institution.name }

    return {
      institution_id: institution.id,
      college: college || undefined,
    }
  }

  if (routeName === 'LabPapers') {
    const lab = await getLab(String(routeParams.slug ?? ''))
    if (currentRequest !== requestId) return {}
    pageScope.value = { kind: 'lab', name: lab.name }
    return {
      lab_id: lab.id,
    }
  }

  if (routeName === 'ScholarPapers') {
    const scholar = await getScholar(String(routeParams.id ?? ''))
    if (currentRequest !== requestId) return {}
    pageScope.value = { kind: 'scholar', name: scholar.name }
    return {
      scholar_id: scholar.id,
    }
  }

  return {}
}

let requestId = 0
onBeforeUnmount(() => {
  requestId++
  authorRequestId++
})
const loadPapers = async (): Promise<void> => {
  const currentRequest = ++requestId
  isLoading.value = true
  loadError.value = ''

  try {
    const presetParams = await buildPresetParams(currentRequest)
    if (currentRequest !== requestId) return
    const params: ListPapersParams = {
      ...presetParams,
      q: queryText.value.trim() || undefined,
      author_id: selectedAuthorId.value || undefined,
      paper_type: selectedPaperType.value,
      year_from: yearFrom.value,
      year_to: yearTo.value,
      sort: selectedSort.value,
      limit: pageSize,
      offset: (page.value - 1) * pageSize,
    }

    const [paperResponse, bookmarkResponse] = await Promise.all([
      listPapers(params),
      isLoggedIn.value
        ? listBookmarks(100, 0, false).catch(() => ({ items: [], total: 0 }))
        : Promise.resolve({ items: [], total: 0 }),
    ])
    if (currentRequest !== requestId) return

    papers.value = paperResponse.items
    total.value = paperResponse.total
    bookmarkSet.value = new Set(bookmarkResponse.items.map((item) => item.paperId))
  } catch (error) {
    if (currentRequest !== requestId) return
    papers.value = []
    total.value = 0
    loadError.value = getErrorMessage(error, t('papersPage.listLoadFailed'))
  } finally {
    if (currentRequest === requestId) isLoading.value = false
  }
}

const toggleBookmark = async (paperId: string): Promise<void> => {
  if (!isLoggedIn.value) {
    window.dispatchEvent(new CustomEvent('auth:open-login', {
      detail: { returnTo: route.fullPath },
    }))
    return
  }

  const next = new Set(bookmarkSet.value)
  const isBookmarked = next.has(paperId)

  if (isBookmarked) {
    next.delete(paperId)
  } else {
    next.add(paperId)
  }
  bookmarkSet.value = next

  try {
    if (isBookmarked) {
      await removeBookmark(paperId)
      Message.success(t('paperDetail.bookmarkRemoved'))
    } else {
      await addBookmark(paperId)
      Message.success(t('paperDetail.bookmarkAdded'))
    }
  } catch (error) {
    const rollback = new Set(bookmarkSet.value)
    if (isBookmarked) {
      rollback.add(paperId)
    } else {
      rollback.delete(paperId)
    }
    bookmarkSet.value = rollback
    Message.error(getErrorMessage(error, t('papersPage.bookmarkActionFailed')))
  }
}

watch(token, (nextToken, previousToken) => {
  if (!nextToken) {
    bookmarkSet.value = new Set()
    return
  }

  if (!previousToken) {
    void loadPapers()
  }
})

watch(
  () => route.fullPath,
  () => {
    if (!['Papers', 'InstitutionPapers', 'InstitutionCollegePapers', 'LabPapers', 'ScholarPapers'].includes(String(route.name))) return
    const numberQuery = (key: string, min: number, max: number): number | undefined => {
      const value = typeof route.query[key] === 'string' && route.query[key].trim() ? Number(route.query[key]) : NaN
      return Number.isInteger(value) && value >= min && value <= max ? value : undefined
    }
    page.value = numberQuery('page', 1, 100000) ?? 1
    queryText.value = typeof route.query.q === 'string' ? route.query.q : ''
    selectedAuthorId.value = typeof route.query.author === 'string' ? route.query.author : ''
    selectedPaperType.value = numberQuery('type', 0, 5)
    selectedSort.value = route.query.sort === 'citations' || route.query.sort === 'latest' || route.query.sort === 'relevance'
      ? route.query.sort : queryText.value.trim() ? 'relevance' : 'latest'
    yearFrom.value = numberQuery('from', 1900, 2100)
    yearTo.value = numberQuery('to', 1900, 2100)
    if (filterCount.value) filtersExpanded.value = true
    void Promise.all([
      loadPapers(),
      handleAuthorSearch(''),
    ])
  },
  { immediate: true },
)
</script>

<style lang="sass" scoped>
.papers-page
  padding: 26px 0 48px

.papers-container
  width: 1120px
  max-width: 100%
  margin: 0 auto
  box-sizing: border-box
  padding: 0 24px

.papers-hero
  color: var(--scholar-text-primary)

.papers-eyebrow
  font-size: 12px
  letter-spacing: 0.22em
  text-transform: uppercase
  color: var(--scholar-text-secondary)

.papers-title
  margin: 0
  font-size: 30px
  font-weight: 700
  line-height: 1.18

.papers-subtitle
  max-width: 760px
  margin: 12px 0 0
  font-size: 14px
  line-height: 1.7
  color: var(--scholar-text-secondary)

.scope-chip-list
  display: flex
  flex-wrap: wrap
  gap: 10px
  margin-top: 18px

.scope-chip
  padding: 7px 12px
  border-radius: 999px
  background: var(--scholar-primary-light)
  color: var(--scholar-primary)
  font-size: 12px

.papers-search-row
  display: flex
  gap: 12px
  align-items: center
  margin-top: 22px

.papers-search-input
  flex: 1
  min-width: 0

.papers-search-input :deep(.arco-input-wrapper)
  min-height: 48px
  border-radius: 14px
  border: 1px solid var(--scholar-border-input)

.filter-toolbar
  display: flex
  align-items: center
  justify-content: space-between
  margin-top: 12px

.filter-toggle
  min-height: 44px
  padding: 0
  border: 0
  background: transparent
  color: var(--scholar-primary)
  cursor: pointer
  font: inherit

.filter-toggle:focus-visible, .browse-chip:focus-visible, .paper-bookmark:focus-visible
  outline: 2px solid var(--scholar-primary)
  outline-offset: 3px

.papers-search-btn
  min-width: 90px
  height: 48px
  border-radius: 14px

.papers-filter-grid
  display: grid
  grid-template-columns: repeat(6, minmax(0, 1fr))
  gap: 12px
  margin-top: 14px

.papers-filter-control
  width: 100%

.papers-filter-control :deep(.arco-select-view),
.papers-filter-control :deep(.arco-input-wrapper),
.papers-filter-control :deep(.arco-input-number)
  min-height: 44px
  border-radius: 12px

.papers-filter-reset
  height: 44px
  border-radius: 12px

.option-meta
  color: #98a2b3

.browse-section
  margin-top: 22px
  padding: 22px 24px
  border-radius: 12px
  background: #fff
  border: 1px solid rgba(15, 47, 87, 0.08)

.section-head
  display: flex
  align-items: flex-start
  justify-content: space-between
  gap: 16px
  margin-bottom: 16px

.section-title
  margin: 0
  font-size: 20px
  color: #1f2937

.section-subtitle
  margin: 8px 0 0
  font-size: 14px
  color: #667085

.browse-group + .browse-group
  margin-top: 16px

.browse-label
  font-size: 13px
  font-weight: 600
  color: #667085

.browse-chip-list
  display: flex
  flex-wrap: wrap
  gap: 10px
  margin-top: 10px

.browse-chip
  display: inline-flex
  align-items: center
  min-height: 36px
  padding: 0 14px
  border-radius: 999px
  background: #eef4ff
  color: #0f62fe
  text-decoration: none
  font-size: 13px
  font-weight: 600

.papers-meta
  margin: 22px 0 12px
  font-size: 14px
  color: #667085

.papers-meta-num
  color: #0f2f57
  font-weight: 700

.papers-list
  display: flex
  flex-direction: column
  gap: 16px

.paper-shell
  padding: 18px
  border-radius: 12px
  background: #fff
  border: 1px solid rgba(15, 47, 87, 0.08)

.paper-shell-head
  display: flex
  align-items: center
  justify-content: space-between
  gap: 12px
  margin-bottom: 10px

.paper-badges
  display: flex
  flex-wrap: wrap
  gap: 8px

.paper-badge
  padding: 6px 10px
  border-radius: 999px
  background: #eef4ff
  color: #0f62fe
  font-size: 12px
  font-weight: 600

.paper-badge--muted
  background: #f4f6f8
  color: #667085

.paper-link
  text-decoration: none

.paper-bookmark
  min-width: 44px
  height: 44px
  border-radius: 50%
  border: 1px solid rgba(15, 47, 87, 0.1)
  background: #fff
  display: inline-flex
  align-items: center
  justify-content: center
  cursor: pointer

.paper-bookmark-icon
  color: #98a2b3
  font-size: 18px

.paper-bookmark-icon--active
  color: #0f62fe

.paper-foot
  display: flex
  justify-content: flex-end
  margin-top: 10px

.paper-foot-meta
  display: flex
  flex-wrap: wrap
  gap: 8px 12px
  font-size: 12px
  color: #667085

.papers-pagination
  display: flex
  justify-content: center
  margin-top: 22px

.papers-state, .section-state
  min-height: 160px
  display: flex
  flex-direction: column
  gap: 12px
  align-items: center
  justify-content: center
  color: #667085
  text-align: center

.section-state--compact
  min-height: 0
  justify-content: flex-start
  text-align: left

@media (max-width: 960px)
  .papers-filter-grid
    grid-template-columns: repeat(2, minmax(0, 1fr))

@media (max-width: 768px)
  .papers-container
    padding: 0 18px

  .papers-title
    font-size: 28px

  .section-head
    flex-direction: column

  .papers-search-row
    flex-direction: column

  .papers-search-btn
    width: 100%

  .papers-search-input
    width: 100%

  .papers-filter-grid
    grid-template-columns: minmax(0, 1fr)

  .paper-shell-head
    align-items: flex-start
</style>
