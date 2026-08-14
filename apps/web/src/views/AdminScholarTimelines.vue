<template>
  <div class="timeline-admin-page">
    <div class="timeline-admin-container">
      <header class="timeline-admin-header">
        <div>
          <router-link to="/admin" class="timeline-admin-back">
            {{ $t('common.back') }}
          </router-link>
          <h1>{{ $t('scholarTimelineAdmin.title') }}</h1>
          <p>{{ $t('scholarTimelineAdmin.subtitle') }}</p>
        </div>
        <div class="timeline-admin-toolbar">
          <select v-model="statusFilter" @change="loadGenerations">
            <option value="">{{ $t('scholarTimelineAdmin.allStatuses') }}</option>
            <option v-for="status in statuses" :key="status" :value="status">
              {{ $t(`scholarTimeline.status.${status}`) }}
            </option>
          </select>
          <button type="button" :disabled="isLoading" @click="loadGenerations">
            {{ $t('scholarTimelineAdmin.refresh') }}
          </button>
        </div>
      </header>

      <div v-if="loadError" class="timeline-admin-error">{{ loadError }}</div>
      <div class="timeline-admin-layout">
        <aside class="timeline-admin-list">
          <div v-if="isLoading" class="timeline-admin-empty">{{ $t('common.loading') }}</div>
          <template v-else>
            <button
              v-for="generation in generations"
              :key="generation.id"
              type="button"
              class="timeline-admin-list-item"
              :class="{ 'timeline-admin-list-item--active': selectedId === generation.id }"
              @click="selectGeneration(generation)"
            >
              <span class="timeline-admin-list-name">{{ generation.scholarName }}</span>
              <span class="timeline-admin-list-status">
                {{ $t(`scholarTimeline.status.${generation.status}`) }}
              </span>
              <span class="timeline-admin-list-meta">
                {{ formatDate(generation.requestedAt) }} · {{ generation.sourcePaperCount }}
                {{ $t('scholarTimelineAdmin.paperUnit') }}
              </span>
            </button>
          </template>
          <div v-if="!isLoading && !generations.length" class="timeline-admin-empty">
            {{ $t('scholarTimelineAdmin.empty') }}
          </div>
        </aside>

        <main class="timeline-admin-detail">
          <div v-if="isLoadingDetail" class="timeline-admin-empty">{{ $t('common.loading') }}</div>
          <template v-else-if="selectedGeneration">
            <div class="timeline-admin-actions">
              <textarea
                v-model="reviewNotes"
                :placeholder="$t('scholarTimelineAdmin.notesPlaceholder')"
                rows="2"
              />
              <div>
                <button
                  v-if="selectedGeneration.status === 'requested'"
                  type="button"
                  class="timeline-admin-primary"
                  :disabled="isMutating"
                  @click="handleStart"
                >
                  {{ $t('scholarTimelineAdmin.start') }}
                </button>
                <button
                  v-if="selectedGeneration.status === 'ready'"
                  type="button"
                  class="timeline-admin-primary"
                  :disabled="isMutating"
                  @click="handlePublish"
                >
                  {{ $t('scholarTimelineAdmin.publish') }}
                </button>
                <button
                  v-if="rejectableStatuses.includes(selectedGeneration.status)"
                  type="button"
                  class="timeline-admin-danger"
                  :disabled="isMutating"
                  @click="handleReject"
                >
                  {{ $t('scholarTimelineAdmin.reject') }}
                </button>
              </div>
            </div>

            <section v-if="publishedTimeline.length" class="timeline-admin-current">
              <h2>{{ $t('scholarTimelineAdmin.currentPublished') }}</h2>
              <div class="timeline-admin-current-grid">
                <article
                  v-for="period in publishedTimeline"
                  :key="period.period_start_year"
                >
                  <strong>{{ period.period_start_year }}–{{ period.period_end_year }}</strong>
                  <span>{{ period.paper_count }} {{ $t('scholarTimelineAdmin.paperUnit') }}</span>
                  <p>{{ period.focus_summary }}</p>
                </article>
              </div>
            </section>

            <ScholarTimelineGeneration
              :generation="selectedGeneration"
              :eyebrow="$t('scholarTimelineAdmin.candidate')"
            />
          </template>
          <div v-else class="timeline-admin-empty">
            {{ $t('scholarTimelineAdmin.selectPrompt') }}
          </div>
        </main>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import { useI18n } from 'vue-i18n'
import {
  getScholar,
  getTimelineGeneration,
  listTimelineGenerations,
  publishTimelineGeneration,
  rejectTimelineGeneration,
  startTimelineGeneration,
  type ScholarResearchPeriod,
  type TimelineGeneration,
  type TimelineGenerationStatus,
} from '@/api/scholars'
import ScholarTimelineGeneration from '@/components/scholars/ScholarTimelineGeneration.vue'

const { t, locale } = useI18n()
const statuses: TimelineGenerationStatus[] = [
  'requested',
  'queued',
  'running',
  'ready',
  'failed',
  'rejected',
  'published',
  'archived',
]
const rejectableStatuses: TimelineGenerationStatus[] = ['requested', 'ready', 'failed']
const generations = ref<TimelineGeneration[]>([])
const selectedGeneration = ref<TimelineGeneration | null>(null)
const selectedId = ref('')
const publishedTimeline = ref<ScholarResearchPeriod[]>([])
const statusFilter = ref<'' | TimelineGenerationStatus>('')
const reviewNotes = ref('')
const isLoading = ref(false)
const isLoadingDetail = ref(false)
const isMutating = ref(false)
const loadError = ref('')
let pollTimer: ReturnType<typeof setTimeout> | null = null
let pollController: AbortController | null = null

const stopPolling = (): void => {
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
  pollController?.abort()
  pollController = null
}

const formatDate = (value: string): string => {
  return new Intl.DateTimeFormat(locale.value, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

const loadGenerations = async (): Promise<void> => {
  isLoading.value = true
  loadError.value = ''
  try {
    const result = await listTimelineGenerations({
      ...(statusFilter.value ? { status: statusFilter.value } : {}),
      limit: 100,
    })
    generations.value = result.items
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : t('scholarTimelineAdmin.loadFailed')
  } finally {
    isLoading.value = false
  }
}

const schedulePolling = (generation: TimelineGeneration): void => {
  stopPolling()
  if (generation.status === 'queued' || generation.status === 'running') {
    pollTimer = setTimeout(() => void refreshSelected(), 2000)
  }
}

const refreshSelected = async (): Promise<void> => {
  const generation = selectedGeneration.value
  if (!generation) {
    return
  }
  pollController?.abort()
  const controller = new AbortController()
  pollController = controller
  try {
    const detail = await getTimelineGeneration(
      generation.scholarId,
      generation.id,
      controller.signal,
    )
    selectedGeneration.value = detail
    const listItem = generations.value.find((item) => item.id === detail.id)
    if (listItem) {
      Object.assign(listItem, detail)
    }
    schedulePolling(detail)
  } catch (error) {
    if (!controller.signal.aborted) {
      Message.error(error instanceof Error ? error.message : t('scholarTimelineAdmin.loadFailed'))
    }
  }
}

const selectGeneration = async (generation: TimelineGeneration): Promise<void> => {
  stopPolling()
  selectedId.value = generation.id
  selectedGeneration.value = null
  publishedTimeline.value = []
  reviewNotes.value = generation.reviewNotes ?? ''
  isLoadingDetail.value = true
  try {
    const [detail, scholar] = await Promise.all([
      getTimelineGeneration(generation.scholarId, generation.id),
      getScholar(generation.scholarId),
    ])
    if (selectedId.value !== generation.id) {
      return
    }
    selectedGeneration.value = detail
    publishedTimeline.value = scholar.research_timeline
    schedulePolling(detail)
  } catch (error) {
    Message.error(error instanceof Error ? error.message : t('scholarTimelineAdmin.loadFailed'))
  } finally {
    isLoadingDetail.value = false
  }
}

const mutateSelected = async (
  action: (generation: TimelineGeneration) => Promise<TimelineGeneration>,
  successMessage: string,
): Promise<void> => {
  if (!selectedGeneration.value || isMutating.value) {
    return
  }
  isMutating.value = true
  try {
    const result = await action(selectedGeneration.value)
    selectedGeneration.value = result
    Message.success(successMessage)
    await loadGenerations()
    schedulePolling(result)
    if (result.status === 'published') {
      const scholar = await getScholar(result.scholarId)
      publishedTimeline.value = scholar.research_timeline
    }
  } catch (error) {
    Message.error(error instanceof Error ? error.message : t('scholarTimelineAdmin.actionFailed'))
  } finally {
    isMutating.value = false
  }
}

const handleStart = async (): Promise<void> => {
  await mutateSelected(
    (generation) => startTimelineGeneration(generation.scholarId, generation.id),
    t('scholarTimelineAdmin.started'),
  )
}

const handlePublish = async (): Promise<void> => {
  await mutateSelected(
    (generation) => publishTimelineGeneration(
      generation.scholarId,
      generation.id,
      reviewNotes.value,
    ),
    t('scholarTimelineAdmin.published'),
  )
}

const handleReject = async (): Promise<void> => {
  await mutateSelected(
    (generation) => rejectTimelineGeneration(
      generation.scholarId,
      generation.id,
      reviewNotes.value,
    ),
    t('scholarTimelineAdmin.rejected'),
  )
}

onMounted(() => {
  void loadGenerations()
})

onBeforeUnmount(() => {
  stopPolling()
})
</script>

<style lang="sass" scoped>
.timeline-admin-page
  min-height: calc(100vh - var(--scholar-navbar-height))
  padding: 30px 0 54px
  background: #f8fafc

.timeline-admin-container
  width: 1240px
  max-width: 100%
  margin: 0 auto
  padding: 0 28px

.timeline-admin-header
  display: flex
  align-items: flex-end
  justify-content: space-between
  gap: 24px
  margin-bottom: 24px

.timeline-admin-back
  color: var(--scholar-primary)
  font-size: 13px
  text-decoration: none

.timeline-admin-header h1
  margin: 10px 0 0
  color: #1e293b
  font-size: 28px

.timeline-admin-header p
  margin: 8px 0 0
  color: #64748b
  font-size: 14px

.timeline-admin-toolbar
  display: flex
  gap: 10px

.timeline-admin-toolbar select, .timeline-admin-toolbar button
  min-height: 40px
  padding: 0 14px
  border: 1px solid #cbd5e1
  border-radius: 10px
  background: #fff
  color: #334155

.timeline-admin-toolbar button
  cursor: pointer

.timeline-admin-layout
  display: grid
  grid-template-columns: 310px minmax(0, 1fr)
  gap: 20px
  align-items: start

.timeline-admin-list, .timeline-admin-detail
  border: 1px solid #e2e8f0
  border-radius: 16px
  background: #fff

.timeline-admin-list
  display: flex
  flex-direction: column
  max-height: calc(100vh - 210px)
  overflow-y: auto

.timeline-admin-list-item
  display: grid
  grid-template-columns: minmax(0, 1fr) auto
  gap: 5px 10px
  padding: 15px
  border: 0
  border-bottom: 1px solid #f1f5f9
  background: transparent
  text-align: left
  cursor: pointer

.timeline-admin-list-item--active
  background: #eef4ff

.timeline-admin-list-name
  overflow: hidden
  color: #1e293b
  font-size: 14px
  font-weight: 600
  text-overflow: ellipsis
  white-space: nowrap

.timeline-admin-list-status
  color: var(--scholar-primary)
  font-size: 12px

.timeline-admin-list-meta
  grid-column: 1 / -1
  color: #94a3b8
  font-size: 11px

.timeline-admin-detail
  min-height: 360px
  padding: 20px

.timeline-admin-empty
  padding: 30px 18px
  color: #94a3b8
  font-size: 13px
  text-align: center

.timeline-admin-error
  margin-bottom: 16px
  padding: 12px
  border-radius: 10px
  background: #fef2f2
  color: #991b1b
  font-size: 13px

.timeline-admin-actions
  display: flex
  align-items: flex-start
  gap: 12px
  margin-bottom: 18px

.timeline-admin-actions textarea
  flex: 1
  resize: vertical
  padding: 10px 12px
  border: 1px solid #cbd5e1
  border-radius: 10px
  color: #334155
  font: inherit

.timeline-admin-actions > div
  display: flex
  gap: 8px

.timeline-admin-primary, .timeline-admin-danger
  min-height: 40px
  padding: 0 15px
  border: 0
  border-radius: 999px
  color: #fff
  font-size: 13px
  font-weight: 600
  cursor: pointer

.timeline-admin-primary
  background: var(--scholar-primary)

.timeline-admin-danger
  background: #b91c1c

.timeline-admin-primary:disabled, .timeline-admin-danger:disabled
  cursor: not-allowed
  opacity: 0.55

.timeline-admin-current
  margin-bottom: 18px
  padding: 16px
  border: 1px dashed #cbd5e1
  border-radius: 14px

.timeline-admin-current h2
  margin: 0 0 12px
  color: #475569
  font-size: 14px

.timeline-admin-current-grid
  display: grid
  grid-template-columns: repeat(2, minmax(0, 1fr))
  gap: 10px

.timeline-admin-current article
  padding: 10px
  border-radius: 10px
  background: #f8fafc

.timeline-admin-current strong
  color: #334155
  font-size: 12px

.timeline-admin-current span
  margin-left: 8px
  color: #94a3b8
  font-size: 11px

.timeline-admin-current p
  margin: 6px 0 0
  color: #64748b
  font-size: 12px
  line-height: 1.5

@media (max-width: 900px)
  .timeline-admin-header, .timeline-admin-actions
    flex-direction: column
    align-items: stretch

  .timeline-admin-layout
    grid-template-columns: 1fr

  .timeline-admin-list
    max-height: 300px

@media (max-width: 600px)
  .timeline-admin-current-grid
    grid-template-columns: 1fr
</style>
