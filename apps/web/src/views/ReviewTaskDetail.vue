<template>
  <main class="review-page">
    <router-link to="/reviews">{{ $t('governance.myReviews') }}</router-link>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="loading" role="status">{{ $t('common.loading') }}</p>
    <template v-if="task">
      <h1>{{ task.material.title || $t('governance.reviewMaterial') }}</h1>
      <p>{{ task.stage }} · {{ $t('governance.round', { number: task.round }) }}</p>
      <p class="notice">{{ $t('governance.frozenNotice') }}</p>
      <dl class="material-list"><template v-for="entry in materialEntries" :key="entry.key"><dt>{{ entry.label }}</dt><dd>{{ entry.value }}</dd></template></dl>
      <button v-if="fileId" :disabled="busy" @click="openPdf">{{ $t('governance.openPdf') }}</button>
      <section v-if="changes.length">
        <h2>{{ $t('governance.changes') }}</h2>
        <table><thead><tr><th>{{ $t('governance.field') }}</th><th>{{ $t('governance.before') }}</th><th>{{ $t('governance.after') }}</th></tr></thead>
          <tbody><tr v-for="change in changes" :key="change.key"><td>{{ change.label }}</td><td>{{ change.before }}</td><td>{{ change.after }}</td></tr></tbody>
        </table>
      </section>
      <form v-if="task.canAct" @submit.prevent="decide('approve')">
        <label for="review-notes">{{ $t('governance.notes') }}</label>
        <textarea id="review-notes" v-model="notes" maxlength="2000" rows="4" />
        <p>{{ $t('governance.confirmVersion') }}</p>
        <div class="actions"><button type="submit" :disabled="busy">{{ $t('governance.approve') }}</button><button type="button" :disabled="busy || !notes.trim()" @click="decide('request_changes')">{{ $t('governance.return') }}</button><button v-if="task.role" type="button" :disabled="busy || !notes.trim()" @click="reject">{{ $t('governance.closeRejected') }}</button></div>
      </form>
      <p v-else>{{ $t('governance.unavailableTask') }}</p>
      <section v-if="task.history.length"><h2>{{ $t('governance.history') }}</h2><p v-for="(event, index) in task.history" :key="index">{{ new Date(event.createdAt).toLocaleString() }} · {{ event.notes || $t('governance.recorded') }}</p></section>
    </template>
  </main>
</template>
<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { loadReviewTask, governancePost, type ReviewTaskDetail } from '@/api/governance'
import { apiClient } from '@/api/client'
import { resolveSafeHttpUrl } from '@/utils/url'
const route = useRoute()
const { t, te } = useI18n()
const task = ref<ReviewTaskDetail | null>(null)
const error = ref('')
const notes = ref('')
const busy = ref(false)
const loading = ref(false)
let controller: AbortController | null = null
const label = (key: string): string => te(`governance.fields.${key}`) ? t(`governance.fields.${key}`) : key
const show = (value: unknown): string => value === null || value === undefined ? '—' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)
const fileId = computed(() => typeof task.value?.material.fileId === 'string' ? task.value.material.fileId : null)
const materialEntries = computed(() => Object.entries(task.value?.material ?? {}).filter(([key]) => !['fileId', 'proposal'].includes(key)).map(([key, value]) => ({ key, label: label(key), value: show(value) })))
const changes = computed(() => {
  const proposal = task.value?.material.proposal
  if (proposal && typeof proposal === 'object') return Object.entries(proposal).filter(([key]) => key !== 'kind').map(([key, value]) => ({ key, label: label(key), before: show(task.value?.material[key === 'restricted' ? 'fullTextRestricted' : key]), after: show(value) }))
  if (!task.value?.previousMaterial) return []
  const previous = task.value.previousMaterial
  const current = task.value.material
  return [...new Set([...Object.keys(previous), ...Object.keys(current)])].filter(key => JSON.stringify(previous[key]) !== JSON.stringify(current[key])).map(key => ({ key, label: label(key), before: key === 'fileId' ? t('governance.previousFile') : show(previous[key]), after: key === 'fileId' ? t('governance.currentFile') : show(current[key]) }))
})
const load = async (): Promise<void> => {
  controller?.abort()
  const current = new AbortController()
  controller = current
  loading.value = true
  error.value = ''
  try { const result = await loadReviewTask(String(route.params.taskId), current.signal); if (!current.signal.aborted) task.value = result }
  catch (cause) { if (!current.signal.aborted) error.value = cause instanceof Error ? cause.message : t('governance.failed') }
  finally { if (controller === current) loading.value = false }
}
const decide = async (decision: 'approve' | 'request_changes'): Promise<void> => {
  if (!task.value || busy.value) return
  busy.value = true
  try { await governancePost(`/v1/reviews/tasks/${task.value.id}/decision`, { decision, notes: notes.value, versionId: task.value.versionId }, controller?.signal); notes.value = ''; await load() }
  catch (cause) { error.value = cause instanceof Error ? cause.message : t('governance.failed') }
  finally { busy.value = false }
}
const reject = async (): Promise<void> => {
  if (!task.value || busy.value || !notes.value.trim()) return
  busy.value = true
  try { await governancePost(`/v1/reviews/cases/${task.value.caseId}/close`, { outcome: 'rejected', taskId: task.value.id, versionId: task.value.versionId, notes: notes.value }, controller?.signal); await load() }
  catch (cause) { error.value = cause instanceof Error ? cause.message : t('governance.failed') }
  finally { busy.value = false }
}
const openPdf = async (): Promise<void> => {
  if (!fileId.value) return
  const preview = window.open('about:blank', '_blank')
  if (preview) preview.opener = null
  busy.value = true
  try {
    const result = await apiClient.get<{ signatureUrl: string }>(`/files/preview/${fileId.value}`, { signal: controller?.signal })
    const url = resolveSafeHttpUrl(result.data.signatureUrl)
    if (!url) throw new Error(t('governance.failed'))
    if (!preview) throw new Error(t('governance.allowPopup'))
    preview.location.replace(url)
  } catch (cause) { preview?.close(); error.value = cause instanceof Error ? cause.message : t('governance.failed') }
  finally { busy.value = false }
}
watch(() => route.params.taskId, () => { task.value = null; void load() }, { immediate: true })
onUnmounted(() => controller?.abort())
</script>
<style scoped>
.review-page { max-width: 1000px; margin: auto; padding: 32px 24px; }
.notice { padding: 14px; background: var(--color-fill-2, #f5f7fa); }
.material-list { display: grid; grid-template-columns: minmax(100px, 160px) 1fr; gap: 14px; }
dd { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
th, td { border: 1px solid var(--color-border-2, #ddd); padding: 10px; text-align: left; overflow-wrap: anywhere; }
form { margin: 28px 0; } textarea { display: block; width: 100%; margin-top: 10px; }
.actions { display: flex; gap: 12px; } button { padding: 10px 16px; cursor: pointer; }
</style>
