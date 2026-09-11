import { Check } from 'typebox/value'
import type { FastifyInstance } from 'fastify'
import { Prisma } from '../../prisma/generated/client'
import { assertCanManageInstitutionMembers } from '../utils/permissions'
import { loadImportInstitution } from '../routes/v1/institutions/service.shared'
import {
  CustomFieldDefinitionInputSchema,
  type CustomFieldDefinitionInput,
  type CustomFieldValue,
} from './schema'
import { isIsoDate, type BibliographyIssue } from './normalize'

export interface CustomFieldDefinition {
  key: string
  label: string
  label_en: string | null
  field_type: string
  options: string[]
  visibility: string
  is_active: boolean
  display_order: number
  is_required?: boolean
  min_value?: number | null
  max_value?: number | null
  max_length?: number
  min_date?: Date | string | null
  max_date?: Date | string | null
}

export interface CustomFieldValidation {
  values: Record<string, CustomFieldValue>
  issues: BibliographyIssue[]
}

const reservedKeys = new Set(['__proto__', 'constructor', 'prototype'])

const isoDay = (value: Date | string | null | undefined): string | null => {
  return value instanceof Date ? value.toISOString().slice(0, 10) : (value ?? null)
}

export const validateCustomFields = (
  input: Record<string, unknown>,
  definitions: CustomFieldDefinition[],
  partial = false,
): CustomFieldValidation => {
  const definitionsByKey = new Map(definitions.map((definition) => [definition.key, definition]))
  const result: CustomFieldValidation = { values: {}, issues: [] }
  for (const [key, value] of Object.entries(input)) {
    const definition = definitionsByKey.get(key)
    const issue = (code: string, message: string): void => {
      result.issues.push({
        code,
        severity: 'warning',
        field: `institution_metadata.custom_fields.${key}`,
        message,
      })
    }
    if (
      reservedKeys.has(key) ||
      !/^[a-z][a-z0-9_]{0,99}$/u.test(key) ||
      !definition ||
      !definition.is_active
    ) {
      issue(
        'unknown_custom_field',
        'The custom field is not configured or is inactive; its value was not applied',
      )
      continue
    }
    if (value === null && !definition.is_required) {
      result.values[key] = null
      continue
    }
    let valid = false
    switch (definition.field_type) {
      case 'boolean':
        valid = typeof value === 'boolean'
        break
      case 'number':
        valid =
          typeof value === 'number' &&
          Number.isFinite(value) &&
          (definition.min_value == null || value >= definition.min_value) &&
          (definition.max_value == null || value <= definition.max_value)
        break
      case 'date':
        valid =
          typeof value === 'string' &&
          isIsoDate(value) &&
          (!isoDay(definition.min_date) || value >= isoDay(definition.min_date)!) &&
          (!isoDay(definition.max_date) || value <= isoDay(definition.max_date)!)
        break
      case 'text':
        valid =
          typeof value === 'string' &&
          [...value].length <= (definition.max_length ?? 10000) &&
          value.trim().length > 0
        break
      case 'single_select':
        valid = typeof value === 'string' && definition.options.includes(value)
        break
      case 'multi_select':
        valid =
          Array.isArray(value) &&
          value.length <= 100 &&
          (!definition.is_required || value.length > 0) &&
          value.every(
            (item: unknown) => typeof item === 'string' && definition.options.includes(item),
          )
        break
    }
    if (!valid) {
      result.issues.push({
        code: 'invalid_custom_field',
        severity: definition.is_required ? 'error' : 'warning',
        field: `institution_metadata.custom_fields.${key}`,
        message: `The value does not match the configured ${definition.field_type} field${definition.is_required ? '' : '; other paper fields can still be imported'}`,
      })
      continue
    }
    result.values[key] = Array.isArray(value)
      ? [...new Set(value as string[])]
      : (value as CustomFieldValue)
  }
  if (!partial) {
    for (const definition of definitions) {
      if (definition.is_active && definition.is_required && !Object.hasOwn(input, definition.key)) {
        result.issues.push({
          code: 'required_custom_field',
          severity: 'error',
          field: `institution_metadata.custom_fields.${definition.key}`,
          message: 'This institution requires a valid value for the custom field',
        })
      }
    }
  }
  return result
}

// Omitted keys leave stored values alone; only an explicit null clears a value.
// Invalid optional changes are reported and skipped without erasing old data.
export const mergeCustomFieldPatch = (
  current: Record<string, CustomFieldValue>,
  patch: Record<string, unknown>,
  definitions: CustomFieldDefinition[],
): CustomFieldValidation => {
  const checked = validateCustomFields(patch, definitions, true)
  const values = { ...current, ...checked.values }
  const required = definitions.filter(
    (definition) => definition.is_active && definition.is_required,
  )
  const requiredValues = Object.fromEntries(
    required
      .filter((definition) => Object.hasOwn(values, definition.key))
      .map((definition) => [definition.key, values[definition.key]]),
  )
  const issues = [...checked.issues]
  for (const issue of validateCustomFields(requiredValues, required).issues) {
    if (!issues.some((existing) => existing.field === issue.field && existing.severity === 'error'))
      issues.push(issue)
  }
  return { values, issues }
}

export const visibleCustomFields = (
  values: Record<string, unknown>,
  definitions: CustomFieldDefinition[],
  access: 'admin' | 'institution' | 'public',
): Record<string, CustomFieldValue> => {
  const allowed = definitions.filter(
    (definition) =>
      definition.is_active &&
      (access === 'admin' ||
        definition.visibility === 'public' ||
        (access === 'institution' && definition.visibility === 'institution')),
  )
  return validateCustomFields(values, allowed, true).values
}

export const getCustomFieldDefinitions = async (
  fastify: FastifyInstance,
  slug: string,
  userId: string,
): Promise<CustomFieldDefinition[]> => {
  const institution = await loadImportInstitution(fastify, slug)
  await assertCanManageInstitutionMembers(fastify, userId, institution.id)
  return fastify.prisma.institution_paper_field_definitions.findMany({
    where: { institutionId: institution.id },
    orderBy: [{ display_order: 'asc' }, { key: 'asc' }],
  })
}

export const saveCustomFieldDefinition = async (
  fastify: FastifyInstance,
  slug: string,
  userId: string,
  input: CustomFieldDefinitionInput,
): Promise<CustomFieldDefinition> => {
  const institution = await loadImportInstitution(fastify, slug)
  await assertCanManageInstitutionMembers(fastify, userId, institution.id)
  if (!Check(CustomFieldDefinitionInputSchema, input) || reservedKeys.has(input.key)) {
    throw fastify.httpErrors.badRequest('Invalid custom field definition')
  }
  return fastify.prisma.$transaction(async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM institutions WHERE id = ${institution.id}::uuid FOR NO KEY UPDATE`,
    )
    const existing = await tx.institution_paper_field_definitions.findUnique({
      where: { institutionId_key: { institutionId: institution.id, key: input.key } },
    })
    if (
      !existing &&
      (await tx.institution_paper_field_definitions.count({
        where: { institutionId: institution.id },
      })) >= 100
    ) {
      throw fastify.httpErrors.badRequest('An institution can define up to 100 custom paper fields')
    }
    const options = input.options ?? existing?.options ?? []
    const used = await tx.$queryRaw<Array<{ used: boolean }>>(Prisma.sql`
      SELECT EXISTS (SELECT 1 FROM institution_paper_metadata
      WHERE "institutionId" = ${institution.id}::uuid AND custom_fields ? ${input.key}
      ) AS used
    `)
    if (
      existing &&
      used[0]?.used &&
      (existing.field_type !== input.field_type ||
        existing.options.some((option) => !options.includes(option)))
    ) {
      throw fastify.httpErrors.conflict(
        'A field in use cannot change type or remove choices. Archive it and create a new field instead',
      )
    }
    const data = {
      label: input.label.trim(),
      label_en:
        input.label_en === undefined
          ? (existing?.label_en ?? null)
          : (input.label_en?.trim() ?? null),
      field_type: input.field_type,
      is_required: input.is_required ?? existing?.is_required ?? false,
      min_value: input.min_value === undefined ? (existing?.min_value ?? null) : input.min_value,
      max_value: input.max_value === undefined ? (existing?.max_value ?? null) : input.max_value,
      max_length: input.max_length ?? existing?.max_length ?? 10000,
      min_date:
        input.min_date === undefined
          ? (existing?.min_date ?? null)
          : input.min_date
            ? new Date(`${input.min_date}T00:00:00Z`)
            : null,
      max_date:
        input.max_date === undefined
          ? (existing?.max_date ?? null)
          : input.max_date
            ? new Date(`${input.max_date}T00:00:00Z`)
            : null,
      options,
      visibility: input.visibility ?? existing?.visibility ?? 'admin',
      is_active: input.is_active ?? existing?.is_active ?? true,
      display_order: input.display_order ?? existing?.display_order ?? 0,
      updatedAt: new Date(),
    }
    if (!data.label) throw fastify.httpErrors.badRequest('Field label must not be blank')
    if (data.label_en === '')
      throw fastify.httpErrors.badRequest('Use null to clear the English label')
    if (
      ['single_select', 'multi_select'].includes(data.field_type)
        ? !options.length
        : options.length > 0
    )
      throw fastify.httpErrors.badRequest('Only select fields require choices')
    if (options.some((option) => !option.trim()))
      throw fastify.httpErrors.badRequest('Choices must not be blank')
    if ((data.min_value !== null || data.max_value !== null) && data.field_type !== 'number')
      throw fastify.httpErrors.badRequest('Numeric bounds only apply to number fields')
    if (data.min_value !== null && data.max_value !== null && data.min_value > data.max_value)
      throw fastify.httpErrors.badRequest('Minimum exceeds maximum')
    if ((data.min_date !== null || data.max_date !== null) && data.field_type !== 'date')
      throw fastify.httpErrors.badRequest('Date bounds only apply to date fields')
    if (
      [input.min_date, input.max_date].some((date) => date && !isIsoDate(date)) ||
      (data.min_date && data.max_date && data.min_date > data.max_date)
    )
      throw fastify.httpErrors.badRequest('Invalid date bounds')
    const invalid = await tx.$queryRaw<Array<{ invalid: boolean }>>(Prisma.sql`
      SELECT EXISTS (
        SELECT 1 FROM institution_paper_metadata
        WHERE "institutionId" = ${institution.id}::uuid
          AND (custom_fields ? ${input.key} OR ${data.is_active && data.is_required})
          AND NOT bibliography_custom_field_value_valid(custom_fields -> ${input.key},
            jsonb_populate_record(NULL::institution_paper_field_definitions, ${JSON.stringify({ key: input.key, ...data })}::jsonb))
      ) AS invalid
    `)
    if (invalid[0]?.invalid) {
      throw fastify.httpErrors.conflict(
        'Existing values do not satisfy the proposed field constraints',
      )
    }
    return tx.institution_paper_field_definitions.upsert({
      where: { institutionId_key: { institutionId: institution.id, key: input.key } },
      create: { institutionId: institution.id, key: input.key, ...data },
      update: data,
    })
  })
}
