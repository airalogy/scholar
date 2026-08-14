<template>
  <div class="lab-page">
    <div v-if="isLoading" class="lab-state">{{ $t('common.loading') }}</div>

    <div v-else-if="!lab" class="lab-state">{{ $t('labDetail.notFound') }}</div>

    <template v-else>
      <section class="lab-hero">
        <div class="lab-hero-inner">
          <button class="lab-back-btn" type="button" @click="$router.back()">
            {{ $t('common.back') }}
          </button>
          <div class="lab-hero-copy">
            <div class="lab-eyebrow">Laboratory Hub</div>
            <h1 class="lab-title">{{ lab.name }}</h1>
            <p class="lab-summary">
              {{ lab.summary || $t('labDetail.summaryFallback') }}
            </p>
            <div class="lab-meta">
              <span v-if="lab.college" class="lab-meta-pill">{{ lab.college }}</span>
              <span v-if="lab.location" class="lab-meta-pill">{{ lab.location }}</span>
              <a
                v-if="resolveSafeHttpUrl(lab.website)"
                :href="resolveSafeHttpUrl(lab.website)"
                target="_blank"
                rel="noopener"
                class="lab-meta-pill lab-meta-pill--link"
              >
                {{ $t('common.website') }}
              </a>
              <router-link
                :to="`/labs/${lab.slug}/papers`"
                class="lab-meta-pill lab-meta-pill--action"
              >
                {{ $t('common.viewAllPapers') }}
              </router-link>
            </div>
          </div>
        </div>
      </section>

      <div class="lab-body">
        <section class="lab-stats-grid">
          <div class="lab-stat-card">
            <div class="lab-stat-label">{{ $t('labDetail.scholarCount') }}</div>
            <div class="lab-stat-value">{{ lab.scholarCount }}</div>
          </div>
          <div class="lab-stat-card">
            <div class="lab-stat-label">{{ $t('labDetail.memberCount') }}</div>
            <div class="lab-stat-value">{{ lab.memberCount }}</div>
          </div>
          <div class="lab-stat-card">
            <div class="lab-stat-label">{{ $t('labDetail.representativePaperCount') }}</div>
            <div class="lab-stat-value">{{ lab.representativePaperCount }}</div>
          </div>
        </section>

        <section class="lab-section">
          <div class="lab-section-head">
            <h2 class="lab-section-title">{{ $t('labDetail.introTitle') }}</h2>
          </div>
          <div class="lab-overview-card">
            <p class="lab-overview-text">
              {{ lab.summary || $t('labDetail.introEmpty') }}
            </p>
            <div class="lab-overview-grid">
              <div class="lab-overview-item">
                <div class="lab-overview-label">{{ $t('common.college') }}</div>
                <div class="lab-overview-value">{{ lab.college || $t('common.notFilled') }}</div>
              </div>
              <div class="lab-overview-item">
                <div class="lab-overview-label">{{ $t('common.location') }}</div>
                <div class="lab-overview-value">{{ lab.location || $t('common.notFilled') }}</div>
              </div>
              <div class="lab-overview-item">
                <div class="lab-overview-label">{{ $t('common.labHomepage') }}</div>
                <a
                  v-if="resolveSafeHttpUrl(lab.website)"
                  :href="resolveSafeHttpUrl(lab.website)"
                  target="_blank"
                  rel="noopener"
                  class="lab-overview-link"
                >
                  {{ lab.website }}
                </a>
                <div v-else class="lab-overview-value">{{ $t('common.notFilled') }}</div>
              </div>
            </div>
          </div>
        </section>

        <section class="lab-section">
          <div class="lab-section-head">
            <h2 class="lab-section-title">{{ $t('labDetail.scholarTitle') }}</h2>
          </div>
          <div v-if="lab.scholars.length" class="lab-people-grid">
            <router-link
              v-for="scholar in lab.scholars"
              :key="scholar.id"
              :to="`/scholars/${scholar.id}`"
              class="lab-person-card"
            >
              <div class="lab-person-avatar">
                <img v-if="scholar.avatar" :src="scholar.avatar" :alt="scholar.name" />
                <span v-else>{{ scholar.name.charAt(0) }}</span>
              </div>
              <div class="lab-person-name">{{ scholar.name }}</div>
              <div class="lab-person-subtitle">
                {{ formatLabScholarSubtitle(scholar) }}
              </div>
              <div class="lab-tag-list">
                <span
                  v-for="direction in scholar.research_directions.slice(0, 3)"
                  :key="direction.name"
                  class="lab-tag"
                >
                  {{ direction.name }}
                </span>
              </div>
            </router-link>
          </div>
          <div v-else class="lab-empty-card">{{ $t('labDetail.noScholars') }}</div>
        </section>

        <section class="lab-section">
          <div class="lab-section-head">
            <h2 class="lab-section-title">{{ $t('labDetail.membersTitle') }}</h2>
          </div>
          <div v-if="lab.members.length" class="lab-members-list">
            <div v-for="member in lab.members" :key="member.id" class="lab-member-row">
              <div class="lab-member-avatar">
                <img v-if="member.avatar" :src="member.avatar" :alt="member.name" />
                <span v-else>{{ member.name.charAt(0) }}</span>
              </div>
              <div class="lab-member-main">
                <div class="lab-member-title-row">
                  <div class="lab-member-name">{{ member.name }}</div>
                  <span v-if="member.degree" class="lab-member-degree">{{ member.degree }}</span>
                </div>
                <div class="lab-member-meta">
                  {{ member.major || $t('common.degreeMajorFallback') }}
                </div>
                <div v-if="member.research_interests" class="lab-member-interests">
                  {{ member.research_interests }}
                </div>
              </div>
            </div>
          </div>
          <div v-else class="lab-empty-card">{{ $t('labDetail.noMembers') }}</div>
        </section>

        <section class="lab-section">
          <div class="lab-section-head">
            <h2 class="lab-section-title">{{ $t('labDetail.representativePapersTitle') }}</h2>
          </div>
          <div v-if="lab.representativePapers.length" class="lab-paper-list">
            <router-link
              v-for="paper in lab.representativePapers"
              :key="paper.id"
              :to="`/papers/${paper.id}`"
              class="lab-paper-card"
            >
              <div v-if="hasPublishYear(paper.publish_year)" class="lab-paper-year">{{ paper.publish_year }}</div>
              <div class="lab-paper-main">
                <div class="lab-paper-title">{{ paper.title }}</div>
                <div class="lab-paper-authors">{{ paper.authors.join('、') }}</div>
                <div class="lab-paper-journal">
                  {{ paper.journal_name || $t('labDetail.sourceFallback') }}<span v-if="paper.doi"> · DOI: {{ paper.doi }}</span>
                </div>
                <div class="lab-tag-list">
                  <span v-for="keyword in paper.keywords.slice(0, 4)" :key="keyword" class="lab-tag lab-tag--paper">
                    {{ keyword }}
                  </span>
                </div>
              </div>
            </router-link>
          </div>
          <div v-else class="lab-empty-card">{{ $t('labDetail.noPapers') }}</div>
        </section>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { getLab, type LabDetailResponse } from '@/api/labs'
import { hasPublishYear } from '@/utils/papers'
import { formatScholarCollege } from '@/utils/scholars'
import { resolveSafeHttpUrl } from '@/utils/url'

const route = useRoute()
const isLoading = ref(false)
const lab = ref<LabDetailResponse | null>(null)

type LabScholarItem = LabDetailResponse['scholars'][number]

const formatLabScholarSubtitle = (scholar: LabScholarItem): string => {
  return [
    scholar.title || '学者',
    formatScholarCollege(scholar.college),
  ].filter(Boolean).join(' · ')
}

const load = async (slug: string): Promise<void> => {
  isLoading.value = true
  try {
    lab.value = await getLab(slug)
  } catch {
    lab.value = null
  } finally {
    isLoading.value = false
  }
}

watch(
  () => String(route.params.slug ?? ''),
  (slug) => {
    if (!slug) {
      lab.value = null
      return
    }
    void load(slug)
  },
  { immediate: true }
)
</script>

<style lang="sass" scoped>
.lab-page
  min-height: calc(100vh - var(--scholar-navbar-height))
  background: linear-gradient(180deg, #f6f8fb 0%, #ffffff 30%, #f8fafc 100%)

.lab-state
  min-height: 360px
  display: flex
  align-items: center
  justify-content: center
  font-size: 14px
  color: var(--scholar-text-3)

.lab-hero
  background: linear-gradient(135deg, #0f2f57 0%, #14599a 55%, #2b7abc 100%)
  color: #fff

.lab-hero-inner
  width: 1120px
  max-width: 100%
  margin: 0 auto
  padding: 36px 32px 44px

.lab-back-btn
  height: 38px
  padding: 0 16px
  border-radius: 999px
  border: 1px solid rgba(255, 255, 255, 0.2)
  background: rgba(255, 255, 255, 0.08)
  color: #fff
  font-size: 13px
  cursor: pointer

.lab-back-btn:hover
  background: rgba(255, 255, 255, 0.14)

.lab-hero-copy
  margin-top: 24px
  max-width: 820px

.lab-eyebrow
  font-size: 12px
  letter-spacing: 0.24em
  text-transform: uppercase
  opacity: 0.72
  margin-bottom: 14px

.lab-title
  margin: 0
  font-size: 40px
  line-height: 1.1
  letter-spacing: -0.04em

.lab-summary
  margin: 18px 0 0
  font-size: 15px
  line-height: 1.85
  color: rgba(255, 255, 255, 0.88)

.lab-meta
  display: flex
  flex-wrap: wrap
  gap: 10px
  margin-top: 22px

.lab-meta-pill
  display: inline-flex
  align-items: center
  height: 34px
  padding: 0 14px
  border-radius: 999px
  background: rgba(255, 255, 255, 0.1)
  font-size: 13px

.lab-meta-pill--link
  color: #fff
  text-decoration: none

.lab-meta-pill--action
  color: #0f2f57
  background: #fff
  text-decoration: none

.lab-body
  width: 1120px
  max-width: 100%
  margin: -24px auto 0
  padding: 0 32px 48px

.lab-stats-grid
  display: grid
  grid-template-columns: repeat(3, minmax(0, 1fr))
  gap: 16px

.lab-stat-card
  background: #fff
  border: 1px solid rgba(15, 47, 87, 0.08)
  border-radius: 22px
  padding: 22px 24px
  box-shadow: 0 16px 40px rgba(15, 47, 87, 0.08)

.lab-stat-label
  font-size: 13px
  color: var(--scholar-text-3)

.lab-stat-value
  margin-top: 12px
  font-size: 34px
  font-weight: 700
  color: #0f2f57
  letter-spacing: -0.04em

.lab-section
  margin-top: 28px

.lab-section-head
  display: flex
  align-items: center
  justify-content: space-between
  margin-bottom: 14px

.lab-section-title
  margin: 0
  font-size: 22px
  font-weight: 700
  color: #1f2937

.lab-overview-card,
.lab-empty-card
  background: #fff
  border-radius: 22px
  border: 1px solid rgba(15, 47, 87, 0.08)
  box-shadow: 0 12px 32px rgba(15, 47, 87, 0.06)

.lab-overview-card
  padding: 24px 26px

.lab-overview-text
  margin: 0
  font-size: 15px
  line-height: 1.9
  color: #41526b

.lab-overview-grid
  display: grid
  grid-template-columns: repeat(3, minmax(0, 1fr))
  gap: 14px
  margin-top: 22px

.lab-overview-item
  padding: 16px 18px
  border-radius: 18px
  background: #f8fafc

.lab-overview-label
  font-size: 12px
  color: #7b8797
  margin-bottom: 8px

.lab-overview-value,
.lab-overview-link
  font-size: 14px
  color: #1f2937
  line-height: 1.6
  word-break: break-all

.lab-overview-link
  text-decoration: none
  color: var(--scholar-primary)

.lab-people-grid
  display: grid
  grid-template-columns: repeat(3, minmax(0, 1fr))
  gap: 16px

.lab-person-card
  background: #fff
  border-radius: 22px
  border: 1px solid rgba(15, 47, 87, 0.08)
  padding: 22px
  text-decoration: none
  color: inherit
  box-shadow: 0 12px 32px rgba(15, 47, 87, 0.06)
  transition: transform 0.2s ease, box-shadow 0.2s ease

.lab-person-card:hover
  transform: translateY(-2px)
  box-shadow: 0 18px 40px rgba(15, 47, 87, 0.1)

.lab-person-avatar,
.lab-member-avatar
  width: 58px
  height: 58px
  border-radius: 50%
  overflow: hidden
  background: #dbeafe
  color: #1d4ed8
  display: flex
  align-items: center
  justify-content: center
  font-size: 22px
  font-weight: 700

.lab-person-avatar img,
.lab-member-avatar img
  width: 100%
  height: 100%
  object-fit: cover

.lab-person-name
  margin-top: 16px
  font-size: 20px
  font-weight: 700
  color: #1f2937

.lab-person-subtitle
  margin-top: 8px
  font-size: 13px
  line-height: 1.6
  color: #6b7280

.lab-tag-list
  display: flex
  flex-wrap: wrap
  gap: 8px
  margin-top: 16px

.lab-tag
  display: inline-flex
  align-items: center
  height: 28px
  padding: 0 10px
  border-radius: 999px
  background: #eef5ff
  color: #215d98
  font-size: 12px

.lab-tag--paper
  background: #f5f7fb
  color: #5a6b82

.lab-members-list
  display: flex
  flex-direction: column
  gap: 14px

.lab-member-row
  display: flex
  gap: 18px
  align-items: flex-start
  background: #fff
  border-radius: 20px
  border: 1px solid rgba(15, 47, 87, 0.08)
  padding: 18px 20px
  box-shadow: 0 10px 28px rgba(15, 47, 87, 0.05)

.lab-member-main
  flex: 1
  min-width: 0

.lab-member-title-row
  display: flex
  gap: 10px
  align-items: center
  flex-wrap: wrap

.lab-member-name
  font-size: 17px
  font-weight: 700
  color: #1f2937

.lab-member-degree
  display: inline-flex
  align-items: center
  height: 24px
  padding: 0 10px
  border-radius: 999px
  background: #fff4e6
  color: #c26c0c
  font-size: 12px

.lab-member-meta
  margin-top: 8px
  font-size: 13px
  color: #667085

.lab-member-interests
  margin-top: 10px
  font-size: 14px
  line-height: 1.75
  color: #425466

.lab-paper-list
  display: flex
  flex-direction: column
  gap: 14px

.lab-paper-card
  display: flex
  gap: 20px
  align-items: flex-start
  background: #fff
  border-radius: 22px
  border: 1px solid rgba(15, 47, 87, 0.08)
  padding: 20px 22px
  text-decoration: none
  color: inherit
  box-shadow: 0 12px 32px rgba(15, 47, 87, 0.06)

.lab-paper-year
  width: 70px
  flex-shrink: 0
  font-size: 28px
  font-weight: 700
  color: #14599a
  letter-spacing: -0.04em

.lab-paper-main
  min-width: 0
  flex: 1

.lab-paper-title
  font-size: 18px
  font-weight: 700
  line-height: 1.6
  color: #1f2937

.lab-paper-authors
  margin-top: 8px
  font-size: 13px
  color: #667085

.lab-paper-journal
  margin-top: 10px
  font-size: 13px
  color: #475467
  line-height: 1.7

.lab-empty-card
  padding: 28px
  font-size: 14px
  color: var(--scholar-text-3)
  text-align: center

@media (max-width: 960px)
  .lab-hero-inner
    padding: 28px 20px 36px

  .lab-body
    padding: 0 20px 40px

  .lab-stats-grid,
  .lab-overview-grid,
  .lab-people-grid
    grid-template-columns: 1fr

  .lab-paper-card
    flex-direction: column

  .lab-paper-year
    width: auto

@media (max-width: 640px)
  .lab-title
    font-size: 32px

  .lab-member-row
    flex-direction: column
</style>
