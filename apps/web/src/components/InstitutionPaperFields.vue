<template>
  <details class="paper-fields">
    <summary>{{ t('paperFields.title') }} ({{ fields.length }})</summary>
    <p>{{ t('paperFields.description') }}</p>
    <button type="button" :disabled="disabled || saving || fields.length >= 100" @click="edit()">{{ t('paperFields.add') }}</button>
    <ul v-if="fields.length" class="field-list">
      <li v-for="field in fields" :key="field.key">
        <div>
          <strong>{{ locale.startsWith('en') ? field.label_en || field.label : field.label }}</strong>
          <code>{{ field.key }}</code>
          <span>{{ t(`paperFields.types.${field.field_type}`) }} · {{ t(`paperFields.visibilities.${field.visibility}`) }}</span>
          <span v-if="field.is_required">{{ t('paperFields.required') }}</span>
          <span v-if="!field.is_active">{{ t('paperFields.inactive') }}</span>
        </div>
        <button type="button" :disabled="disabled || saving" @click="edit(field)">{{ t('paperFields.edit') }}</button>
      </li>
    </ul>
    <p v-else>{{ t('paperFields.empty') }}</p>
    <form v-if="draft" class="field-editor" @submit.prevent="save">
      <h4>{{ t(editing ? 'paperFields.edit' : 'paperFields.add') }}</h4>
      <fieldset :disabled="disabled || saving">
        <label>{{ t('paperFields.key') }}<input v-model="draft.key" name="key" required pattern="[a-z][a-z0-9_]{0,99}" maxlength="100" :disabled="editing"></label>
        <label>{{ t('paperFields.label') }}<input v-model="draft.label" name="label" required maxlength="200"></label>
        <label>{{ t('paperFields.labelEn') }}<input v-model="draft.label_en" name="label_en" maxlength="200"></label>
        <label>{{ t('paperFields.type') }}<select v-model="draft.field_type" name="field_type" @change="resetConstraints"><option v-for="type in types" :key="type" :value="type">{{ t(`paperFields.types.${type}`) }}</option></select></label>
        <label>{{ t('paperFields.visibility') }}<select v-model="draft.visibility" name="visibility"><option v-for="visibility in visibilities" :key="visibility" :value="visibility">{{ t(`paperFields.visibilities.${visibility}`) }}</option></select></label>
        <label>{{ t('paperFields.order') }}<input v-model.number="draft.display_order" name="display_order" type="number" required min="0" max="10000" step="1"></label>
        <template v-if="draft.field_type === 'number'">
          <label>{{ t('paperFields.minimum') }}<input v-model.number="draft.min_value" name="min_value" type="number" step="any"></label>
          <label>{{ t('paperFields.maximum') }}<input v-model.number="draft.max_value" name="max_value" type="number" step="any"></label>
        </template>
        <label v-if="draft.field_type === 'text'">{{ t('paperFields.maxLength') }}<input v-model.number="draft.max_length" name="max_length" type="number" min="1" max="10000" required step="1"></label>
        <template v-if="draft.field_type === 'date'">
          <label>{{ t('paperFields.earliest') }}<input v-model="draft.min_date" name="min_date" type="date"></label>
          <label>{{ t('paperFields.latest') }}<input v-model="draft.max_date" name="max_date" type="date"></label>
        </template>
        <label v-if="isSelect" class="wide">{{ t('paperFields.options') }}<textarea v-model="optionsText" name="options" required rows="4" maxlength="50100" /></label>
        <label class="check-label"><input v-model="draft.is_required" name="is_required" type="checkbox">{{ t('paperFields.required') }}</label>
        <label class="check-label"><input v-model="draft.is_active" name="is_active" type="checkbox">{{ t('paperFields.active') }}</label>
        <p class="wide">{{ t('paperFields.safety') }}</p>
        <div class="actions wide">
          <button type="submit">{{ t(saving ? 'common.loading' : 'paperFields.save') }}</button>
          <button type="button" @click="draft = null">{{ t('common.cancel') }}</button>
        </div>
      </fieldset>
    </form>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <p v-if="success" role="status">{{ t('paperFields.saved') }}</p>
  </details>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { saveBibliographyField, type BibliographyField } from '@/api/bibliography'

const props = defineProps<{ slug: string; fields: BibliographyField[]; disabled: boolean }>()
const emit = defineEmits<{ saved: [field: BibliographyField] }>()
const { t, locale } = useI18n()
const types: BibliographyField['field_type'][] = ['text', 'number', 'boolean', 'date', 'single_select', 'multi_select']
const visibilities: BibliographyField['visibility'][] = ['admin', 'institution', 'public']
const draft = ref<BibliographyField | null>(null)
const editing = ref(false)
const optionsText = ref('')
const saving = ref(false)
const error = ref('')
const success = ref(false)
let controller: AbortController | undefined
const isSelect = computed(() => draft.value?.field_type === 'single_select' || draft.value?.field_type === 'multi_select')
const edit = (field?: BibliographyField): void => {
  editing.value = Boolean(field)
  draft.value = field ? { ...field, options: [...field.options] } : {
    key: '', label: '', label_en: null, field_type: 'text', options: [],
    is_active: true, is_required: false, display_order: 0, visibility: 'admin',
    min_value: null, max_value: null, max_length: 10000, min_date: null, max_date: null,
  }
  optionsText.value = draft.value.options.join('\n')
  error.value = ''
  success.value = false
}
const resetConstraints = (): void => {
  if (!draft.value) return
  draft.value.min_value = null
  draft.value.max_value = null
  draft.value.min_date = null
  draft.value.max_date = null
  draft.value.max_length = 10000
  optionsText.value = ''
}
const nullableNumber = (value: unknown): number | null => {
  if (value === '' || value == null) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(t('paperFields.invalidNumber'))
  return value
}
const save = async (): Promise<void> => {
  if (!draft.value || saving.value || props.disabled) return
  error.value = ''
  success.value = false
  saving.value = true
  controller = new AbortController()
  const signal = controller.signal
  try {
    const body: BibliographyField = {
      ...draft.value,
      label: draft.value.label.trim(),
      label_en: draft.value.label_en?.trim() || null,
      options: isSelect.value ? optionsText.value.split(/\r?\n/u).map(value => value.trim()).filter(Boolean) : [],
      min_value: nullableNumber(draft.value.min_value), max_value: nullableNumber(draft.value.max_value),
      min_date: draft.value.min_date || null, max_date: draft.value.max_date || null,
    }
    if (!editing.value && props.fields.some(field => field.key === body.key)) throw new Error(t('paperFields.duplicateKey'))
    if (body.options.length > 100 || new Set(body.options).size !== body.options.length) throw new Error(t('paperFields.invalidOptions'))
    const field = await saveBibliographyField(props.slug, body, signal)
    if (signal.aborted) return
    emit('saved', field)
    draft.value = null
    success.value = true
  } catch (failure) {
    if (!signal.aborted) error.value = failure instanceof Error ? failure.message : t('bibliography.failed')
  } finally {
    if (!signal.aborted) saving.value = false
  }
}
watch(() => props.slug, () => {
  controller?.abort()
  draft.value = null
  error.value = ''
  success.value = false
  saving.value = false
})
onBeforeUnmount(() => controller?.abort())
</script>

<style scoped>
.paper-fields { border-bottom: 1px solid var(--color-border-2); padding-bottom: 16px; margin-bottom: 20px; }
summary { cursor: pointer; font-weight: 600; }
p { color: var(--color-text-2); line-height: 1.7; }
.field-list { list-style: none; padding: 0; }
.field-list li, .field-list li > div, .actions { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
.field-list li { justify-content: space-between; border-bottom: 1px solid var(--color-border-2); padding: 12px 0; }
.field-list span, code { font-size: 13px; color: var(--color-text-2); overflow-wrap: anywhere; }
.field-editor { margin-top: 16px; }
fieldset { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; border: 0; padding: 0; }
label { display: flex; flex-direction: column; gap: 6px; }
button, input:not([type='checkbox']), select, textarea { padding: 8px; border: 1px solid var(--color-border-2); border-radius: 6px; background: var(--color-bg-2); color: inherit; min-width: 0; }
button { cursor: pointer; }
button:disabled { opacity: .5; cursor: not-allowed; }
.check-label { flex-direction: row; align-items: center; }
.wide { grid-column: 1 / -1; }
.error { color: rgb(var(--danger-6)); }
@media (max-width: 640px) { fieldset { grid-template-columns: 1fr; } }
</style>
