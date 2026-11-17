<template>
  <div class="theses-page">
    <PaperLibraryNavigation active="theses" />
    <header class="page-header">
      <div>
        <h1>{{ $t('paperLibrary.theses') }}</h1>
        <p class="page-description">{{ $t('paperLibrary.thesesScope') }}</p>
      </div>
      <div class="header-actions">
        <router-link to="/theses/mine" class="secondary-btn">{{ $t('degreeTheses.myTheses') }}</router-link>
        <router-link to="/theses/submit" class="primary-btn">{{ $t('degreeTheses.submitThesis') }}</router-link>
      </div>
    </header>

    <form class="search-panel" role="search" :aria-label="$t('paperLibrary.thesisSearch')" @submit.prevent="runSearch">
      <label class="search-label" for="thesis-search">{{ $t('paperLibrary.thesisSearch') }}</label>
      <div class="search-row">
        <input id="thesis-search" v-model="query.q" class="search-input" type="search" :placeholder="$t('degreeTheses.searchPlaceholder')" />
        <button class="primary-btn" type="submit">{{ $t('common.search') }}</button>
      </div>
      <div class="filter-toolbar">
        <button class="text-btn" type="button" :aria-expanded="filtersExpanded" aria-controls="thesis-filters" @click="filtersExpanded = !filtersExpanded">
          {{ $t('paperLibrary.filters') }}<span v-if="filterCount"> ({{ filterCount }})</span>
          <span aria-hidden="true">{{ filtersExpanded ? ' −' : ' +' }}</span>
        </button>
        <button class="text-btn" type="button" @click="resetFilters">{{ $t('papersPage.resetFilters') }}</button>
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
      <article v-for="thesis in items" :key="thesis.id" class="thesis-card">
        <div class="thesis-main">
          <div class="record-meta">
            <span class="type-badge">{{ thesis.published_version?.degree_category }}</span>
            <span>{{ thesis.published_version?.award_year }}</span>
            <span class="record-code">{{ thesis.record_code }}</span>
          </div>
          <h2><router-link :to="`/theses/${thesis.record_code}`">{{ thesis.published_version?.title }}</router-link></h2>
          <p v-if="thesis.published_version?.title_en" class="title-en">{{ thesis.published_version.title_en }}</p>
          <div class="metadata-row">
            <span>{{ thesis.published_version?.author_name }}</span>
            <span>{{ thesis.published_version?.training_unit }}</span>
            <span>{{ thesis.published_version?.major }}</span>
          </div>
          <p class="abstract">{{ thesis.published_version?.abstract || $t('common.noAbstract') }}</p>
          <div v-if="thesis.published_version?.keywords.length" class="tags">
            <span v-for="keyword in thesis.published_version.keywords.slice(0, 6)" :key="keyword">{{ keyword }}</span>
          </div>
        </div>
        <router-link :to="`/theses/${thesis.record_code}`" class="detail-link" :aria-label="$t('paperLibrary.viewThesis', { title: thesis.published_version?.title })">
          {{ $t('degreeTheses.viewDetail') }} <span aria-hidden="true">→</span>
        </router-link>
      </article>
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
const hasSearch = computed(() => Object.values(route.query).some(Boolean))
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
.theses-page { width: 1120px; max-width: 100%; box-sizing: border-box; margin: 0 auto; padding: 26px 24px 48px; }
.page-header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; margin-bottom: 24px; }
h1 { margin: 0; font-size: 30px; line-height: 1.3; color: var(--scholar-text-primary); }
.page-description { max-width: 660px; margin: 12px 0 0; color: var(--scholar-text-secondary); line-height: 1.7; }
.header-actions { display: flex; gap: 10px; flex-wrap: wrap; flex-shrink: 0; }
.primary-btn, .secondary-btn { display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; min-height: 42px; border-radius: 8px; padding: 10px 16px; text-decoration: none; font-size: 14px; font-weight: 600; cursor: pointer; }
.primary-btn { border: 1px solid var(--scholar-primary); background: var(--scholar-primary); color: #fff; }
.secondary-btn { border: 1px solid var(--scholar-border-input); color: var(--scholar-text-primary); background: #fff; }
.search-panel { background: #fff; border: 1px solid var(--scholar-border-light); border-radius: 14px; padding: 24px; margin-bottom: 24px; }
.search-label { display: block; margin-bottom: 10px; font-size: 14px; font-weight: 600; color: var(--scholar-text-primary); }
.search-row { display: flex; gap: 12px; }
.search-input, .filter-select { width: 100%; min-width: 0; min-height: 44px; box-sizing: border-box; border: 1px solid var(--scholar-border-input); border-radius: 8px; padding: 0 12px; color: var(--scholar-text-primary); background: #fff; font: inherit; }
.search-row .primary-btn { flex-shrink: 0; min-width: 88px; }
.filter-toolbar { display: flex; justify-content: space-between; gap: 12px; margin-top: 8px; }
.text-btn { padding: 10px 0; min-height: 44px; border: 0; background: none; color: var(--scholar-primary); cursor: pointer; font: inherit; font-size: 14px; }
.filter-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin-top: 10px; padding-top: 18px; border-top: 1px solid var(--scholar-border-light); }
.filter-grid label { display: grid; gap: 8px; color: var(--scholar-text-secondary); font-size: 13px; }
.apply-filters { justify-self: start; }
.filter-hint { grid-column: 1 / -1; color: var(--scholar-text-secondary); margin: 0; font-size: 13px; }
.results-summary { margin: 0 0 16px; color: var(--scholar-text-secondary); font-size: 14px; }
.state-card { padding: 48px 20px; text-align: center; background: #fff; border: 1px solid var(--scholar-border-light); border-radius: 12px; color: var(--scholar-text-secondary); }
.state-card h2 { font-size: 18px; color: var(--scholar-text-primary); }
.state-card p { line-height: 1.7; margin-bottom: 20px; }
.state-card--error { border-color: #f2cccc; }
.thesis-list { display: grid; gap: 16px; }
.thesis-card { display: flex; gap: 24px; align-items: center; padding: 24px; border: 1px solid var(--scholar-border-light); border-radius: 12px; background: #fff; }
.thesis-card:hover { border-color: var(--scholar-primary); }
.thesis-main { min-width: 0; flex: 1; overflow-wrap: anywhere; }
.record-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; color: var(--scholar-text-secondary); font-size: 12px; }
.type-badge { padding: 4px 10px; border-radius: 6px; background: var(--scholar-primary-light); color: var(--scholar-primary); }
.record-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.thesis-main h2 { margin: 12px 0 0; font-size: 19px; line-height: 1.6; }
.thesis-main h2 a { color: var(--scholar-text-primary); text-decoration: none; }
.thesis-main h2 a:hover { color: var(--scholar-primary); }
.title-en { margin: 4px 0; color: var(--scholar-text-secondary); font-size: 14px; }
.metadata-row { display: flex; flex-wrap: wrap; gap: 6px 16px; margin: 12px 0; color: var(--scholar-text-secondary); font-size: 14px; }
.abstract { color: var(--scholar-text-secondary); font-size: 14px; line-height: 1.8; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.tags { display: flex; flex-wrap: wrap; gap: 8px; }
.tags span { background: var(--scholar-bg-sidebar); color: var(--scholar-text-secondary); border-radius: 6px; padding: 4px 8px; font-size: 12px; }
.detail-link { flex-shrink: 0; display: inline-flex; align-items: center; gap: 8px; min-height: 44px; color: var(--scholar-primary); text-decoration: none; font-size: 14px; }
.pagination { display: flex; justify-content: center; align-items: center; gap: 16px; margin-top: 28px; color: var(--scholar-text-secondary); font-size: 14px; }
.pagination button:disabled { opacity: .5; cursor: not-allowed; }
a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--scholar-primary); outline-offset: 3px; }
@media (max-width: 1000px) { .page-header { flex-direction: column; } .filter-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 640px) {
  .theses-page { padding: 24px 16px 48px; }
  h1 { font-size: 26px; }
  .header-actions { width: 100%; }
  .header-actions a { flex: 1; padding: 10px 8px; }
  .search-panel { padding: 18px 16px; }
  .filter-grid { grid-template-columns: 1fr; }
  .thesis-card { padding: 20px; flex-direction: column; align-items: stretch; gap: 4px; }
  .detail-link { align-self: flex-start; }
  .pagination { flex-wrap: wrap; gap: 12px; }
  .pagination > span { order: -1; width: 100%; text-align: center; }
}
</style>
