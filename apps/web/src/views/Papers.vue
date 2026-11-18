<template>
  <div class="papers-page">
    <div class="papers-container">
      <PaperLibraryNavigation v-if="isLibraryHome" active="publications" heading
        :context="currentInstitution?.name"
        :hint="features.degreeTheses ? $t('paperLibrary.publicationsScope') : pageSubtitle"
      />
      <header v-else class="scope-header">
        <h1>{{ pageTitle }}</h1>
        <p>{{ pageSubtitle }}</p>
      </header>
      <form role="search" :aria-label="$t('paperLibrary.publications')" @submit.prevent="applyFilters">
        <div class="papers-search-row">
          <input v-model="queryText" class="papers-search-input" type="search"
            :placeholder="$t('papersPage.searchPlaceholder')" :aria-label="$t('papersPage.searchPlaceholder')"
          />
          <button type="submit" class="search-btn">{{ $t('common.search') }}</button>
          <button type="button" class="filter-toggle" :aria-expanded="filtersExpanded" aria-controls="publication-filters" @click="filtersExpanded = !filtersExpanded">
            {{ $t('paperLibrary.filters') }}<span v-if="filterCount"> ({{ filterCount }})</span>
            <span aria-hidden="true">{{ filtersExpanded ? '−' : '+' }}</span>
          </button>
          <button v-if="canReset" type="button" class="reset-btn" @click="resetFilters">{{ $t('papersPage.resetFilters') }}</button>
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

          <button type="submit" class="filter-toggle">{{ $t('paperLibrary.applyFilters') }}</button>
        </div>
      </form>

      <details v-if="institutionQuickBrowse.colleges.length || institutionQuickBrowse.labs.length" class="browse-section">
        <summary>{{ $t('papersPage.organizedBrowseTitle') }}</summary>
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
      </details>

      <div class="results-toolbar">
        <span role="status" aria-live="polite">{{ isLoading ? $t('common.loading') : $t('papersPage.totalResults', { count: total }) }}</span>
        <label class="sort-control">{{ $t('papersPage.sortPlaceholder') }}
          <select :value="selectedSort" @change="changeSort">
            <option value="latest">{{ $t('papersPage.sort.latest') }}</option>
            <option value="citations">{{ $t('papersPage.sort.citations') }}</option>
            <option value="relevance">{{ $t('papersPage.sort.relevance') }}</option>
          </select>
        </label>
      </div>
      <div v-if="isLoading" class="papers-state">{{ $t('common.loading') }}</div>
      <div v-else-if="loadError" class="papers-state" role="alert">
        <p>{{ loadError }}</p>
        <a-button @click="loadPapers">{{ $t('paperLibrary.retry') }}</a-button>
      </div>
      <div v-else-if="!papers.length" class="papers-state">
        <p>{{ $t('papersPage.empty') }}</p>
        <a-button v-if="canReset" @click="resetFilters">{{ $t('papersPage.resetFilters') }}</a-button>
      </div>

      <div v-else class="papers-list">
        <PaperInfoCard v-for="paper in papers" :key="paper.id" :to="`/papers/${paper.id}`"
          :title="paper.title" :byline="paperByline(paper)" :abstract="paper.abstract"
          :details="paperDetails(paper)" :keywords="paper.keywords.slice(0, 5)"
        >
          <template #action>
            <button class="paper-bookmark" type="button" :aria-pressed="bookmarkSet.has(paper.id)"
              :aria-label="bookmarkSet.has(paper.id) ? $t('paperDetail.removeBookmarkAria') : $t('paperDetail.addBookmarkAria')"
              @click="toggleBookmark(paper.id)"
            ><IconBookmark aria-hidden="true" /></button>
          </template>
        </PaperInfoCard>
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
import PaperInfoCard from '@/components/PaperInfoCard.vue'
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

const paperByline = (paper: PaperResponse): string[] => [
  paper.authors.map((author) => author.name).join(locale.value === 'zh-CN' ? '、' : ', '),
  paper.journal_name || '',
  hasPublishYear(paper.publish_year) ? String(paper.publish_year) : '',
].filter(Boolean)

const paperDetails = (paper: PaperResponse): string[] => [
  paper.paper_type != null ? getPaperTypeLabel(paper.paper_type) : '',
  showPaperSourceBadges.value ? paper.institutionName || '' : '',
  showPaperSourceBadges.value ? paper.labName || '' : '',
  paper.citation_count != null ? t('papersPage.citationCount', { count: paper.citation_count }) : '',
  paper.reviewedAt ? t('common.review.reviewedAt', { date: formatDate(paper.reviewedAt) }) : '',
].filter(Boolean)

const canReset = computed(() => Boolean(queryText.value.trim() || filterCount.value ||
  ['q', 'author', 'type', 'from', 'to'].some((key) => route.query[key]) || selectedSort.value !== 'latest'))

const changeSort = (event: Event): void => {
  const sort = (event.target as HTMLSelectElement).value
  if (sort !== 'latest' && sort !== 'citations' && sort !== 'relevance') return
  void router.push({ path: route.path, query: { ...route.query, sort, page: undefined } })
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
    sort: selectedSort.value === 'latest' && !queryText.value.trim() ? undefined : selectedSort.value,
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

<style scoped>
.papers-container { width: 100%; max-width: 1080px; margin: 0 auto; padding: 22px 24px 40px; box-sizing: border-box; color: var(--scholar-text-1); }
.scope-header { margin-bottom: 12px; }
.scope-header h1 { margin: 0; font-size: clamp(24px, 2vw, 30px); }
.scope-header p { margin: 6px 0 0; color: var(--scholar-text-2); }
.papers-search-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.papers-search-input, .sort-control select { min-width: 0; box-sizing: border-box; background: white; color: var(--scholar-text-1); border: 1px solid var(--scholar-border-input); border-radius: 8px; font: inherit; }
.papers-search-input { flex: 1 1 220px; height: 44px; padding: 0 12px; }
.search-btn, .filter-toggle, .reset-btn { box-sizing: border-box; min-height: 44px; border: 1px solid var(--scholar-border-input); border-radius: 8px; padding: 0 14px; color: var(--scholar-text-2); background: white; font: inherit; cursor: pointer; }
.search-btn { background: var(--scholar-primary); border-color: var(--scholar-primary); color: white; font-weight: 600; }
.filter-toggle[aria-expanded="true"] { border-color: var(--scholar-primary); color: var(--scholar-primary); }
.reset-btn { border-color: transparent; background: transparent; color: var(--scholar-primary); }
.papers-filter-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(128px, 1fr)); align-items: center; gap: 8px; margin-top: 8px; padding: 12px; border-radius: 8px; background: var(--scholar-bg-sidebar); }
.papers-filter-control { width: 100%; min-width: 0; min-height: 44px; }
.papers-filter-control :deep(.arco-input-wrapper) { min-height: 44px; }
.option-meta { color: var(--scholar-text-desc); }
.browse-section { margin-top: 4px; }
.browse-section summary { cursor: pointer; width: fit-content; max-width: 100%; padding: 12px 0; box-sizing: border-box; min-height: 44px; color: var(--scholar-primary); font-weight: 500; }
.browse-group { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 14px; padding-inline-start: 12px; }
.browse-label { font-size: 13px; color: var(--scholar-text-desc); }
.browse-chip-list { display: flex; flex-wrap: wrap; gap: 0 12px; }
.browse-chip { display: inline-flex; align-items: center; min-height: 44px; color: var(--scholar-primary); overflow-wrap: anywhere; }
.results-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px 12px; margin-top: 10px; color: var(--scholar-text-2); font-size: 13px; }
.sort-control { display: inline-flex; align-items: center; gap: 6px; }
.sort-control select { min-height: 44px; border-color: transparent; color: var(--scholar-primary); cursor: pointer; }
.paper-bookmark { flex: 0 0 44px; width: 44px; height: 44px; margin: -8px 0; display: grid; place-items: center; border: 0; border-radius: 8px; background: transparent; color: var(--scholar-text-desc); font-size: 18px; cursor: pointer; }
.paper-bookmark:hover, .paper-bookmark[aria-pressed="true"] { background: var(--scholar-primary-light); color: var(--scholar-primary); }
.paper-bookmark[aria-pressed="true"] svg { fill: currentColor; }
.papers-pagination { display: flex; justify-content: center; margin-top: 18px; }
.papers-state { padding: 32px 12px; border-top: 1px solid var(--scholar-divider); text-align: center; color: var(--scholar-text-2); }
:where(input, button, summary, select, a):focus-visible { outline: 2px solid var(--scholar-primary); outline-offset: 2px; }
@media (max-width: 640px) {
  .papers-container { padding: 16px 12px 32px; }
  .papers-search-input { flex-basis: 100%; }
  .papers-filter-grid { grid-template-columns: 1fr; }
  .papers-pagination :deep(.arco-pagination) { max-width: 100%; flex-wrap: wrap; justify-content: center; row-gap: 4px; }
}
</style>
