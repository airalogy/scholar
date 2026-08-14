<template>
  <div class="scholar-detail-page">
    <div class="scholar-banner">
      <button class="scholar-back-btn" type="button" @click="$router.back()">
        <img :src="iconBack" alt="" class="scholar-back-icon" />
        <span>{{ $t('common.back') }}</span>
      </button>
    </div>

    <div v-if="isLoading" class="scholar-loading">{{ $t('common.loading') }}</div>

    <div v-else-if="!scholar" class="scholar-loading">{{ $t('scholarDetail.notFound') }}</div>

    <div v-else class="scholar-detail-body">
      <aside class="scholar-sidebar-card">
        <div class="scholar-avatar-wrapper">
          <img v-if="scholar.avatar" class="scholar-avatar" :src="scholar.avatar" :alt="scholar.name" />
          <div v-else class="scholar-avatar-placeholder">{{ scholar.name.charAt(0) }}</div>
        </div>
        <h2 class="scholar-name">{{ scholar.name }}</h2>
        <div class="scholar-title-badge">{{ scholarTitleBadge }}</div>
        <router-link :to="`/scholars/${scholar.id}/papers`" class="scholar-papers-link">
          {{ $t('common.viewAllPapers') }}
        </router-link>

        <div class="scholar-contact-list">
          <div v-if="scholarCollegeText" class="scholar-contact-item">
            <img :src="iconSchool" alt="" class="scholar-contact-icon" />
            <div class="scholar-contact-label">{{ $t('scholarDetail.collegeLabel') }}</div>
            <div class="scholar-contact-value">{{ scholarCollegeText }}</div>
          </div>
          <div v-if="scholar.lab" class="scholar-contact-item">
            <img :src="iconLab" alt="" class="scholar-contact-icon" />
            <div class="scholar-contact-label">{{ $t('scholarDetail.labLabel') }}</div>
            <router-link
              v-if="scholar.lab_slug"
              :to="`/labs/${scholar.lab_slug}`"
              class="scholar-contact-value scholar-contact-value--link"
            >
              {{ scholar.lab }}
            </router-link>
            <div v-else class="scholar-contact-value">{{ scholar.lab }}</div>
          </div>
          <div v-if="scholar.office" class="scholar-contact-item">
            <img :src="iconLocation" alt="" class="scholar-contact-icon" />
            <div class="scholar-contact-label">{{ $t('scholarDetail.officeLabel') }}</div>
            <div class="scholar-contact-value">{{ scholar.office }}</div>
          </div>
          <div v-if="scholar.email" class="scholar-contact-item">
            <img :src="iconEmail" alt="" class="scholar-contact-icon" />
            <div class="scholar-contact-label">{{ $t('scholarDetail.emailLabel') }}</div>
            <div class="scholar-contact-value">{{ scholar.email }}</div>
          </div>
          <div v-if="scholar.phone" class="scholar-contact-item">
            <img :src="iconPhone" alt="" class="scholar-contact-icon" />
            <div class="scholar-contact-label">{{ $t('scholarDetail.phoneLabel') }}</div>
            <div class="scholar-contact-value">{{ scholar.phone }}</div>
          </div>
        </div>
      </aside>

      <div class="scholar-main-content">
        <section v-if="scholar.bio" class="scholar-section">
          <h3 class="scholar-section-title"><span class="scholar-section-dot" />{{ $t('scholarDetail.bioTitle') }}</h3>
          <p class="scholar-bio">{{ scholar.bio }}</p>
        </section>

        <template v-if="scholar.education.length">
          <div class="scholar-divider" />
          <section class="scholar-section">
            <h3 class="scholar-section-title"><span class="scholar-section-dot" />{{ $t('scholarDetail.educationTitle') }}</h3>
            <div class="scholar-edu-list">
              <div v-for="(edu, idx) in scholar.education" :key="idx" class="scholar-edu-item">
                <div class="scholar-edu-dot" :class="{ 'scholar-edu-dot--first': idx === 0 }" />
                <div class="scholar-edu-info">
                  <div class="scholar-edu-header">
                    <span class="scholar-edu-school">{{ edu.school }}</span>
                    <span class="scholar-edu-degree-tag">{{ edu.degree }}</span>
                  </div>
                  <div class="scholar-edu-period">{{ edu.period }}</div>
                </div>
              </div>
            </div>
          </section>
        </template>

        <template v-if="scholar.research_directions.length">
          <div class="scholar-divider" />
          <section class="scholar-section">
            <h3 class="scholar-section-title"><span class="scholar-section-dot" />{{ $t('scholarDetail.researchTitle') }}</h3>
            <div class="scholar-research-list">
              <div v-for="(item, idx) in scholar.research_directions" :key="idx" class="scholar-research-item">
                <div class="scholar-research-num">{{ String(idx + 1).padStart(2, '0') }}</div>
                <div class="scholar-research-body">
                  <div class="scholar-research-name">{{ item.name }}</div>
                  <div class="scholar-research-desc">{{ item.description }}</div>
                </div>
              </div>
            </div>
          </section>
        </template>

        <template v-if="showTimelineGeneration">
          <div class="scholar-divider" />
          <section class="scholar-section scholar-generation-section">
            <div class="scholar-generation-head">
              <div>
                <h3 class="scholar-section-title scholar-generation-title">
                  <span class="scholar-section-dot" />{{ $t('scholarTimeline.generatorTitle') }}
                </h3>
                <p class="scholar-generation-description">{{ timelineGenerationDescription }}</p>
              </div>
              <button
                type="button"
                class="scholar-generation-button"
                :disabled="isCreatingGeneration || isGenerationActive"
                @click="handleCreateGeneration"
              >
                {{ isCreatingGeneration ? $t('common.loading') : timelineGenerationButtonLabel }}
              </button>
            </div>

            <p v-if="timelineGeneration?.reused" class="scholar-generation-cache-note">
              {{ $t('scholarTimeline.cacheReused') }}
            </p>
            <ScholarTimelineGeneration
              v-if="timelineGeneration"
              class="scholar-generation-preview"
              :generation="timelineGeneration"
              :title="$t('scholarTimeline.previewTitle')"
              :eyebrow="$t('scholarTimeline.previewWarning')"
            />
          </section>
        </template>

        <template v-if="representativeTimeline.length">
          <div class="scholar-divider" />
          <section class="scholar-section">
            <h3 class="scholar-section-title"><span class="scholar-section-dot" />{{ $t('scholarDetail.achievementsTitle') }}</h3>
            <p class="scholar-section-note">{{ $t('scholarDetail.timelineDisclaimer') }}</p>
            <div class="scholar-timeline">
              <div
                v-for="period in representativeTimeline"
                :key="period.period_start_year"
                class="scholar-timeline-year-group"
              >
                <div class="scholar-timeline-year">
                  <span class="scholar-timeline-year-text">{{ period.period_start_year }}</span>
                  <span class="scholar-timeline-year-dot" />
                </div>
                <div class="scholar-timeline-items">
                  <div class="scholar-timeline-card scholar-timeline-card--interactive">
                    <div class="scholar-timeline-card-meta">
                      <span class="scholar-timeline-card-period">
                        {{ $t('scholarDetail.periodLabel', { start: period.period_start_year, end: period.period_end_year }) }}
                      </span>
                      <span class="scholar-timeline-card-count">
                        {{ $t('scholarDetail.paperCountLabel', { count: period.paper_count }) }}
                      </span>
                    </div>
                    <div class="scholar-timeline-card-desc scholar-timeline-card-desc--summary">
                      {{ period.focus_summary }}
                    </div>
                    <button
                      v-if="period.source_papers.length"
                      class="scholar-timeline-toggle"
                      type="button"
                      @click="toggleTimelinePeriod(period.period_start_year)"
                    >
                      <span>
                        {{
                          isTimelinePeriodExpanded(period.period_start_year)
                            ? $t('scholarDetail.collapsePapers')
                            : $t('scholarDetail.expandPapers')
                        }}
                      </span>
                      <IconDown
                        class="scholar-timeline-toggle-icon"
                        :class="{ 'scholar-timeline-toggle-icon--open': isTimelinePeriodExpanded(period.period_start_year) }"
                      />
                    </button>
                    <div
                      v-if="isTimelinePeriodExpanded(period.period_start_year)"
                      class="scholar-timeline-paper-list"
                    >
                      <div
                        v-for="paper in period.source_papers"
                        :key="paper.doi || paper.title"
                        class="scholar-timeline-paper-item"
                      >
                        {{ paper.title }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div
                v-for="(group, gIdx) in supplementaryAchievements"
                :key="`supplementary-${gIdx}`"
                class="scholar-timeline-group"
              >
                <div class="scholar-timeline-phase">
                  <span class="scholar-timeline-phase-dot" :class="{ 'scholar-timeline-phase-dot--past': group.phase === 'before' }" />
                  <span class="scholar-timeline-phase-label" :class="{ 'scholar-timeline-phase-label--past': group.phase === 'before' }">{{ group.label }}</span>
                  <span class="scholar-timeline-phase-line" />
                </div>
                <div v-for="(yearGroup, yIdx) in group.years" :key="yIdx" class="scholar-timeline-year-group">
                  <div class="scholar-timeline-year">
                    <span class="scholar-timeline-year-text">{{ yearGroup.year }}</span>
                    <span class="scholar-timeline-year-dot" :class="{ 'scholar-timeline-year-dot--past': group.phase === 'before' }" />
                  </div>
                  <div class="scholar-timeline-items">
                    <div v-for="(item, iIdx) in yearGroup.items" :key="iIdx" class="scholar-timeline-card">
                      <div class="scholar-timeline-card-title">{{ item.title }}</div>
                      <div class="scholar-timeline-card-desc">{{ item.description }}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </template>

        <template v-else-if="scholar.achievements.length">
          <div class="scholar-divider" />
          <section class="scholar-section">
            <h3 class="scholar-section-title"><span class="scholar-section-dot" />{{ $t('scholarDetail.achievementsTitle') }}</h3>
            <p class="scholar-section-note">{{ $t('scholarDetail.timelineDisclaimer') }}</p>
            <div class="scholar-timeline">
              <div v-for="(group, gIdx) in scholar.achievements" :key="gIdx" class="scholar-timeline-group">
                <div class="scholar-timeline-phase">
                  <span class="scholar-timeline-phase-dot" :class="{ 'scholar-timeline-phase-dot--past': group.phase === 'before' }" />
                  <span class="scholar-timeline-phase-label" :class="{ 'scholar-timeline-phase-label--past': group.phase === 'before' }">{{ group.label }}</span>
                  <span class="scholar-timeline-phase-line" />
                </div>
                <div v-for="(yearGroup, yIdx) in group.years" :key="yIdx" class="scholar-timeline-year-group">
                  <div class="scholar-timeline-year">
                    <span class="scholar-timeline-year-text">{{ yearGroup.year }}</span>
                    <span class="scholar-timeline-year-dot" :class="{ 'scholar-timeline-year-dot--past': group.phase === 'before' }" />
                  </div>
                  <div class="scholar-timeline-items">
                    <div v-for="(item, iIdx) in yearGroup.items" :key="iIdx" class="scholar-timeline-card">
                      <div class="scholar-timeline-card-title">{{ item.title }}</div>
                      <div class="scholar-timeline-card-desc">{{ item.description }}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onBeforeUnmount, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Message } from '@arco-design/web-vue'
import { IconDown } from '@arco-design/web-vue/es/icon'
import {
  createTimelineGeneration,
  getScholar,
  getTimelineGeneration,
  type ScholarResponse,
  type TimelineGeneration,
} from '@/api/scholars'
import ScholarTimelineGeneration from '@/components/scholars/ScholarTimelineGeneration.vue'
import { useAuth } from '@/composables/useAuth'
import { usePublicConfig } from '@/composables/usePublicConfig'
import { formatScholarCollege } from '@/utils/scholars'
import {
  canShowScholarTimelineGeneration,
  getTimelinePollingDelay,
  isActiveTimelineGeneration,
} from '@/utils/scholarTimeline'
import iconSchool from '@/assets/scholars/icon-school.svg?url'
import iconLab from '@/assets/scholars/icon-lab.svg?url'
import iconLocation from '@/assets/scholars/icon-location.svg?url'
import iconEmail from '@/assets/scholars/icon-email.svg?url'
import iconPhone from '@/assets/scholars/icon-phone.svg?url'
import iconBack from '@/assets/scholars/icon-back.svg?url'

const route = useRoute()
const { t } = useI18n()
const { isLoggedIn, canAccessAdmin } = useAuth()
const { scholarTimeline } = usePublicConfig()
const isLoading = ref(true)
const scholar = ref<ScholarResponse | null>(null)
const expandedTimelinePeriods = ref<number[]>([])
const timelineGeneration = ref<TimelineGeneration | null>(null)
const isCreatingGeneration = ref(false)
let timelinePollTimer: ReturnType<typeof setTimeout> | null = null
let timelinePollController: AbortController | null = null

const representativeTimeline = computed(() => {
  return scholar.value?.research_timeline ?? []
})

const scholarCollegeText = computed(() => {
  return formatScholarCollege(scholar.value?.college)
})

const scholarTitleBadge = computed(() => {
  return [scholarCollegeText.value, scholar.value?.title].filter(Boolean).join(' | ')
})

const supplementaryAchievements = computed(() => {
  return (scholar.value?.achievements ?? [])
    .filter((group) => group.label !== '代表成果')
})

const timelineGenerationMode = computed(() => scholarTimeline.value.generationMode)
const showTimelineGeneration = computed(() => {
  return canShowScholarTimelineGeneration(
    timelineGenerationMode.value,
    isLoggedIn.value,
    canAccessAdmin.value,
  )
})
const isGenerationActive = computed(() => {
  return isActiveTimelineGeneration(timelineGeneration.value)
})
const timelineGenerationButtonLabel = computed(() => {
  if (timelineGenerationMode.value === 'request_only' && !canAccessAdmin.value) {
    return t('scholarTimeline.requestUpdate')
  }
  if (timelineGenerationMode.value === 'preview' && !canAccessAdmin.value) {
    return t('scholarTimeline.generatePreview')
  }
  return t('scholarTimeline.adminGenerate')
})
const timelineGenerationDescription = computed(() => {
  return t(`scholarTimeline.modeDescription.${timelineGenerationMode.value}`)
})

const isTimelinePeriodExpanded = (periodStartYear: number): boolean => {
  return expandedTimelinePeriods.value.includes(periodStartYear)
}

const toggleTimelinePeriod = (periodStartYear: number): void => {
  if (isTimelinePeriodExpanded(periodStartYear)) {
    expandedTimelinePeriods.value = expandedTimelinePeriods.value
      .filter((value) => value !== periodStartYear)
    return
  }

  expandedTimelinePeriods.value = [...expandedTimelinePeriods.value, periodStartYear]
}

const clearTimelinePolling = (): void => {
  if (timelinePollTimer) {
    clearTimeout(timelinePollTimer)
    timelinePollTimer = null
  }
  timelinePollController?.abort()
  timelinePollController = null
}

const pollTimelineGeneration = async (): Promise<void> => {
  if (!scholar.value || !timelineGeneration.value) {
    return
  }

  timelinePollController?.abort()
  const controller = new AbortController()
  timelinePollController = controller
  try {
    const generation = await getTimelineGeneration(
      scholar.value.id,
      timelineGeneration.value.id,
      controller.signal,
    )
    timelineGeneration.value = generation
    const pollDelay = getTimelinePollingDelay(generation.status)
    if (pollDelay !== null) {
      timelinePollTimer = setTimeout(() => void pollTimelineGeneration(), pollDelay)
    }
  } catch (error) {
    if (!controller.signal.aborted) {
      Message.error(error instanceof Error ? error.message : t('scholarTimeline.loadFailed'))
    }
  }
}

const createRequestKey = (): string => {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `timeline-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const handleCreateGeneration = async (): Promise<void> => {
  if (!scholar.value || isCreatingGeneration.value) {
    return
  }
  isCreatingGeneration.value = true
  clearTimelinePolling()
  try {
    const generation = await createTimelineGeneration(
      scholar.value.id,
      createRequestKey(),
      false,
    )
    timelineGeneration.value = generation
    if (generation.status === 'requested') {
      Message.success(t('scholarTimeline.requestSubmitted'))
    } else if (generation.reused) {
      Message.success(t('scholarTimeline.cacheReused'))
    } else {
      Message.success(t('scholarTimeline.generationQueued'))
    }
    const pollDelay = getTimelinePollingDelay(generation.status)
    if (pollDelay !== null) {
      timelinePollTimer = setTimeout(() => void pollTimelineGeneration(), pollDelay)
    }
  } catch (error) {
    Message.error(error instanceof Error ? error.message : t('scholarTimeline.createFailed'))
  } finally {
    isCreatingGeneration.value = false
  }
}

watch(scholar, () => {
  expandedTimelinePeriods.value = []
})

onMounted(async () => {
  try {
    scholar.value = await getScholar(route.params.id as string)
  } catch {
    scholar.value = null
  } finally {
    isLoading.value = false
  }
})

onBeforeUnmount(() => {
  clearTimelinePolling()
})
</script>

<style lang="sass" scoped>
.scholar-detail-page
  background: #f5f7fa
  min-height: calc(100vh - var(--scholar-navbar-height))

.scholar-banner
  height: 200px
  background: var(--scholar-primary)
  position: relative
  padding: 16px 80px

.scholar-loading
  display: flex
  align-items: center
  justify-content: center
  min-height: 300px
  font-size: 14px
  color: var(--scholar-text-3)

.scholar-back-btn
  display: flex
  align-items: center
  gap: 8px
  height: 38px
  padding: 0 17px
  border-radius: 999px
  border: 1px solid rgba(255, 255, 255, 0.1)
  background: rgba(0, 0, 0, 0.1)
  color: rgba(255, 255, 255, 0.9)
  font-size: 14px
  font-weight: 500
  cursor: pointer
  letter-spacing: -0.15px

.scholar-back-btn:hover
  background: rgba(0, 0, 0, 0.2)

.scholar-back-icon
  width: 16px
  height: 16px

.scholar-detail-body
  display: flex
  gap: 30px
  max-width: 1060px
  margin: -120px auto 0
  padding: 0 30px 60px
  position: relative

.scholar-sidebar-card
  width: 260px
  flex-shrink: 0
  background: #fff
  border-radius: 20px
  padding: 30px 24px
  display: flex
  flex-direction: column
  align-items: center
  align-self: flex-start
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06)

.scholar-avatar-wrapper
  width: 110px
  height: 110px
  border-radius: 50%
  overflow: hidden
  margin-bottom: 16px

.scholar-avatar
  width: 100%
  height: 100%
  object-fit: cover

.scholar-avatar-placeholder
  width: 100%
  height: 100%
  background: var(--scholar-primary-light)
  color: var(--scholar-primary)
  font-size: 42px
  font-weight: 600
  display: flex
  align-items: center
  justify-content: center

.scholar-name
  font-size: 22px
  font-weight: 600
  color: #364153
  margin: 0 0 8px

.scholar-title-badge
  font-size: 13px
  color: #fff
  background: var(--scholar-primary)
  border-radius: 999px
  padding: 4px 14px
  margin-bottom: 14px
  letter-spacing: -0.15px

.scholar-papers-link
  display: inline-flex
  align-items: center
  justify-content: center
  min-height: 38px
  padding: 0 18px
  border-radius: 999px
  background: var(--scholar-primary-light)
  color: var(--scholar-primary)
  text-decoration: none
  font-size: 14px
  font-weight: 600
  margin-bottom: 24px

.scholar-contact-list
  width: 100%
  display: flex
  flex-direction: column
  gap: 18px

.scholar-contact-item
  display: grid
  grid-template-columns: 18px 1fr
  grid-template-rows: auto auto
  gap: 2px 10px
  align-items: start

.scholar-contact-icon
  width: 18px
  height: 18px
  grid-row: 1 / 3
  margin-top: 2px

.scholar-contact-label
  font-size: 12px
  color: #9da3ab
  line-height: 18px

.scholar-contact-value
  font-size: 13px
  color: #364153
  font-weight: 500
  line-height: 18px
  word-break: break-all

.scholar-contact-value--link
  color: var(--scholar-primary)
  text-decoration: none

.scholar-contact-value--link:hover
  color: var(--scholar-primary-hover)

.scholar-main-content
  flex: 1
  min-width: 0
  background: #fff
  border-radius: 20px
  padding: 36px 40px
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06)

.scholar-section
  margin-bottom: 6px

.scholar-section-title
  display: flex
  align-items: center
  gap: 10px
  font-size: 18px
  font-weight: 600
  color: #364153
  margin: 0 0 20px

.scholar-section-note
  margin: -8px 0 20px
  padding: 10px 12px
  border-radius: 12px
  background: rgba(241, 139, 28, 0.08)
  color: #8a4b11
  font-size: 13px
  line-height: 1.6

.scholar-section-dot
  width: 8px
  height: 8px
  border-radius: 50%
  background: var(--scholar-primary)
  flex-shrink: 0

.scholar-generation-section
  display: flex
  flex-direction: column
  gap: 16px

.scholar-generation-head
  display: flex
  align-items: flex-start
  justify-content: space-between
  gap: 22px

.scholar-generation-title
  margin-bottom: 8px

.scholar-generation-description
  max-width: 560px
  margin: 0
  color: #64748b
  font-size: 13px
  line-height: 1.65

.scholar-generation-button
  flex-shrink: 0
  min-height: 40px
  padding: 0 17px
  border: 0
  border-radius: 999px
  background: var(--scholar-primary)
  color: #fff
  font-size: 13px
  font-weight: 600
  cursor: pointer

.scholar-generation-button:disabled
  cursor: not-allowed
  opacity: 0.55

.scholar-generation-cache-note
  margin: 0
  color: #166534
  font-size: 12px

.scholar-generation-preview
  margin-top: 2px

.scholar-bio
  font-size: 14px
  color: #45556c
  line-height: 1.8
  margin: 0

.scholar-divider
  height: 1px
  background: var(--scholar-border-light)
  margin: 28px 0

.scholar-edu-list
  display: flex
  flex-direction: column
  gap: 20px
  padding-left: 4px

.scholar-edu-item
  display: flex
  align-items: flex-start
  gap: 16px
  position: relative

.scholar-edu-dot
  width: 10px
  height: 10px
  border-radius: 50%
  border: 2px solid #90a1b9
  background: #fff
  flex-shrink: 0
  margin-top: 6px
  position: relative
  z-index: 1

.scholar-edu-dot--first
  border-color: var(--scholar-primary)
  background: var(--scholar-primary)

.scholar-edu-item:not(:last-child)::before
  content: ''
  position: absolute
  left: 4px
  top: 18px
  bottom: -22px
  width: 2px
  background: #dbeafe

.scholar-edu-info
  flex: 1

.scholar-edu-header
  display: flex
  align-items: center
  gap: 10px
  margin-bottom: 4px

.scholar-edu-school
  font-size: 15px
  font-weight: 500
  color: #364153

.scholar-edu-degree-tag
  font-size: 12px
  color: var(--scholar-primary)
  background: rgba(0, 73, 143, 0.08)
  border-radius: 999px
  padding: 2px 10px
  font-weight: 500

.scholar-edu-period
  font-size: 13px
  color: #9da3ab

.scholar-research-list
  display: flex
  flex-direction: column
  gap: 18px

.scholar-research-item
  display: flex
  gap: 18px
  padding: 18px 22px
  background: #f8fafc
  border-radius: 14px

.scholar-research-num
  font-size: 28px
  font-weight: 700
  color: rgba(0, 73, 143, 0.12)
  line-height: 1
  flex-shrink: 0
  width: 40px

.scholar-research-body
  flex: 1

.scholar-research-name
  font-size: 15px
  font-weight: 600
  color: #364153
  margin-bottom: 6px

.scholar-research-desc
  font-size: 13px
  color: #62748e
  line-height: 1.6

.scholar-timeline
  padding-left: 0

.scholar-timeline-group
  margin-bottom: 30px

.scholar-timeline-group:last-child
  margin-bottom: 0

.scholar-timeline-phase
  display: flex
  align-items: center
  gap: 12px
  margin-bottom: 20px

.scholar-timeline-phase-dot
  width: 8px
  height: 8px
  border-radius: 50%
  background: var(--scholar-primary)
  flex-shrink: 0

.scholar-timeline-phase-dot--past
  background: #90a1b9

.scholar-timeline-phase-label
  font-size: 14px
  font-weight: 600
  color: var(--scholar-primary)
  letter-spacing: 0.7px
  white-space: nowrap

.scholar-timeline-phase-label--past
  color: #62748e

.scholar-timeline-phase-line
  flex: 1
  height: 1px
  background: #dbeafe

.scholar-timeline-year-group
  display: flex
  gap: 20px
  margin-bottom: 18px
  padding-left: 20px

.scholar-timeline-year-group:last-child
  margin-bottom: 0

.scholar-timeline-year
  width: 60px
  flex-shrink: 0
  display: flex
  align-items: flex-start
  gap: 8px
  padding-top: 16px

.scholar-timeline-year-text
  font-size: 14px
  font-weight: 600
  color: var(--scholar-primary)

.scholar-timeline-year-dot
  width: 8px
  height: 8px
  border-radius: 50%
  background: #f18b1c
  flex-shrink: 0
  margin-top: 5px

.scholar-timeline-year-dot--past
  background: #90a1b9

.scholar-timeline-items
  flex: 1
  display: flex
  flex-direction: column
  gap: 18px

.scholar-timeline-card
  background: #f8fafc
  border-radius: 16px
  padding: 18px
  border: 1px solid transparent

.scholar-timeline-card--interactive
  border-color: rgba(148, 163, 184, 0.16)
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5)

.scholar-timeline-card-meta
  display: flex
  align-items: center
  justify-content: space-between
  gap: 12px
  flex-wrap: wrap
  margin-bottom: 12px

.scholar-timeline-card-period
  display: inline-flex
  align-items: center
  min-height: 28px
  padding: 0 12px
  border-radius: 999px
  background: rgba(0, 73, 143, 0.08)
  color: var(--scholar-primary)
  font-size: 12px
  font-weight: 600

.scholar-timeline-card-count
  font-size: 12px
  color: #90a1b9
  font-weight: 500

.scholar-timeline-card-title
  font-size: 15px
  font-weight: 600
  color: #364153
  margin-bottom: 6px

.scholar-timeline-card-desc
  font-size: 14px
  color: #45556c
  line-height: 1.7
  font-weight: 300

.scholar-timeline-card-desc--summary
  margin-bottom: 14px

.scholar-timeline-toggle
  width: 100%
  display: flex
  align-items: center
  justify-content: space-between
  gap: 12px
  border: none
  border-radius: 12px
  background: rgba(0, 73, 143, 0.04)
  color: var(--scholar-primary)
  font-size: 13px
  font-weight: 600
  cursor: pointer
  padding: 12px 14px
  transition: background 0.2s ease

.scholar-timeline-toggle:hover
  background: rgba(0, 73, 143, 0.08)

.scholar-timeline-toggle-icon
  font-size: 14px
  transition: transform 0.2s ease

.scholar-timeline-toggle-icon--open
  transform: rotate(180deg)

.scholar-timeline-paper-list
  display: flex
  flex-direction: column
  gap: 10px
  margin-top: 14px
  padding-top: 14px
  border-top: 1px dashed rgba(148, 163, 184, 0.4)

.scholar-timeline-paper-item
  position: relative
  padding-left: 18px
  font-size: 13px
  color: #45556c
  line-height: 1.6

.scholar-timeline-paper-item::before
  content: ''
  position: absolute
  left: 0
  top: 8px
  width: 6px
  height: 6px
  border-radius: 50%
  background: #f18b1c

@media (max-width: 700px)
  .scholar-generation-head
    flex-direction: column

  .scholar-generation-button
    width: 100%
</style>
