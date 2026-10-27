<template>
  <section>
    <h2>{{ $t('governance.reviewSettings') }}</h2>
    <p>{{ $t('governance.grantNotice') }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="busy" role="status">{{ $t('common.loading') }}</p>
    <template v-if="state">
      <form class="settings-form" @submit.prevent="perform(refresh)"><label>{{ $t('governance.searchUnit') }}<input v-model="nodeSearch" maxlength="200"></label><button :disabled="busy">{{ $t('governance.search') }}</button></form>
      <form class="settings-form" @submit.prevent="searchPeople">
        <label>{{ $t('governance.findPerson') }}<input v-model="search" maxlength="100"></label><button :disabled="busy">{{ $t('governance.search') }}</button>
      </form>
      <form class="settings-form" @submit.prevent="grant">
        <label>{{ $t('governance.person') }}<select v-model="grantForm.personId" required><option v-for="person in people" :key="person.id" :value="person.id">{{ person.name }} · {{ person.internalId }}</option></select></label>
        <label>{{ $t('governance.role') }}<select v-model="grantForm.role"><option v-for="role in roles" :key="role" :value="role">{{ $t(`governance.roles.${role}`) }}</option></select></label>
        <label>{{ $t('governance.unit') }}<select v-model="grantForm.nodeId"><option value="">{{ $t('governance.institutionScope') }}</option><option v-for="node in state.nodes" :key="node.id" :value="node.id">{{ node.name }}</option></select></label>
        <label>{{ $t('governance.expires') }}<input v-model="grantForm.endsAt" type="datetime-local"></label>
        <label>{{ $t('governance.reason') }}<input v-model="grantForm.notes" required maxlength="2000"></label>
        <button :disabled="busy || !grantForm.personId">{{ $t('governance.grant') }}</button>
      </form>
      <ul class="grant-list"><li v-for="item in state.grants" :key="item.id">{{ item.person.name }} — {{ $t(`governance.roles.${item.role}`) }} · {{ item.revokedAt ? $t('governance.revoked') : item.person.userId ? $t('governance.activated') : $t('governance.notActivated') }} <button v-if="!item.revokedAt" :disabled="busy" @click="revoking = item.id">{{ $t('governance.revoke') }}</button></li></ul>
      <form v-if="revoking" class="settings-form" @submit.prevent="revoke"><label>{{ $t('governance.reason') }}<input v-model="revokeNotes" required maxlength="2000"></label><button :disabled="busy">{{ $t('governance.confirmRevoke') }}</button><button type="button" @click="revoking = ''">{{ $t('governance.cancel') }}</button></form>
      <hr>
      <h3>{{ $t('governance.workflow') }}</h3>
      <p>{{ $t('governance.workflowNotice') }}</p>
      <label>{{ $t('governance.contentType') }}<select v-model="contentType" @change="selectWorkflow"><option value="paper">{{ $t('governance.paper') }}</option><option value="degree_thesis">{{ $t('governance.thesis') }}</option></select></label>
      <form class="settings-form" @submit.prevent="saveWorkflow">
        <label>{{ $t('governance.workflowName') }}<input v-model="workflowName" required maxlength="100"></label>
        <fieldset v-for="(step, index) in stages" :key="index">
          <legend>{{ $t('governance.stage', { number: index + 1 }) }}</legend>
          <label>{{ $t('governance.stageName') }}<input v-model="step.name" required maxlength="100"></label>
          <label>{{ $t('governance.deadline') }}<input v-model.number="step.deadlineHours" required type="number" min="1" max="8760"></label>
          <label v-for="choice in choices" :key="choice"><input type="checkbox" :checked="hasGroup(step, choice)" @change="toggleGroup(step, choice)">{{ $t(`governance.groups.${choice}`) }}</label>
          <label>{{ $t('governance.ccRecipients') }}<select v-model="step.ccPersonIds" multiple><option v-for="person in people" :key="person.id" :value="person.id">{{ person.name }} · {{ person.internalId }}</option></select></label>
          <button v-if="stages.length > 1" type="button" @click="stages.splice(index, 1)">{{ $t('governance.removeStage') }}</button>
        </fieldset>
        <button v-if="stages.length < 10" type="button" @click="addStage">{{ $t('governance.addStage') }}</button>
        <button :disabled="busy">{{ $t('governance.saveWorkflow') }}</button>
      </form>
      <h3>{{ $t('governance.pendingTasks') }}</h3>
      <article v-for="task in state.tasks" :key="task.id" class="task-card">
        <h4>{{ task.material.title }}</h4><p>{{ task.stage }} · {{ task.exception || $t('governance.awaitingReviewer') }}</p>
        <router-link :to="`/reviews/cases/${task.caseId}`">{{ $t('reviewProgress.open') }}</router-link>
        <button v-if="task.kind !== 'routing' && task.kind !== 'relationship'" :disabled="busy" @click="selectTask(task)">{{ $t('governance.reassign') }}</button>
        <button :disabled="busy" @click="restartTask = task; restartNotes = ''">{{ $t('routing.restart') }}</button>
        <button :disabled="busy" @click="selectParticipants(task)">{{ $t('governance.verifyParticipants') }}</button>
      </article>
      <form v-if="restartTask" class="settings-form" @submit.prevent="restartRound"><p>{{ $t('routing.restartNotice') }}</p><label>{{ $t('governance.reason') }}<input v-model="restartNotes" required maxlength="2000"></label><button :disabled="busy || !restartNotes.trim()">{{ $t('routing.restart') }}</button><button type="button" @click="restartTask = null">{{ $t('governance.cancel') }}</button></form>
      <form v-if="participantTask" class="settings-form" @submit.prevent="saveParticipants">
        <p>{{ $t('governance.participantNotice') }}</p>
        <ul><li v-for="person in participantPeople" :key="person.id">{{ person.name }}</li></ul>
        <label>{{ $t('governance.publicationUnits') }}<select v-model="participantNodes" multiple><option v-for="node in state.nodes" :key="node.id" :value="node.id">{{ node.name }}</option></select></label>
        <label>{{ $t('governance.reason') }}<input v-model="participantNotes" required maxlength="2000"></label>
        <button :disabled="busy || !participantPeople.length">{{ $t('governance.confirmParticipants') }}</button><button type="button" @click="participantTask = null">{{ $t('governance.cancel') }}</button>
      </form>
      <form v-if="selectedTask" class="settings-form" @submit.prevent="reassign">
        <p>{{ $t('governance.reassignNotice') }}</p>
        <label>{{ $t('governance.person') }}<select v-model="assignment.personId" required><option v-for="person in people" :key="person.id" :value="person.id">{{ person.name }} · {{ person.internalId }}</option></select></label>
        <label>{{ $t('governance.unit') }}<select v-model="assignment.nodeId"><option value="">{{ $t('governance.institutionScope') }}</option><option v-for="node in state.nodes" :key="node.id" :value="node.id">{{ node.name }}</option></select></label>
        <label>{{ $t('governance.reason') }}<input v-model="assignment.notes" required maxlength="2000"></label><button :disabled="busy">{{ $t('governance.confirmReassign') }}</button><button type="button" @click="selectedTask = null">{{ $t('governance.cancel') }}</button>
      </form>
      <h3>{{ $t('governance.notifications') }}</h3>
      <p v-for="item in state.notifications" :key="item.status">{{ item.status }}: {{ item._count }}</p>
      <form class="settings-form" @submit.prevent="retryNotifications"><label>{{ $t('governance.reason') }}<input v-model="retryNotes" required maxlength="2000"></label><button :disabled="busy">{{ $t('governance.retryNotifications') }}</button></form>
      <button :disabled="busy || !retryNotes.trim()" @click="reconcileNotifications">{{ $t('governance.reconcileNotifications') }}</button>
      <h3>{{ $t('governance.executionFailures') }}</h3>
      <article v-for="failure in state.executionFailures" :key="failure.id"><p>{{ $t(`governance.changeKinds.${failure.kind}`) }} · {{ failure.error }}</p><router-link :to="`/reviews/cases/${failure.caseId}`">{{ $t('reviewProgress.open') }}</router-link><button :disabled="busy || !retryNotes.trim()" @click="retryExecution(failure.id)">{{ $t('governance.retryExecution') }}</button></article>
      <nav><button v-if="offset" :disabled="busy" @click="page(Math.max(0, offset - 100))">{{ $t('governance.previousPage') }}</button><button v-if="state.nextOffset !== null" :disabled="busy" @click="page(state.nextOffset)">{{ $t('governance.more') }}</button></nav>
    </template>
  </section>
</template>
<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { loadReviewAdmin, loadReviewParticipants, governanceBase, governancePost, governancePut, type ReviewAdminState, type ReviewStage, type ReviewGroup } from '@/api/governance'
import { listIdentityPeople, type IdentityPerson } from '@/api/identity'
const props = defineProps<{ slug: string }>()
const { t } = useI18n()
const state = ref<ReviewAdminState | null>(null)
const offset = ref(0)
const nodeSearch = ref('')
const people = ref<IdentityPerson[]>([])
const search = ref('')
const busy = ref(false)
const error = ref('')
const controller = new AbortController()
const roles = ['library_intake', 'department', 'library_final', 'supervisor', 'responsible'] as const
const choices = ['library_intake', 'authors', 'departments', 'library_final'] as const
type Choice = typeof choices[number]
const grantForm = reactive({ personId: '', role: 'library_intake', nodeId: '', endsAt: '', notes: '' })
const revoking = ref('')
const revokeNotes = ref('')
const retryNotes = ref('')
const contentType = ref<'paper' | 'degree_thesis'>('paper')
const workflowName = ref('')
const stages = ref<ReviewStage[]>([])
const selectedTask = ref<ReviewAdminState['tasks'][number] | null>(null)
const assignment = reactive({ personId: '', nodeId: '', notes: '' })
const participantTask = ref<ReviewAdminState['tasks'][number] | null>(null)
const participantPeople = ref<Array<{ id: string; name: string }>>([])
const participantNodes = ref<string[]>([])
const participantNotes = ref('')
const restartTask = ref<ReviewAdminState['tasks'][number] | null>(null)
const restartNotes = ref('')
const base = (): string => `${governanceBase(props.slug)}/review-governance`
const refresh = async (): Promise<void> => { state.value = await loadReviewAdmin(props.slug, controller.signal, offset.value, nodeSearch.value) }
const page = async (next: number): Promise<void> => perform(async () => { offset.value = next })
const perform = async (operation: () => Promise<unknown>): Promise<void> => {
  if (busy.value) return
  busy.value = true; error.value = ''
  try { await operation(); await refresh() } catch (cause) { if (!controller.signal.aborted) error.value = cause instanceof Error ? cause.message : t('governance.failed') } finally { busy.value = false }
}
const searchPeople = async (): Promise<void> => perform(async () => { people.value = (await listIdentityPeople(props.slug, search.value, 0, controller.signal)).items })
const grant = async (): Promise<void> => perform(() => governancePost(`${base()}/grants`, { ...grantForm, nodeId: grantForm.nodeId || undefined, startsAt: new Date().toISOString(), endsAt: grantForm.endsAt ? new Date(grantForm.endsAt).toISOString() : null }, controller.signal))
const revoke = async (): Promise<void> => perform(async () => { await governancePost(`${base()}/grants/${revoking.value}/revoke`, { notes: revokeNotes.value }, controller.signal); revoking.value = ''; revokeNotes.value = '' })
const group = (choice: Choice): ReviewGroup => choice === 'authors' || choice === 'departments' ? { kind: choice } : { kind: 'role', role: choice }
const hasGroup = (step: ReviewStage, choice: Choice): boolean => step.groups.some(item => item.kind === choice || (item.kind === 'role' && item.role === choice))
const toggleGroup = (step: ReviewStage, choice: Choice): void => { step.groups = hasGroup(step, choice) ? step.groups.filter(item => !(item.kind === choice || (item.kind === 'role' && item.role === choice))) : [...step.groups, group(choice)] }
const addStage = (): void => { stages.value.push({ name: t('governance.newStage'), groups: [{ kind: 'role', role: 'library_final' }], deadlineHours: 168 }) }
const selectWorkflow = (): void => {
  const existing = state.value?.workflows.find(item => item.key === `governed-${contentType.value}`)
  workflowName.value = existing?.name ?? t('governance.defaultWorkflow')
  stages.value = existing ? existing.steps.map(({ resolver_config: step }) => ({ ...step, groups: step.groups.map(item => ({ ...item })), ccPersonIds: [...(step.ccPersonIds ?? [])] })) : [
    { name: t('governance.roles.library_intake'), groups: [group('library_intake')], deadlineHours: 168 },
    { name: t('governance.parallelStage'), groups: [group('authors'), group('departments')], deadlineHours: 168 },
    { name: t('governance.roles.library_final'), groups: [group('library_final')], deadlineHours: 168 },
  ]
}
const saveWorkflow = async (): Promise<void> => perform(() => governancePut(`${base()}/workflows/${contentType.value}`, { name: workflowName.value, steps: stages.value }, controller.signal))
const selectParticipants = async (task: ReviewAdminState['tasks'][number]): Promise<void> => perform(async () => { const result = await loadReviewParticipants(props.slug, task.caseId, controller.signal); participantTask.value = { ...task, versionId: result.versionId }; participantPeople.value = result.people; participantNodes.value = []; participantNotes.value = '' })
const saveParticipants = async (): Promise<void> => perform(async () => { if (!participantTask.value) return; await governancePost(`${base()}/cases/${participantTask.value.caseId}/participants`, { versionId: participantTask.value.versionId, personIds: participantPeople.value.map(person => person.id), nodeIds: participantNodes.value, notes: participantNotes.value }, controller.signal); participantTask.value = null })
const selectTask = (task: ReviewAdminState['tasks'][number]): void => { selectedTask.value = task; Object.assign(assignment, { personId: task.assignedPersonId ?? task.personId ?? '', nodeId: task.nodeId ?? '', notes: '' }) }
const reassign = async (): Promise<void> => perform(async () => { if (!selectedTask.value) return; await governancePost(`${base()}/tasks/${selectedTask.value.id}/reassign`, { ...assignment, nodeId: assignment.nodeId || undefined, expectedVersionId: selectedTask.value.versionId }, controller.signal); selectedTask.value = null })
const retryNotifications = async (): Promise<void> => perform(() => governancePost(`${base()}/notifications/retry`, { notes: retryNotes.value }, controller.signal))
const retryExecution = async (id: string): Promise<void> => perform(() => governancePost(`${base()}/changes/${id}/retry`, { notes: retryNotes.value }, controller.signal))
const restartRound = async (): Promise<void> => perform(async () => {
  if (!restartTask.value || !restartNotes.value.trim()) return
  await governancePost(`${base()}/cases/${restartTask.value.caseId}/reroute`, { versionId: restartTask.value.versionId, notes: restartNotes.value }, controller.signal)
  restartTask.value = null
})
const reconcileNotifications = async (): Promise<void> => perform(async () => { let offset: number | null = 0; while (offset !== null && !controller.signal.aborted) { const result: { nextOffset: number | null } = await governancePost(`${base()}/notifications/reconcile`, { notes: retryNotes.value, offset }, controller.signal); offset = result.nextOffset } })
onMounted(async () => { await perform(async () => { await refresh(); people.value = (await listIdentityPeople(props.slug, '', 0, controller.signal)).items; selectWorkflow() }) })
onUnmounted(() => controller.abort())
</script>
<style scoped>
.settings-form { display: grid; gap: 14px; max-width: 720px; margin: 24px 0; }
label { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
input:not([type='checkbox']), select { padding: 8px; min-width: 220px; }
button { padding: 8px 14px; cursor: pointer; }
fieldset { display: grid; gap: 14px; padding: 20px; border: 1px solid var(--color-border-2, #ddd); }
.grant-list li { margin: 12px 0; }
.task-card { padding: 14px; margin: 14px 0; border: 1px solid var(--color-border-2, #ddd); border-radius: 8px; }
</style>
