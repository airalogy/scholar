<template>
  <main class="review-page">
    <h1>{{ $t('governance.myReviews') }}</h1>
    <nav class="tabs" :aria-label="$t('governance.myReviews')">
      <button :aria-pressed="tab === 'tasks'" @click="changeTab('tasks')">{{ $t('governance.tasks') }}</button>
      <button :aria-pressed="tab === 'applications'" @click="changeTab('applications')">{{ $t('governance.applications') }}</button>
    </nav>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="loading" role="status">{{ $t('common.loading') }}</p>
    <template v-else-if="tab === 'tasks'">
      <p v-if="!tasks.length">{{ $t('governance.noTasks') }}</p>
      <article v-for="task in tasks" :key="task.id" class="review-card">
        <router-link :to="`/reviews/tasks/${task.id}`"><h2>{{ task.material.title || $t('governance.reviewMaterial') }}</h2></router-link>
        <p>{{ task.stage }} · {{ $t('governance.round', { number: task.round }) }} · {{ statusLabel(task.status) }}</p>
        <p v-if="task.dueAt">{{ $t('governance.due') }} {{ new Date(task.dueAt).toLocaleString() }}</p>
      </article>
    </template>
    <template v-else>
      <p v-if="!applications.length">{{ $t('governance.noApplications') }}</p>
      <article v-for="application in applications" :key="application.id" class="review-card">
        <h2>{{ application.rounds[0]?.material.title || $t('governance.reviewMaterial') }}</h2>
        <p>{{ statusLabel(application.status) }}</p>
        <router-link :to="`/reviews/cases/${application.id}`">{{ $t('reviewProgress.open') }}</router-link>
        <details v-for="round in application.rounds" :key="round.id">
          <summary>{{ $t('governance.round', { number: round.number }) }} · {{ statusLabel(round.status) }} · {{ statusLabel(round.executionStatus) }}</summary>
          <ul><li v-for="(stage, index) in round.stages" :key="index">{{ stage.name }} — {{ statusLabel(stage.status) }} ({{ completion(stage.tasks) }})</li></ul>
        </details>
        <button v-if="canWithdraw(application)" @click="withdrawing = application">{{ $t('governance.withdrawApplication') }}</button>
      </article>
      <form v-if="withdrawing" @submit.prevent="withdraw"><p>{{ $t('governance.closeNotice') }}</p><label>{{ $t('governance.reason') }}<textarea v-model="withdrawNotes" required maxlength="2000" /></label><button :disabled="loading">{{ $t('governance.withdrawApplication') }}</button><button type="button" @click="withdrawing = null">{{ $t('governance.cancel') }}</button></form>
    </template>
    <button v-if="nextOffset !== null" :disabled="loading" @click="load(nextOffset)">{{ $t('governance.more') }}</button>
  </main>
</template>
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { loadReviewTasks, loadReviewApplications, governancePost, type ReviewTask, type ReviewApplication } from '@/api/governance'
const { t, te } = useI18n()
const tab = ref<'tasks' | 'applications'>('tasks')
const tasks = ref<ReviewTask[]>([])
const applications = ref<ReviewApplication[]>([])
const loading = ref(false)
const error = ref('')
const nextOffset = ref<number | null>(null)
const withdrawing = ref<ReviewApplication | null>(null)
const withdrawNotes = ref('')
const completion = (items: Array<{ status: string }>): string => `${items.filter(item => item.status === 'approved').length}/${items.length}`
const canWithdraw = (application: ReviewApplication): boolean => ['pending_review', 'changes_requested'].includes(application.status) && Boolean(application.rounds[0]?.versionId)
let controller: AbortController | null = null
const statusLabel = (status: string): string => te(`governance.status.${status}`) ? t(`governance.status.${status}`) : status
const load = async (offset = 0): Promise<void> => {
  controller?.abort()
  const current = new AbortController()
  controller = current
  loading.value = true
  error.value = ''
  try {
    if (tab.value === 'tasks') {
      const data = await loadReviewTasks(offset, current.signal)
      if (current.signal.aborted) return
      tasks.value = offset ? [...tasks.value, ...data.items] : data.items
      nextOffset.value = data.nextOffset
    } else {
      const data = await loadReviewApplications(offset, current.signal)
      if (current.signal.aborted) return
      applications.value = offset ? [...applications.value, ...data.items] : data.items
      nextOffset.value = data.nextOffset
    }
  } catch (cause) { if (!current.signal.aborted) error.value = cause instanceof Error ? cause.message : t('governance.failed') }
  finally { if (controller === current) loading.value = false }
}
const changeTab = (value: 'tasks' | 'applications'): void => { tab.value = value; void load() }
const withdraw = async (): Promise<void> => {
  if (!withdrawing.value || loading.value) return
  loading.value = true
  try { await governancePost(`/v1/reviews/cases/${withdrawing.value.id}/close`, { versionId: withdrawing.value.rounds[0]!.versionId, outcome: 'withdrawn', notes: withdrawNotes.value }, controller?.signal); withdrawing.value = null; withdrawNotes.value = ''; await load() }
  catch (cause) { error.value = cause instanceof Error ? cause.message : t('governance.failed') }
  finally { loading.value = false }
}
onMounted(() => { void load() })
onUnmounted(() => controller?.abort())
</script>
<style scoped>
.review-page { max-width: 960px; margin: auto; padding: 32px 24px; }
.tabs { display: flex; gap: 16px; margin: 20px 0; }
.review-card { border: 1px solid var(--color-border-2, #ddd); border-radius: 12px; padding: 20px; margin: 16px 0; }
.review-card h2 { font-size: 18px; }
details { margin: 12px 0; }
button { padding: 10px 16px; cursor: pointer; }
</style>
