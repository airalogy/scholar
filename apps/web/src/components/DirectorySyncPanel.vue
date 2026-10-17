<template>
  <section class="governance-panel">
    <h2>{{ $t('governance.directory') }}</h2>
    <p>{{ $t('governance.directoryNotice') }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="loading">{{ $t('common.loading') }}</p>
    <template v-if="state">
      <form class="settings-form" @submit.prevent="savePolicy">
        <label>{{ $t('governance.admission') }}<select v-model="policy.admissionMode"><option value="sso">{{ $t('governance.ssoAdmission') }}</option><option value="directory">{{ $t('governance.directoryAdmission') }}</option></select></label>
        <label><input v-model="policy.requireAppointment" type="checkbox">{{ $t('governance.requireAppointment') }}</label>
        <label>{{ $t('governance.reason') }}<input v-model="policy.notes" required maxlength="2000"></label>
        <button :disabled="busy">{{ $t('governance.savePolicy') }}</button>
      </form>
      <details ref="sourceEditor"><summary>{{ $t('governance.sourceSettings') }}</summary>
        <form class="settings-form" @submit.prevent="saveSource">
          <label>{{ $t('governance.sourceKey') }}<input v-model="source.key" required pattern="[a-z0-9_-]+" maxlength="64"></label>
          <label>{{ $t('governance.sourceName') }}<input v-model="source.name" required maxlength="100"></label>
          <label><input v-model="source.enabled" type="checkbox">{{ $t('governance.enabled') }}</label>
          <label><input v-model="source.authoritative" type="checkbox">{{ $t('governance.authoritative') }}</label>
          <label><input v-model="source.deactivateMissing" type="checkbox" :disabled="!source.authoritative">{{ $t('governance.deactivateMissing') }}</label>
          <label>{{ $t('governance.maxDeactivation') }}<input v-model.number="source.maxDeactivationPercent" type="number" min="0" max="100" required></label>
          <label>{{ $t('governance.syncInterval') }}<input v-model.number="source.expectedIntervalHours" type="number" min="1" max="720" required></label>
          <button :disabled="busy">{{ $t('governance.saveSource') }}</button>
        </form>
      </details>
      <ul class="source-list"><li v-for="item in state.sources" :key="item.id"><strong>{{ item.name }}</strong> — {{ item.overdue ? $t('governance.overdue') : $t('governance.current') }} <button @click="editSource(item)">{{ $t('governance.edit') }}</button></li></ul>
      <form class="settings-form" @submit.prevent="preview">
        <h3>{{ $t('governance.importDirectory') }}</h3>
        <label>{{ $t('governance.sourceName') }}<select v-model="selectedSource" required><option v-for="item in state.sources" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
        <label>{{ $t('governance.syncMode') }}<select v-model="mode"><option value="incremental">{{ $t('governance.incremental') }}</option><option value="full">{{ $t('governance.full') }}</option></select></label>
        <label>{{ $t('governance.standardJson') }}<input type="file" accept="application/json,.json" required @change="selectFile"></label>
        <button :disabled="busy || !file || !selectedSource">{{ $t('governance.validate') }}</button>
      </form>
      <p v-if="busy" role="status">{{ $t('governance.working') }}</p>
      <div class="table-scroll"><table><thead><tr><th>{{ $t('governance.sequence') }}</th><th>{{ $t('governance.state') }}</th><th>{{ $t('governance.changeCounts') }}</th><th>{{ $t('governance.actions') }}</th></tr></thead>
        <tbody><tr v-for="run in state.runs" :key="run.id"><td>{{ run.sequence }} / {{ run.expectedRows }}</td><td>{{ statusLabel(run.status) }}<p v-if="run.error">{{ run.error }}</p></td><td>{{ run.createdCount }} / {{ run.updatedCount }} / {{ run.deactivatedCount }}</td><td><button :disabled="busy" @click="inspectRun(run)">{{ $t('governance.rowDetails') }}</button><button v-if="canApply(run)" :disabled="busy" @click="selectApply(run)">{{ $t('governance.apply') }}</button></td></tr></tbody>
      </table></div>
      <p>{{ $t('governance.syncHistoryLimit') }}</p>
      <section v-if="inspected"><h3>{{ $t('governance.rowDetails') }}</h3><ul><li v-for="row in records" :key="row.id">{{ row.kind }} · {{ row.externalId }} — {{ row.error || row.outcome }}<details><summary>{{ $t('governance.standardJson') }}</summary><h4>{{ $t('governance.before') }}</h4><pre>{{ JSON.stringify(row.previousSnapshot ?? null, null, 2) }}</pre><h4>{{ $t('governance.after') }}</h4><pre>{{ JSON.stringify(row.payload, null, 2) }}</pre></details></li></ul><button v-if="recordOffset" :disabled="busy" @click="inspectRun(inspected, Math.max(0, recordOffset - 100))">{{ $t('governance.previousPage') }}</button><button v-if="records.length === 100" :disabled="busy" @click="inspectRun(inspected, recordOffset + 100)">{{ $t('governance.more') }}</button></section>
      <details><summary>{{ $t('governance.suspension') }}</summary><IdentityPersonPicker :slug="slug" :disabled="busy" :selected-id="suspendPerson?.id" @select="suspendPerson = $event" /><form class="settings-form" @submit.prevent="suspend"><label>{{ $t('governance.reason') }}<input v-model="suspendNotes" required maxlength="2000"></label><label><input v-model="suspended" type="checkbox">{{ $t('governance.suspended') }}</label><p>{{ $t('governance.unsuspended') }}</p><button :disabled="busy || !suspendPerson">{{ $t('governance.apply') }}</button></form></details>
      <form v-if="applying" class="confirmation" @submit.prevent="apply">
        <p>{{ $t('governance.applyWarning', { count: applying.deactivatedCount }) }}</p>
        <label>{{ $t('governance.reason') }}<input v-model="applyNotes" required maxlength="2000"></label>
        <label><input v-model="confirmed" type="checkbox" required>{{ $t('governance.confirmApply') }}</label>
        <button :disabled="busy || !confirmed">{{ $t('governance.apply') }}</button><button type="button" @click="applying = null">{{ $t('governance.cancel') }}</button>
      </form>
    </template>
  </section>
</template>
<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { governanceBase, governancePost, governancePut, loadDirectory, stageDirectorySnapshot, type DirectoryState, type DirectorySource, type DirectoryRun } from '@/api/governance'
import IdentityPersonPicker from '@/components/IdentityPersonPicker.vue'
import type { IdentityPerson } from '@/api/identity'
import { apiClient } from '@/api/client'
const props = defineProps<{ slug: string }>()
const { t, te } = useI18n()
const state = ref<DirectoryState | null>(null)
const error = ref('')
const busy = ref(false)
const loading = ref(false)
const controller = new AbortController()
const sourceEditor = ref<HTMLDetailsElement | null>(null)
const suspendPerson = ref<IdentityPerson | null>(null)
const suspendNotes = ref('')
const suspended = ref(true)
const inspected = ref<DirectoryRun | null>(null)
const records = ref<Array<{ id: string; kind: string; externalId: string; outcome: string; error: string | null; payload: unknown; previousSnapshot: unknown }>>([])
const recordOffset = ref(0)
const policy = reactive({ admissionMode: 'sso' as 'sso' | 'directory', requireAppointment: false, notes: '' })
const source = reactive({ key: '', name: '', enabled: true, authoritative: false, deactivateMissing: false, maxDeactivationPercent: 10, expectedIntervalHours: 24 })
const selectedSource = ref('')
const file = ref<File | null>(null)
const mode = ref<'full' | 'incremental'>('incremental')
const applying = ref<DirectoryRun | null>(null)
const applyNotes = ref('')
const confirmed = ref(false)
const statusLabel = (status: string): string => te(`governance.status.${status}`) ? t(`governance.status.${status}`) : status
const canApply = (run: DirectoryRun): boolean => ['validated', 'needs_confirmation'].includes(run.status)
const reload = async (): Promise<void> => { state.value = await loadDirectory(props.slug, controller.signal); Object.assign(policy, state.value.policy) }
const perform = async (operation: () => Promise<unknown>): Promise<void> => {
  if (busy.value) return
  busy.value = true; error.value = ''
  try { await operation(); await reload() } catch (cause) { if (!controller.signal.aborted) error.value = cause instanceof Error ? cause.message : t('governance.failed') } finally { busy.value = false }
}
const savePolicy = async (): Promise<void> => perform(() => governancePut(`${governanceBase(props.slug)}/directory/policy`, policy, controller.signal))
const saveSource = async (): Promise<void> => perform(() => governancePost(`${governanceBase(props.slug)}/directory/sources`, { ...source, deactivateMissing: source.authoritative && source.deactivateMissing }, controller.signal))
const editSource = (item: DirectorySource): void => { Object.assign(source, { key: item.key, name: item.name, enabled: item.enabled, authoritative: item.authoritative, deactivateMissing: item.deactivateMissing, maxDeactivationPercent: item.maxDeactivationPercent, expectedIntervalHours: item.expectedIntervalHours }); if (sourceEditor.value) sourceEditor.value.open = true }
const inspectRun = async (run: DirectoryRun, offset = 0): Promise<void> => perform(async () => { const result = await apiClient.get<{ data: { rows: typeof records.value } }>(`${governanceBase(props.slug)}/directory/sources/${run.sourceId}/runs/${run.id}`, { params: { offset }, signal: controller.signal }); inspected.value = run; records.value = result.data.data.rows; recordOffset.value = offset })
const suspend = async (): Promise<void> => perform(async () => { if (!suspendPerson.value) return; await governancePost(`${governanceBase(props.slug)}/directory/people/${suspendPerson.value.id}/suspension`, { suspended: suspended.value, notes: suspendNotes.value }, controller.signal); suspendPerson.value = null; suspendNotes.value = '' })
const selectFile = (event: Event): void => { file.value = (event.target as HTMLInputElement).files?.[0] ?? null }
const preview = async (): Promise<void> => perform(async () => {
  const chosen = state.value?.sources.find(item => item.id === selectedSource.value)
  if (!chosen || !file.value) return
  if (file.value.size > 30 * 1024 * 1024) throw new Error(t('governance.fileTooLarge'))
  const rows: unknown = JSON.parse(await file.value.text())
  if (!Array.isArray(rows) || rows.length > 100000) throw new Error(t('governance.invalidJson'))
  await stageDirectorySnapshot(props.slug, chosen, rows, mode.value, controller.signal)
})
const selectApply = (run: DirectoryRun): void => { applying.value = run; applyNotes.value = ''; confirmed.value = false }
const apply = async (): Promise<void> => perform(async () => {
  if (!applying.value || !confirmed.value) return
  await governancePost(`${governanceBase(props.slug)}/directory/sources/${applying.value.sourceId}/runs/${applying.value.id}/apply`, { confirmDeactivation: true, notes: applyNotes.value }, controller.signal)
  applying.value = null
})
onMounted(async () => { loading.value = true; await perform(reload); loading.value = false })
onUnmounted(() => controller.abort())
</script>
<style scoped>
.settings-form { display: grid; gap: 14px; max-width: 700px; margin: 24px 0; }
label { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
input:not([type='checkbox']), select { min-width: 220px; padding: 8px; }
button { padding: 8px 14px; cursor: pointer; }
.table-scroll { overflow-x: auto; } table { width: 100%; border-collapse: collapse; } th, td { text-align: left; padding: 12px; border-bottom: 1px solid var(--color-border-2, #ddd); }
.source-list li { margin: 12px 0; }
.confirmation { padding: 18px; border: 1px solid #d79529; display: grid; gap: 12px; }
</style>
