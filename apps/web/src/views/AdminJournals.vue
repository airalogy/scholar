<template>
  <main class="journals-page" :aria-busy="busy">
    <header><h1>{{ t('journals.title') }}</h1><button type="button" :disabled="busy" @click="showCreate = !showCreate">{{ t('journals.create') }}</button></header>
    <p>{{ t('journals.description') }}</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="busy" role="status">{{ t('common.loading') }}</p>
    <form v-if="showCreate" class="editor" @submit.prevent="create">
      <fieldset :disabled="busy">
        <label>{{ t('journals.system') }}<select v-model="newEdition.system" name="system"><option v-for="value in systems" :key="value" :value="value">{{ systemLabel(value) }}</option></select></label>
        <label>{{ t('journals.version') }}<input v-model="newEdition.version" name="version" required maxlength="100"></label>
        <label>{{ t('journals.metricYear') }}<input v-model.number="metricYear" name="metric_year" type="number" min="1900" max="9999" step="1"></label>
        <label>{{ t('journals.releasedOn') }}<input v-model="newEdition.released_on" name="released_on" type="date"></label>
        <label>{{ t('journals.observedOn') }}<input v-model="newEdition.observed_on" name="observed_on" type="date" :required="newEdition.system === 'esi'"></label>
        <label>{{ t('journals.source') }}<input v-model="newEdition.source" name="source" required maxlength="255"></label>
        <label>{{ t('journals.sourceUrl') }}<input v-model="newEdition.source_url" name="source_url" type="url" maxlength="2000"></label>
        <label>{{ t('journals.notes') }}<input v-model="newEdition.notes" name="create_notes" required maxlength="2000"></label>
        <button type="submit">{{ t('journals.create') }}</button>
      </fieldset>
    </form>
    <form class="filters" @submit.prevent="search">
      <label>{{ t('common.search') }}<input v-model="query" :disabled="busy" maxlength="500"></label>
      <label>{{ t('journals.system') }}<select v-model="system" :disabled="busy"><option value="">{{ t('common.all') }}</option><option v-for="value in systems" :key="value" :value="value">{{ systemLabel(value) }}</option></select></label>
      <label>{{ t('journals.status') }}<select v-model="status" :disabled="busy"><option value="">{{ t('common.all') }}</option><option value="draft">{{ t('journals.draft') }}</option><option value="published">{{ t('journals.published') }}</option></select></label>
      <button type="submit" :disabled="busy">{{ t('common.search') }}</button>
    </form>
    <div class="table-wrap">
      <table><thead><tr><th>{{ t('journals.system') }}</th><th>{{ t('journals.version') }}</th><th>{{ t('journals.metricYear') }}</th><th>{{ t('journals.status') }}</th><th>{{ t('journals.source') }}</th></tr></thead><tbody>
        <tr v-for="edition in editions" :key="edition.id" :class="{ selected: detail?.edition.id === edition.id }"><td>{{ systemLabel(edition.system) }}</td><td><button type="button" :disabled="busy" @click="open(edition.id)">{{ edition.version }} · r{{ edition.revision }}</button></td><td>{{ edition.metric_year ?? '—' }}</td><td>{{ t(`journals.${edition.status}`) }}</td><td>{{ edition.source }}</td></tr>
      </tbody></table>
    </div>
    <p v-if="!editions.length && !busy">{{ t('journals.empty') }}</p>
    <div v-if="total > 20" class="pagination"><button type="button" :disabled="busy || offset === 0" @click="turnPage(-20)">{{ t('bibliography.previous') }}</button><span>{{ offset + 1 }}–{{ Math.min(offset + 20, total) }} / {{ total }}</span><button type="button" :disabled="busy || offset + 20 >= total" @click="turnPage(20)">{{ t('bibliography.next') }}</button></div>

    <section v-if="detail" class="edition-detail">
      <header><h2>{{ systemLabel(detail.edition.system) }} · {{ detail.edition.version }} · r{{ detail.edition.revision }}</h2><button type="button" :disabled="busy" @click="open(detail.edition.id)">{{ t('common.refresh') }}</button></header>
      <p>{{ t('journals.releasedOn') }}: {{ detail.edition.released_on ?? '—' }} · {{ t('journals.observedOn') }}: {{ detail.edition.observed_on ?? '—' }}</p>
      <p>{{ t('journals.source') }}: <a v-if="safeSource" :href="safeSource" target="_blank" rel="noopener noreferrer">{{ detail.edition.source }}</a><span v-else>{{ detail.edition.source }}</span></p>
      <p v-if="detail.edition.status === 'published'" class="notice">{{ t('journals.frozen') }}</p>
      <div class="edition-actions">
        <label class="change-notes">{{ t('journals.notes') }}<input v-model="notes" :disabled="busy" maxlength="2000"></label>
        <template v-if="detail.edition.status === 'draft'">
          <button type="button" :disabled="busy" @click="detail.edition.system === 'esi' ? editIndicator() : editRanking()">{{ t('journals.addObservation') }}</button>
          <button type="button" :disabled="busy || !notes.trim() || !observationTotal" @click="publish">{{ t('journals.publish') }}</button>
        </template>
        <button v-else type="button" :disabled="busy || !notes.trim()" @click="revise">{{ t('journals.revise') }}</button>
      </div>
      <form v-if="ranking" class="editor" @submit.prevent="saveRanking">
        <fieldset :disabled="busy">
          <label>{{ t('journals.findJournal') }}<input v-model="journalQuery" :disabled="editingObservation" maxlength="500"></label>
          <button type="button" :disabled="editingObservation" @click="searchJournals">{{ t('common.search') }}</button>
          <label>{{ t('journals.journal') }}<select v-model="ranking.journal_id" name="journal_id" required :disabled="editingObservation"><option value="">{{ t('journals.chooseJournal') }}</option><option v-if="selectedJournal && !journals.some(row => row.id === selectedJournal!.id)" :value="selectedJournal.id">{{ selectedJournal.name }}</option><option v-for="journal in journals" :key="journal.id" :value="journal.id">{{ journal.name }} {{ journal.identifiers.map(value => value.value).join(' / ') }}</option></select></label>
          <label>{{ t('journals.category') }}<input v-model="ranking.category" name="category" required maxlength="500" :disabled="editingObservation"></label>
          <label>{{ t('journals.categoryLevel') }}<select v-model="ranking.category_level" name="category_level" :disabled="editingObservation"><option v-for="level in categoryLevels" :key="level" :value="level">{{ t(`journals.levels.${level}`) }}</option></select></label>
          <label>{{ t('journals.metric') }}<select v-model="ranking.metric" name="metric" :disabled="editingObservation"><option v-for="metric in metrics" :key="metric" :value="metric">{{ metric.toUpperCase() }}</option></select></label>
          <label>{{ t('journals.quartile') }}<select v-model="ranking.quartile" name="quartile"><option :value="null">{{ t('journals.unknown') }}</option><option v-for="value in [1, 2, 3, 4]" :key="value" :value="value">{{ value }}</option></select></label>
          <label>Top<select v-model="ranking.is_top" name="is_top"><option :value="null">{{ t('journals.unknown') }}</option><option :value="true">{{ t('journals.yes') }}</option><option :value="false">{{ t('journals.no') }}</option></select></label>
          <button type="submit" :disabled="!notes.trim()">{{ t('journals.save') }}</button><button type="button" @click="ranking = null">{{ t('common.cancel') }}</button>
        </fieldset>
      </form>
      <form v-if="indicator" class="editor" @submit.prevent="saveIndicator">
        <fieldset :disabled="busy">
          <label>{{ t('journals.paperId') }}<input v-model="indicator.paper_id" name="paper_id" required :disabled="editingObservation"></label>
          <label>{{ t('journals.indicator') }}<select v-model="indicator.kind" :disabled="editingObservation"><option value="highly_cited">{{ t('journals.highlyCited') }}</option><option value="hot">{{ t('journals.hot') }}</option></select></label>
          <label>{{ t('journals.category') }}<input v-model="indicator.category" maxlength="255" :disabled="editingObservation"></label>
          <label>{{ t('journals.value') }}<select v-model="indicator.value" required><option :value="null" disabled>{{ t('journals.chooseValue') }}</option><option :value="true">{{ t('journals.yes') }}</option><option :value="false">{{ t('journals.no') }}</option></select></label>
          <button type="submit" :disabled="!notes.trim()">{{ t('journals.save') }}</button><button type="button" @click="indicator = null">{{ t('common.cancel') }}</button>
        </fieldset>
      </form>
      <div class="table-wrap">
        <table v-if="detail.edition.system !== 'esi'"><thead><tr><th>{{ t('journals.journal') }}</th><th>{{ t('journals.category') }}</th><th>{{ t('journals.metric') }}</th><th>{{ t('journals.quartile') }}</th><th>Top</th><th>{{ t('journals.actions') }}</th></tr></thead><tbody>
          <tr v-for="row in detail.rankings" :key="row.id"><td>{{ row.journal_name }}</td><td>{{ t(`journals.levels.${row.category_level}`) }} · {{ row.category }}</td><td>{{ row.metric.toUpperCase() }}</td><td>{{ row.quartile ?? '—' }}</td><td>{{ boolLabel(row.is_top) }}</td><td><template v-if="detail.edition.status === 'draft'"><button type="button" :disabled="busy" @click="editRanking(row)">{{ t('journals.edit') }}</button><button type="button" :disabled="busy || !notes.trim()" @click="withdraw(row.id, 'ranking')">{{ t('journals.withdraw') }}</button></template></td></tr>
        </tbody></table>
        <table v-else><thead><tr><th>{{ t('journals.paper') }}</th><th>{{ t('journals.indicator') }}</th><th>{{ t('journals.category') }}</th><th>{{ t('journals.value') }}</th><th>{{ t('journals.actions') }}</th></tr></thead><tbody>
          <tr v-for="row in detail.indicators" :key="row.id"><td>{{ row.paper_title }}</td><td>{{ t(row.kind === 'hot' ? 'journals.hot' : 'journals.highlyCited') }}</td><td>{{ row.category || '—' }}</td><td>{{ boolLabel(row.value) }}</td><td><template v-if="detail.edition.status === 'draft'"><button type="button" :disabled="busy" @click="editIndicator(row)">{{ t('journals.edit') }}</button><button type="button" :disabled="busy || !notes.trim()" @click="withdraw(row.id, 'indicator')">{{ t('journals.withdraw') }}</button></template></td></tr>
        </tbody></table>
      </div>
      <div v-if="observationTotal > 20" class="pagination"><button type="button" :disabled="busy || detailOffset === 0" @click="turnDetailPage(-20)">{{ t('bibliography.previous') }}</button><button type="button" :disabled="busy || detailOffset + 20 >= observationTotal" @click="turnDetailPage(20)">{{ t('bibliography.next') }}</button></div>
      <details v-if="detail.events.length" class="history"><summary>{{ t('journals.history') }}</summary><ol><li v-for="event in detail.events" :key="event.id"><span>{{ dateLabel(event.created_at) }} · {{ event.actor_name ?? t('common.unknownUser') }} · {{ t(`journals.events.${event.action}`) }}</span><p>{{ event.notes }}</p></li></ol></details>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import * as api from '@/api/bibliometrics'
import { resolveSafeHttpUrl } from '@/utils/url'

const { t, locale } = useI18n()
const systems: api.BibliometricSystem[] = ['jcr', 'cas', 'esi', 'institution']
const query = ref('')
const system = ref<api.BibliometricSystem | ''>('')
const status = ref<'draft' | 'published' | ''>('')
const offset = ref(0)
const total = ref(0)
const editions = ref<api.BibliometricEdition[]>([])
const detail = ref<api.EditionDetail | null>(null)
const detailOffset = ref(0)
const busy = ref(false)
const error = ref('')
const notes = ref('')
const showCreate = ref(false)
const metricYear = ref<number | ''>('')
const newEdition = ref<api.BibliometricEditionInput>({ system: 'jcr', version: '', source: '', notes: '' })
const ranking = ref<api.RankingChange | null>(null)
const indicator = ref<(Omit<api.IndicatorChange, 'value'> & { value: boolean | null }) | null>(null)
const editingObservation = ref(false)
const journalQuery = ref('')
const journals = ref<api.JournalItem[]>([])
const selectedJournal = ref<{ id: string; name: string } | null>(null)
const controller = new AbortController()
const safeSource = computed(() => resolveSafeHttpUrl(detail.value?.edition.source_url))
const observationTotal = computed(() => (detail.value?.edition.ranking_count ?? 0) + (detail.value?.edition.indicator_count ?? 0))
const metrics = computed<api.JournalRanking['metric'][]>(() => detail.value?.edition.system === 'jcr' ? ['jif', 'jci'] : detail.value?.edition.system === 'cas' ? ['cas'] : ['institution'])
const categoryLevels = computed<api.JournalRanking['category_level'][]>(() => detail.value?.edition.system === 'cas' ? ['broad', 'narrow'] : ['category'])
const systemLabel = (value: api.BibliometricSystem): string => value === 'institution' ? t('journals.institutionSystem') : value.toUpperCase()
const boolLabel = (value: boolean | null): string => t(value === null ? 'journals.unknown' : value ? 'journals.yes' : 'journals.no')
const dateLabel = (value: string): string => new Date(value).toLocaleString(locale.value)
const run = async (work: (signal: AbortSignal) => Promise<void>): Promise<void> => {
  if (busy.value || controller.signal.aborted) return
  busy.value = true
  error.value = ''
  try { await work(controller.signal) } catch (failure) {
    if (!controller.signal.aborted) error.value = failure instanceof Error ? failure.message : t('bibliography.failed')
  } finally { if (!controller.signal.aborted) busy.value = false }
}
const loadList = async (signal: AbortSignal): Promise<void> => {
  const result = await api.listBibliometricEditions({ q: query.value, system: system.value || undefined, status: status.value || undefined, offset: offset.value }, signal)
  if (!signal.aborted) { editions.value = result.items; total.value = result.total }
}
const loadDetail = async (id: string, signal: AbortSignal): Promise<void> => {
  const result = await api.getBibliometricEdition(id, detailOffset.value, signal)
  if (!signal.aborted) detail.value = result
}
const open = async (id: string): Promise<void> => run(async signal => {
  ranking.value = null; indicator.value = null; detailOffset.value = 0; notes.value = ''
  await loadDetail(id, signal)
})
const search = async (): Promise<void> => run(async signal => { offset.value = 0; await loadList(signal) })
const turnPage = async (change: number): Promise<void> => run(async signal => { offset.value += change; await loadList(signal) })
const turnDetailPage = async (change: number): Promise<void> => run(async signal => { detailOffset.value += change; await loadDetail(detail.value!.edition.id, signal) })
const create = async (): Promise<void> => run(async signal => {
  const { released_on, observed_on, source_url, ...fields } = newEdition.value
  const result = await api.createBibliometricEdition({ ...fields, metric_year: typeof metricYear.value === 'number' ? metricYear.value : undefined, released_on: released_on || undefined, observed_on: observed_on || undefined, source_url: source_url || undefined }, signal)
  if (signal.aborted) return
  showCreate.value = false; detailOffset.value = 0
  await loadDetail(result.id, signal); await loadList(signal)
})
const changeBody = (): api.EditionChange => ({ expected_revision: detail.value!.edition.content_revision, notes: notes.value })
const afterChange = async (id: string, signal: AbortSignal): Promise<void> => {
  if (signal.aborted) return
  ranking.value = null; indicator.value = null
  await loadDetail(id, signal); await loadList(signal)
}
const publish = async (): Promise<void> => run(async signal => {
  if (!window.confirm(t('journals.publishConfirm'))) return
  const result = await api.publishBibliometricEdition(detail.value!.edition.id, changeBody(), signal)
  await afterChange(result.id, signal)
})
const revise = async (): Promise<void> => run(async signal => {
  const result = await api.reviseBibliometricEdition(detail.value!.edition.id, changeBody(), signal)
  detailOffset.value = 0
  await afterChange(result.id, signal)
})
const searchJournals = async (): Promise<void> => run(async signal => {
  const result = await api.listBibliometricJournals(journalQuery.value, signal)
  if (!signal.aborted) journals.value = result.items
})
const editRanking = (row?: api.JournalRanking): void => {
  indicator.value = null
  editingObservation.value = Boolean(row)
  selectedJournal.value = row ? { id: row.journalId, name: row.journal_name } : null
  ranking.value = { ...changeBody(), journal_id: row?.journalId ?? '', category: row?.category ?? '', category_level: row?.category_level ?? categoryLevels.value[0], metric: row?.metric ?? metrics.value[0], quartile: row?.quartile ?? null, is_top: row?.is_top ?? null }
}
const editIndicator = (row?: api.PaperIndicator): void => {
  ranking.value = null; editingObservation.value = Boolean(row)
  indicator.value = { ...changeBody(), paper_id: row?.paperId ?? '', kind: row?.kind ?? 'highly_cited', category: row?.category ?? '', value: row?.value ?? null }
}
const saveRanking = async (): Promise<void> => run(async signal => {
  const result = await api.saveJournalRanking(detail.value!.edition.id, { ...ranking.value!, ...changeBody() }, signal)
  await afterChange(result.id, signal)
})
const saveIndicator = async (): Promise<void> => run(async signal => {
  if (!indicator.value || indicator.value.value === null) throw new Error(t('journals.chooseValue'))
  const result = await api.savePaperIndicator(detail.value!.edition.id, { ...indicator.value, value: indicator.value.value, ...changeBody() }, signal)
  await afterChange(result.id, signal)
})
const withdraw = async (id: string, type: 'ranking' | 'indicator'): Promise<void> => run(async signal => {
  if (!window.confirm(t('journals.withdrawConfirm'))) return
  const result = await api.withdrawBibliometricObservation(detail.value!.edition.id, { ...changeBody(), observation_id: id, observation_type: type }, signal)
  detailOffset.value = 0
  await afterChange(result.id, signal)
})
onMounted(() => { void run(loadList) })
onBeforeUnmount(() => controller.abort())
</script>

<style scoped>
.journals-page { max-width: 1120px; margin: 0 auto; padding: 32px 24px 64px; color: var(--color-text-1); }
header, .filters, .edition-actions, .pagination { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; }
h1 { font-size: 26px; } h2 { font-size: 20px; }
p { color: var(--color-text-2); line-height: 1.7; }
.filters, .edition-actions { justify-content: flex-start; align-items: flex-end; margin: 20px 0; }
label { display: flex; flex-direction: column; gap: 6px; font-size: 14px; }
button, input, select { color: inherit; background: var(--color-bg-2); padding: 8px 10px; border: 1px solid var(--color-border-2); border-radius: 6px; min-width: 0; }
button { cursor: pointer; } button:disabled { opacity: .5; cursor: not-allowed; }
button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid rgb(var(--primary-6)); outline-offset: 2px; }
table { width: 100%; border-collapse: collapse; font-size: 14px; } th, td { padding: 12px 8px; text-align: start; border-bottom: 1px solid var(--color-border-2); overflow-wrap: anywhere; }
.table-wrap { overflow-x: auto; } .selected, .notice { background: var(--color-fill-1); } .notice { padding: 12px; }
.edition-detail { margin-top: 32px; padding-top: 20px; border-top: 1px solid var(--color-border-2); }
.editor { padding: 20px; margin: 20px 0; border: 1px solid var(--color-border-2); border-radius: 8px; }
fieldset { border: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.change-notes { flex: 1; min-width: 220px; } .history { margin-top: 20px; } .history li { margin: 12px 0; }
.error { color: rgb(var(--danger-6)); } .pagination { justify-content: center; margin-top: 16px; } a { color: rgb(var(--primary-6)); }
@media (max-width: 640px) { fieldset { grid-template-columns: 1fr; } .journals-page { padding: 20px 12px; } .editor { padding: 12px; } }
</style>
