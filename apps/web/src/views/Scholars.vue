<template>
  <main class="scholars-page">
    <header class="directory-header">
      <p class="directory-kicker">{{ t('scholars.kicker') }}</p>
      <h1>{{ t('scholars.title') }}</h1>
      <p class="directory-intro">{{ t('scholars.intro') }}</p>
      <form class="directory-search" role="search" @submit.prevent="search">
        <label for="scholar-search" class="sr-only">{{ t('scholars.searchPlaceholder') }}</label>
        <input
          id="scholar-search"
          v-model="query"
          type="search"
          maxlength="200"
          :placeholder="t('scholars.searchPlaceholder')"
          @compositionstart="composing = true"
          @compositionend="compositionEnd"
        />
        <button type="submit" class="search-button">{{ t('common.search') }}</button>
      </form>
    </header>

    <div class="directory-layout">
      <aside :aria-label="t('scholars.filters')">
        <ScholarDirectoryFilters
          :units="data?.facets.units ?? []"
          :subjects="data?.facets.subjects ?? []"
          :unit="state.unit"
          :subject="state.subject"
          @select="selectFilter"
        />
      </aside>
      <section class="directory-results" :aria-label="t('scholars.results')" :aria-busy="loading">
        <nav class="alphabet-nav" :aria-label="t('scholars.letterFilter')">
          <span class="alphabet-label">{{ t('scholars.letterFilter') }}</span>
          <div class="alphabet-options">
            <button
              type="button"
              :class="{ active: !state.letter }"
              :aria-pressed="!state.letter"
              @click="update({ letter: '' })"
            >
              {{ t('common.all') }}
            </button>
            <button
              v-for="letter in alphabet"
              :key="letter"
              type="button"
              :class="{ active: state.letter === letter }"
              :aria-pressed="state.letter === letter"
              :aria-label="
                t('scholars.letterCount', {
                  letter: letter === '#' ? t('scholars.otherLetters') : letter,
                  count: letterCounts.get(letter) ?? 0,
                })
              "
              @click="update({ letter })"
            >
              {{ letter === '#' ? t('scholars.otherLetters') : letter }}
            </button>
          </div>
          <p>{{ t('scholars.letterHelp') }}</p>
        </nav>

        <div ref="resultsToolbar" class="results-toolbar" tabindex="-1">
          <p class="result-count" role="status" aria-live="polite">
            {{
              loading
                ? t('common.loading')
                : failed
                  ? t('scholars.loadFailed')
                  : t('scholars.resultCount', { count: data?.total ?? 0 })
            }}
          </p>
          <label class="sort-control"
            >{{ t('scholars.sortLabel') }}
            <select :value="state.sort" @change="changeSort">
              <option value="relevance">{{ t('scholars.sortRelevance') }}</option>
              <option value="name">
                {{ t(data?.nameOrder === 'pinyin' ? 'scholars.sortName' : 'scholars.sortUnicode') }}
              </option>
            </select>
          </label>
        </div>
        <div v-if="hasFilters" class="active-filters" :aria-label="t('scholars.activeFilters')">
          <button
            v-for="chip in chips"
            :key="chip.key"
            type="button"
            :aria-label="t('scholars.removeFilter', { label: chip.label })"
            @click="update({ [chip.key]: '' })"
          >
            {{ chip.label }} <span aria-hidden="true">×</span>
          </button>
          <button type="button" class="clear-filters" @click="reset">
            {{ t('scholars.resetFilters') }}
          </button>
        </div>

        <div v-if="failed" class="directory-state" role="alert">
          <h2>{{ t('scholars.loadFailed') }}</h2>
          <p>{{ t('scholars.loadFailedHint') }}</p>
          <button type="button" @click="refresh">{{ t('scholars.retry') }}</button>
        </div>
        <div v-else-if="loading" class="scholars-grid skeleton-grid" aria-hidden="true">
          <div v-for="item in 6" :key="item" class="skeleton-card"><span /><i /><i /><i /></div>
        </div>
        <div v-else-if="!data?.items.length" class="directory-state">
          <h2>{{ t(hasFilters ? 'scholars.noMatches' : 'scholars.empty') }}</h2>
          <p>{{ t(hasFilters ? 'scholars.noMatchesHint' : 'scholars.emptyHint') }}</p>
          <button v-if="hasFilters" type="button" @click="reset">
            {{ t('scholars.resetFilters') }}
          </button>
        </div>
        <div v-else class="scholars-grid">
          <ScholarDirectoryCard
            v-for="scholar in data.items"
            :key="scholar.id"
            :scholar="scholar"
          />
        </div>

        <nav
          v-if="!failed && data && data.total > data.limit"
          class="pagination"
          :aria-label="t('scholars.pagination')"
        >
          <button
            type="button"
            :disabled="loading || data.page <= 1"
            @click="changePage(data.page - 1)"
          >
            {{ t('scholars.previousPage') }}
          </button>
          <template v-for="(page, index) in pages" :key="page">
            <span v-if="index && page - (pages[index - 1] ?? 0) > 1" aria-hidden="true">…</span>
            <button
              type="button"
              :disabled="loading"
              :aria-current="page === data.page ? 'page' : undefined"
              :aria-label="t('scholars.pageNumber', { page })"
              :class="{ active: page === data.page }"
              @click="changePage(page)"
            >
              {{ page }}
            </button>
          </template>
          <button
            type="button"
            :disabled="loading || data.page >= pageCount"
            @click="changePage(data.page + 1)"
          >
            {{ t('scholars.nextPage') }}
          </button>
        </nav>
      </section>
    </div>
  </main>
  <RagChatFloat v-if="features.aiChat && isLoggedIn" />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import RagChatFloat from '@/components/RagChatFloat.vue'
import ScholarDirectoryCard from '@/components/scholars/ScholarDirectoryCard.vue'
import ScholarDirectoryFilters from '@/components/scholars/ScholarDirectoryFilters.vue'
import { usePublicConfig } from '@/composables/usePublicConfig'
import { useAuth } from '@/composables/useAuth'
import { useScholarDirectory, type DirectoryState } from '@/composables/useScholarDirectory'

const { t, locale } = useI18n()
const { features, paperLibrary } = usePublicConfig()
const { isLoggedIn } = useAuth()
const institutionSlug = computed(() => paperLibrary.value.fixedInstitutionSlug)
const {
  state,
  query,
  data,
  loading,
  failed,
  composing,
  compositionEnd,
  hasFilters,
  pageCount,
  pages,
  refresh,
  update,
  search,
  reset,
} = useScholarDirectory(institutionSlug)
const alphabet = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#']
const resultsToolbar = ref<HTMLElement | null>(null)
const letterCounts = computed(
  () => new Map(data.value?.facets.letters.map((item) => [item.letter, item.count]) ?? []),
)
const chips = computed(() => {
  const result: Array<{
    key: keyof Pick<DirectoryState, 'q' | 'unit' | 'subject' | 'letter'>
    label: string
  }> = []
  if (state.value.q) result.push({ key: 'q', label: state.value.q })
  if (state.value.unit) {
    const unit = data.value?.facets.units.find((item) => item.id === state.value.unit)
    result.push({
      key: 'unit',
      label:
        unit?.id === 'unassigned'
          ? t('scholars.unassigned')
          : unit?.name || t('scholars.unitFilter'),
    })
  }
  if (state.value.subject) {
    const subject = data.value?.facets.subjects.find((item) => item.id === state.value.subject)
    result.push({
      key: 'subject',
      label: subject
        ? locale.value.startsWith('en')
          ? subject.nameEn || subject.nameZh
          : subject.nameZh
        : t('scholars.subjectFilter'),
    })
  }
  if (state.value.letter)
    result.push({
      key: 'letter',
      label: state.value.letter === '#' ? t('scholars.otherLetters') : state.value.letter,
    })
  return result
})
const selectFilter = (key: 'unit' | 'subject', value: string): void => {
  void update({ [key]: value })
}
const changeSort = (event: Event): void => {
  void update({ sort: (event.target as HTMLSelectElement).value === 'name' ? 'name' : 'relevance' })
}
const changePage = async (page: number): Promise<void> => {
  await update({ page })
  resultsToolbar.value?.focus({ preventScroll: true })
  resultsToolbar.value?.scrollIntoView?.({ block: 'start' })
}
</script>

<style scoped>
.scholars-page {
  max-width: 1280px;
  margin: 0 auto;
  padding: 42px 32px 64px;
  color: var(--scholar-text-1);
}
.directory-header {
  margin-bottom: 32px;
}
.directory-kicker {
  margin: 0 0 10px;
  color: var(--scholar-primary);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 1px;
}
h1 {
  margin: 0;
  font-size: 32px;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.5px;
}
.directory-intro {
  margin: 12px 0 24px;
  font-size: 14px;
  line-height: 1.8;
  color: var(--scholar-text-2);
}
.directory-search {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 720px;
  padding: 6px;
  border: 1px solid var(--scholar-border-input);
  border-radius: 14px;
  background: var(--scholar-bg-white);
}
.directory-search:focus-within {
  border-color: var(--scholar-primary);
  box-shadow: 0 0 0 3px var(--scholar-primary-light);
}
.directory-search input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: none;
  background: transparent;
  padding: 10px 12px;
  color: var(--scholar-text-1);
  font: inherit;
  font-size: 15px;
}
.search-button {
  border: 0;
  border-radius: 9px;
  background: var(--scholar-primary);
  color: #fff;
  padding: 12px 24px;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
  flex-shrink: 0;
}
.search-button:hover {
  background: var(--scholar-primary-hover);
}
.directory-layout {
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr);
  align-items: start;
  gap: 28px;
}
.directory-results {
  min-width: 0;
}
.alphabet-nav {
  padding: 18px 20px;
  border: 1px solid var(--scholar-border-light);
  border-radius: 14px;
  background: var(--scholar-bg-white);
}
.alphabet-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--scholar-text-2);
  margin-bottom: 10px;
}
.alphabet-options {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.alphabet-options button {
  min-width: 32px;
  min-height: 34px;
  padding: 5px 8px;
  border: 0;
  background: transparent;
  border-radius: 6px;
  color: var(--scholar-text-2);
  cursor: pointer;
  font-size: 12px;
}
.alphabet-options button:hover {
  background: var(--scholar-primary-light);
}
.alphabet-options button.active,
.pagination button.active {
  background: var(--scholar-primary);
  color: #fff;
}
.alphabet-nav p {
  margin: 10px 0 0;
  color: var(--scholar-text-desc);
  font-size: 11px;
  line-height: 1.6;
}
.results-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 24px 0 18px;
  scroll-margin-top: 90px;
}
.result-count {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
}
.sort-control {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--scholar-text-2);
}
.sort-control select {
  max-width: 180px;
  padding: 8px 10px;
  border: 1px solid var(--scholar-border-input);
  border-radius: 8px;
  background: var(--scholar-bg-white);
  color: var(--scholar-text-1);
  font: inherit;
  cursor: pointer;
}
.active-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 18px;
}
.active-filters button {
  display: flex;
  gap: 10px;
  align-items: center;
  max-width: 100%;
  padding: 7px 10px;
  border: 1px solid var(--scholar-border-light);
  border-radius: 6px;
  background: var(--scholar-primary-light);
  color: var(--scholar-primary);
  font-size: 12px;
  cursor: pointer;
  overflow-wrap: anywhere;
  text-align: left;
}
.active-filters .clear-filters {
  background: transparent;
  border-color: transparent;
}
.scholars-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}
.directory-state {
  padding: 60px 20px;
  text-align: center;
  border: 1px dashed var(--scholar-border-input);
  border-radius: 14px;
}
.directory-state h2 {
  font-size: 18px;
  margin: 0 0 12px;
}
.directory-state p {
  color: var(--scholar-text-2);
  font-size: 14px;
  line-height: 1.8;
}
.directory-state button {
  margin-top: 12px;
  padding: 10px 20px;
  border: 1px solid var(--scholar-primary);
  background: transparent;
  color: var(--scholar-primary);
  border-radius: 8px;
  cursor: pointer;
}
.pagination {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 28px;
}
.pagination button {
  min-width: 36px;
  min-height: 36px;
  padding: 6px 10px;
  border: 1px solid var(--scholar-border-light);
  border-radius: 8px;
  background: var(--scholar-bg-white);
  color: var(--scholar-text-2);
  cursor: pointer;
}
.pagination button:disabled {
  opacity: 0.45;
  cursor: default;
}
.skeleton-card {
  min-height: 232px;
  border: 1px solid var(--scholar-border-light);
  border-radius: 16px;
  padding: 24px;
}
.skeleton-card span {
  display: block;
  height: 56px;
  width: 56px;
  border-radius: 50%;
  background: var(--scholar-primary-light);
}
.skeleton-card i {
  display: block;
  height: 14px;
  margin-top: 20px;
  border-radius: 4px;
  background: var(--scholar-primary-light);
}
.skeleton-card i:last-child {
  width: 60%;
}
button:focus-visible,
select:focus-visible {
  outline: 2px solid var(--scholar-primary);
  outline-offset: 3px;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
@media (max-width: 1150px) {
  .scholars-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .directory-layout {
    grid-template-columns: 220px minmax(0, 1fr);
    gap: 20px;
  }
}
@media (max-width: 760px) {
  .scholars-page {
    padding: 28px 18px 40px;
  }
  h1 {
    font-size: 27px;
  }
  .directory-layout {
    grid-template-columns: minmax(0, 1fr);
    gap: 18px;
  }
  .directory-header {
    margin-bottom: 22px;
  }
  .alphabet-options button {
    min-height: 40px;
    min-width: 36px;
  }
  .search-button {
    padding: 12px 18px;
  }
}
@media (max-width: 480px) {
  .scholars-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .alphabet-nav {
    padding: 14px;
  }
  .sort-control select {
    max-width: 150px;
  }
}
</style>
