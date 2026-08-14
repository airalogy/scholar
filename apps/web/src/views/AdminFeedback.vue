<template>
  <div class="admin-page">
    <div class="admin-container">
      <div class="admin-header">
        <div>
          <div class="admin-eyebrow">{{ $t('adminFeedback.eyebrow') }}</div>
          <h1 class="admin-title">{{ $t('adminFeedback.title') }}</h1>
          <p class="admin-subtitle">{{ $t('adminFeedback.subtitle') }}</p>
        </div>
        <router-link to="/admin" class="back-link">{{ $t('adminFeedback.backToAdmin') }}</router-link>
      </div>

      <div class="admin-stats-grid">
        <button class="admin-stat-card" type="button" @click="setStatusFilter('pending')">
          <div class="admin-stat-label">{{ getStatusLabel('pending') }}</div>
          <div class="admin-stat-value">{{ statusTotals.pending }}</div>
        </button>
        <button class="admin-stat-card" type="button" @click="setStatusFilter('processed')">
          <div class="admin-stat-label">{{ getStatusLabel('processed') }}</div>
          <div class="admin-stat-value">{{ statusTotals.processed }}</div>
        </button>
      </div>

      <div class="admin-toolbar">
        <div class="admin-search">
          <a-input
            v-model="query"
            :placeholder="$t('adminFeedback.searchPlaceholder')"
            allow-clear
            @press-enter="onSearch"
          />
          <button class="admin-search-btn" type="button" @click="onSearch">{{ $t('common.search') }}</button>
        </div>
        <div class="admin-filter-controls">
          <a-select
            v-model="typeFilter"
            class="admin-filter-select"
            :placeholder="$t('adminFeedback.typeFilterPlaceholder')"
            allow-clear
          >
            <a-option value="bug_report">{{ getTypeLabel('bug_report') }}</a-option>
            <a-option value="feature_request">{{ getTypeLabel('feature_request') }}</a-option>
          </a-select>
          <div class="admin-filter-pills">
            <button
              class="admin-filter-pill"
              :class="{ 'admin-filter-pill--active': statusFilter === '' }"
              type="button"
              @click="setStatusFilter('')"
            >
              {{ $t('common.all') }}
            </button>
            <button
              v-for="status in statusOptions"
              :key="status"
              class="admin-filter-pill"
              :class="{ 'admin-filter-pill--active': statusFilter === status }"
              type="button"
              @click="setStatusFilter(status)"
            >
              {{ getStatusLabel(status) }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="isLoading" class="admin-state">{{ $t('common.loading') }}</div>
      <div v-else-if="loadError" class="admin-state">{{ loadError }}</div>
      <div v-else-if="!feedbackItems.length" class="admin-state">{{ $t('adminFeedback.empty') }}</div>

      <div v-else class="admin-list">
        <article v-for="item in feedbackItems" :key="item.id" class="feedback-card">
          <div class="feedback-card-head">
            <div class="feedback-card-main">
              <div class="feedback-card-title">{{ item.title }}</div>
              <div class="feedback-card-meta">
                <span>{{ getSubmitterLabel(item) }}</span>
                <span>{{ $t('adminFeedback.submittedAt', { date: formatDate(item.createdAt) }) }}</span>
              </div>
            </div>
            <div class="feedback-card-badges">
              <span class="feedback-type-badge">{{ getTypeLabel(item.type) }}</span>
              <span class="feedback-status-badge" :class="`feedback-status-badge--${item.status}`">
                {{ getStatusLabel(item.status) }}
              </span>
            </div>
          </div>

          <p class="feedback-content">{{ item.content }}</p>

          <div class="feedback-card-foot">
            <div class="feedback-handler">
              <span v-if="item.handledAt && item.handledByName">
                {{ $t('adminFeedback.handledBy', {
                  name: item.handledByName,
                  date: formatDate(item.handledAt),
                }) }}
              </span>
              <span v-else-if="item.handledAt">
                {{ $t('adminFeedback.handledAt', { date: formatDate(item.handledAt) }) }}
              </span>
            </div>
            <a-button
              size="small"
              :type="item.status === 'processed' ? 'outline' : 'primary'"
              :loading="activeActionId === item.id"
              @click="toggleStatus(item)"
            >
              {{ item.status === 'processed'
                ? $t('adminFeedback.reopen')
                : $t('adminFeedback.markProcessed') }}
            </a-button>
          </div>
        </article>
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
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { Message } from '@arco-design/web-vue'
import { useI18n } from 'vue-i18n'
import {
  listFeedback,
  updateFeedbackStatus,
  type FeedbackItem,
  type FeedbackStatus,
  type FeedbackStatusTotals,
  type FeedbackType,
} from '@/api/feedback'
import { FEEDBACK_STATUS_LABEL_KEYS, FEEDBACK_TYPE_LABEL_KEYS } from '@/i18n/helpers'

const statusOptions: FeedbackStatus[] = ['pending', 'processed']
const pageSize = 10

const query = ref('')
const statusFilter = ref<FeedbackStatus | ''>('')
const typeFilter = ref<FeedbackType | ''>('')
const page = ref(1)
const total = ref(0)
const feedbackItems = ref<FeedbackItem[]>([])
const isLoading = ref(false)
const loadError = ref('')
const activeActionId = ref('')
const statusTotals = ref<FeedbackStatusTotals>({
  pending: 0,
  processed: 0,
})
const { t, locale } = useI18n()

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { message?: unknown } } }).response
    if (typeof response?.data?.message === 'string') {
      return response.data.message
    }
  }

  return fallback
}

const formatDate = (value: string): string => {
  return new Intl.DateTimeFormat(locale.value, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

const getTypeLabel = (type: FeedbackType): string => {
  return t(FEEDBACK_TYPE_LABEL_KEYS[type])
}

const getStatusLabel = (status: FeedbackStatus): string => {
  return t(FEEDBACK_STATUS_LABEL_KEYS[status])
}

const getSubmitterLabel = (item: FeedbackItem): string => {
  if (item.userName) {
    return t('adminFeedback.submitter', { name: item.userName })
  }

  return t('adminFeedback.anonymousSubmitter', { email: item.email ?? t('common.unknown') })
}

const load = async (): Promise<void> => {
  isLoading.value = true
  loadError.value = ''

  try {
    const response = await listFeedback({
      q: query.value.trim() || undefined,
      status: statusFilter.value || undefined,
      type: typeFilter.value || undefined,
      limit: pageSize,
      offset: (page.value - 1) * pageSize,
    })
    feedbackItems.value = response.items
    total.value = response.total
    statusTotals.value = response.statusTotals
  } catch (error) {
    loadError.value = getErrorMessage(error, t('adminFeedback.loadFailed'))
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

const setStatusFilter = (status: FeedbackStatus | ''): void => {
  statusFilter.value = status
}

const toggleStatus = async (item: FeedbackItem): Promise<void> => {
  const nextStatus: FeedbackStatus = item.status === 'processed' ? 'pending' : 'processed'
  activeActionId.value = item.id

  try {
    await updateFeedbackStatus(item.id, nextStatus)
    Message.success(t('adminFeedback.statusUpdated'))
    await load()
  } catch (error) {
    Message.error(getErrorMessage(error, t('adminFeedback.statusUpdateFailed')))
  } finally {
    activeActionId.value = ''
  }
}

watch([statusFilter, typeFilter], () => {
  page.value = 1
  void load()
}, { immediate: true })
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

.back-link
  display: inline-flex
  align-items: center
  min-height: 38px
  padding: 0 14px
  border-radius: 999px
  background: #eef4ff
  color: #0f2f57
  font-size: 14px
  font-weight: 600
  text-decoration: none

.admin-stats-grid
  display: grid
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr))
  gap: 16px
  margin-bottom: 20px

.admin-stat-card
  text-align: left
  padding: 20px 22px
  border-radius: 8px
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
  flex: 0 0 auto
  min-width: 72px
  height: 36px
  padding: 0 18px
  border: none
  border-radius: 8px
  background: var(--scholar-primary)
  color: #fff
  white-space: nowrap
  cursor: pointer

.admin-filter-controls
  display: flex
  align-items: center
  gap: 12px
  flex-wrap: wrap

.admin-filter-select
  width: 160px

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

.feedback-card
  padding: 22px
  border-radius: 8px
  border: 1px solid rgba(15, 47, 87, 0.08)
  background: #fff
  box-shadow: 0 14px 34px rgba(15, 47, 87, 0.06)

.feedback-card-head
  display: flex
  justify-content: space-between
  gap: 16px
  align-items: flex-start

.feedback-card-main
  min-width: 0
  flex: 1

.feedback-card-title
  font-size: 20px
  line-height: 1.5
  color: #1f2937
  font-weight: 700
  overflow-wrap: anywhere

.feedback-card-meta
  display: flex
  flex-wrap: wrap
  gap: 10px
  margin-top: 8px
  font-size: 13px
  color: #667085

.feedback-card-badges
  display: flex
  align-items: center
  gap: 8px
  flex-wrap: wrap
  justify-content: flex-end

.feedback-type-badge,
.feedback-status-badge
  display: inline-flex
  align-items: center
  height: 30px
  padding: 0 12px
  border-radius: 999px
  font-size: 12px
  font-weight: 600

.feedback-type-badge
  background: #f5f7fb
  color: #5b6677

.feedback-status-badge--pending
  background: #fff7e8
  color: #d48806

.feedback-status-badge--processed
  background: #f0f9eb
  color: #389e0d

.feedback-content
  margin: 16px 0 0
  white-space: pre-wrap
  overflow-wrap: anywhere
  font-size: 14px
  line-height: 1.8
  color: #475467

.feedback-card-foot
  display: flex
  justify-content: space-between
  gap: 14px
  align-items: center
  margin-top: 18px
  flex-wrap: wrap

.feedback-handler
  min-height: 22px
  font-size: 13px
  color: #667085

.admin-pagination
  display: flex
  justify-content: center
  margin-top: 24px

@media (max-width: 768px)
  .admin-container
    padding: 0 18px

  .admin-header,
  .feedback-card-head
    flex-direction: column

  .admin-search,
  .admin-filter-controls,
  .admin-filter-select
    width: 100%
</style>
