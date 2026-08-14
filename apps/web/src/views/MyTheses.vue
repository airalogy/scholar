<template>
  <div class="workspace-page">
    <header class="workspace-header">
      <div>
        <h1>{{ $t('degreeTheses.myTheses') }}</h1>
        <span>{{ $t('degreeTheses.myThesesSubtitle') }}</span>
      </div>
      <router-link to="/theses/submit" class="primary-btn">{{ $t('degreeTheses.createTitle') }}</router-link>
    </header>

    <div v-if="loading" class="state-card">{{ $t('common.loading') }}</div>
    <div v-else-if="errorMessage" class="state-card state-card--error">{{ errorMessage }}</div>
    <div v-else-if="!items.length" class="state-card empty-state">
      <p>{{ $t('degreeTheses.noMyTheses') }}</p>
      <router-link to="/theses/submit" class="primary-btn">{{ $t('degreeTheses.submitThesis') }}</router-link>
    </div>
    <div v-else class="workspace-list">
      <article v-for="thesis in items" :key="thesis.id" class="workspace-card">
        <div class="card-main">
          <div class="card-status" :class="`card-status--${thesis.status}`">
            {{ statusLabel(thesis.status) }}
          </div>
          <h2>{{ thesis.current_version?.title || thesis.published_version?.title }}</h2>
          <small class="record-code">{{ thesis.record_code }}</small>
          <p>
            {{ thesis.current_version?.training_unit || thesis.published_version?.training_unit }} ·
            {{ thesis.current_version?.degree_category || thesis.published_version?.degree_category }} ·
            {{ thesis.current_version?.award_year || thesis.published_version?.award_year }}
          </p>
          <div v-if="thesis.decision_notes" class="review-note">
            {{ $t('degreeTheses.reviewNote') }}：{{ thesis.decision_notes }}
          </div>
          <div v-if="thesis.current_step" class="current-step">
            {{ $t('degreeTheses.currentStep', { step: thesis.current_step }) }}
          </div>
        </div>
        <div class="card-actions">
          <router-link :to="`/theses/${thesis.record_code}`" class="secondary-btn">{{ $t('degreeTheses.viewDetail') }}</router-link>
          <router-link v-if="thesis.can_edit" :to="`/theses/${thesis.id}/edit`" class="secondary-btn">
            {{ $t('degreeTheses.edit') }}
          </router-link>
          <button
            v-if="canSubmit(thesis)"
            class="primary-btn"
            type="button"
            :disabled="submittingId === thesis.id"
            @click="submit(thesis.id)"
          >
            {{ submittingId === thesis.id ? $t('degreeTheses.submitting') : $t('degreeTheses.submitReview') }}
          </button>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import { useI18n } from 'vue-i18n'
import {
  listMyDegreeTheses,
  submitDegreeThesis,
  type DegreeThesis,
  type DegreeThesisStatus,
} from '@/api/theses'

const { t } = useI18n()
const items = ref<DegreeThesis[]>([])
const loading = ref(false)
const errorMessage = ref('')
const submittingId = ref('')

const statusLabel = (status: DegreeThesisStatus): string => t(`degreeTheses.status.${status}`)

const canSubmit = (thesis: DegreeThesis): boolean => {
  if (!thesis.can_edit) {
    return false
  }
  if (thesis.status === 'draft' || thesis.status === 'changes_requested') {
    return true
  }
  return thesis.status === 'approved' && thesis.current_version?.id !== thesis.published_version?.id
}

const load = async (): Promise<void> => {
  loading.value = true
  try {
    items.value = (await listMyDegreeTheses()).items
  } catch {
    errorMessage.value = t('degreeTheses.loadFailed')
  } finally {
    loading.value = false
  }
}

const submit = async (id: string): Promise<void> => {
  submittingId.value = id
  try {
    const updated = await submitDegreeThesis(id)
    items.value = items.value.map((item) => (item.id === id ? updated : item))
    Message.success(t('degreeTheses.submitSuccess'))
  } catch {
    Message.error(t('degreeTheses.submitFailed'))
  } finally {
    submittingId.value = ''
  }
}

onMounted(load)
</script>

<style scoped>
.workspace-page { max-width: 1080px; margin: 0 auto; padding: 44px 36px 80px; }
.workspace-header { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; margin-bottom: 28px; }
.workspace-header h1 { margin: 0 0 8px; font-size: 32px; }
.workspace-header span { color: var(--scholar-text-secondary); }
.workspace-list { display: grid; gap: 15px; }
.workspace-card { display: flex; justify-content: space-between; gap: 24px; padding: 24px; border: 1px solid var(--scholar-border-light); border-radius: 12px; background: #fff; }
.card-main h2 { margin: 10px 0 8px; font-size: 19px; }
.record-code { display: block; margin: -2px 0 8px; color: var(--scholar-text-secondary); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.card-main p { margin: 0; color: var(--scholar-text-secondary); }
.card-status { display: inline-flex; border-radius: 999px; padding: 4px 10px; font-size: 12px; color: #475467; background: #f2f4f7; }
.card-status--approved { color: #067647; background: #ecfdf3; }
.card-status--pending_review { color: #b54708; background: #fffaeb; }
.card-status--changes_requested { color: #b42318; background: #fef3f2; }
.review-note { margin-top: 12px; border-left: 3px solid #f97066; padding: 8px 12px; color: #b42318; background: #fff4f2; }
.current-step { margin-top: 10px; color: var(--scholar-primary); font-size: 13px; }
.card-actions { display: flex; gap: 9px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
.primary-btn, .secondary-btn { border-radius: 8px; padding: 9px 15px; text-decoration: none; font-weight: 600; cursor: pointer; white-space: nowrap; }
.primary-btn { border: 1px solid var(--scholar-primary); background: var(--scholar-primary); color: #fff; }
.secondary-btn { border: 1px solid var(--scholar-border-input); background: #fff; color: var(--scholar-text-primary); }
.state-card { padding: 48px; text-align: center; border: 1px solid var(--scholar-border-light); border-radius: 12px; background: #fff; }
.empty-state { display: flex; flex-direction: column; align-items: center; gap: 16px; }
.empty-state p { margin: 0; }
.empty-state .primary-btn { display: inline-flex; }
.state-card--error { color: #b42318; }
@media (max-width: 760px) { .workspace-page { padding: 28px 18px 60px; } .workspace-header, .workspace-card { align-items: flex-start; flex-direction: column; } .card-actions { justify-content: flex-start; } }
</style>
