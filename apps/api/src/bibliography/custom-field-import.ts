import {
  validateCustomFields,
  type CustomFieldDefinition,
  type CustomFieldValidation,
} from './custom-fields'
import type { CustomFieldValue } from './schema'

export interface CustomFieldColumnMapping {
  blank: 'skip' | 'clear'
  boolean_values?: { true: string[]; false: string[] }
  multi_select_separator?: string
}

// The raw preview can show null for an empty source cell, while a patch omits it
// unless the operator explicitly chooses to clear existing values.
export const normalizeCustomFieldCell = (
  raw: string | null,
  definition: CustomFieldDefinition,
  mapping: CustomFieldColumnMapping,
): CustomFieldValidation => {
  const text = raw?.trim() ?? ''
  const booleanValues = mapping.boolean_values
  if (booleanValues) {
    const trueValues = booleanValues.true.map((value) => value.trim())
    const falseValues = booleanValues.false.map((value) => value.trim())
    if (
      definition.field_type !== 'boolean' ||
      !trueValues.length ||
      !falseValues.length ||
      [...trueValues, ...falseValues].some((value) => !value) ||
      trueValues.some((value) => falseValues.includes(value))
    ) {
      throw new Error('Boolean mappings must define distinct, nonempty true and false values')
    }
  }
  if (!text) {
    return mapping.blank === 'skip'
      ? { values: {}, issues: [] }
      : validateCustomFields({ [definition.key]: null }, [definition], true)
  }
  let value: CustomFieldValue = text
  if (definition.field_type === 'boolean') {
    const trueValues = booleanValues?.true.map((entry) => entry.trim()) ?? ['true']
    const falseValues = booleanValues?.false.map((entry) => entry.trim()) ?? ['false']
    if (trueValues.includes(text)) value = true
    else if (falseValues.includes(text)) value = false
  } else if (
    definition.field_type === 'number' &&
    /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/u.test(text)
  ) {
    value = Number(text)
  } else if (definition.field_type === 'multi_select') {
    const separator = mapping.multi_select_separator
    if (!separator) throw new Error('Multi-select columns require an explicit separator')
    value = text.split(separator).map((entry) => entry.trim())
  }
  return validateCustomFields({ [definition.key]: value }, [definition], true)
}
