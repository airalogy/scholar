import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  fingerprint,
  isIsoDate,
  normalizeIdentifier,
  normalizeIssn,
  normalizeLanguageTag,
  normalizePaperMetadata,
} from '../src/bibliography/normalize'
import {
  mergeCustomFieldPatch,
  validateCustomFields,
  visibleCustomFields,
  type CustomFieldDefinition,
} from '../src/bibliography/custom-fields'
import { normalizeCustomFieldCell } from '../src/bibliography/custom-field-import'
import { Check } from 'typebox/value'
import { CustomFieldValueSchema, PaperMetadataInputSchema } from '../src/bibliography/schema'

test('bibliography normalizes external identifiers and never invents a DOI', () => {
  assert.deepEqual(
    normalizeIdentifier({ scheme: 'DOI', value: 'https://doi.org/10.1234/EXAMPLE' }),
    { scheme: 'doi', value: '10.1234/example' },
  )
  const result = normalizePaperMetadata({
    title: 'An example without a DOI',
    identifiers: [{ scheme: 'scopus', value: '2-s2.0-123456789' }],
  })
  assert.equal(result.issues.length, 0)
  assert.equal(result.item?.doi, undefined)
  assert.equal(result.item?.identifiers[0].scheme, 'scopus')
  assert.equal(
    normalizePaperMetadata({ title: 'No identifiers' }).issues[0].code,
    'missing_identifier',
  )
  assert.throws(() => normalizeIdentifier({ scheme: 'doi', value: 'not-a-doi' }))
})

test('titles support multiple languages independently of the full-text language', () => {
  const result = normalizePaperMetadata({
    doi: '10.1234/example',
    language_tags: ['zh'],
    titles: [
      { language: 'zh', title: '示例论文', is_primary: true },
      { language: 'en', title: 'An example', kind: 'translated' },
    ],
  })
  assert.equal(result.item?.title, '示例论文')
  assert.deepEqual(result.item?.language_tags, ['zh'])
  assert.equal(result.item?.titles?.length, 2)
  assert.equal(normalizeLanguageTag('zh-hans'), 'zh-Hans')
  assert.throws(() => normalizeLanguageTag('zh_CN'))
  assert.equal(
    normalizePaperMetadata({
      doi: '10.1234/example',
      titles: [
        { language: 'en', title: 'A', is_primary: true },
        { language: 'zh', title: 'B', is_primary: true },
      ],
    }).item,
    null,
  )
})

test('metadata checks calendar dates, author positions, identity disagreement and safe URLs', () => {
  assert.equal(isIsoDate('2026-02-30'), false)
  assert.equal(isIsoDate('2024-02-29'), true)
  const base = { title: 'Example', doi: '10.1234/example' }
  assert.equal(
    normalizePaperMetadata({ ...base, publish_year: 2026, publish_date: '2025-12-01' }).item,
    null,
  )
  assert.equal(
    normalizePaperMetadata({
      ...base,
      authors: [
        { name: 'A', order: 1 },
        { name: 'B', order: 1 },
      ],
    }).item,
    null,
  )
  assert.equal(
    normalizePaperMetadata({ ...base, identifiers: [{ scheme: 'doi', value: '10.1234/other' }] })
      .item,
    null,
  )
  assert.equal(normalizePaperMetadata({ ...base, link: 'javascript:alert(1)' }).item, null)
  assert.equal(
    normalizePaperMetadata({ ...base, publish_date: '2027-01-01' }).item?.publish_year,
    2027,
  )
})

test('ISSN validates check digits and ESI cannot masquerade as a journal ranking', () => {
  assert.equal(normalizeIssn('1476 4687'), '1476-4687')
  assert.throws(() => normalizeIssn('1476-4688'))
  const edition = { system: 'esi', version: 'example-batch', source: 'fixture' }
  assert.equal(
    normalizePaperMetadata({
      title: 'Example',
      doi: '10.1234/example',
      rankings: [
        { edition, category_level: 'category', category: 'Example', metric: 'jif', quartile: 1 },
      ],
    }).item,
    null,
  )
})

const field = (
  key: string,
  field_type: string,
  visibility = 'admin',
  options: string[] = [],
): CustomFieldDefinition => ({
  key,
  label: key,
  label_en: null,
  field_type,
  visibility,
  options,
  is_active: true,
  display_order: 0,
})

test('institution custom fields support zero, one and multiple typed definitions', () => {
  assert.deepEqual(validateCustomFields({}, []), { values: {}, issues: [] })
  const definitions = [
    field('flag', 'boolean'),
    field('amount', 'number'),
    field('note', 'text'),
    field('date', 'date'),
    field('category', 'single_select', 'admin', ['a', 'b']),
    field('tags', 'multi_select', 'admin', ['a', 'b']),
  ]
  const values = {
    flag: false,
    amount: 0,
    note: null,
    date: '2026-09-11',
    category: 'a',
    tags: ['a', 'a', 'b'],
  }
  const result = validateCustomFields(values, definitions)
  assert.equal(result.issues.length, 0)
  assert.deepEqual(result.values, { ...values, tags: ['a', 'b'] })
  assert.deepEqual(validateCustomFields({ flag: false }, definitions).values, { flag: false })
})

test('unknown, malformed and inactive custom fields do not become paper-wide failures', () => {
  const result = validateCustomFields(
    { flag: '0', amount: Infinity, date: '2026-02-30', category: 'c', unknown: true },
    [
      field('flag', 'boolean'),
      field('amount', 'number'),
      field('date', 'date'),
      field('category', 'single_select', 'admin', ['a']),
    ],
  )
  assert.deepEqual(result.values, {})
  assert.equal(result.issues.length, 5)
  assert.ok(result.issues.every((issue) => issue.severity === 'warning'))
  assert.equal(
    validateCustomFields({ flag: true }, [{ ...field('flag', 'boolean'), is_active: false }]).issues
      .length,
    1,
  )
  assert.deepEqual(validateCustomFields(JSON.parse('{"__proto__":true}'), []).values, {})
})

test('custom field visibility is enforced on values, not just UI controls', () => {
  const definitions = [
    field('private_note', 'text'),
    field('internal', 'boolean', 'institution'),
    field('public_label', 'text', 'public'),
  ]
  const values = { private_note: 'Secret', internal: false, public_label: 'Visible' }
  assert.deepEqual(visibleCustomFields(values, definitions, 'public'), { public_label: 'Visible' })
  assert.deepEqual(visibleCustomFields(values, definitions, 'institution'), {
    internal: false,
    public_label: 'Visible',
  })
  assert.deepEqual(visibleCustomFields(values, definitions, 'admin'), values)
})

test('fingerprints do not depend on JSON object property order', () => {
  assert.equal(fingerprint({ b: 2, a: { d: 4, c: 3 } }), fingerprint({ a: { c: 3, d: 4 }, b: 2 }))
  assert.notEqual(fingerprint({ a: false }), fingerprint({}))
  assert.notEqual(fingerprint({ a: null }), fingerprint({}))
})

test('boolean fields distinguish false, null and omission without coercing other JSON types', () => {
  const definitions = [field('flag', 'boolean')]
  for (const value of [true, false, null]) {
    assert.equal(Check(CustomFieldValueSchema, value), true)
    assert.deepEqual(validateCustomFields({ flag: value }, definitions), {
      values: { flag: value },
      issues: [],
    })
  }
  for (const value of [0, 1, '0', '1', 'true', 'false', '', 'null', [], {}]) {
    assert.equal(
      validateCustomFields({ flag: value }, definitions).issues[0]?.code,
      'invalid_custom_field',
    )
  }
  assert.deepEqual(validateCustomFields({}, definitions), { values: {}, issues: [] })
  assert.equal(
    Check(PaperMetadataInputSchema, {
      title: 'Fixture',
      doi: '10.1234/example',
      institution_metadata: { custom_fields: { flag: null } },
    }),
    true,
  )
})

test('field patches preserve omitted and invalid optional values and clear only explicit null', () => {
  const definitions = [field('flag', 'boolean'), field('note', 'text')]
  assert.deepEqual(mergeCustomFieldPatch({ flag: true, note: 'Keep' }, {}, definitions).values, {
    flag: true,
    note: 'Keep',
  })
  assert.deepEqual(
    mergeCustomFieldPatch({ flag: true, note: 'Keep' }, { flag: null }, definitions).values,
    { flag: null, note: 'Keep' },
  )
  assert.deepEqual(mergeCustomFieldPatch({ flag: true }, { flag: false }, definitions).values, {
    flag: false,
  })
  assert.deepEqual(mergeCustomFieldPatch({ flag: true }, { flag: 0 }, definitions).values, {
    flag: true,
  })
  assert.equal(validateCustomFields({ note: '' }, definitions).issues.length, 1)
  assert.equal(validateCustomFields({ note: '  \n\t' }, definitions).issues.length, 1)
})

test('required values are checked against the resulting record, not only the incoming patch', () => {
  const definitions = [{ ...field('flag', 'boolean'), is_required: true }]
  assert.equal(mergeCustomFieldPatch({ flag: false }, {}, definitions).issues.length, 0)
  assert.equal(mergeCustomFieldPatch({}, {}, definitions).issues[0]?.severity, 'error')
  assert.equal(
    mergeCustomFieldPatch({ flag: false }, { flag: null }, definitions).issues[0]?.severity,
    'error',
  )
  assert.equal(
    mergeCustomFieldPatch({ flag: false }, { flag: 0 }, definitions).issues[0]?.severity,
    'error',
  )
  assert.equal(validateCustomFields({ flag: false }, definitions).issues.length, 0)
})

test('individual numeric, date, length and choice constraints are enforced without replacing null', () => {
  const definitions = [
    { ...field('count', 'number'), min_value: 0, max_value: 10 },
    { ...field('date', 'date'), min_date: '2026-01-01', max_date: new Date('2026-12-31') },
    { ...field('note', 'text'), max_length: 2 },
    field('choices', 'multi_select', 'admin', ['a']),
  ]
  assert.equal(
    validateCustomFields({ count: 0, date: '2026-09-11', note: '🧪中', choices: [] }, definitions)
      .issues.length,
    0,
  )
  assert.equal(
    validateCustomFields(
      { count: 11, date: '2027-01-01', note: 'abc', choices: ['b'] },
      definitions,
    ).issues.length,
    4,
  )
  assert.deepEqual(
    validateCustomFields({ count: null, date: null, note: null, choices: null }, definitions)
      .values,
    { count: null, date: null, note: null, choices: null },
  )
})

test('source cell conversion requires explicit boolean mappings and explicit blank clearing', () => {
  const flag = field('flag', 'boolean')
  const mapping = {
    blank: 'skip' as const,
    boolean_values: { true: ['1', '是'], false: ['0', '否'] },
  }
  assert.deepEqual(normalizeCustomFieldCell('0', flag, mapping).values, { flag: false })
  assert.deepEqual(normalizeCustomFieldCell('1', flag, mapping).values, { flag: true })
  assert.deepEqual(normalizeCustomFieldCell(' \n ', flag, mapping).values, {})
  assert.deepEqual(normalizeCustomFieldCell(null, flag, { ...mapping, blank: 'clear' }).values, {
    flag: null,
  })
  assert.equal(normalizeCustomFieldCell('0', flag, { blank: 'skip' }).issues.length, 1)
  assert.equal(normalizeCustomFieldCell('unknown', flag, mapping).issues.length, 1)
  assert.throws(() =>
    normalizeCustomFieldCell('1', flag, {
      blank: 'skip',
      boolean_values: { true: ['1'], false: ['1'] },
    }),
  )
  assert.equal(
    normalizeCustomFieldCell('', { ...flag, is_required: true }, { blank: 'clear' }).issues[0]
      ?.severity,
    'error',
  )
  assert.deepEqual(
    normalizeCustomFieldCell('0', field('count', 'number'), { blank: 'skip' }).values,
    { count: 0 },
  )
  assert.deepEqual(
    normalizeCustomFieldCell('null', field('note', 'text'), { blank: 'skip' }).values,
    { note: 'null' },
  )
})
