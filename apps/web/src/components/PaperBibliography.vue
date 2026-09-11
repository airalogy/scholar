<template>
  <section class="paper-bibliography">
    <p v-if="loading" role="status">{{ $t('common.loading') }}</p>
    <p v-if="failed" role="alert">{{ $t('paperBibliography.loadFailed') }} <button type="button" @click="load">{{ $t('common.retry') }}</button></p>
    <template v-if="data">
      <dl class="bibliography-facts">
        <template v-for="title in alternateTitles" :key="`${title.language}:${title.kind}`">
          <dt>{{ languageName(title.language) }} <span v-if="title.kind === 'machine_translated'">{{ $t('paperBibliography.machineTranslated') }}</span></dt>
          <dd :lang="title.language">{{ title.title }}</dd>
        </template>
        <template v-if="data.language_tags.length"><dt>{{ $t('paperDetail.languageLabel') }}</dt><dd>{{ data.language_tags.map(languageName).join(' · ') }}</dd></template>
        <template v-if="data.document_type"><dt>{{ $t('paperBibliography.documentType') }}</dt><dd>{{ codeLabel('documentTypes', data.document_type) }}</dd></template>
        <template v-if="data.publication_status"><dt>{{ $t('paperBibliography.publicationStatus') }}</dt><dd>{{ codeLabel('publicationStatuses', data.publication_status) }}</dd></template>
        <template v-for="identifier in identifiers" :key="`${identifier.scheme}:${identifier.value}`"><dt>{{ identifier.scheme.toUpperCase() }}</dt><dd>{{ identifier.value }}</dd></template>
      </dl>
      <section v-if="data.authors.length">
        <h2>{{ $t('paperBibliography.authorship') }}</h2>
        <ol class="author-list">
          <li v-for="author in data.authors" :key="author.id" :value="author.order">
            <span>{{ author.name }}</span>
            <span v-if="author.corresponding === true" class="fact-badge">{{ $t('paperBibliography.corresponding') }}</span>
            <span v-if="author.equal_contribution === true" class="fact-badge">{{ $t('paperBibliography.equalContribution') }}</span>
            <span v-if="!author.order_verified" class="fact-note">{{ $t('paperBibliography.orderUnverified') }}</span>
            <span v-if="author.orcid" class="fact-note">ORCID {{ author.orcid }}</span>
            <div v-for="affiliationId in author.affiliation_ids" :key="affiliationId" class="fact-note">{{ affiliationsById.get(affiliationId) }}</div>
          </li>
        </ol>
      </section>
      <section v-if="data.affiliations.length">
        <h2>{{ $t('paperBibliography.affiliations') }}</h2>
        <ul><li v-for="affiliation in data.affiliations" :key="affiliation.id">{{ affiliation.raw_name }}</li></ul>
      </section>
      <section v-if="data.funding.length">
        <h2>{{ $t('paperBibliography.funding') }}</h2>
        <ul><li v-for="fund in data.funding" :key="fund.id">{{ fund.raw_text }}<span v-if="fund.award_number && !fund.raw_text.includes(fund.award_number)" class="fact-note"> · {{ fund.award_number }}</span></li></ul>
      </section>
      <dl v-if="institutionFacts.length || data.institution.custom_fields.length" class="bibliography-facts">
        <template v-for="fact in institutionFacts" :key="fact.key"><dt>{{ $t(`paperBibliography.${fact.key}`) }}</dt><dd>{{ fact.value }}</dd></template>
        <template v-for="field in data.institution.custom_fields" :key="field.key"><dt>{{ locale.startsWith('en') ? field.label_en || field.label : field.label }}</dt><dd>{{ displayValue(field.value) }}</dd></template>
      </dl>
      <section v-if="data.sources.length">
        <h2>{{ $t('paperBibliography.provenance') }}</h2>
        <ul><li v-for="source in data.sources" :key="source.provider">{{ source.provider }}<span v-if="source.external_id"> · {{ source.external_id }}</span><span v-if="source.collected_on"> · {{ $t('paperBibliography.collectedOn', { date: source.collected_on }) }}</span></li></ul>
      </section>
    </template>
    <PaperBibliometrics :paper-id="paperId" />
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { getPaperBibliography, type PaperBibliography } from '@/api/paper-bibliography'
import { useAuth } from '@/composables/useAuth'
import PaperBibliometrics from './PaperBibliometrics.vue'

const props = defineProps<{ paperId: string }>()
const { t, te, locale } = useI18n()
const { token } = useAuth()
const data = ref<PaperBibliography | null>(null)
const loading = ref(false)
const failed = ref(false)
let controller: AbortController | undefined
const alternateTitles = computed(() => data.value?.titles.filter(title => !title.is_primary) ?? [])
const identifiers = computed(() => [...(data.value?.identifiers.filter(item => item.scheme !== 'doi') ?? []), ...(data.value?.journal?.identifiers ?? [])])
const affiliationsById = computed(() => new Map(data.value?.affiliations.map(item => [item.id, item.raw_name])))
const languageName = (tag: string): string => {
  try { return new Intl.DisplayNames([locale.value], { type: 'language' }).of(tag) ?? tag } catch { return tag }
}
const codeLabel = (group: string, value: string): string => te(`paperBibliography.${group}.${value}`) ? t(`paperBibliography.${group}.${value}`) : value
const displayValue = (value: null | string | number | boolean | string[]): string => {
  if (value === null) return t('journals.unknown')
  if (typeof value === 'boolean') return t(value ? 'journals.yes' : 'journals.no')
  return Array.isArray(value) ? value.join(' · ') : String(value)
}
const institutionFacts = computed(() => {
  if (!data.value) return []
  const row = data.value.institution
  return [
    { key: 'owningUnits', value: row.owning_units.join(' · ') },
    { key: 'secondaryUnits', value: row.secondary_units.join(' · ') },
    { key: 'signatureType', value: row.signature_type },
    { key: 'affiliationCount', value: row.reported_affiliation_count == null ? null : String(row.reported_affiliation_count) },
    { key: 'cooperation', value: [row.cooperation_types.join(' · '), row.cooperation_description].filter(Boolean).join(' — ') },
  ].filter(item => item.value !== null && item.value !== '')
})
const load = async (): Promise<void> => {
  controller?.abort()
  const current = new AbortController()
  controller = current
  data.value = null
  failed.value = false
  loading.value = true
  try {
    const result = await getPaperBibliography(props.paperId, current.signal)
    if (!current.signal.aborted) data.value = result
  } catch { if (!current.signal.aborted) failed.value = true } finally { if (!current.signal.aborted) loading.value = false }
}
watch([() => props.paperId, token], load, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => controller?.abort())
</script>

<style scoped>
.paper-bibliography { margin-top: 24px; color: var(--scholar-text-1); font-size: 14px; line-height: 1.7; overflow-wrap: anywhere; }
.paper-bibliography section, .bibliography-facts { margin: 20px 0; }
h2 { font-size: 16px; margin: 0 0 10px; }
.bibliography-facts { display: grid; grid-template-columns: minmax(90px, 130px) minmax(0, 1fr); gap: 10px 18px; }
dt, .fact-note { color: var(--scholar-text-3); }
dd { margin: 0; }
ul, ol { padding-left: 24px; }
li { margin: 8px 0; }
.fact-badge { display: inline-block; margin-left: 8px; border-radius: 4px; background: var(--scholar-bg-2, #f5f6f8); padding: 0 6px; font-size: 12px; }
.fact-note { font-size: 12px; margin-left: 8px; }
button { cursor: pointer; color: var(--scholar-primary, #165dff); background: transparent; border: 0; }
@media (max-width: 600px) { .bibliography-facts { grid-template-columns: 1fr; gap: 2px; } dd { margin-bottom: 12px; } }
</style>
