<template>
  <div class="library-page">
    <div class="library-container">
      <div class="library-header">
        <h1 class="library-title">{{ $t('myUploads.title') }}</h1>
        <span class="library-count">{{ $t('common.counts.papers', { count: total }) }}</span>
      </div>

      <div class="library-status-row">
        <span class="library-status-pill library-status-pill--draft">
          {{ $t('common.paperStatus.draft') }} {{ statusTotals.draft }}
        </span>
        <span class="library-status-pill library-status-pill--pending_review">
          {{ $t('common.paperStatus.pendingReview') }} {{ statusTotals.pending_review }}
        </span>
        <span class="library-status-pill library-status-pill--changes_requested">
          {{ $t('common.paperStatus.changesRequested') }} {{ statusTotals.changes_requested }}
        </span>
        <span class="library-status-pill library-status-pill--approved">
          {{ $t('common.paperStatus.approved') }} {{ statusTotals.approved }}
        </span>
        <span class="library-status-pill library-status-pill--archived">
          {{ $t('common.paperStatus.archived') }} {{ statusTotals.archived }}
        </span>
      </div>

      <div v-if="isLoading" class="library-empty">{{ $t('common.loading') }}</div>

      <div v-else-if="!papers.length" class="library-empty">
        <IconFile class="library-empty-icon" />
        <p>{{ $t('myUploads.empty') }}</p>
        <router-link v-if="features.paperUpload" to="/upload" class="library-go-btn">
          {{ $t('common.goUpload') }}
        </router-link>
      </div>

      <div v-else class="library-list">
        <div v-for="item in papers" :key="item.id" class="library-item">
          <router-link :to="`/papers/${item.id}`" class="library-item-link">
            <div class="library-item-top">
              <div class="library-item-title">{{ item.title }}</div>
              <span
                class="library-review-badge"
                :class="`library-review-badge--${item.reviewStatus}`"
              >
                {{ getReviewStatusLabel(item.reviewStatus) }}
              </span>
            </div>
            <div class="library-item-meta">
              <span v-if="item.journal_name">{{ item.journal_name }}</span>
              <span v-if="item.journal_name && hasPublishYear(item.publish_year)"> · </span>
              <span v-if="hasPublishYear(item.publish_year)">{{ item.publish_year }}</span>
              <span class="library-item-date"> · {{ $t('common.upload.uploadedAt', { date: formatDate(item.createdAt) }) }}</span>
            </div>
            <div v-if="item.abstract" class="library-item-abstract">{{ item.abstract }}</div>
            <div v-if="item.reviewNotes" class="library-item-review-note">
              {{ $t('common.review.notes', { notes: item.reviewNotes }) }}
            </div>
            <div v-if="item.keywords.length" class="library-item-keywords">
              <span v-for="kw in item.keywords.slice(0, 4)" :key="kw" class="library-kw-tag">{{ kw }}</span>
            </div>
          </router-link>
        </div>
      </div>

      <div v-if="papers.length < total" class="library-load-more">
        <button class="load-more-btn" type="button" :disabled="isLoadingMore" @click="loadMore">
          {{ isLoadingMore ? $t('common.loading') : $t('common.loadMore') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { IconFile } from '@arco-design/web-vue/es/icon'
import { useI18n } from 'vue-i18n'
import {
  listMyPapers,
  type PaperResponse,
  type PaperReviewStatus,
  type PaperStatusTotals,
} from '@/api/papers'
import { usePublicConfig } from '@/composables/usePublicConfig'
import { PAPER_STATUS_LABEL_KEYS } from '@/i18n/helpers'
import { hasPublishYear } from '@/utils/papers'

const isLoading = ref(false)
const isLoadingMore = ref(false)
const papers = ref<PaperResponse[]>([])
const total = ref(0)
const statusTotals = ref<PaperStatusTotals>({
  draft: 0,
  pending_review: 0,
  changes_requested: 0,
  approved: 0,
  archived: 0,
})
const PAGE_SIZE = 20
const { t, locale } = useI18n()
const { features } = usePublicConfig()

function formatDate(iso: string) {
  return new Intl.DateTimeFormat(locale.value, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

function getReviewStatusLabel(status: PaperReviewStatus): string {
  return t(PAPER_STATUS_LABEL_KEYS[status])
}

async function fetchPage(offset: number) {
  const res = await listMyPapers({
    limit: PAGE_SIZE,
    offset,
  })
  total.value = res.total
  statusTotals.value = res.statusTotals
  return res.items
}

onMounted(async () => {
  isLoading.value = true
  try {
    papers.value = await fetchPage(0)
  } finally {
    isLoading.value = false
  }
})

async function loadMore() {
  isLoadingMore.value = true
  try {
    const more = await fetchPage(papers.value.length)
    papers.value.push(...more)
  } finally {
    isLoadingMore.value = false
  }
}
</script>

<style lang="sass" scoped>
.library-page
  display: flex
  justify-content: center
  padding: 32px 0 60px

.library-container
  width: 860px
  max-width: 100%
  padding: 0 30px

.library-header
  display: flex
  align-items: baseline
  gap: 12px
  margin-bottom: 24px

.library-status-row
  display: flex
  gap: 10px
  flex-wrap: wrap
  margin-bottom: 20px

.library-status-pill
  display: inline-flex
  align-items: center
  height: 30px
  padding: 0 12px
  border-radius: 999px
  font-size: 13px
  font-weight: 500

.library-status-pill--pending_review
  background: #fff7e8
  color: #d48806

.library-status-pill--changes_requested
  background: #e8f4ff
  color: #0050b3

.library-status-pill--approved
  background: #f0f9eb
  color: #389e0d

.library-status-pill--draft, .library-status-pill--archived
  background: #fff1f0
  color: #cf1322

.library-title
  font-size: 26px
  font-weight: 600
  color: var(--scholar-text-1)
  margin: 0
  letter-spacing: -0.5px

.library-count
  font-size: 14px
  color: var(--scholar-text-3)

.library-empty
  display: flex
  flex-direction: column
  align-items: center
  justify-content: center
  min-height: 300px
  font-size: 14px
  color: var(--scholar-text-3)
  gap: 8px

.library-empty-icon
  margin-bottom: 12px
  opacity: 0.3
  font-size: 48px

.library-go-btn
  margin-top: 8px
  height: 36px
  padding: 0 20px
  border-radius: 10px
  background: var(--scholar-primary)
  color: #fff
  font-size: 14px
  font-weight: 500
  text-decoration: none
  display: inline-flex
  align-items: center
  cursor: pointer

.library-go-btn:hover
  background: var(--scholar-primary-hover)

.library-list
  display: flex
  flex-direction: column
  gap: 14px

.library-item
  position: relative
  background: #fff
  border: 1px solid var(--scholar-border-light)
  border-radius: 16px
  padding: 22px 24px
  transition: border-color 0.2s

.library-item:hover
  border-color: rgba(0, 73, 143, 0.2)

.library-item-link
  display: block
  text-decoration: none
  color: inherit

.library-item-top
  display: flex
  gap: 12px
  align-items: flex-start
  justify-content: space-between
  margin-bottom: 6px

.library-item-title
  font-size: 17px
  font-weight: 600
  color: var(--scholar-text-1)
  line-height: 1.5
  margin: 0

.library-review-badge
  flex-shrink: 0
  display: inline-flex
  align-items: center
  height: 26px
  padding: 0 10px
  border-radius: 999px
  font-size: 12px
  font-weight: 500

.library-review-badge--pending_review
  background: #fff7e8
  color: #d48806

.library-review-badge--changes_requested
  background: #e8f4ff
  color: #0050b3

.library-review-badge--approved
  background: #f0f9eb
  color: #389e0d

.library-review-badge--draft, .library-review-badge--archived
  background: #fff1f0
  color: #cf1322

.library-item-meta
  font-size: 13px
  color: var(--scholar-text-3)
  margin-bottom: 10px

.library-item-date
  color: var(--scholar-text-3)

.library-item-abstract
  font-size: 13px
  color: var(--scholar-text-2)
  line-height: 1.7
  display: -webkit-box
  -webkit-line-clamp: 2
  -webkit-box-orient: vertical
  overflow: hidden
  margin-bottom: 12px

.library-item-review-note
  font-size: 13px
  line-height: 1.6
  color: #8a2d1d
  background: #fff7f5
  border-radius: 10px
  padding: 10px 12px
  margin-bottom: 12px

.library-item-keywords
  display: flex
  flex-wrap: wrap
  gap: 6px

.library-kw-tag
  height: 24px
  line-height: 24px
  padding: 0 10px
  border: 1px solid var(--scholar-border-light)
  border-radius: 999px
  font-size: 12px
  color: var(--scholar-text-3)

.library-load-more
  display: flex
  justify-content: center
  margin-top: 24px

.load-more-btn
  height: 36px
  padding: 0 28px
  border-radius: 10px
  border: 1px solid var(--scholar-border-light)
  background: #fff
  font-size: 14px
  color: var(--scholar-text-2)
  cursor: pointer

.load-more-btn:hover
  border-color: var(--scholar-primary)
  color: var(--scholar-primary)

.load-more-btn:disabled
  opacity: 0.5
  cursor: not-allowed
</style>
