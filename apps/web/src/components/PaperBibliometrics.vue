<template>
  <section v-if="loading || failed || editions.length" class="paper-metrics">
    <h2>{{ $t('paperBibliography.metrics') }}</h2>
    <p v-if="failed" role="alert">{{ $t('paperBibliography.loadFailed') }} <button type="button" @click="reload">{{ $t('common.retry') }}</button></p>
    <label v-if="editions.length" class="edition-picker">{{ $t('journals.version') }}
      <select v-model="selected" @change="loadMetrics(0)">
        <option value="">{{ $t('paperBibliography.chooseEdition') }}</option>
        <option v-for="edition in editions" :key="edition.id" :value="edition.id">{{ edition.system.toUpperCase() }} · {{ edition.version }} · r{{ edition.revision }}</option>
      </select>
    </label>
    <button v-if="editions.length < total" type="button" :disabled="loading" @click="loadEditions(true)">{{ $t('paperBibliography.moreEditions') }}</button>
    <p v-if="loading" role="status">{{ $t('common.loading') }}</p>
    <template v-if="metrics">
      <p class="edition-source">
        {{ $t('journals.source') }}: <a v-if="sourceUrl" :href="sourceUrl" target="_blank" rel="noopener noreferrer">{{ metrics.edition.source }}</a><span v-else>{{ metrics.edition.source }}</span>
        <span v-if="metrics.edition.metric_year != null"> · {{ $t('paperBibliography.metricYear') }}: {{ metrics.edition.metric_year }}</span>
        <span v-if="metrics.edition.released_on"> · {{ $t('journals.releasedOn') }}: {{ metrics.edition.released_on }}</span>
        <span v-if="metrics.edition.observed_on"> · {{ $t('journals.observedOn') }}: {{ metrics.edition.observed_on }}</span>
      </p>
      <div v-if="metrics.rankings.length" class="metrics-table">
        <table><thead><tr><th>{{ $t('journals.category') }}</th><th>{{ $t('journals.metric') }}</th><th>{{ $t('paperBibliography.quartile') }}</th><th>Top</th></tr></thead>
          <tbody><tr v-for="row in metrics.rankings" :key="row.id"><td>{{ row.category }} <span class="level">{{ levelLabel(row.category_level) }}</span></td><td>{{ row.metric.toUpperCase() }}</td><td>{{ quartile(row.metric, row.quartile) }}</td><td>{{ booleanLabel(row.is_top) }}</td></tr></tbody>
        </table>
      </div>
      <ul v-if="metrics.indicators.length"><li v-for="row in metrics.indicators" :key="row.id">{{ row.kind === 'hot' ? $t('journals.hot') : $t('journals.highlyCited') }}<span v-if="row.category"> · {{ row.category }}</span>: {{ booleanLabel(row.value) }}</li></ul>
      <nav v-if="page > 0 || hasMore" :aria-label="$t('paperBibliography.metricPages')"><button type="button" :disabled="loading || page === 0" @click="loadMetrics(page - 20)">{{ $t('bibliography.previous') }}</button><button type="button" :disabled="loading || !hasMore" @click="loadMetrics(page + 20)">{{ $t('bibliography.next') }}</button></nav>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { getPaperMetrics, listPaperMetricEditions, type PaperMetricEdition, type PaperMetrics } from '@/api/paper-bibliography'
import { resolveSafeHttpUrl } from '@/utils/url'
import { useAuth } from '@/composables/useAuth'

const props = defineProps<{ paperId: string }>()
const { t, te } = useI18n()
const { token } = useAuth()
const editions = ref<PaperMetricEdition[]>([])
const total = ref(0)
const selected = ref('')
const metrics = ref<PaperMetrics | null>(null)
const loading = ref(false)
const failed = ref(false)
const page = ref(0)
let controller: AbortController | undefined
let failedOperation: 'editions' | 'metrics' = 'editions'
const sourceUrl = computed(() => resolveSafeHttpUrl(metrics.value?.edition.source_url))
const hasMore = computed(() => page.value + 20 < Math.max(metrics.value?.ranking_total ?? 0, metrics.value?.indicator_total ?? 0))
const booleanLabel = (value: boolean | null): string => t(value === null ? 'journals.unknown' : value ? 'journals.yes' : 'journals.no')
const levelLabel = (value: string): string => te(`journals.levels.${value}`) ? t(`journals.levels.${value}`) : value
const quartile = (metric: string, value: number | null): string => value === null ? t('journals.unknown') : metric === 'cas' ? t('paperBibliography.casZone', { zone: value }) : ['jif', 'jci'].includes(metric) ? `Q${value}` : String(value)
const begin = (): AbortController => {
  controller?.abort()
  const current = new AbortController()
  controller = current
  loading.value = true
  failed.value = false
  return current
}
const loadEditions = async (more = false): Promise<void> => {
  failedOperation = 'editions'
  const current = begin()
  try {
    const result = await listPaperMetricEditions(props.paperId, more ? editions.value.length : 0, current.signal)
    if (!current.signal.aborted) {
      editions.value = more ? [...new Map([...editions.value, ...result.items].map(item => [item.id, item])).values()] : result.items
      total.value = result.total
    }
  } catch { if (!current.signal.aborted) failed.value = true } finally { if (!current.signal.aborted) loading.value = false }
}
const loadMetrics = async (offset: number): Promise<void> => {
  failedOperation = 'metrics'
  const current = begin()
  metrics.value = null
  page.value = offset
  if (!selected.value) { loading.value = false; return }
  try {
    const result = await getPaperMetrics(props.paperId, selected.value, offset, current.signal)
    if (!current.signal.aborted) metrics.value = result
  } catch { if (!current.signal.aborted) failed.value = true } finally { if (!current.signal.aborted) loading.value = false }
}
const reload = (): void => { if (failedOperation === 'metrics') void loadMetrics(page.value); else void loadEditions(editions.value.length > 0) }
watch([() => props.paperId, token], () => {
  selected.value = ''
  metrics.value = null
  editions.value = []
  total.value = 0
  page.value = 0
  void loadEditions()
}, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => controller?.abort())
</script>

<style scoped>
.paper-metrics { margin: 24px 0; font-size: 14px; line-height: 1.7; }
h2 { font-size: 16px; margin: 0 0 12px; }
.edition-picker { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
select { max-width: 100%; padding: 8px; border: 1px solid var(--scholar-border-color, #ddd); border-radius: 6px; background: white; font: inherit; }
.edition-source, .level { color: var(--scholar-text-3); font-size: 12px; }
.metrics-table { overflow-x: auto; }
table { width: 100%; text-align: left; border-collapse: collapse; }
th, td { padding: 8px 12px; border-bottom: 1px solid var(--scholar-border-color, #eee); }
button { cursor: pointer; background: none; color: var(--scholar-primary, #165dff); border: 0; padding: 8px; }
button:disabled { opacity: .5; cursor: default; }
nav { display: flex; justify-content: flex-end; }
</style>
