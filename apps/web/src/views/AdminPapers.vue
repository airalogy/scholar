<template>
  <div class="admin-page">
    <div class="admin-container">
      <div class="admin-header">
        <div>
          <div class="admin-eyebrow">Paper Review Console</div>
          <h1 class="admin-title">{{ $t('adminPapers.title') }}</h1>
          <p class="admin-subtitle">{{ $t('adminPapers.subtitle') }}</p>
        </div>
      </div>

      <div class="admin-stats-grid">
        <button class="admin-stat-card" type="button" @click="setStatusFilter('draft')">
          <div class="admin-stat-label">{{ $t('common.paperStatus.draft') }}</div>
          <div class="admin-stat-value">{{ statusTotals.draft }}</div>
        </button>
        <button class="admin-stat-card" type="button" @click="setStatusFilter('pending_review')">
          <div class="admin-stat-label">{{ $t('common.paperStatus.pendingReview') }}</div>
          <div class="admin-stat-value">{{ statusTotals.pending_review }}</div>
        </button>
        <button class="admin-stat-card" type="button" @click="setStatusFilter('changes_requested')">
          <div class="admin-stat-label">{{ $t('common.paperStatus.changesRequested') }}</div>
          <div class="admin-stat-value">{{ statusTotals.changes_requested }}</div>
        </button>
        <button class="admin-stat-card" type="button" @click="setStatusFilter('approved')">
          <div class="admin-stat-label">{{ $t('common.paperStatus.approved') }}</div>
          <div class="admin-stat-value">{{ statusTotals.approved }}</div>
        </button>
        <button class="admin-stat-card" type="button" @click="setStatusFilter('archived')">
          <div class="admin-stat-label">{{ $t('common.paperStatus.archived') }}</div>
          <div class="admin-stat-value">{{ statusTotals.archived }}</div>
        </button>
      </div>

      <div class="admin-toolbar">
        <div class="admin-search">
          <a-input
            v-model="query"
            :placeholder="$t('adminPapers.searchPlaceholder')"
            allow-clear
            @press-enter="onSearch"
          />
          <button class="admin-search-btn" type="button" @click="onSearch">{{ $t('common.search') }}</button>
        </div>
        <div class="admin-filter-pills">
          <button
            class="admin-filter-pill"
            :class="{ 'admin-filter-pill--active': reviewStatus === '' }"
            type="button"
            @click="setStatusFilter('')"
          >
            {{ $t('common.all') }}
          </button>
          <button
            v-for="status in filterOptions"
            :key="status"
            class="admin-filter-pill"
            :class="{ 'admin-filter-pill--active': reviewStatus === status }"
            type="button"
            @click="setStatusFilter(status)"
          >
            {{ getReviewStatusLabel(status) }}
          </button>
        </div>
      </div>

      <div v-if="isLoading" class="admin-state">{{ $t('common.loading') }}</div>

      <div v-else-if="!papers.length" class="admin-state">{{ $t('adminPapers.empty') }}</div>

      <div v-else class="admin-list">
        <div v-for="paper in papers" :key="paper.id" class="admin-card">
          <div class="admin-card-head">
            <div class="admin-card-main">
              <router-link :to="`/papers/${paper.id}`" class="admin-card-title">
                {{ paper.title }}
              </router-link>
              <div class="admin-card-meta">
                <span>{{ $t('common.upload.uploadedBy', { name: paper.uploadUserName || $t('common.unknownUser') }) }}</span>
                <span>{{ $t('adminPapers.uploadedTime', { date: formatDate(paper.createdAt) }) }}</span>
                <span v-if="hasPublishYear(paper.publish_year)">{{ $t('adminPapers.publishedYear', { year: paper.publish_year }) }}</span>
              </div>
              <div v-if="paper.authors.length" class="admin-card-authors">
                {{ paper.authors.map((author) => author.name).join('、') }}
              </div>
            </div>
            <span class="admin-review-badge" :class="`admin-review-badge--${paper.reviewStatus}`">
              {{ getReviewStatusLabel(paper.reviewStatus) }}
            </span>
          </div>

          <div v-if="paper.abstract" class="admin-card-abstract">
            {{ paper.abstract }}
          </div>

          <div class="admin-card-foot">
            <div class="admin-card-tags">
              <span v-for="keyword in paper.keywords.slice(0, 4)" :key="keyword" class="admin-tag">
                {{ keyword }}
              </span>
            </div>
            <div v-if="isActionableStatus(paper.reviewStatus)" class="admin-card-actions">
              <button
                class="admin-action-btn admin-action-btn--approve"
                type="button"
                @click="openReviewModal(paper, 'approve')"
              >
                {{ $t('adminPapers.approve') }}
              </button>
              <button
                class="admin-action-btn admin-action-btn--reject"
                type="button"
                @click="openReviewModal(paper, 'request_changes')"
              >
                {{ $t('adminPapers.reject') }}
              </button>
            </div>
          </div>

          <div v-if="paper.reviewNotes" class="admin-review-note">
            {{ $t('common.review.notes', { notes: paper.reviewNotes }) }}
          </div>
        </div>
      </div>

      <div v-if="total > pageSize" class="admin-pagination">
        <a-pagination
          :total="total"
          :current="page"
          :page-size="pageSize"
          :show-total="true"
          @change="onPageChange"
        />
      </div>
    </div>

    <a-modal
      :visible="reviewModalVisible"
      :title="reviewAction === 'approve' ? $t('adminPapers.approveTitle') : $t('adminPapers.rejectTitle')"
      :ok-text="reviewAction === 'approve' ? $t('adminPapers.approveConfirm') : $t('adminPapers.rejectConfirm')"
      :cancel-text="$t('common.cancel')"
      :confirm-loading="isSubmitting"
      @ok="submitReview"
      @cancel="closeReviewModal"
    >
      <div v-if="selectedPaper" class="admin-modal-body">
        <div class="admin-modal-paper-title">{{ selectedPaper.title }}</div>
        <div class="admin-modal-desc">
          {{ reviewAction === 'approve' ? $t('adminPapers.approveHint') : $t('adminPapers.rejectHint') }}
        </div>
        <a-textarea
          v-model="reviewNotes"
          :max-length="2000"
          :placeholder="reviewAction === 'approve' ? $t('adminPapers.approvePlaceholder') : $t('adminPapers.rejectPlaceholder')"
          :auto-size="{ minRows: 4, maxRows: 8 }"
          allow-clear
        />
      </div>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { Message } from '@arco-design/web-vue'
import { useI18n } from 'vue-i18n'
import {
  listReviewQueue,
  reviewPaper,
  type PaperResponse,
  type PaperReviewStatus,
  type PaperStatusTotals,
} from '@/api/papers'
import { PAPER_STATUS_LABEL_KEYS } from '@/i18n/helpers'
import { hasPublishYear } from '@/utils/papers'

type ReviewDecision = 'approve' | 'request_changes'

const filterOptions: PaperReviewStatus[] = [
  'draft',
  'pending_review',
  'changes_requested',
  'approved',
  'archived',
]
const pageSize = 10

const query = ref('')
const reviewStatus = ref<PaperReviewStatus | ''>('')
const page = ref(1)
const total = ref(0)
const papers = ref<PaperResponse[]>([])
const isLoading = ref(false)
const isSubmitting = ref(false)
const statusTotals = ref<PaperStatusTotals>({
  draft: 0,
  pending_review: 0,
  changes_requested: 0,
  approved: 0,
  archived: 0,
})

const reviewModalVisible = ref(false)
const selectedPaper = ref<PaperResponse | null>(null)
const reviewAction = ref<ReviewDecision>('approve')
const reviewNotes = ref('')
const { t, locale } = useI18n()

const formatDate = (value: string): string => {
  return new Intl.DateTimeFormat(locale.value, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}
const isActionableStatus = (status: PaperReviewStatus): boolean => {
  return status === 'pending_review'
}
const getReviewStatusLabel = (status: PaperReviewStatus): string => {
  return t(PAPER_STATUS_LABEL_KEYS[status])
}

const load = async (): Promise<void> => {
  isLoading.value = true
  try {
    const response = await listReviewQueue({
      q: query.value.trim() || undefined,
      reviewStatus: reviewStatus.value || undefined,
      limit: pageSize,
      offset: (page.value - 1) * pageSize,
    })
    papers.value = response.items
    total.value = response.total
    statusTotals.value = response.statusTotals
  } finally {
    isLoading.value = false
  }
}

const onSearch = (): void => {
  page.value = 1
  void load()
}

const onPageChange = (next: number): void => {
  page.value = next
  void load()
}

const setStatusFilter = (status: PaperReviewStatus | ''): void => {
  reviewStatus.value = status
}

watch(reviewStatus, () => {
  page.value = 1
  void load()
}, { immediate: true })

const openReviewModal = (
  paper: PaperResponse,
  action: ReviewDecision
): void => {
  selectedPaper.value = paper
  reviewAction.value = action
  reviewNotes.value = action === 'request_changes' ? paper.reviewNotes ?? '' : ''
  reviewModalVisible.value = true
}

const closeReviewModal = (): void => {
  reviewModalVisible.value = false
  selectedPaper.value = null
  reviewNotes.value = ''
}

const submitReview = async (): Promise<void> => {
  if (!selectedPaper.value) {
    return
  }

  const notes = reviewNotes.value.trim()
  if (reviewAction.value === 'request_changes' && !notes) {
    Message.warning(t('adminPapers.rejectReasonRequired'))
    return
  }

  isSubmitting.value = true
  try {
    await reviewPaper(selectedPaper.value.claimId ?? selectedPaper.value.id, {
      decision: reviewAction.value,
      notes: notes || undefined,
    })
    Message.success(
      reviewAction.value === 'approve'
        ? t('adminPapers.approvedSuccess')
        : t('adminPapers.rejectedSuccess'),
    )
    closeReviewModal()
    await load()
  } finally {
    isSubmitting.value = false
  }
}
</script>

<style lang="sass" scoped>
.admin-page
  display: flex
  justify-content: center
  padding: 28px 0 48px
  background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)

.admin-container
  width: 1120px
  max-width: 100%
  padding: 0 30px

.admin-header
  display: flex
  align-items: flex-start
  justify-content: space-between
  gap: 20px
  margin-bottom: 22px

.admin-eyebrow
  font-size: 12px
  letter-spacing: 0.22em
  text-transform: uppercase
  color: #7d8ca3

.admin-title
  margin: 10px 0 0
  font-size: 30px
  font-weight: 700
  color: #1f2937

.admin-subtitle
  margin: 10px 0 0
  font-size: 14px
  color: #667085

.admin-stats-grid
  display: grid
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr))
  gap: 16px
  margin-bottom: 20px

.admin-stat-card
  text-align: left
  padding: 20px 22px
  border-radius: 20px
  border: 1px solid rgba(15, 47, 87, 0.08)
  background: #fff
  box-shadow: 0 14px 34px rgba(15, 47, 87, 0.06)
  cursor: pointer

.admin-stat-label
  font-size: 13px
  color: #667085

.admin-stat-value
  margin-top: 10px
  font-size: 30px
  font-weight: 700
  color: #0f2f57

.admin-toolbar
  display: flex
  gap: 16px
  align-items: center
  justify-content: space-between
  margin-bottom: 18px
  flex-wrap: wrap

.admin-search
  display: flex
  gap: 10px
  width: 460px
  max-width: 100%

.admin-search-btn
  height: 36px
  padding: 0 18px
  border: none
  border-radius: 10px
  background: var(--scholar-primary)
  color: #fff
  cursor: pointer

.admin-filter-pills
  display: flex
  gap: 10px
  flex-wrap: wrap

.admin-filter-pill
  height: 34px
  padding: 0 14px
  border-radius: 999px
  border: 1px solid var(--scholar-border-light)
  background: #fff
  color: #5b6677
  cursor: pointer

.admin-filter-pill--active
  border-color: transparent
  background: var(--scholar-primary)
  color: #fff

.admin-state
  min-height: 300px
  display: flex
  align-items: center
  justify-content: center
  color: var(--scholar-text-3)
  font-size: 14px

.admin-list
  display: flex
  flex-direction: column
  gap: 16px

.admin-card
  background: #fff
  border-radius: 22px
  border: 1px solid rgba(15, 47, 87, 0.08)
  padding: 22px
  box-shadow: 0 14px 34px rgba(15, 47, 87, 0.06)

.admin-card-head
  display: flex
  justify-content: space-between
  gap: 16px
  align-items: flex-start

.admin-card-main
  min-width: 0
  flex: 1

.admin-card-title
  font-size: 20px
  line-height: 1.6
  color: #1f2937
  text-decoration: none
  font-weight: 700

.admin-card-meta
  display: flex
  flex-wrap: wrap
  gap: 10px
  margin-top: 8px
  font-size: 13px
  color: #667085

.admin-card-authors
  margin-top: 10px
  font-size: 14px
  color: #425466

.admin-review-badge
  display: inline-flex
  align-items: center
  height: 30px
  padding: 0 12px
  border-radius: 999px
  font-size: 12px
  font-weight: 600

.admin-review-badge--pending_review
  background: #fff7e8
  color: #d48806

.admin-review-badge--changes_requested
  background: #e8f4ff
  color: #0050b3

.admin-review-badge--approved
  background: #f0f9eb
  color: #389e0d

.admin-review-badge--draft, .admin-review-badge--archived
  background: #fff1f0
  color: #cf1322

.admin-card-abstract
  margin-top: 16px
  font-size: 14px
  line-height: 1.8
  color: #475467

.admin-card-foot
  display: flex
  justify-content: space-between
  gap: 14px
  align-items: center
  margin-top: 18px
  flex-wrap: wrap

.admin-card-tags
  display: flex
  gap: 8px
  flex-wrap: wrap

.admin-tag
  display: inline-flex
  align-items: center
  height: 28px
  padding: 0 10px
  border-radius: 999px
  background: #f5f7fb
  font-size: 12px
  color: #5b6677

.admin-card-actions
  display: flex
  gap: 10px

.admin-action-btn
  height: 34px
  padding: 0 16px
  border-radius: 10px
  border: none
  cursor: pointer
  font-size: 13px
  font-weight: 600

.admin-action-btn--approve
  background: #e8f7ea
  color: #2b8a3e

.admin-action-btn--reject
  background: #fff1f0
  color: #cf1322

.admin-review-note
  margin-top: 14px
  padding: 12px 14px
  border-radius: 12px
  background: #fff7f5
  color: #8a2d1d
  font-size: 13px
  line-height: 1.7

.admin-pagination
  display: flex
  justify-content: center
  margin-top: 24px

.admin-modal-body
  display: flex
  flex-direction: column
  gap: 12px

.admin-modal-paper-title
  font-size: 16px
  font-weight: 700
  color: #1f2937

.admin-modal-desc
  font-size: 13px
  line-height: 1.7
  color: #667085

@media (max-width: 960px)
  .admin-stats-grid
    grid-template-columns: 1fr

  .admin-card-head
    flex-direction: column

@media (max-width: 640px)
  .admin-container
    padding: 0 18px

  .admin-search
    width: 100%

  .admin-card
    padding: 18px
</style>
