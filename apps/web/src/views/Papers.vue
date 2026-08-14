<template>
  <div class="papers-page">
    <div class="papers-container">
      <section class="papers-hero">
        <div class="papers-hero-copy">
          <div class="papers-eyebrow">{{ $t('papersPage.eyebrow') }}</div>
          <h1 class="papers-title">{{ pageTitle }}</h1>
          <p class="papers-subtitle">{{ pageSubtitle }}</p>
        </div>

        <div v-if="scopeChips.length" class="scope-chip-list">
          <span v-for="chip in scopeChips" :key="chip" class="scope-chip">{{ chip }}</span>
        </div>

        <div class="papers-search-row">
          <a-input
            v-model="queryText"
            class="papers-search-input"
            :placeholder="$t('papersPage.searchPlaceholder')"
            allow-clear
            @press-enter="applyFilters"
          />
          <a-button type="primary" class="papers-search-btn" @click="applyFilters">
            {{ $t('common.search') }}
          </a-button>
        </div>

        <div class="papers-filter-grid">
          <a-select
            v-model="selectedAuthorId"
            class="papers-filter-control"
            :placeholder="$t('papersPage.authorFilterPlaceholder')"
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
            allow-clear
          >
            <a-option v-for="item in paperTypeOptions" :key="item.value" :value="item.value">
              {{ item.label }}
            </a-option>
          </a-select>

          <a-select v-model="selectedSort" class="papers-filter-control" :placeholder="$t('papersPage.sortPlaceholder')">
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
            hide-button
          />

          <a-input-number
            v-model="yearTo"
            class="papers-filter-control"
            :min="1900"
            :max="2100"
            :placeholder="$t('papersPage.yearToPlaceholder')"
            hide-button
          />

          <a-button class="papers-filter-reset" @click="resetFilters">
            {{ $t('papersPage.resetFilters') }}
          </a-button>
        </div>
      </section>

      <section v-if="showInstitutionAccessPanel" class="browse-section">
        <div class="section-head">
          <div>
            <h2 class="section-title">{{ $t('papersPage.libraryAccessTitle') }}</h2>
            <p class="section-subtitle">
              {{ $t('papersPage.libraryAccessSubtitle', { app: branding.appName }) }}
            </p>
          </div>
          <a-button v-if="canBindInstitution" class="library-access-btn" @click="openInstitutionBinding">
            {{ $t('papersPage.bindInstitution') }}
          </a-button>
        </div>

        <div v-if="isViewerInstitutionsLoading" class="section-state">{{ $t('common.loading') }}</div>
        <div v-else class="library-access-card">
          <div class="browse-group">
            <div class="browse-label">{{ $t('papersPage.switchInstitutionLabel') }}</div>
            <a-select
              :model-value="institutionSwitchValue"
              class="library-switch"
              @change="handleInstitutionSwitch"
            >
              <a-option :value="PUBLIC_LIBRARY_VALUE">
                {{ $t('papersPage.defaultLibraryOption', { app: branding.appName }) }}
              </a-option>
              <a-option
                v-for="institution in viewerInstitutionMemberships"
                :key="institution.id"
                :value="institution.slug"
              >
                {{ institution.name }}
              </a-option>
            </a-select>
          </div>

          <div v-if="!viewerInstitutionMemberships.length" class="section-state section-state--compact">
            {{
              canBindInstitution
                ? $t('papersPage.noBoundInstitution')
                : $t('papersPage.bindingUnavailable')
            }}
          </div>

          <div v-if="viewerInstitutionsError" class="section-state section-state--compact">
            {{ viewerInstitutionsError }}
          </div>
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

      <div class="papers-meta">
        {{ $t('papersPage.totalResults', { count: total }) }}
      </div>

      <div v-if="isLoading" class="papers-state">{{ $t('common.loading') }}</div>
      <div v-else-if="loadError" class="papers-state">{{ loadError }}</div>
      <div v-else-if="!papers.length" class="papers-state">{{ $t('papersPage.empty') }}</div>

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

      <div class="papers-pagination">
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
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import { IconBookmark } from '@arco-design/web-vue/es/icon'
import { useI18n } from 'vue-i18n'
import PaperInfoCard, { type PaperInfo } from '@/components/PaperInfoCard.vue'
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
import { getMyProfile, type UserInstitutionMembershipItem } from '@/api/users'
import { useAuth } from '@/composables/useAuth'
import { usePublicConfig } from '@/composables/usePublicConfig'
import { PAPER_TYPE_LABEL_KEYS } from '@/i18n/helpers'
import { hasPublishYear } from '@/utils/papers'

const pageSize = 10
const PUBLIC_LIBRARY_VALUE = '__public__'

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const { isLoggedIn, token } = useAuth()
const { branding, publicConfig, paperLibrary } = usePublicConfig()

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
const viewerInstitutionMemberships = ref<UserInstitutionMembershipItem[]>([])

const isLoading = ref(false)
const isAuthorLoading = ref(false)
const isViewerInstitutionsLoading = ref(false)
const loadError = ref('')
const viewerInstitutionsError = ref('')

const queryText = ref('')
const selectedAuthorId = ref('')
const selectedPaperType = ref<number | undefined>(undefined)
const selectedSort = ref<'latest' | 'citations' | 'relevance'>('latest')
const yearFrom = ref<number | undefined>(undefined)
const yearTo = ref<number | undefined>(undefined)

const pageScope = ref<PageScope>({ kind: 'default' })
const currentInstitutionSlug = ref('')
const currentInstitution = ref<InstitutionDetailResponse | null>(null)

const isPublicDeployment = computed(() => publicConfig.value.deploymentMode === 'public')

const showInstitutionAccessPanel = computed(() => {
  return isPublicDeployment.value && isLoggedIn.value
})

const canBindInstitution = computed(() => {
  return publicConfig.value.auth.enableInstitutionLogin
})

const institutionSwitchValue = computed(() => {
  return currentInstitutionSlug.value || PUBLIC_LIBRARY_VALUE
})

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

const openInstitutionBinding = (): void => {
  window.dispatchEvent(new CustomEvent('auth:open-login', {
    detail: {
      preferredTab: 'institution' as const,
    },
  }))
}

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
  void loadPapers()
}

const applyFilters = (): void => {
  page.value = 1
  void loadPapers()
}

const onPageChange = (next: number): void => {
  page.value = next
  void loadPapers()
}

const handleAuthorSearch = async (keyword: string): Promise<void> => {
  isAuthorLoading.value = true
  try {
    const response = await searchAuthors(keyword.trim() || undefined, 20, 0)
    authorOptions.value = response.items
  } finally {
    isAuthorLoading.value = false
  }
}

const loadViewerInstitutionMemberships = async (): Promise<void> => {
  if (!isLoggedIn.value || !isPublicDeployment.value) {
    viewerInstitutionMemberships.value = []
    viewerInstitutionsError.value = ''
    return
  }

  isViewerInstitutionsLoading.value = true
  try {
    const profile = await getMyProfile()
    viewerInstitutionMemberships.value = [...profile.institution_memberships]
      .sort((left, right) => left.name.localeCompare(right.name, locale.value))
    viewerInstitutionsError.value = ''
  } catch (error) {
    viewerInstitutionMemberships.value = []
    viewerInstitutionsError.value = getErrorMessage(
      error,
      t('papersPage.institutionBindingsLoadFailed'),
    )
  } finally {
    isViewerInstitutionsLoading.value = false
  }
}

const buildPresetParams = async (): Promise<Partial<ListPapersParams>> => {
  currentInstitutionSlug.value = ''
  currentInstitution.value = null
  pageScope.value = { kind: 'default' }

  if (route.name === 'InstitutionPapers' || route.name === 'InstitutionCollegePapers') {
    const institution = await getInstitution(String(route.params.slug ?? ''))
    currentInstitution.value = institution
    currentInstitutionSlug.value = institution.slug

    const college = route.name === 'InstitutionCollegePapers'
      ? String(route.params.collegeSlug ?? '').trim()
      : ''

    pageScope.value = college
      ? { kind: 'institutionCollege', institutionName: institution.name, college }
      : { kind: 'institution', name: institution.name }

    return {
      institution_id: institution.id,
      college: college || undefined,
    }
  }

  if (route.name === 'LabPapers') {
    const lab = await getLab(String(route.params.slug ?? ''))
    pageScope.value = { kind: 'lab', name: lab.name }
    return {
      lab_id: lab.id,
    }
  }

  if (route.name === 'ScholarPapers') {
    const scholar = await getScholar(String(route.params.id ?? ''))
    pageScope.value = { kind: 'scholar', name: scholar.name }
    return {
      scholar_id: scholar.id,
    }
  }

  return {}
}

const handleInstitutionSwitch = (value: unknown): void => {
  if (typeof value !== 'string') {
    return
  }

  const targetPath = value === PUBLIC_LIBRARY_VALUE
    ? paperLibrary.value.defaultPath
    : `/institutions/${value}/papers`

  if (targetPath !== route.path) {
    void router.push(targetPath)
  }
}

const loadPapers = async (): Promise<void> => {
  isLoading.value = true
  loadError.value = ''

  try {
    const presetParams = await buildPresetParams()
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
      listBookmarks(100, 0).catch(() => ({ items: [], total: 0 })),
    ])

    papers.value = paperResponse.items
    total.value = paperResponse.total
    bookmarkSet.value = new Set(bookmarkResponse.items.map((item) => item.paperId))
  } catch (error) {
    papers.value = []
    total.value = 0
    loadError.value = getErrorMessage(error, t('papersPage.listLoadFailed'))
  } finally {
    isLoading.value = false
  }
}

const toggleBookmark = async (paperId: string): Promise<void> => {
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

watch(
  [() => token.value, () => publicConfig.value.deploymentMode],
  () => {
    void loadViewerInstitutionMemberships()
  },
  { immediate: true },
)

watch(
  () => route.fullPath,
  () => {
    page.value = 1
    queryText.value = typeof route.query.q === 'string' ? route.query.q : ''
    selectedAuthorId.value = ''
    selectedPaperType.value = undefined
    selectedSort.value = queryText.value.trim() ? 'relevance' : 'latest'
    yearFrom.value = undefined
    yearTo.value = undefined
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
  background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)

.papers-container
  width: 1120px
  max-width: 100%
  margin: 0 auto
  padding: 0 30px

.papers-hero
  padding: 28px 30px
  border-radius: 28px
  background: linear-gradient(135deg, #0f2f57 0%, #14599a 55%, #dcecff 180%)
  color: #fff
  box-shadow: 0 18px 46px rgba(15, 47, 87, 0.14)

.papers-eyebrow
  font-size: 12px
  letter-spacing: 0.22em
  text-transform: uppercase
  color: rgba(255, 255, 255, 0.72)

.papers-title
  margin: 12px 0 0
  font-size: 34px
  font-weight: 700
  line-height: 1.18

.papers-subtitle
  max-width: 760px
  margin: 12px 0 0
  font-size: 14px
  line-height: 1.7
  color: rgba(255, 255, 255, 0.82)

.scope-chip-list
  display: flex
  flex-wrap: wrap
  gap: 10px
  margin-top: 18px

.scope-chip
  padding: 7px 12px
  border-radius: 999px
  background: rgba(255, 255, 255, 0.14)
  color: #fff
  font-size: 12px

.papers-search-row
  display: flex
  gap: 12px
  align-items: center
  margin-top: 22px

.papers-search-input
  flex: 1

.papers-search-input :deep(.arco-input-wrapper)
  min-height: 48px
  border-radius: 14px
  border: none

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
  border-radius: 24px
  background: #fff
  border: 1px solid rgba(15, 47, 87, 0.08)
  box-shadow: 0 14px 34px rgba(15, 47, 87, 0.06)

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

.library-access-btn
  border-radius: 12px

.library-access-card
  display: flex
  flex-direction: column
  gap: 14px
  padding: 18px 20px
  border-radius: 18px
  background: linear-gradient(180deg, #f9fbff 0%, #f3f7ff 100%)
  border: 1px solid rgba(15, 98, 254, 0.08)

.library-switch
  width: 100%
  max-width: 420px
  margin-top: 10px

.library-switch :deep(.arco-select-view)
  min-height: 42px
  border-radius: 12px

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
  border-radius: 22px
  background: #fff
  border: 1px solid rgba(15, 47, 87, 0.08)
  box-shadow: 0 14px 34px rgba(15, 47, 87, 0.06)

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
  width: 36px
  height: 36px
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

  .papers-hero
    padding: 22px 18px

  .papers-title
    font-size: 28px

  .section-head
    flex-direction: column

  .papers-search-row
    flex-direction: column

  .papers-search-btn
    width: 100%

  .papers-filter-grid
    grid-template-columns: minmax(0, 1fr)

  .paper-shell-head
    align-items: flex-start
</style>
