<template>
  <section class="bibliography-panel" :aria-busy="busy">
    <InstitutionPaperFields v-if="canManageFields" :slug="slug" :fields="definitions" :disabled="busy" @saved="fieldSaved" />
    <div class="panel-heading">
      <h3>{{ t('bibliography.title') }}</h3>
      <button type="button" @click="downloadTemplate">{{ t('bibliography.template') }}</button>
    </div>
    <div class="file-actions">
      <label>{{ t('bibliography.chooseFile') }}<input type="file" accept=".json,.csv,application/json,text/csv" :disabled="busy" @change="chooseFile"></label>
      <button type="button" :disabled="busy || !fileName" @click="preview">{{ t('bibliography.preview') }}</button>
    </div>
    <p v-if="fileName" class="file-name">{{ fileName }}</p>
    <details v-if="csv" open class="mapping-box">
      <summary>{{ t('bibliography.mapping') }}</summary>
      <p>{{ t('bibliography.mappingHint') }}</p>
      <div class="mapping-tools">
        <button type="button" :disabled="busy" @click="saveMapping">{{ t('bibliography.saveMapping') }}</button>
        <label>{{ t('bibliography.loadMapping') }}<input type="file" accept=".json,application/json" :disabled="busy" @change="loadMapping"></label>
      </div>
      <div class="mapping-table-wrap">
        <table class="mapping-table">
          <thead><tr><th>{{ t('bibliography.column') }}</th><th>{{ t('bibliography.target') }}</th><th>{{ t('bibliography.blank') }}</th><th>{{ t('bibliography.booleanEncoding') }}</th></tr></thead>
          <tbody>
            <tr v-for="mapping in mappings" :key="mapping.column">
              <th scope="row">{{ mapping.column }}</th>
              <td><select v-model="mapping.target" :disabled="busy" :aria-label="`${mapping.column}: ${t('bibliography.target')}`" @change="mapping.blank = 'skip'"><option value="">{{ t('bibliography.ignore') }}</option><option v-for="target in targets" :key="target.value" :value="target.value">{{ target.label }}</option></select></td>
              <td><select v-model="mapping.blank" :disabled="busy" :aria-label="`${mapping.column}: ${t('bibliography.blank')}`"><option value="skip">{{ t('bibliography.skipBlank') }}</option><option v-if="mapping.target.startsWith('custom.')" value="clear">{{ t('bibliography.clearBlank') }}</option></select></td>
              <td><select v-if="isBoolean(mapping.target)" v-model="mapping.boolean_encoding" :disabled="busy" :aria-label="`${mapping.column}: ${t('bibliography.booleanEncoding')}`"><option value="true_false">true / false</option><option value="zero_one">0 / 1 → false / true</option></select><span v-else>—</span></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="unmapped" class="warning">{{ t('bibliography.unmapped', { count: unmapped }) }}</p>
    </details>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <p v-if="busy" role="status">{{ t('common.loading') }}</p>

    <div v-if="record" class="preview-result">
      <div class="panel-heading"><h4>{{ record.source }}</h4><span>{{ statusLabel(record.status) }}</span></div>
      <p>{{ t('bibliography.summary', record.summary) }}</p>
      <p v-if="record.status === 'previewing'" role="status">{{ t('bibliography.preparing') }}</p>
      <div v-if="record.items.some(item => item.status === 'ready' || item.status === 'pending_review')" class="confirmation">
        <label><input type="checkbox" :checked="allSelected" :disabled="busy" @change="toggleAll">{{ t('bibliography.selectAll') }}</label>
        <label v-if="selectedWarnings"><input v-model="acknowledgeWarnings" type="checkbox" :disabled="busy">{{ t('bibliography.acknowledge') }}</label>
        <button type="button" class="primary" :disabled="busy || !selectedReady.length || (selectedWarnings && !acknowledgeWarnings)" @click="confirmImport">{{ t(managed ? 'bibliography.submitReview' : 'bibliography.confirm') }} ({{ selectedReady.length }})</button>
        <template v-if="platformAdmin && selectedPending.length">
          <label class="review-notes">{{ t('bibliography.reviewNotes') }}<input v-model="reviewNotes" :disabled="busy" maxlength="2000"></label>
          <button type="button" :disabled="busy || !reviewNotes.trim() || (selectedWarnings && !acknowledgeWarnings)" @click="review('approve')">{{ t('bibliography.approve') }}</button>
          <button type="button" :disabled="busy || !reviewNotes.trim()" @click="review('reject')">{{ t('bibliography.reject') }}</button>
        </template>
      </div>
      <div class="result-table-wrap">
        <table class="result-table">
          <thead><tr><th>{{ t('bibliography.select') }}</th><th>{{ t('bibliography.row') }}</th><th>{{ t('bibliography.paper') }}</th><th>{{ t('bibliography.result') }}</th><th>{{ t('bibliography.details') }}</th></tr></thead>
          <tbody>
            <template v-for="item in pageItems" :key="item.id">
              <tr>
                <td><input v-model="selectedIds" type="checkbox" :value="item.id" :disabled="busy || !selectable(item)" :aria-label="`${t('bibliography.select')} ${item.title}`"></td>
                <td>{{ item.source_row ?? item.index + 1 }}</td><td>{{ item.title }}</td>
                <td>{{ actionLabel(item.action) }} · {{ statusLabel(item.status) }}<span v-if="item.decision === 'applied_pending_content_review'" class="warning">{{ t('bibliography.contentReview') }}</span><ul v-if="item.issues.length" class="issue-list"><li v-for="(issue, index) in item.issues" :key="`${issue.code}-${issue.field}-${index}`" :class="issue.severity">{{ issue.field }}: {{ issue.message }}</li></ul></td>
                <td><button type="button" :disabled="busy" @click="openDetail(item.id)">{{ t(detail?.id === item.id ? 'bibliography.hide' : 'bibliography.details') }}</button></td>
              </tr>
              <tr v-if="detail?.id === item.id"><td colspan="5" class="change-cell"><p v-if="!detail.changes.length">{{ t('bibliography.noChanges') }}</p><div v-for="change in detail.changes" :key="change.field" class="field-change"><strong>{{ change.field }}</strong><div><span>{{ t('bibliography.before') }}</span><pre>{{ displayValue(change.before) }}</pre></div><div><span>{{ t('bibliography.after') }}</span><pre>{{ displayValue(change.after) }}</pre></div></div><p v-if="detail.claim_review_status">{{ t('bibliography.contentStatus') }}: {{ statusLabel(detail.claim_review_status) }}</p></td></tr>
              <tr v-if="detail?.id === item.id && detail.decisions.length"><td colspan="5"><strong>{{ t('bibliography.decisions') }}</strong><ol class="decision-history"><li v-for="decision in detail.decisions" :key="decision.id"><span>{{ dateLabel(decision.created_at) }} · {{ decision.actor_name || t('common.unknownUser') }} · {{ statusLabel(decision.decision) }}</span><p v-if="decision.notes">{{ decision.notes }}</p></li></ol></td></tr>
            </template>
          </tbody>
        </table>
      </div>
      <div v-if="record.items.length > pageSize" class="pagination"><button type="button" :disabled="page === 0" @click="page--">{{ t('bibliography.previous') }}</button><span>{{ page + 1 }} / {{ Math.ceil(record.items.length / pageSize) }}</span><button type="button" :disabled="(page + 1) * pageSize >= record.items.length" @click="page++">{{ t('bibliography.next') }}</button></div>
    </div>

    <div class="panel-heading history-heading"><h4>{{ t('bibliography.history') }}</h4><button type="button" :disabled="busy" @click="refreshHistory">{{ t('common.refresh') }}</button></div>
    <p v-if="!history.length">{{ t('bibliography.noHistory') }}</p>
    <ul class="history-list"><li v-for="entry in history" :key="entry.id"><button type="button" :disabled="busy" @click="openImport(entry.id)"><span>{{ entry.source }}</span><span>{{ dateLabel(entry.created_at) }} · {{ statusLabel(entry.status) }}</span></button></li></ul>
    <div v-if="historyTotal > 20" class="pagination"><button type="button" :disabled="busy || historyOffset === 0" @click="historyPage(-20)">{{ t('bibliography.previous') }}</button><button type="button" :disabled="busy || historyOffset + 20 >= historyTotal" @click="historyPage(20)">{{ t('bibliography.next') }}</button></div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePublicConfig } from '@/composables/usePublicConfig'
import InstitutionPaperFields from './InstitutionPaperFields.vue'
import { createBibliographyPreview, getBibliographyImport, listBibliographyImports, getBibliographyItem, applyBibliographyImport, reviewBibliographyImport, getBibliographyFields, type BibliographyImport, type BibliographySummary, type BibliographyDetail, type BibliographyItem, type BibliographyInput, type BibliographyField, type JsonValue } from '@/api/bibliography'
import { bibliographyCsvFields, parseBibliographyCsv, defaultBibliographyMapping, mapBibliographyCsv, parseBibliographyJson, type BibliographyCsv, type BibliographyColumnMapping } from '@/utils/bibliography-csv'

const props = defineProps<{ slug: string; platformAdmin: boolean; canManageFields?: boolean }>()
const emit = defineEmits<{ imported: [] }>()
const { t, te, locale } = useI18n()
const { publicConfig } = usePublicConfig()
const managed = computed(() => publicConfig.value.managementMode !== 'self_hosted')
const fileName = ref('')
const csv = ref<BibliographyCsv | null>(null)
const jsonInput = shallowRef<BibliographyInput | null>(null)
const mappings = ref<BibliographyColumnMapping[]>([])
const definitions = ref<BibliographyField[]>([])
const record = ref<BibliographyImport | null>(null)
const detail = shallowRef<BibliographyDetail | null>(null)
const history = ref<BibliographySummary[]>([])
const historyOffset = ref(0)
const historyTotal = ref(0)
const busy = ref(false)
const error = ref('')
const selectedIds = ref<string[]>([])
const acknowledgeWarnings = ref(false)
const reviewNotes = ref('')
const page = ref(0)
const pageSize = 25
let controller = new AbortController()
let polling: ReturnType<typeof setTimeout> | undefined
let lastPayload = ''
let idempotencyKey = ''
const pageItems = computed(() => record.value?.items.slice(page.value * pageSize, (page.value + 1) * pageSize) ?? [])
const targets = computed(() => [
  ...Object.keys(bibliographyCsvFields).map(value => ({ value, label: value })),
  ...definitions.value.filter(field => field.is_active).map(field => ({ value: `custom.${field.key}`, label: `${locale.value.startsWith('en') ? field.label_en || field.label : field.label} (${field.key})` })),
])
const unmapped = computed(() => mappings.value.filter(mapping => !mapping.target).length)
const isBoolean = (target: string): boolean => definitions.value.some(field => `custom.${field.key}` === target && field.field_type === 'boolean')
const fieldSaved = (field: BibliographyField): void => {
  definitions.value = [...definitions.value.filter(value => value.key !== field.key), field].sort((a, b) => a.display_order - b.display_order || a.key.localeCompare(b.key))
}
const selectable = (item: BibliographyItem): boolean => item.status === 'ready' || (props.platformAdmin && item.status === 'pending_review')
const selectedReady = computed(() => record.value?.items.filter(item => item.status === 'ready' && selectedIds.value.includes(item.id)).map(item => item.id) ?? [])
const selectedPending = computed(() => record.value?.items.filter(item => item.status === 'pending_review' && selectedIds.value.includes(item.id)).map(item => item.id) ?? [])
const selectedWarnings = computed(() => record.value?.items.some(item => selectedIds.value.includes(item.id) && item.issues.some(issue => issue.severity === 'warning')) ?? false)
const allSelected = computed(() => Boolean(record.value?.items.some(selectable)) && record.value!.items.filter(selectable).every(item => selectedIds.value.includes(item.id)))
const toggleAll = (): void => { selectedIds.value = allSelected.value ? [] : record.value?.items.filter(selectable).map(item => item.id) ?? [] }
const statusLabel = (status: string): string => te(`bibliography.statuses.${status}`) ? t(`bibliography.statuses.${status}`) : status
const actionLabel = (action: string): string => te(`adminInstitutionContent.importActions.${action}`) ? t(`adminInstitutionContent.importActions.${action}`) : action
const displayValue = (value: JsonValue): string => typeof value === 'string' ? value : JSON.stringify(value, null, 2)
const dateLabel = (date: string): string => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date))
const setRecord = (value: BibliographyImport): void => {
  record.value = value; detail.value = null; page.value = 0
  selectedIds.value = value.items.filter(selectable).map(item => item.id)
  acknowledgeWarnings.value = false
}
const run = async (work: (signal: AbortSignal) => Promise<void>): Promise<void> => {
  if (busy.value) return
  const signal = controller.signal
  busy.value = true; error.value = ''
  try { await work(signal) } catch (failure) {
    if (!signal.aborted) error.value = failure instanceof Error ? failure.message : t('bibliography.failed')
  } finally { if (!signal.aborted) busy.value = false }
}
const loadHistory = async (signal: AbortSignal): Promise<void> => {
  const result = await listBibliographyImports(props.slug, historyOffset.value, signal)
  if (!signal.aborted) { history.value = result.items; historyTotal.value = result.total }
}
const schedulePoll = (): void => {
  clearTimeout(polling)
  if (record.value?.status !== 'previewing') return
  polling = setTimeout(() => {
    if (busy.value) { schedulePoll(); return }
    void run(async signal => {
      const updated = await getBibliographyImport(props.slug, record.value!.id, signal)
      if (!signal.aborted) { setRecord(updated); schedulePoll() }
    })
  }, 1500)
}
const chooseFile = async (event: Event): Promise<void> => run(async signal => {
  clearTimeout(polling)
  const file = (event.target as HTMLInputElement).files?.[0]
  csv.value = null; jsonInput.value = null; mappings.value = []; record.value = null; fileName.value = ''
  if (!file) return
  if (file.size > 10 * 1024 * 1024) throw new Error(t('bibliography.fileTooLarge'))
  const text = await file.text()
  if (signal.aborted) return
  if (file.name.toLowerCase().endsWith('.csv')) {
    csv.value = parseBibliographyCsv(text); mappings.value = defaultBibliographyMapping(csv.value.headers)
  } else jsonInput.value = parseBibliographyJson(text)
  fileName.value = file.name
})
const preview = async (): Promise<void> => run(async signal => {
  const body = csv.value ? mapBibliographyCsv(csv.value, mappings.value, definitions.value, fileName.value) : jsonInput.value
  if (!body) return
  const serialized = JSON.stringify(body)
  if (serialized !== lastPayload) { idempotencyKey = crypto.randomUUID(); lastPayload = serialized }
  const result = await createBibliographyPreview(props.slug, body, idempotencyKey, signal)
  if (signal.aborted) return
  setRecord(result); schedulePoll(); await loadHistory(signal)
})
const confirmImport = async (): Promise<void> => run(async signal => {
  if (!record.value || !selectedReady.value.length) return
  const previous = record.value.summary.completed
  const result = await applyBibliographyImport(props.slug, record.value.id, { item_ids: selectedReady.value, acknowledge_warnings: acknowledgeWarnings.value }, signal)
  if (signal.aborted) return
  setRecord(result); if (result.summary.completed > previous) emit('imported')
  await loadHistory(signal)
})
const review = async (decision: 'approve' | 'reject'): Promise<void> => run(async signal => {
  if (!record.value || !selectedPending.value.length) return
  const previous = record.value.summary.completed
  const result = await reviewBibliographyImport(props.slug, record.value.id, { item_ids: selectedPending.value, acknowledge_warnings: acknowledgeWarnings.value, decision, notes: reviewNotes.value }, signal)
  if (signal.aborted) return
  setRecord(result); if (result.summary.completed > previous) emit('imported')
  await loadHistory(signal)
})
const openImport = async (id: string): Promise<void> => run(async signal => {
  const result = await getBibliographyImport(props.slug, id, signal)
  if (!signal.aborted) { setRecord(result); schedulePoll() }
})
const openDetail = async (id: string): Promise<void> => run(async signal => {
  if (detail.value?.id === id) { detail.value = null; return }
  const result = await getBibliographyItem(props.slug, record.value!.id, id, signal)
  if (!signal.aborted) detail.value = result
})
const refreshHistory = async (): Promise<void> => run(loadHistory)
const historyPage = async (change: number): Promise<void> => { historyOffset.value += change; await refreshHistory() }
const download = (name: string, value: unknown): void => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url)
}
const downloadTemplate = (): void => download('scholar-papers-v2.json', { schema_version: 2, source: 'example-catalog', items: [{ paper: { titles: [{ language: 'en', title: 'Example paper', is_primary: true }], doi: '10.1234/example', language_tags: ['en'], authors: [{ name: 'Example Author', order: 1 }], publish_year: 2026 } }] })
const saveMapping = (): void => download('scholar-private-column-mapping.json', { version: 1, columns: mappings.value })
const loadMapping = async (event: Event): Promise<void> => run(async signal => {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file || !csv.value) return
  if (file.size > 1000000) throw new Error(t('bibliography.fileTooLarge'))
  const value = JSON.parse(await file.text()) as { version?: number; columns?: BibliographyColumnMapping[] }
  if (signal.aborted) return
  if (value.version !== 1 || !Array.isArray(value.columns)) throw new Error(t('bibliography.invalidMapping'))
  mapBibliographyCsv(csv.value, value.columns, definitions.value, fileName.value)
  mappings.value = value.columns
})
watch(() => props.slug, () => {
  controller.abort(); clearTimeout(polling); controller = new AbortController()
  busy.value = false; fileName.value = ''; record.value = null; detail.value = null; history.value = []; historyOffset.value = 0
  csv.value = null; jsonInput.value = null; definitions.value = []; lastPayload = ''; idempotencyKey = ''
  void run(async signal => {
    const fields = await getBibliographyFields(props.slug, signal)
    if (signal.aborted) return
    definitions.value = fields; await loadHistory(signal)
  })
}, { immediate: true })
onBeforeUnmount(() => { controller.abort(); clearTimeout(polling) })
</script>

<style scoped>
.bibliography-panel { margin-bottom: 28px; padding: 20px; border: 1px solid var(--color-border-2); border-radius: 12px; color: var(--color-text-1); }
.panel-heading, .file-actions, .mapping-tools, .confirmation, .pagination { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.panel-heading { justify-content: space-between; }
h3, h4 { margin: 0; } p { color: var(--color-text-2); line-height: 1.6; }
button, select, input:not([type='checkbox']) { padding: 7px 10px; border: 1px solid var(--color-border-2); border-radius: 6px; background: var(--color-bg-2); color: inherit; max-width: 100%; }
button { cursor: pointer; } button:disabled { opacity: .5; cursor: not-allowed; }
button:focus-visible, select:focus-visible, input:focus-visible { outline: 2px solid rgb(var(--primary-6)); outline-offset: 2px; }
.primary { background: rgb(var(--primary-6)); color: white; }
label { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; } input[type='checkbox'] { accent-color: rgb(var(--primary-6)); }
.file-actions, .mapping-box, .preview-result, .confirmation, .history-heading { margin-top: 18px; }
.file-name { overflow-wrap: anywhere; } .error { color: rgb(var(--danger-6)); } .warning { display: block; color: rgb(var(--warning-7)); }
.mapping-table-wrap, .result-table-wrap { overflow-x: auto; margin-top: 12px; }
table { border-collapse: collapse; width: 100%; font-size: 13px; } th, td { padding: 10px; text-align: start; border-bottom: 1px solid var(--color-border-2); vertical-align: top; }
.mapping-table select { min-width: 145px; } .result-table { min-width: 540px; } .result-table td:nth-child(3) { min-width: 170px; max-width: 400px; overflow-wrap: anywhere; }
.issue-list { margin: 8px 0 0; padding-left: 16px; max-width: 440px; overflow-wrap: anywhere; }
.review-notes { flex: 1; min-width: 220px; } .review-notes input { flex: 1; }
.field-change { display: grid; grid-template-columns: minmax(110px, 1fr) minmax(0, 2fr) minmax(0, 2fr); gap: 12px; margin: 12px 0; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 260px; overflow-y: auto; background: var(--color-fill-1); padding: 8px; }
.history-list { list-style: none; margin: 12px 0; padding: 0; } .history-list button { width: 100%; display: flex; justify-content: space-between; gap: 12px; text-align: start; margin-bottom: 6px; }
.pagination { justify-content: center; margin-top: 12px; }
@media (max-width: 640px) { .bibliography-panel { padding: 12px; } .field-change { grid-template-columns: 1fr; } .history-list button { flex-direction: column; } }
</style>
