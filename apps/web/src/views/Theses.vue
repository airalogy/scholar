<template>
  <div class="theses-page">
    <PaperLibraryNavigation active="theses" heading :hint="$t('paperLibrary.thesesScope')">
      <template #actions>
        <router-link to="/theses/mine" class="header-link">{{ $t('degreeTheses.myTheses') }}</router-link>
        <router-link to="/theses/submit" class="secondary-btn">{{ $t('degreeTheses.submitThesis') }}</router-link>
      </template>
    </PaperLibraryNavigation>

    <form class="search-panel" role="search" :aria-label="$t('paperLibrary.thesisSearch')" @submit.prevent="runSearch">
      <div class="search-row">
        <input id="thesis-search" v-model="query.q" class="search-input" type="search" :aria-label="$t('paperLibrary.thesisSearch')" :placeholder="$t('degreeTheses.searchPlaceholder')" />
        <button class="primary-btn" type="submit">{{ $t('common.search') }}</button>

        <button class="secondary-btn" type="button" :aria-expanded="filtersExpanded" aria-controls="thesis-filters" @click="filtersExpanded = !filtersExpanded">
          {{ $t('paperLibrary.filters') }}<span v-if="filterCount"> ({{ filterCount }})</span>
          <span aria-hidden="true">{{ filtersExpanded ? ' −' : ' +' }}</span>
        </button>
        <button v-if="canReset" class="text-btn" type="button" @click="resetFilters">{{ $t('papersPage.resetFilters') }}</button>
      </div>
      <div v-show="filtersExpanded" id="thesis-filters" class="filter-grid">
        <label>{{ $t('degreeTheses.awardYearLabel') }}
          <select v-model="query.award_year" class="filter-select">
            <option value="">{{ $t('degreeTheses.allYears') }}</option>
            <option v-for="year in yearOptions" :key="year" :value="String(year)">{{ year }}</option>
          </select>
        </label>
        <label>{{ $t('degreeTheses.trainingUnitLabel') }}
          <select v-model="query.training_unit" class="filter-select">
            <option value="">{{ $t('degreeTheses.allUnits') }}</option>
            <option v-for="unit in withSelected(facets.training_units, query.training_unit)" :key="unit" :value="unit">{{ unit }}</option>
          </select>
        </label>
        <label>{{ $t('degreeTheses.degreeCategoryLabel') }}
          <select v-model="query.degree_category" class="filter-select">
            <option value="">{{ $t('degreeTheses.allDegreeCategories') }}</option>
            <option v-for="degree in withSelected(facets.degree_categories, query.degree_category)" :key="degree" :value="degree">{{ degree }}</option>
          </select>
        </label>
        <label>{{ $t('degreeTheses.majorLabel') }}
          <select v-model="query.major" class="filter-select">
            <option value="">{{ $t('degreeTheses.allMajors') }}</option>
            <option v-for="major in withSelected(facets.majors, query.major)" :key="major" :value="major">{{ major }}</option>
          </select>
        </label>
        <p v-if="facetsError" class="filter-hint">{{ $t('paperLibrary.facetsUnavailable') }}</p>
        <button class="secondary-btn apply-filters" type="submit">{{ $t('paperLibrary.applyFilters') }}</button>
      </div>
    </form>

    <div class="results-summary" role="status" aria-live="polite">
      {{ loading ? $t('common.loading') : $t('papersPage.totalResults', { count: total }) }}
    </div>
    <div v-if="loading" class="state-card" aria-busy="true">{{ $t('common.loading') }}</div>
    <div v-else-if="errorMessage" class="state-card state-card--error" role="alert">
      <h2>{{ $t('degreeTheses.loadFailed') }}</h2>
      <button class="secondary-btn" type="button" @click="loadTheses">{{ $t('paperLibrary.retry') }}</button>
    </div>
    <div v-else-if="!items.length" class="state-card">
      <h2>{{ hasSearch ? $t('paperLibrary.noMatches') : $t('degreeTheses.empty') }}</h2>
      <p>{{ $t('paperLibrary.emptyHint') }}</p>
      <button v-if="hasSearch" class="secondary-btn" type="button" @click="resetFilters">{{ $t('papersPage.resetFilters') }}</button>
    </div>
    <section v-else class="thesis-list" :aria-label="$t('paperLibrary.theses')">
      <PaperInfoCard v-for="thesis in items" :key="thesis.id" :to="`/theses/${thesis.record_code}`"
        :title="thesis.published_version?.title || thesis.record_code" :subtitle="thesis.published_version?.title_en"
        :byline="thesisByline(thesis)" :abstract="thesis.published_version?.abstract"
        :details="thesisDetails(thesis)" :keywords="thesis.published_version?.keywords.slice(0, 6) ?? []"
      />
    </section>
    <nav v-if="!loading && !errorMessage && total > pageSize" class="pagination" :aria-label="$t('degreeTheses.paginationLabel')">
      <button class="secondary-btn" type="button" :disabled="offset === 0" @click="changePage(-1)">{{ $t('degreeTheses.previousPage') }}</button>
      <span>{{ $t('degreeTheses.pageSummary', { current: currentPage, total: pageCount, count: total }) }}</span>
      <button class="secondary-btn" type="button" :disabled="offset + pageSize >= total" @click="changePage(1)">{{ $t('degreeTheses.nextPage') }}</button>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PaperInfoCard from '@/components/PaperInfoCard.vue'
import PaperLibraryNavigation from '@/components/PaperLibraryNavigation.vue'
import { getDegreeThesisFacets, listDegreeTheses, type DegreeThesis, type DegreeThesisFacets } from '@/api/theses'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const errorMessage = ref(false)
const facetsError = ref(false)
const filtersExpanded = ref(false)
const items = ref<DegreeThesis[]>([])
const total = ref(0)
const offset = ref(0)
const pageSize = 20
const facets = ref<DegreeThesisFacets>({ training_units: [], majors: [], degree_categories: [], award_years: [] })
const query = reactive({ q: '', award_year: '', training_unit: '', degree_category: '', major: '' })
const filterCount = computed(() => [query.award_year, query.training_unit, query.degree_category, query.major].filter(Boolean).length)
const hasSearch = computed(() => ['q', 'year', 'unit', 'degree', 'major'].some((key) => route.query[key]))
const canReset = computed(() => Boolean(hasSearch.value || query.q.trim() || filterCount.value))
const thesisByline = (thesis: DegreeThesis): string[] => {
  const v = thesis.published_version
  return v ? [v.author_name, v.training_unit, v.major, v.award_year ? String(v.award_year) : ''].filter((item): item is string => Boolean(item)) : []
}
const thesisDetails = (thesis: DegreeThesis): string[] => [thesis.published_version?.degree_category || '', thesis.record_code].filter(Boolean)
const currentPage = computed(() => Math.floor(offset.value / pageSize) + 1)
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
const withSelected = (values: string[], selected: string): string[] => [...new Set([...values, ...(selected ? [selected] : [])])]
const yearOptions = computed(() => [...new Set([...facets.value.award_years, ...(query.award_year ? [Number(query.award_year)] : [])])].sort((a, b) => b - a))
let requestId = 0
onBeforeUnmount(() => { requestId++ })

const loadTheses = async (): Promise<void> => {
  const currentRequest = ++requestId
  loading.value = true
  errorMessage.value = false
  try {
    const result = await listDegreeTheses({
      q: query.q.trim() || undefined,
      training_unit: query.training_unit || undefined,
      degree_category: query.degree_category || undefined,
      major: query.major || undefined,
      year_from: query.award_year ? Number(query.award_year) : undefined,
      year_to: query.award_year ? Number(query.award_year) : undefined,
      limit: pageSize,
      offset: offset.value,
    })
    if (currentRequest !== requestId) return
    items.value = result.items
    total.value = result.total
    if (offset.value > 0 && offset.value >= result.total) {
      offset.value = 0
      await updateSearchRoute()
    }
  } catch {
    if (currentRequest !== requestId) return
    items.value = []
    total.value = 0
    errorMessage.value = true
  } finally {
    if (currentRequest === requestId) loading.value = false
  }
}

const updateSearchRoute = async (): Promise<void> => {
  const target = {
    path: '/theses',
    query: {
      q: query.q.trim() || undefined,
      year: query.award_year || undefined,
      unit: query.training_unit || undefined,
      degree: query.degree_category || undefined,
      major: query.major || undefined,
      page: currentPage.value > 1 ? String(currentPage.value) : undefined,
    },
  }
  if (router.resolve(target).fullPath === route.fullPath) await loadTheses()
  else await router.push(target)
}

const runSearch = (): void => {
  offset.value = 0
  void updateSearchRoute()
}
const resetFilters = (): void => {
  Object.assign(query, { q: '', award_year: '', training_unit: '', degree_category: '', major: '' })
  runSearch()
}
const changePage = (direction: -1 | 1): void => {
  const nextOffset = offset.value + direction * pageSize
  if (nextOffset < 0 || nextOffset >= total.value) return
  void router.push({ path: '/theses', query: { ...route.query, page: nextOffset > 0 ? String(nextOffset / pageSize + 1) : undefined } })
}

watch(() => route.fullPath, () => {
  if (route.name !== 'Theses') return
  const text = (key: string): string => typeof route.query[key] === 'string' ? route.query[key] : ''
  const year = Number(text('year'))
  const page = Number(text('page'))
  Object.assign(query, {
    q: text('q'), training_unit: text('unit'), degree_category: text('degree'), major: text('major'),
    award_year: Number.isInteger(year) && year >= 1900 && year <= 2100 ? String(year) : '',
  })
  offset.value = Number.isInteger(page) && page >= 1 && page <= 100000 ? (page - 1) * pageSize : 0
  if (filterCount.value) filtersExpanded.value = true
  void loadTheses()
}, { immediate: true })

onMounted(async (): Promise<void> => {
  try { facets.value = await getDegreeThesisFacets() } catch { facetsError.value = true }
})
</script>

<style scoped>
.theses-page { width: 100%; max-width: 1080px; margin: 0 auto; padding: 22px 24px 40px; box-sizing: border-box; color: var(--scholar-text-1); }
.primary-btn, .secondary-btn, .text-btn, .header-link { display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; min-height: 44px; border-radius: 8px; padding: 0 14px; border: 1px solid var(--scholar-border-input); background: white; color: var(--scholar-text-2); font: inherit; text-decoration: none; cursor: pointer; }
.primary-btn { color: white; background: var(--scholar-primary); border-color: var(--scholar-primary); font-weight: 600; }
.secondary-btn[aria-expanded="true"] { border-color: var(--scholar-primary); color: var(--scholar-primary); }
.text-btn, .header-link { color: var(--scholar-primary); background: transparent; border-color: transparent; }
.header-link { padding: 0 2px; }
.header-link:hover { text-decoration: underline; }
.search-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.search-input, .filter-select { min-width: 0; min-height: 44px; box-sizing: border-box; border: 1px solid var(--scholar-border-input); border-radius: 8px; padding: 0 12px; color: var(--scholar-text-1); background: white; font: inherit; }
.search-input { flex: 1 1 220px; }
.filter-select { width: 100%; }
.filter-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); align-items: end; gap: 8px; margin-top: 8px; padding: 12px; border-radius: 8px; background: var(--scholar-bg-sidebar); }
.filter-grid label { display: grid; gap: 4px; font-size: 13px; color: var(--scholar-text-2); }
.filter-hint { grid-column: 1 / -1; margin: 0; color: var(--scholar-text-desc); }
.results-summary { display: flex; align-items: center; min-height: 44px; margin-top: 10px; color: var(--scholar-text-2); font-size: 13px; }
.state-card { padding: 32px 12px; border-top: 1px solid var(--scholar-divider); text-align: center; color: var(--scholar-text-2); }
.state-card h2 { color: var(--scholar-text-1); font-size: 18px; }
.pagination { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 8px 12px; margin-top: 18px; color: var(--scholar-text-2); }
.pagination button:disabled { opacity: .55; cursor: not-allowed; }
:where(input, button, select, a):focus-visible { outline: 2px solid var(--scholar-primary); outline-offset: 2px; }
@media (max-width: 640px) {
  .theses-page { padding: 16px 12px 32px; }
  .search-input { flex-basis: 100%; }
  .filter-grid { grid-template-columns: 1fr; }
  .pagination > span { order: -1; width: 100%; text-align: center; }
}
</style>
