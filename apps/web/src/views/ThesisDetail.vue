<template>
  <div class="detail-page">
    <router-link to="/theses" class="back-link">← {{ $t('degreeTheses.backToList') }}</router-link>
    <div v-if="loading" class="state-card">{{ $t('common.loading') }}</div>
    <div v-else-if="errorMessage" class="state-card state-card--error">{{ errorMessage }}</div>
    <template v-else-if="thesis && displayVersion">
      <header class="detail-header">
        <div class="header-main">
          <div class="badges">
            <span class="status-badge" :class="`status-badge--${thesis.status}`">
              {{ $t(`degreeTheses.status.${thesis.status}`) }}
            </span>
            <span class="meta-badge">{{ displayVersion.degree_category }}</span>
            <span class="meta-badge">{{ displayVersion.award_year }}</span>
          </div>
          <h1>{{ displayVersion.title }}</h1>
          <p v-if="displayVersion.title_en" class="title-en">{{ displayVersion.title_en }}</p>
          <div class="author-line">
            <strong>{{ displayVersion.author_name }}</strong>
            <span>{{ displayVersion.training_unit }}</span>
            <span>{{ displayVersion.major }}</span>
          </div>
        </div>
        <div class="header-actions">
          <router-link v-if="thesis.can_edit" :to="`/theses/${thesis.id}/edit`" class="secondary-btn">
            {{ $t('degreeTheses.edit') }}
          </router-link>
          <a v-if="previewUrl" :href="previewUrl" target="_blank" rel="noopener" class="primary-btn">
            {{ $t('degreeTheses.readThesis') }}
          </a>
          <a v-if="downloadUrl" :href="downloadUrl" rel="noopener" class="secondary-btn">
            {{ $t('degreeTheses.downloadThesis') }}
          </a>
        </div>
      </header>

      <div v-if="thesis.decision_notes" class="review-alert">
        <strong>{{ $t('degreeTheses.reviewNote') }}</strong>
        <span>{{ thesis.decision_notes }}</span>
      </div>

      <main class="detail-grid" :class="{ 'detail-grid--single': !hasReviewPanel }">
        <article class="content-card">
          <section>
            <h2>{{ $t('degreeTheses.abstractLabel') }}</h2>
            <p class="abstract">{{ displayVersion.abstract || $t('common.noAbstract') }}</p>
          </section>
          <section>
            <h2>{{ $t('degreeTheses.metadata') }}</h2>
            <dl class="metadata-grid">
              <div><dt>{{ $t('degreeTheses.recordCodeLabel') }}</dt><dd class="record-code">{{ thesis.record_code }}</dd></div>
              <div v-if="thesis.institution_reference"><dt>{{ $t('degreeTheses.institutionReferenceLabel') }}</dt><dd>{{ thesis.institution_reference }}</dd></div>
              <div><dt>{{ $t('degreeTheses.authorLabel') }}</dt><dd>{{ displayVersion.author_name }}</dd></div>
              <div v-if="displayVersion.student_id"><dt>{{ $t('degreeTheses.studentIdLabel') }}</dt><dd>{{ displayVersion.student_id }}</dd></div>
              <div><dt>{{ $t('degreeTheses.trainingUnitLabel') }}</dt><dd>{{ displayVersion.training_unit }}</dd></div>
              <div><dt>{{ $t('degreeTheses.majorLabel') }}</dt><dd>{{ displayVersion.major }}</dd></div>
              <div><dt>{{ $t('degreeTheses.degreeCategoryLabel') }}</dt><dd>{{ displayVersion.degree_category }}</dd></div>
              <div><dt>{{ $t('degreeTheses.awardYearLabel') }}</dt><dd>{{ displayVersion.award_year }}</dd></div>
              <div><dt>{{ $t('degreeTheses.advisorsLabel') }}</dt><dd>{{ displayVersion.advisors.join('、') || $t('common.notFilled') }}</dd></div>
              <div><dt>{{ $t('degreeTheses.languageLabel') }}</dt><dd>{{ displayVersion.language }}</dd></div>
              <div><dt>{{ $t('degreeTheses.visibilityLabel') }}</dt><dd>{{ $t(`degreeTheses.visibility.${displayVersion.visibility}`) }}</dd></div>
              <div><dt>{{ $t('degreeTheses.versionLabel') }}</dt><dd>v{{ displayVersion.version_number }}</dd></div>
            </dl>
          </section>
          <section v-if="displayVersion.keywords.length">
            <h2>{{ $t('degreeTheses.keywordsLabel') }}</h2>
            <div class="keywords"><span v-for="keyword in displayVersion.keywords" :key="keyword">{{ keyword }}</span></div>
          </section>
        </article>

        <aside v-if="hasReviewPanel" class="review-card">
          <h2>{{ $t('degreeTheses.reviewProgress') }}</h2>
          <ol v-if="thesis.review_steps.length" class="steps">
            <li v-for="step in thesis.review_steps" :key="step.id" :class="`step--${step.status}`">
              <span class="step-index">{{ step.order }}</span>
              <div>
                <strong>{{ step.name }}</strong>
                <p>{{ $t(`degreeTheses.stepStatus.${step.status}`) }}</p>
                <small v-if="step.review_notes">{{ step.review_notes }}</small>
              </div>
            </li>
          </ol>
          <h3 v-if="thesis.review_history.length">{{ $t('degreeTheses.history') }}</h3>
          <div class="history-list">
            <div v-for="action in thesis.review_history" :key="action.id" class="history-item">
              <strong>{{ action.actor_name }} · {{ actionLabel(action.action) }}</strong>
              <span>{{ formatDate(action.created_at) }}</span>
              <p v-if="action.notes">{{ action.notes }}</p>
            </div>
          </div>
        </aside>
      </main>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { getDegreeThesis, type DegreeThesis } from '@/api/theses'
import { resolveSafeHttpUrl } from '@/utils/url'

const route = useRoute()
const { t, locale } = useI18n()
const thesis = ref<DegreeThesis | null>(null)
const loading = ref(false)
const errorMessage = ref('')
const displayVersion = computed(() => thesis.value?.current_version ?? thesis.value?.published_version ?? null)
const previewUrl = computed(() => resolveSafeHttpUrl(displayVersion.value?.preview_url ?? null))
const downloadUrl = computed(() => resolveSafeHttpUrl(displayVersion.value?.download_url ?? null))
const hasReviewPanel = computed(() => Boolean(thesis.value?.review_steps.length || thesis.value?.review_history.length))

const formatDate = (value: string): string => {
  return new Intl.DateTimeFormat(locale.value === 'zh-CN' ? 'zh-CN' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

const actionLabel = (action: string): string => {
  const key = `degreeTheses.actions.${action}`
  const translated = t(key)
  return translated === key ? action : translated
}

onMounted(async () => {
  loading.value = true
  try {
    thesis.value = await getDegreeThesis(String(route.params.id ?? ''))
  } catch (error) {
    if (typeof error === 'object' && error && 'response' in error) {
      errorMessage.value =
        (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
        t('degreeTheses.loadFailed')
    } else {
      errorMessage.value = t('degreeTheses.loadFailed')
    }
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.detail-page { max-width: 1180px; margin: 0 auto; padding: 38px 38px 80px; }
.back-link { display: inline-block; margin-bottom: 24px; color: var(--scholar-text-secondary); text-decoration: none; }
.detail-header { display: flex; justify-content: space-between; gap: 32px; align-items: flex-start; padding: 32px; background: #fff; border: 1px solid var(--scholar-border-light); border-radius: 14px; }
.header-main { max-width: 820px; }
.badges { display: flex; gap: 8px; flex-wrap: wrap; }
.status-badge, .meta-badge { border-radius: 999px; padding: 5px 11px; font-size: 12px; background: #f2f4f7; }
.status-badge--approved { color: #067647; background: #ecfdf3; }
.status-badge--pending_review { color: #b54708; background: #fffaeb; }
.status-badge--changes_requested { color: #b42318; background: #fef3f2; }
h1 { margin: 18px 0 10px; font-size: 30px; line-height: 1.45; }
.title-en { color: var(--scholar-text-secondary); font-size: 16px; }
.author-line { display: flex; gap: 10px 20px; flex-wrap: wrap; margin-top: 20px; color: var(--scholar-text-secondary); }
.header-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.primary-btn, .secondary-btn { padding: 10px 16px; border-radius: 8px; text-decoration: none; font-weight: 600; white-space: nowrap; }
.primary-btn { background: var(--scholar-primary); color: #fff; }
.secondary-btn { border: 1px solid var(--scholar-border-input); color: var(--scholar-text-primary); }
.review-alert { display: grid; gap: 5px; margin-top: 18px; padding: 16px 20px; border: 1px solid #fecdca; border-radius: 10px; color: #b42318; background: #fff4f2; }
.detail-grid { display: grid; grid-template-columns: minmax(0, 1fr) 330px; gap: 20px; margin-top: 20px; }
.detail-grid--single { grid-template-columns: minmax(0, 1fr); }
.content-card, .review-card { background: #fff; border: 1px solid var(--scholar-border-light); border-radius: 14px; padding: 28px; }
.content-card section + section { margin-top: 30px; padding-top: 24px; border-top: 1px solid var(--scholar-border-light); }
h2 { margin: 0 0 16px; font-size: 18px; }
.abstract { white-space: pre-wrap; line-height: 1.85; color: var(--scholar-text-secondary); }
.metadata-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px 28px; }
.metadata-grid div { min-width: 0; }
.metadata-grid dt { color: var(--scholar-text-secondary); font-size: 13px; }
.metadata-grid dd { margin: 5px 0 0; overflow-wrap: anywhere; }
.record-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.keywords { display: flex; gap: 8px; flex-wrap: wrap; }
.keywords span { padding: 5px 10px; border-radius: 999px; color: var(--scholar-primary); background: var(--scholar-primary-light); font-size: 12px; }
.steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 16px; }
.steps li { display: flex; gap: 12px; color: var(--scholar-text-secondary); }
.step-index { display: grid; place-items: center; width: 28px; height: 28px; flex: 0 0 28px; border-radius: 50%; background: #f2f4f7; }
.step--approved .step-index { color: #067647; background: #dcfae6; }
.step--pending .step-index { color: #b54708; background: #fef0c7; }
.steps strong { color: var(--scholar-text-primary); }
.steps p { margin: 4px 0; font-size: 13px; }
.review-card h3 { margin: 28px 0 12px; font-size: 15px; }
.history-list { display: grid; gap: 12px; }
.history-item { display: grid; gap: 3px; padding-left: 12px; border-left: 2px solid var(--scholar-border-input); font-size: 13px; }
.history-item span { color: var(--scholar-text-secondary); }
.history-item p { margin: 3px 0 0; }
.state-card { padding: 48px; text-align: center; border: 1px solid var(--scholar-border-light); border-radius: 12px; background: #fff; }
.state-card--error { color: #b42318; }
@media (max-width: 900px) { .detail-grid { grid-template-columns: 1fr; } }
@media (max-width: 680px) { .detail-page { padding: 26px 18px 60px; } .detail-header { flex-direction: column; padding: 22px; } .metadata-grid { grid-template-columns: 1fr; } }
</style>
