<template>
  <section class="progress-panel">
    <div class="progress-heading"><h1>{{ data?.title || t('reviewProgress.title') }}</h1><a-button :loading="loading" @click="refresh">{{ t('reviewProgress.refresh') }}</a-button></div>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="loading" role="status">{{ t('common.loading') }}</p>
    <template v-if="data">
      <div class="round-toolbar">
        <label>{{ t('reviewProgress.title') }}
          <select :value="data.round?.number" @change="selectRound"><option v-if="data.round && !data.rounds.some(round => round.number === data?.round?.number)" :value="data.round.number">{{ t('governance.round', { number: data.round.number }) }} · {{ status(data.round.status) }}</option><option v-for="round in data.rounds" :key="round.number" :value="round.number">{{ t('governance.round', { number: round.number }) }} · {{ status(round.status) }}</option></select>
        </label>
        <a-button v-if="data.nextRoundOffset !== null" :loading="paging" @click="moreRounds">{{ t('reviewProgress.moreRounds') }}</a-button>
      </div>
      <p v-if="!data.round">{{ t('reviewProgress.noRound') }}</p>
      <template v-else>
        <p v-if="historical" class="historical">{{ t('reviewProgress.historical') }}</p>
        <dl class="round-summary">
          <dt>{{ t('reviewProgress.status') }}</dt><dd>{{ status(data.round.status) }}</dd>
          <dt>{{ t('reviewProgress.execution') }}</dt><dd>{{ execution }}</dd>
          <dt>{{ t('reviewProgress.workflow') }}</dt><dd>{{ data.round.workflowName || '—' }}</dd>
          <dt>{{ t('reviewProgress.rule') }}</dt><dd>{{ data.round.ruleName || t('reviewProgress.defaultRule') }}<template v-if="data.round.ruleRevision !== null"> · v{{ data.round.ruleRevision }}</template></dd>
          <dt>{{ t('reviewProgress.version') }}</dt><dd class="version-id">{{ data.round.versionId || '—' }}</dd>
        </dl>
        <ReviewFlow :stages="flowStages" @select="selectTask" />
        <div v-for="stage in data.round.stages" :key="stage.id" class="stage-extras">
          <p v-if="stage.legacy">{{ stage.name }} · {{ t('reviewProgress.legacy') }}</p>
          <template v-if="stage.nextTaskOffset !== null"><p>{{ stage.name }} · {{ t('reviewProgress.partial') }}</p><a-button :loading="paging" @click="moreTasks(stage)">{{ t('reviewProgress.moreTasks') }}</a-button></template>
          <details v-if="stage.tasks.some(task => task.kind === 'cc')"><summary>{{ stage.name }} · {{ t('reviewProgress.cc') }}</summary><ul><li v-for="task in stage.tasks.filter(task => task.kind === 'cc')" :key="task.id"><button class="cc-button" @click="selectTask(task.id)">{{ task.personName || t('reviewProgress.unknownName') }} · {{ status(task.status) }}</button></li></ul></details>
        </div>
        <p class="snapshot-notice">{{ t('reviewProgress.snapshotNotice') }}</p>
        <section class="activity"><h2>{{ t('reviewProgress.history') }}</h2><ReviewHistory :events="history" /><a-button v-if="nextHistory !== null" :loading="paging" @click="moreHistory">{{ t('reviewProgress.moreHistory') }}</a-button></section>
      </template>
    </template>
    <a-drawer :visible="selected !== null" :title="t('reviewProgress.details')" :width="'min(480px, 100vw)'" :footer="false" @cancel="selectedId = ''">
      <template v-if="selected">
        <h3>{{ taskTitle(selected.task) }}</h3>
        <dl class="task-summary">
          <dt>{{ t('reviewProgress.stage') }}</dt><dd>{{ selected.stage.name }}</dd>
          <dt>{{ t('reviewProgress.status') }}</dt><dd>{{ status(selected.task.status) }}</dd>
          <dt>{{ t('reviewProgress.designated') }}</dt><dd>{{ designated(selected.task) }}</dd>
          <dt>{{ t('reviewProgress.actual') }}</dt><dd>{{ selected.task.hasCompletedBy ? selected.task.completedByName || t('reviewProgress.unknownName') : t('reviewProgress.noActor') }}</dd>
          <dt>{{ t('reviewProgress.scope') }}</dt><dd>{{ selected.task.hasNode ? selected.task.nodeName || t('reviewProgress.unknownName') : t('reviewProgress.institutionScope') }}</dd>
          <dt>{{ t('reviewProgress.deadline') }}</dt><dd>{{ date(selected.task.dueAt) }}</dd>
          <dt>{{ t('reviewProgress.completed') }}</dt><dd>{{ date(selected.task.completedAt) }}</dd>
        </dl>
        <p v-if="selected.task.overdue" class="warning">{{ t('reviewProgress.overdue') }}</p>
        <p v-if="selected.task.exception" class="warning">{{ t('reviewProgress.blocked') }}<template v-if="data?.viewer === 'administrator'">: {{ selected.task.exception }}</template></p>
        <section v-if="selected.task.candidateCount !== null">
          <h4>{{ t('reviewProgress.candidates') }}</h4><p>{{ t('reviewProgress.candidateCount', { count: selected.task.candidateCount }) }}</p>
          <p v-if="!selected.task.candidateCount" class="warning">{{ t('reviewProgress.noCandidates') }}</p><ul><li v-for="(name, index) in selected.task.candidateNames" :key="index">{{ name }}</li></ul>
        </section>
        <router-link v-if="selected.task.canAct && !historical" :to="`/reviews/tasks/${selected.task.id}`">{{ t('reviewProgress.act') }}</router-link>
        <h4>{{ t('reviewProgress.taskHistory') }}</h4><ReviewTaskHistory v-if="data?.round" :case-id="caseId" :task-id="selected.task.id" :round-number="data.round.number" />
      </template>
    </a-drawer>
  </section>
</template>
<script setup lang="ts">
import { computed, ref, toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ProgressTask } from '@/api/review-progress'
import { useReviewProgress } from '@/composables/useReviewProgress'
import type { ReviewFlowStage } from '@/utils/review-flow'
import ReviewFlow from './ReviewFlow.vue'
import ReviewHistory from './ReviewHistory.vue'
import ReviewTaskHistory from './ReviewTaskHistory.vue'
const props = defineProps<{ caseId: string }>()
const { t, te, locale } = useI18n()
const { data, history, nextHistory, loading, paging, error, load, moreHistory, moreRounds, moreTasks } = useReviewProgress(toRef(props, 'caseId'))
const selectedId = ref('')
const historical = computed(() => data.value?.round?.number !== data.value?.currentRound)
const selected = computed(() => {
  for (const stage of data.value?.round?.stages ?? []) { const task = stage.tasks.find(item => item.id === selectedId.value); if (task) return { stage, task } }
  return null
})
const status = (value: string): string => te(`reviewProgress.states.${value}`) ? t(`reviewProgress.states.${value}`) : t('reviewProgress.states.unknown')
const execution = computed(() => {
  const value = data.value?.round?.executionStatus ?? 'not_applicable'
  if (value === 'awaiting_approval') return t('reviewProgress.awaitingApproval')
  return te(`reviewProgress.executionStates.${value}`) ? t(`reviewProgress.executionStates.${value}`) : '—'
})
const date = (value: string | null): string => value ? new Date(value).toLocaleString(locale.value) : '—'
const taskTitle = (task: ProgressTask): string => task.role && te(`governance.roles.${task.role}`) ? t(`governance.roles.${task.role}`) : te(`reviewProgress.kinds.${task.kind}`) ? t(`reviewProgress.kinds.${task.kind}`) : t('reviewProgress.details')
const designated = (task: ProgressTask): string => task.hasAssignee ? task.assignedPersonName || t('reviewProgress.unknownName') : task.hasPerson ? task.personName || t('reviewProgress.unknownName') : t('reviewProgress.pendingAssignment')
const taskDescription = (task: ProgressTask): string => {
  const person = task.hasCompletedBy ? `${t('reviewProgress.actual')}: ${task.completedByName || t('reviewProgress.unknownName')}` : task.hasAssignee || task.hasPerson ? designated(task) : t(task.kind === 'role' ? 'reviewProgress.candidateGroup' : 'reviewProgress.blocked')
  return [person, task.nodeName].filter(Boolean).join(' · ')
}
const flowStages = computed<ReviewFlowStage[]>(() => (data.value?.round?.stages ?? []).map(stage => ({
  id: stage.id, label: stage.name, status: stage.status,
  detail: stage.legacy ? t('reviewProgress.legacy') : t('reviewProgress.stageCount', { approved: stage.approvedCount, total: stage.taskCount }),
  tasks: stage.tasks.filter(task => task.kind !== 'cc').map(task => ({ id: task.id, label: taskTitle(task), detail: taskDescription(task), status: task.status, alert: task.overdue ? t('reviewProgress.overdue') : task.exception ? t('reviewProgress.blocked') : undefined, selectable: true })),
})))
const selectTask = (id: string): void => { selectedId.value = id }
const selectRound = (event: Event): void => { selectedId.value = ''; void load(Number((event.target as HTMLSelectElement).value)) }
const refresh = (): void => { selectedId.value = ''; void load(data.value?.round?.number) }
</script>
<style scoped>
.progress-panel { min-width: 0; color: var(--color-text-1); }
.progress-heading, .round-toolbar { display: flex; gap: 16px; align-items: center; justify-content: space-between; flex-wrap: wrap; margin: 20px 0; }
h1 { font-size: 24px; margin: 0; overflow-wrap: anywhere; flex: 1; min-width: 200px; }
h2 { font-size: 18px; }
select { margin-left: 12px; padding: 8px 12px; border: 1px solid var(--color-border-3); border-radius: 6px; background: var(--color-bg-2); color: inherit; max-width: 100%; }
.round-summary, .task-summary { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 10px 16px; line-height: 1.6; }
dt { color: var(--color-text-3); } dd { margin: 0; overflow-wrap: anywhere; }
.version-id { font-family: monospace; font-size: 12px; }
.round-summary { background: var(--color-fill-1); padding: 20px; border-radius: 12px; }
.historical { color: rgb(var(--warning-7)); }
.warning { color: rgb(var(--danger-6)); overflow-wrap: anywhere; }
.snapshot-notice { font-size: 12px; color: var(--color-text-3); line-height: 1.7; }
.stage-extras { margin-top: 14px; font-size: 13px; }
.cc-button { padding: 6px; color: rgb(var(--primary-6)); border: 0; background: none; cursor: pointer; }
.activity { margin-top: 32px; }
@media (max-width: 600px) { .round-summary, .task-summary { grid-template-columns: 80px minmax(0, 1fr); gap: 8px; padding: 12px; } h1 { font-size: 20px; } }
</style>
