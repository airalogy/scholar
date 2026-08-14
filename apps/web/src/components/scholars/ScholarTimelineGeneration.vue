<template>
  <article class="timeline-preview" :class="`timeline-preview--${generation.status}`">
    <header class="timeline-preview-header">
      <div>
        <div class="timeline-preview-eyebrow">{{ eyebrow }}</div>
        <h4 class="timeline-preview-title">{{ title }}</h4>
      </div>
      <span class="timeline-preview-status">{{ statusLabel }}</span>
    </header>

    <div v-if="isInProgress" class="timeline-preview-progress">
      <div class="timeline-preview-progress-track">
        <span :style="{ width: `${progressPercent}%` }" />
      </div>
      <div class="timeline-preview-progress-text">
        {{ $t('scholarTimeline.progress', { stage: progressStageLabel, progress: progressPercent }) }}
      </div>
    </div>

    <p v-if="generation.errorMessage" class="timeline-preview-error">
      {{ generation.errorMessage }}
    </p>

    <dl class="timeline-preview-stats">
      <div>
        <dt>{{ $t('scholarTimeline.generatedAt') }}</dt>
        <dd>{{ generatedAt }}</dd>
      </div>
      <div>
        <dt>{{ $t('scholarTimeline.paperTotal') }}</dt>
        <dd>{{ generation.sourcePaperCount }}</dd>
      </div>
      <div>
        <dt>{{ $t('scholarTimeline.unresolvedTotal') }}</dt>
        <dd>{{ generation.unresolvedPaperCount }}</dd>
      </div>
      <div>
        <dt>{{ $t('scholarTimeline.issueTotal') }}</dt>
        <dd>{{ generation.issues.length }}</dd>
      </div>
    </dl>

    <div v-if="generation.periods.length" class="timeline-preview-periods">
      <section
        v-for="period in generation.periods"
        :key="`${period.period_start_year}-${period.period_end_year}`"
        class="timeline-preview-period"
      >
        <div class="timeline-preview-period-head">
          <strong>{{ period.period_start_year }}–{{ period.period_end_year }}</strong>
          <span>{{ $t('scholarDetail.paperCountLabel', { count: period.paper_count }) }}</span>
        </div>
        <p>{{ period.focus_summary }}</p>
        <div v-if="period.focus_tags.length" class="timeline-preview-tags">
          <span v-for="tag in period.focus_tags" :key="tag">{{ tag }}</span>
        </div>
        <button
          v-if="period.source_papers.length"
          type="button"
          class="timeline-preview-toggle"
          @click="togglePeriod(period.period_start_year)"
        >
          {{
            isExpanded(period.period_start_year)
              ? $t('scholarDetail.collapsePapers')
              : $t('scholarDetail.expandPapers')
          }}
        </button>
        <ul v-if="isExpanded(period.period_start_year)" class="timeline-preview-papers">
          <li v-for="paper in period.source_papers" :key="paper.doi || paper.title">
            <span>{{ paper.year }}</span>
            {{ paper.title }}
          </li>
        </ul>
      </section>
    </div>

    <details v-if="generation.issues.length" class="timeline-preview-issues">
      <summary>{{ $t('scholarTimeline.showIssues', { count: generation.issues.length }) }}</summary>
      <ul>
        <li v-for="issue in generation.issues" :key="issue.id">
          {{ issue.message }}
        </li>
      </ul>
    </details>
  </article>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TimelineGeneration } from '@/api/scholars'

const props = withDefaults(defineProps<{
  generation: TimelineGeneration
  title?: string
  eyebrow?: string
}>(), {
  title: '',
  eyebrow: '',
})

const { t, locale } = useI18n()
const expandedPeriods = ref<number[]>([])

const title = computed(() => props.title || props.generation.scholarName)
const eyebrow = computed(() => props.eyebrow || t('scholarTimeline.previewEyebrow'))
const isInProgress = computed(() => ['queued', 'running'].includes(props.generation.status))
const progressPercent = computed(() => {
  if (props.generation.totalPeriods > 0) {
    return Math.min(100, Math.round(
      props.generation.completedPeriods / props.generation.totalPeriods * 100,
    ))
  }
  return props.generation.status === 'queued' ? 0 : 10
})
const statusLabel = computed(() => t(`scholarTimeline.status.${props.generation.status}`))
const progressStageLabel = computed(() => {
  return t(`scholarTimeline.stage.${props.generation.progressStage}`, props.generation.progressStage)
})
const generatedAt = computed(() => {
  const value = props.generation.completedAt || props.generation.requestedAt
  return new Intl.DateTimeFormat(locale.value, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
})

const isExpanded = (startYear: number): boolean => expandedPeriods.value.includes(startYear)

const togglePeriod = (startYear: number): void => {
  expandedPeriods.value = isExpanded(startYear)
    ? expandedPeriods.value.filter((year) => year !== startYear)
    : [...expandedPeriods.value, startYear]
}
</script>

<style lang="sass" scoped>
.timeline-preview
  padding: 20px
  border: 1px solid #cbd5e1
  border-radius: 16px
  background: #f8fafc

.timeline-preview--ready
  border-color: rgba(0, 73, 143, 0.32)
  background: rgba(0, 73, 143, 0.035)

.timeline-preview--failed, .timeline-preview--rejected
  border-color: rgba(185, 28, 28, 0.3)

.timeline-preview-header
  display: flex
  align-items: flex-start
  justify-content: space-between
  gap: 18px

.timeline-preview-eyebrow
  color: #64748b
  font-size: 12px
  letter-spacing: 0.08em
  text-transform: uppercase

.timeline-preview-title
  margin: 5px 0 0
  color: #1e293b
  font-size: 17px

.timeline-preview-status
  flex-shrink: 0
  padding: 5px 11px
  border-radius: 999px
  background: #e2e8f0
  color: #334155
  font-size: 12px
  font-weight: 600

.timeline-preview-progress
  margin-top: 18px

.timeline-preview-progress-track
  height: 7px
  overflow: hidden
  border-radius: 999px
  background: #e2e8f0

.timeline-preview-progress-track span
  display: block
  height: 100%
  border-radius: inherit
  background: var(--scholar-primary)
  transition: width 0.25s ease

.timeline-preview-progress-text
  margin-top: 7px
  color: #64748b
  font-size: 12px

.timeline-preview-error
  margin: 16px 0 0
  padding: 10px 12px
  border-radius: 10px
  background: #fef2f2
  color: #991b1b
  font-size: 13px

.timeline-preview-stats
  display: grid
  grid-template-columns: repeat(4, minmax(0, 1fr))
  gap: 10px
  margin: 18px 0 0

.timeline-preview-stats div
  padding: 10px
  border-radius: 10px
  background: rgba(255, 255, 255, 0.9)

.timeline-preview-stats dt
  color: #94a3b8
  font-size: 11px

.timeline-preview-stats dd
  margin: 4px 0 0
  color: #334155
  font-size: 13px
  font-weight: 600

.timeline-preview-periods
  display: flex
  flex-direction: column
  gap: 12px
  margin-top: 18px

.timeline-preview-period
  padding: 14px
  border-radius: 12px
  background: #fff

.timeline-preview-period-head
  display: flex
  align-items: center
  justify-content: space-between
  gap: 12px
  color: #334155
  font-size: 13px

.timeline-preview-period-head span
  color: #64748b
  font-size: 12px

.timeline-preview-period p
  margin: 10px 0 0
  color: #475569
  font-size: 13px
  line-height: 1.7

.timeline-preview-tags
  display: flex
  flex-wrap: wrap
  gap: 6px
  margin-top: 10px

.timeline-preview-tags span
  padding: 3px 8px
  border-radius: 999px
  background: #eef4ff
  color: var(--scholar-primary)
  font-size: 11px

.timeline-preview-toggle
  margin-top: 12px
  padding: 0
  border: 0
  background: transparent
  color: var(--scholar-primary)
  font-size: 12px
  cursor: pointer

.timeline-preview-papers
  display: flex
  flex-direction: column
  gap: 8px
  margin: 10px 0 0
  padding: 10px 0 0 18px
  border-top: 1px dashed #cbd5e1
  color: #475569
  font-size: 12px
  line-height: 1.55

.timeline-preview-papers span
  color: #94a3b8
  margin-right: 5px

.timeline-preview-issues
  margin-top: 16px
  color: #92400e
  font-size: 12px

.timeline-preview-issues summary
  cursor: pointer

.timeline-preview-issues ul
  margin: 8px 0 0
  padding-left: 18px
  line-height: 1.6

@media (max-width: 700px)
  .timeline-preview-stats
    grid-template-columns: repeat(2, minmax(0, 1fr))

  .timeline-preview-header
    flex-direction: column
</style>
