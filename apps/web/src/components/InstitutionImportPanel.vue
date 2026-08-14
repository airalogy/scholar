<template>
  <section class="admin-panel">
    <div class="panel-head">
      <div>
        <h2 class="panel-title">{{ $t('adminInstitutionContent.importTitle') }}</h2>
        <p class="panel-subtitle">{{ $t('adminInstitutionContent.importSubtitle') }}</p>
      </div>
    </div>

    <div class="import-grid">
      <article v-for="kind in importKinds" :key="kind" class="import-card">
        <div class="import-card-head">
          <div>
            <h3 class="import-card-title">{{ getKindLabel(kind) }}</h3>
            <p class="import-card-subtitle">{{ getKindSubtitle(kind) }}</p>
          </div>
          <span class="import-card-badge">CSV → JSON</span>
        </div>
        <div class="import-required">{{ getRequiredFields(kind) }}</div>

        <div class="import-actions">
          <a-button type="outline" size="small" @click="downloadTemplate(kind)">
            {{ $t('adminInstitutionContent.downloadTemplate') }}
          </a-button>
          <label class="import-file-trigger">
            <input
              class="import-file-input"
              type="file"
              accept=".csv,text/csv"
              @change="handleFileChange(kind, $event)"
            >
            {{ states[kind].fileName
              ? $t('adminInstitutionContent.changeFile')
              : $t('adminInstitutionContent.selectFile') }}
          </label>
          <a-button
            type="primary"
            size="small"
            :loading="states[kind].isSubmitting"
            :disabled="states[kind].items.length === 0 || Boolean(states[kind].parseError)"
            @click="submitImport(kind)"
          >
            {{ $t('adminInstitutionContent.startImport') }}
          </a-button>
        </div>

        <div class="import-file-name">
          {{ states[kind].fileName || $t('adminInstitutionContent.noFileSelected') }}
        </div>
        <div v-if="states[kind].isParsing" class="preview-box">
          {{ $t('adminInstitutionContent.csvParsing') }}
        </div>
        <div v-else-if="states[kind].parseError" class="preview-box preview-box--error">
          {{ states[kind].parseError }}
        </div>
        <div v-else-if="states[kind].items.length" class="preview-box">
          {{ $t('adminInstitutionContent.csvPreviewReady', { count: states[kind].items.length }) }}
          <div class="preview-keys">
            {{ states[kind].previewKeys.join(' · ') }}
          </div>
        </div>

        <div
          v-if="states[kind].result"
          class="import-result"
          :class="{ 'import-result--warning': hasIssues(states[kind].result) }"
        >
          <div class="import-result-summary">
            {{ formatImportSummary(states[kind].result) }}
          </div>
          <ul v-if="getIssueItems(states[kind].result).length" class="import-issues-list">
            <li
              v-for="item in getIssueItems(states[kind].result)"
              :key="`${states[kind].result?.id}-${item.index}`"
            >
              {{ formatImportIssue(item) }}
            </li>
          </ul>
        </div>
      </article>
    </div>

    <div class="history-head">
      <div>
        <h3 class="history-title">{{ $t('adminInstitutionContent.importHistoryTitle') }}</h3>
        <p class="panel-subtitle">{{ $t('adminInstitutionContent.importHistorySubtitle') }}</p>
      </div>
      <a-button type="text" size="small" :loading="isHistoryLoading" @click="loadHistory">
        {{ $t('common.refresh') }}
      </a-button>
    </div>

    <div v-if="isHistoryLoading && history.length === 0" class="history-state">
      {{ $t('common.loading') }}
    </div>
    <div v-else-if="history.length" class="history-list">
      <article v-for="record in history" :key="record.id" class="history-item">
        <div class="history-main">
          <div class="history-title-row">
            <strong>{{ getKindLabel(record.kind) }}</strong>
            <span class="status-badge" :class="`status-badge--${record.status}`">
              {{ getStatusLabel(record.status) }}
            </span>
          </div>
          <div class="history-meta">
            {{ formatDateTime(record.createdAt) }} ·
            {{ record.actorType === 'integration'
              ? $t('adminInstitutionContent.actorIntegration')
              : $t('adminInstitutionContent.actorUser') }}
          </div>
          <div class="history-meta">{{ formatImportSummary(record) }}</div>
        </div>
        <a-button
          type="outline"
          size="small"
          :loading="detailLoadingId === record.id"
          @click="toggleImportDetail(record.id)"
        >
          {{ selectedImport?.id === record.id
            ? $t('adminInstitutionContent.hideImportDetails')
            : $t('adminInstitutionContent.showImportDetails') }}
        </a-button>
        <div
          v-if="canReviewScholarImport(record)"
          class="import-review"
        >
          <a-input
            v-model="reviewNotes[record.id]"
            :placeholder="$t('adminInstitutionContent.importReviewNotesPlaceholder')"
            allow-clear
          />
          <a-button
            type="primary"
            size="small"
            :loading="reviewActionId === record.id && reviewActionStatus === 'approved'"
            @click="reviewImport(record.id, 'approved')"
          >
            {{ $t('adminInstitutionContent.approveScholarImport') }}
          </a-button>
          <a-button
            status="danger"
            type="outline"
            size="small"
            :loading="reviewActionId === record.id && reviewActionStatus === 'rejected'"
            @click="reviewImport(record.id, 'rejected')"
          >
            {{ $t('adminInstitutionContent.rejectScholarImport') }}
          </a-button>
        </div>
        <div v-if="selectedImport?.id === record.id" class="history-details">
          <div v-if="selectedImport.reviewNotes" class="review-notes">
            {{ $t('adminInstitutionContent.reviewNotes') }}：{{ selectedImport.reviewNotes }}
          </div>
          <div v-if="selectedImport.items.length" class="detail-list">
            <div
              v-for="item in selectedImport.items"
              :key="`${selectedImport.id}-${item.index}`"
              class="detail-item"
            >
              <span>#{{ item.index + 1 }} {{ item.key || '-' }}</span>
              <span>{{ getActionLabel(item.action) }}</span>
              <span v-if="item.message">{{ item.message }}</span>
            </div>
          </div>
          <div v-else class="history-state">{{ $t('adminInstitutionContent.noImportDetails') }}</div>
        </div>
      </article>
    </div>
    <div v-else class="history-state">{{ $t('adminInstitutionContent.noImportHistory') }}</div>
  </section>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { Message } from '@arco-design/web-vue'
import { useI18n } from 'vue-i18n'
import {
  getInstitutionImport,
  importInstitutionPapers,
  importInstitutionScholars,
  listInstitutionImports,
  reviewInstitutionImport,
  type InstitutionDetailResponse,
  type InstitutionImportItemAction,
  type InstitutionImportKind,
  type InstitutionImportRecord,
  type InstitutionImportResultItem,
  type InstitutionImportStatus,
  type PaperImportItem,
  type ScholarImportItem,
} from '@/api/institutions'
import { parseStrictCsvRecords, type ParsedCsvRecord } from '@/utils/csv'

const props = defineProps<{
  institution: InstitutionDetailResponse
}>()

const emit = defineEmits<{
  papersImported: []
}>()

const { t, locale } = useI18n()
const importKinds: InstitutionImportKind[] = ['papers', 'scholars']

type ImportPayloadItem = PaperImportItem | ScholarImportItem

interface ImportPanelState {
  fileName: string
  isParsing: boolean
  isSubmitting: boolean
  parseError: string
  items: ImportPayloadItem[]
  previewKeys: string[]
  result: InstitutionImportRecord | null
}

const PAPER_HEADERS = [
  'title',
  'doi',
  'publish_year',
  'paper_type',
  'language',
  'abstract',
  'journal_name',
  'publish_date',
  'citation_count',
  'pages',
  'link',
  'keywords',
]
const SCHOLAR_HEADERS = [
  'external_id',
  'name',
  'avatar',
  'college',
  'title',
  'lab',
  'office',
  'email',
  'phone',
  'bio',
  'join_year',
  'research_directions',
  'education',
  'achievements',
  'research_timeline',
  'letter_index',
  'subjects',
  'subject_codes',
  'paper_dois',
]
const PAPER_TEMPLATE = [
  'Example Paper Title',
  '10.48550/example.paper',
  '2024',
  '',
  '',
  'Example abstract',
  'Example Journal',
  '2024-03-31',
  '12',
  '1-12',
  'https://example.com/paper',
  '["AI","Biology"]',
]
const SCHOLAR_TEMPLATE = [
  'faculty-001',
  'Example Scholar',
  '',
  '["Computer Science"]',
  'Scholar',
  'Example Lab',
  'Room 301',
  'prof@example.edu',
  '',
  'Example scholar bio',
  '2020',
  '[{"name":"AI for Science","description":"Research focus"}]',
  '[{"school":"Example University","degree":"PhD","period":"2010-2015"}]',
  '[]',
  '[]',
  'E',
  '',
  '["computer-science"]',
  '["10.48550/example.paper"]',
]

const createState = (): ImportPanelState => ({
  fileName: '',
  isParsing: false,
  isSubmitting: false,
  parseError: '',
  items: [],
  previewKeys: [],
  result: null,
})

const states = reactive<Record<InstitutionImportKind, ImportPanelState>>({
  papers: createState(),
  scholars: createState(),
})
const history = ref<Array<Omit<InstitutionImportRecord, 'items'>>>([])
const isHistoryLoading = ref(false)
const selectedImport = ref<InstitutionImportRecord | null>(null)
const detailLoadingId = ref('')
const reviewNotes = reactive<Record<string, string>>({})
const reviewActionId = ref('')
const reviewActionStatus = ref<'approved' | 'rejected' | ''>('')

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as {
      response?: { data?: { message?: string } }
    }).response
    if (response?.data?.message) {
      return response.data.message
    }
  }
  return error instanceof Error ? error.message : fallback
}

const optionalString = (value: string): string | undefined => {
  const normalized = value.trim()
  return normalized || undefined
}

const parseOptionalInteger = (
  rowNumber: number,
  field: string,
  value: string,
): number | undefined => {
  const normalized = optionalString(value)
  if (normalized === undefined) {
    return undefined
  }
  const parsed = Number(normalized)
  if (!Number.isInteger(parsed)) {
    throw new Error(t('adminInstitutionContent.csvIntegerError', { row: rowNumber, field }))
  }
  return parsed
}

const parseJsonArray = <T,>(
  rowNumber: number,
  field: string,
  value: string,
): T[] | undefined => {
  const normalized = optionalString(value)
  if (normalized === undefined) {
    return undefined
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(normalized)
  } catch {
    throw new Error(t('adminInstitutionContent.csvJsonError', { row: rowNumber, field }))
  }
  if (!Array.isArray(parsed)) {
    throw new Error(t('adminInstitutionContent.csvArrayError', { row: rowNumber, field }))
  }
  return parsed as T[]
}

const requireValue = (
  rowNumber: number,
  field: string,
  value: string,
): string => {
  const normalized = optionalString(value)
  if (!normalized) {
    throw new Error(t('adminInstitutionContent.csvRequiredError', { row: rowNumber, field }))
  }
  return normalized
}

const toPaper = ({ rowNumber, record }: ParsedCsvRecord): PaperImportItem => {
  return {
    title: requireValue(rowNumber, 'title', record.title),
    doi: requireValue(rowNumber, 'doi', record.doi),
    publish_year: parseOptionalInteger(rowNumber, 'publish_year', record.publish_year),
    paper_type: parseOptionalInteger(rowNumber, 'paper_type', record.paper_type),
    language: parseOptionalInteger(rowNumber, 'language', record.language),
    abstract: optionalString(record.abstract),
    journal_name: optionalString(record.journal_name),
    publish_date: optionalString(record.publish_date),
    citation_count: parseOptionalInteger(rowNumber, 'citation_count', record.citation_count),
    pages: optionalString(record.pages),
    link: optionalString(record.link),
    keywords: parseJsonArray<string>(rowNumber, 'keywords', record.keywords),
  }
}

const toScholar = ({ rowNumber, record }: ParsedCsvRecord): ScholarImportItem => {
  return {
    external_id: requireValue(rowNumber, 'external_id', record.external_id),
    name: requireValue(rowNumber, 'name', record.name),
    avatar: optionalString(record.avatar),
    college: parseJsonArray<string>(rowNumber, 'college', record.college),
    title: optionalString(record.title),
    lab: optionalString(record.lab),
    office: optionalString(record.office),
    email: optionalString(record.email),
    phone: optionalString(record.phone),
    bio: optionalString(record.bio),
    join_year: parseOptionalInteger(rowNumber, 'join_year', record.join_year),
    research_directions: parseJsonArray<{
      name: string
      description?: string
    }>(rowNumber, 'research_directions', record.research_directions),
    education: parseJsonArray<{
      school: string
      degree: string
      period: string
    }>(rowNumber, 'education', record.education),
    achievements: parseJsonArray<NonNullable<ScholarImportItem['achievements']>[number]>(
      rowNumber,
      'achievements',
      record.achievements,
    ),
    research_timeline: parseJsonArray<NonNullable<ScholarImportItem['research_timeline']>[number]>(
      rowNumber,
      'research_timeline',
      record.research_timeline,
    ),
    letter_index: optionalString(record.letter_index),
    subjects: parseJsonArray<string>(rowNumber, 'subjects', record.subjects),
    subject_codes: parseJsonArray<string>(rowNumber, 'subject_codes', record.subject_codes),
    paper_dois: parseJsonArray<string>(rowNumber, 'paper_dois', record.paper_dois),
  }
}

const escapeCsvCell = (value: string): string => {
  const normalized = value.replace(/"/gu, '""')
  return /[",\n]/u.test(normalized) ? `"${normalized}"` : normalized
}

const downloadTemplate = (kind: InstitutionImportKind): void => {
  const headers = kind === 'papers' ? PAPER_HEADERS : SCHOLAR_HEADERS
  const row = kind === 'papers' ? PAPER_TEMPLATE : SCHOLAR_TEMPLATE
  const content = [headers, row]
    .map((values) => values.map(escapeCsvCell).join(','))
    .join('\n')
  const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = kind === 'papers'
    ? 'institution-papers-import-template.csv'
    : 'institution-scholars-import-template.csv'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

const handleFileChange = async (
  kind: InstitutionImportKind,
  event: Event,
): Promise<void> => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  const state = states[kind]
  state.fileName = file?.name ?? ''
  state.items = []
  state.previewKeys = []
  state.result = null
  state.parseError = ''
  if (!file) {
    return
  }

  state.isParsing = true
  try {
    const rows = parseStrictCsvRecords(
      await file.text(),
      kind === 'papers' ? PAPER_HEADERS : SCHOLAR_HEADERS,
    )
    if (rows.length === 0) {
      throw new Error(t('adminInstitutionContent.csvNoRows'))
    }
    if (rows.length > 500) {
      throw new Error(t('adminInstitutionContent.csvTooManyRows'))
    }
    state.items = kind === 'papers'
      ? rows.map(toPaper)
      : rows.map(toScholar)
    state.previewKeys = state.items.slice(0, 5).map((item) => {
      return 'doi' in item ? item.doi : item.external_id
    })
  } catch (error) {
    state.parseError = getErrorMessage(error, t('adminInstitutionContent.csvParseFailed'))
  } finally {
    state.isParsing = false
  }
}

const buildIdempotencyKey = (): string => {
  return globalThis.crypto?.randomUUID?.() ??
    `web-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const submitImport = async (kind: InstitutionImportKind): Promise<void> => {
  const state = states[kind]
  if (state.items.length === 0) {
    return
  }

  state.isSubmitting = true
  try {
    const result = kind === 'papers'
      ? await importInstitutionPapers(
        props.institution.slug,
        state.items as PaperImportItem[],
        buildIdempotencyKey(),
      )
      : await importInstitutionScholars(
        props.institution.slug,
        state.items as ScholarImportItem[],
        buildIdempotencyKey(),
      )
    state.result = result
    await loadHistory()
    if (kind === 'papers') {
      emit('papersImported')
    }
    if (result.summary.errors > 0) {
      Message.warning(t('adminInstitutionContent.importCompletedWithErrors'))
    } else {
      Message.success(t('adminInstitutionContent.importCompleted'))
    }
  } catch (error) {
    Message.error(getErrorMessage(error, t('adminInstitutionContent.importFailed')))
  } finally {
    state.isSubmitting = false
  }
}

const loadHistory = async (): Promise<void> => {
  isHistoryLoading.value = true
  try {
    const result = await listInstitutionImports(props.institution.slug, { limit: 20 })
    history.value = result.items
  } catch (error) {
    Message.error(getErrorMessage(error, t('adminInstitutionContent.importHistoryFailed')))
  } finally {
    isHistoryLoading.value = false
  }
}

const toggleImportDetail = async (importId: string): Promise<void> => {
  if (selectedImport.value?.id === importId) {
    selectedImport.value = null
    return
  }

  detailLoadingId.value = importId
  try {
    selectedImport.value = await getInstitutionImport(props.institution.slug, importId)
  } catch (error) {
    Message.error(getErrorMessage(error, t('adminInstitutionContent.importDetailFailed')))
  } finally {
    detailLoadingId.value = ''
  }
}

const canReviewScholarImport = (
  record: Omit<InstitutionImportRecord, 'items'>,
): boolean => {
  return props.institution.access.platform_role === 'platform_admin' &&
    record.kind === 'scholars' &&
    record.status === 'pending_review'
}

const reviewImport = async (
  importId: string,
  status: 'approved' | 'rejected',
): Promise<void> => {
  reviewActionId.value = importId
  reviewActionStatus.value = status
  try {
    selectedImport.value = await reviewInstitutionImport(
      props.institution.slug,
      importId,
      {
        status,
        notes: reviewNotes[importId]?.trim() || undefined,
      },
    )
    await loadHistory()
    Message.success(t('adminInstitutionContent.importReviewed'))
  } catch (error) {
    Message.error(getErrorMessage(error, t('adminInstitutionContent.importReviewFailed')))
  } finally {
    reviewActionId.value = ''
    reviewActionStatus.value = ''
  }
}

const getKindLabel = (kind: InstitutionImportKind): string => {
  return t(`adminInstitutionContent.${kind === 'papers' ? 'paperImportTitle' : 'scholarImportTitle'}`)
}

const getKindSubtitle = (kind: InstitutionImportKind): string => {
  return t(`adminInstitutionContent.${kind === 'papers' ? 'paperImportSubtitle' : 'scholarImportSubtitle'}`)
}

const getRequiredFields = (kind: InstitutionImportKind): string => {
  return t(`adminInstitutionContent.${kind === 'papers' ? 'paperImportRequiredFields' : 'scholarImportRequiredFields'}`)
}

const getStatusLabel = (status: InstitutionImportStatus): string => {
  return t(`adminInstitutionContent.importStatuses.${status}`)
}

const getActionLabel = (action: InstitutionImportItemAction): string => {
  return t(`adminInstitutionContent.importActions.${action}`)
}

const formatDateTime = (value: string): string => {
  return new Intl.DateTimeFormat(locale.value, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

const formatImportSummary = (
  result: Pick<InstitutionImportRecord, 'summary'>,
): string => {
  return t('adminInstitutionContent.importSummary', result.summary)
}

const hasIssues = (result: InstitutionImportRecord): boolean => {
  return result.summary.errors > 0 || result.summary.pending > 0
}

const getIssueItems = (result: InstitutionImportRecord): InstitutionImportResultItem[] => {
  return result.items.filter((item) => item.status === 'error' || item.status === 'pending')
}

const formatImportIssue = (item: InstitutionImportResultItem): string => {
  return t('adminInstitutionContent.importIssue', {
    row: item.index + 1,
    id: item.key ?? '-',
    message: item.message ?? getActionLabel(item.action),
  })
}

watch(
  () => props.institution.slug,
  () => {
    states.papers = createState()
    states.scholars = createState()
    history.value = []
    selectedImport.value = null
    void loadHistory()
  },
  { immediate: true },
)
</script>

<style lang="sass" scoped>
.panel-title, .import-card-title, .history-title
  margin: 0
  color: #1f2937

.panel-title
  font-size: 20px

.panel-subtitle
  margin: 8px 0 0
  font-size: 14px
  color: #667085

.import-grid
  display: grid
  grid-template-columns: repeat(2, minmax(0, 1fr))
  gap: 16px
  margin-top: 18px

.import-card
  padding: 18px
  border-radius: 18px
  background: #f8fafc
  border: 1px solid rgba(15, 47, 87, 0.08)

.import-card-head, .history-head, .history-title-row
  display: flex
  align-items: flex-start
  justify-content: space-between
  gap: 14px

.import-card-title
  font-size: 16px

.import-card-subtitle, .import-required, .history-meta
  margin: 8px 0 0
  font-size: 13px
  line-height: 1.6
  color: #667085

.import-card-badge, .status-badge
  padding: 5px 10px
  border-radius: 999px
  background: #edf4ff
  color: #0f4c81
  font-size: 12px
  font-weight: 700

.import-actions
  display: flex
  flex-wrap: wrap
  gap: 10px
  margin-top: 16px

.import-file-trigger
  display: inline-flex
  align-items: center
  min-height: 32px
  padding: 0 14px
  border-radius: 10px
  border: 1px dashed #98a2b3
  background: #fff
  color: #355070
  font-size: 13px
  font-weight: 600
  cursor: pointer

.import-file-input
  display: none

.import-file-name, .preview-box
  margin-top: 12px
  font-size: 13px
  color: #667085
  word-break: break-all

.preview-box, .import-result
  padding: 12px
  border-radius: 12px
  background: #fff
  border: 1px solid rgba(15, 47, 87, 0.08)

.preview-box--error
  color: #b42318
  background: #fff5f4

.preview-keys
  margin-top: 6px
  color: #355070

.import-result
  margin-top: 14px
  background: #edf7ee

.import-result--warning
  background: #fff8eb

.import-result-summary, .import-issues-list
  font-size: 13px
  line-height: 1.6
  color: #1f2937

.import-issues-list
  margin: 10px 0 0
  padding-left: 18px

.history-head
  margin-top: 24px
  align-items: center

.history-title
  font-size: 16px

.history-list
  display: flex
  flex-direction: column
  gap: 10px
  margin-top: 14px

.history-item
  display: grid
  grid-template-columns: 1fr auto
  gap: 12px
  padding: 14px
  border: 1px solid rgba(15, 47, 87, 0.08)
  border-radius: 14px
  background: #fff

.history-main
  min-width: 0

.history-title-row
  justify-content: flex-start
  align-items: center

.history-details
  grid-column: 1 / -1
  padding-top: 12px
  border-top: 1px solid rgba(15, 47, 87, 0.08)

.import-review
  grid-column: 1 / -1
  display: grid
  grid-template-columns: minmax(240px, 1fr) auto auto
  gap: 10px

.review-notes
  margin-bottom: 10px
  color: #8a4b10

.detail-list
  display: flex
  flex-direction: column
  gap: 6px

.detail-item
  display: grid
  grid-template-columns: minmax(160px, 1fr) 100px minmax(160px, 2fr)
  gap: 10px
  font-size: 12px
  color: #667085

.history-state
  padding: 20px 0
  color: #667085

.status-badge--completed
  background: #edf7ee
  color: #137333

.status-badge--pending_review, .status-badge--processing
  background: #fff8eb
  color: #8a4b10

.status-badge--completed_with_errors, .status-badge--rejected, .status-badge--failed
  background: #fff1f0
  color: #b42318

@media (max-width: 768px)
  .import-grid
    grid-template-columns: 1fr

  .history-item
    grid-template-columns: 1fr

  .detail-item
    grid-template-columns: 1fr

  .import-review
    grid-template-columns: 1fr
</style>
