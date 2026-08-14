<template>
  <div class="theses-page">
    <header class="page-header">
      <div>
        <h1>{{ $t('degreeTheses.title') }}</h1>
      </div>
      <div class="header-actions">
        <router-link to="/theses/mine" class="secondary-btn">{{ $t('degreeTheses.myTheses') }}</router-link>
        <router-link to="/theses/submit" class="primary-btn">{{ $t('degreeTheses.submitThesis') }}</router-link>
      </div>
    </header>

    <section class="filters">
      <input
        v-model="query.q"
        class="search-input"
        :placeholder="$t('degreeTheses.searchPlaceholder')"
        @keyup.enter="runSearch"
      />
      <select v-model="query.award_year" class="filter-select">
        <option value="">{{ $t('degreeTheses.allYears') }}</option>
        <option v-for="year in facets.award_years" :key="year" :value="String(year)">{{ year }}</option>
      </select>
      <select v-model="query.training_unit" class="filter-select">
        <option value="">{{ $t('degreeTheses.allUnits') }}</option>
        <option v-for="unit in facets.training_units" :key="unit" :value="unit">{{ unit }}</option>
      </select>
      <select v-model="query.degree_category" class="filter-select">
        <option value="">{{ $t('degreeTheses.allDegreeCategories') }}</option>
        <option v-for="degree in facets.degree_categories" :key="degree" :value="degree">{{ degree }}</option>
      </select>
      <select v-model="query.major" class="filter-select">
        <option value="">{{ $t('degreeTheses.allMajors') }}</option>
        <option v-for="major in facets.majors" :key="major" :value="major">{{ major }}</option>
      </select>
      <button class="primary-btn" type="button" @click="runSearch">{{ $t('common.search') }}</button>
    </section>

    <div v-if="loading" class="state-card">{{ $t('common.loading') }}</div>
    <div v-else-if="errorMessage" class="state-card state-card--error">{{ errorMessage }}</div>
    <div v-else-if="!items.length" class="state-card">{{ $t('degreeTheses.empty') }}</div>
    <section v-else class="thesis-list">
      <router-link
        v-for="thesis in items"
        :key="thesis.id"
        :to="`/theses/${thesis.record_code}`"
        class="thesis-card"
      >
        <div class="thesis-year">{{ thesis.published_version?.award_year }}</div>
        <div class="thesis-main">
          <h2>{{ thesis.published_version?.title }}</h2>
          <small class="record-code">{{ thesis.record_code }}</small>
          <p v-if="thesis.published_version?.title_en" class="title-en">
            {{ thesis.published_version.title_en }}
          </p>
          <div class="metadata-row">
            <span>{{ thesis.published_version?.author_name }}</span>
            <span>{{ thesis.published_version?.training_unit }}</span>
            <span>{{ thesis.published_version?.major }}</span>
            <span>{{ thesis.published_version?.degree_category }}</span>
          </div>
          <p class="abstract">{{ thesis.published_version?.abstract || $t('common.noAbstract') }}</p>
          <div class="tags">
            <span v-for="keyword in thesis.published_version?.keywords.slice(0, 6)" :key="keyword">
              {{ keyword }}
            </span>
          </div>
        </div>
      </router-link>
    </section>
    <nav v-if="!loading && !errorMessage && total > pageSize" class="pagination" :aria-label="$t('degreeTheses.paginationLabel')">
      <button class="secondary-btn" type="button" :disabled="offset === 0 || loading" @click="changePage(-1)">
        {{ $t('degreeTheses.previousPage') }}
      </button>
      <span>{{ $t('degreeTheses.pageSummary', { current: currentPage, total: pageCount, count: total }) }}</span>
      <button class="secondary-btn" type="button" :disabled="offset + pageSize >= total || loading" @click="changePage(1)">
        {{ $t('degreeTheses.nextPage') }}
      </button>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  getDegreeThesisFacets,
  listDegreeTheses,
  type DegreeThesis,
  type DegreeThesisFacets,
} from '@/api/theses'

const { t } = useI18n()
const loading = ref(false)
const errorMessage = ref('')
const items = ref<DegreeThesis[]>([])
const total = ref(0)
const offset = ref(0)
const pageSize = 20
const facets = ref<DegreeThesisFacets>({
  training_units: [],
  majors: [],
  degree_categories: [],
  award_years: [],
})
const query = reactive({
  q: '',
  award_year: '',
  training_unit: '',
  degree_category: '',
  major: '',
})
const currentPage = computed(() => Math.floor(offset.value / pageSize) + 1)
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

const getErrorMessage = (error: unknown): string => {
  if (typeof error === 'object' && error && 'response' in error) {
    const response = (error as { response?: { data?: { message?: string } } }).response
    return response?.data?.message || t('degreeTheses.loadFailed')
  }
  return t('degreeTheses.loadFailed')
}

const loadTheses = async (): Promise<void> => {
  loading.value = true
  errorMessage.value = ''
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
    items.value = result.items
    total.value = result.total
  } catch (error) {
    errorMessage.value = getErrorMessage(error)
  } finally {
    loading.value = false
  }
}

const runSearch = (): void => {
  offset.value = 0
  void loadTheses()
}

const changePage = (direction: -1 | 1): void => {
  const nextOffset = offset.value + direction * pageSize
  if (nextOffset < 0 || nextOffset >= total.value) return
  offset.value = nextOffset
  void loadTheses()
}

onMounted(async () => {
  await loadTheses()
  try {
    facets.value = await getDegreeThesisFacets()
  } catch {
    // 列表仍可用时，筛选项加载失败不应覆盖主内容。
  }
})
</script>

<style scoped>
.theses-page { max-width: 1180px; margin: 0 auto; padding: 48px 40px 80px; }
.page-header { display: flex; justify-content: space-between; gap: 32px; align-items: flex-end; margin-bottom: 32px; }
h1 { margin: 0; font-size: 34px; color: var(--scholar-text-primary); }
.header-actions { display: flex; gap: 12px; flex-wrap: wrap; }
.primary-btn, .secondary-btn { border-radius: 8px; padding: 10px 18px; text-decoration: none; font-weight: 600; cursor: pointer; }
.primary-btn { border: 1px solid var(--scholar-primary); background: var(--scholar-primary); color: #fff; }
.secondary-btn { border: 1px solid var(--scholar-border-input); color: var(--scholar-text-primary); background: #fff; }
.filters { display: grid; grid-template-columns: minmax(220px, 2fr) repeat(4, minmax(120px, 1fr)) auto; gap: 12px; background: #fff; border: 1px solid var(--scholar-border-light); border-radius: 12px; padding: 18px; margin-bottom: 24px; }
.search-input, .filter-select { width: 100%; min-width: 0; min-height: 40px; box-sizing: border-box; border: 1px solid var(--scholar-border-input); border-radius: 8px; padding: 0 12px; background: #fff; }
.state-card { padding: 48px; text-align: center; background: #fff; border: 1px solid var(--scholar-border-light); border-radius: 12px; color: var(--scholar-text-secondary); }
.state-card--error { color: #c23b3b; }
.thesis-list { display: grid; gap: 16px; }
.thesis-card { display: grid; grid-template-columns: 82px 1fr; gap: 24px; padding: 24px; border: 1px solid var(--scholar-border-light); border-radius: 12px; background: #fff; color: inherit; text-decoration: none; transition: box-shadow .2s, transform .2s; }
.thesis-card:hover { transform: translateY(-2px); box-shadow: 0 12px 30px rgb(37 55 90 / 8%); }
.thesis-year { color: var(--scholar-primary); font-size: 24px; font-weight: 700; }
.thesis-main h2 { margin: 0; font-size: 20px; line-height: 1.5; }
.record-code { display: inline-block; margin-top: 6px; color: var(--scholar-text-secondary); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.title-en { margin: 5px 0; color: var(--scholar-text-secondary); }
.metadata-row { display: flex; flex-wrap: wrap; gap: 8px 18px; margin: 12px 0; color: var(--scholar-text-secondary); font-size: 14px; }
.abstract { color: var(--scholar-text-secondary); line-height: 1.7; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.tags { display: flex; flex-wrap: wrap; gap: 8px; }
.tags span { background: var(--scholar-primary-light); color: var(--scholar-primary); border-radius: 999px; padding: 4px 10px; font-size: 12px; }
.pagination { display: flex; justify-content: center; align-items: center; gap: 16px; margin-top: 24px; color: var(--scholar-text-secondary); }
.pagination .secondary-btn:disabled { opacity: .5; cursor: not-allowed; }
@media (max-width: 1050px) { .filters { grid-template-columns: repeat(2, minmax(0, 1fr)); } .search-input { grid-column: 1 / -1; } }
@media (max-width: 760px) { .theses-page { padding: 28px 18px 60px; } .page-header { align-items: flex-start; flex-direction: column; } .filters { grid-template-columns: 1fr; } .search-input { grid-column: auto; } .thesis-card { grid-template-columns: 1fr; } .pagination { align-items: stretch; flex-direction: column; text-align: center; } }
</style>
