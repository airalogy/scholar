import { parseCsv, type ParsedCsvRow } from './csv'
import type { BibliographyField, BibliographyInput, BibliographyPaper, JsonValue } from '@/api/bibliography'

export const bibliographyCsvFields = {
  paper_id: 'text', title: 'text', doi: 'text', titles: 'json', identifiers: 'json',
  publish_year: 'number', publish_date: 'text', paper_type: 'number', language: 'number',
  document_type: 'text', publication_status: 'text', language_tags: 'json',
  abstract: 'text', journal_name: 'text', journal: 'json', citation_count: 'number',
  pages: 'text', link: 'text', keywords: 'json', authors: 'json', affiliations: 'json',
  funding: 'json', sources: 'json', institution_metadata: 'json', rankings: 'json', indicators: 'json',
} as const

export interface BibliographyColumnMapping {
  column: string
  target: string
  blank: 'skip' | 'clear'
  boolean_encoding: 'true_false' | 'zero_one'
}
export interface BibliographyCsv { headers: string[]; rows: ParsedCsvRow[] }
export const parseBibliographyCsv = (text: string): BibliographyCsv => {
  const rows = parseCsv(text)
  if (!rows.length) throw new Error('CSV is empty')
  const headers = rows[0].values
  if (headers.some(header => !header) || new Set(headers).size !== headers.length) throw new Error('CSV headers must be nonempty and unique')
  if (rows.length < 2 || rows.length > 501) throw new Error('Import between 1 and 500 rows at a time')
  for (const row of rows.slice(1)) if (row.values.length !== headers.length) throw new Error(`Row ${row.rowNumber}: unexpected column count`)
  return { headers, rows: rows.slice(1) }
}

export const defaultBibliographyMapping = (headers: string[]): BibliographyColumnMapping[] => headers.map(column => ({
  column, target: Object.prototype.hasOwnProperty.call(bibliographyCsvFields, column) ? column : '', blank: 'skip', boolean_encoding: 'true_false',
}))

const parseJsonValue = (text: string): JsonValue => JSON.parse(text, (_key: string, value: unknown): unknown => {
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('JSON numbers must be finite')
  return value
}) as JsonValue

const parseCell = (raw: string, kind: string, mapping: BibliographyColumnMapping): JsonValue => {
  if (!raw.trim()) return null
  if (kind === 'number') {
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/u.test(raw) || !Number.isFinite(Number(raw))) throw new Error('Expected a number')
    return Number(raw)
  }
  if (kind === 'boolean') {
    const yes = mapping.boolean_encoding === 'zero_one' ? '1' : 'true'
    const no = mapping.boolean_encoding === 'zero_one' ? '0' : 'false'
    if (raw === yes) return true
    if (raw === no) return false
    throw new Error(`Expected ${yes} or ${no}`)
  }
  return kind === 'json' || kind === 'multi_select' ? parseJsonValue(raw) : raw
}

export const mapBibliographyCsv = (
  csv: BibliographyCsv, mappings: BibliographyColumnMapping[], definitions: BibliographyField[], source: string,
): BibliographyInput => {
  const targets = mappings.filter(mapping => mapping.target).map(mapping => mapping.target)
  if (!targets.length || new Set(targets).size !== targets.length) throw new Error('Choose unique target fields for the columns to import')
  if (targets.includes('institution_metadata') && targets.some(target => target.startsWith('custom.'))) throw new Error('Do not map both institution_metadata and individual custom fields')
  for (const mapping of mappings) {
    if (!csv.headers.includes(mapping.column)) throw new Error('A mapped column is missing from the CSV')
    if (mapping.target && !Object.prototype.hasOwnProperty.call(bibliographyCsvFields, mapping.target) && !definitions.some(field => field.is_active && mapping.target === `custom.${field.key}`)) throw new Error(`Unknown target field: ${mapping.target}`)
    if (!['skip', 'clear'].includes(mapping.blank) || !['true_false', 'zero_one'].includes(mapping.boolean_encoding)) throw new Error('Invalid column mapping')
    if (mapping.target && mapping.blank === 'clear' && !mapping.target.startsWith('custom.')) throw new Error('Blank clearing is only available for nullable custom fields')
  }
  const items = csv.rows.map(row => {
    const paper: BibliographyPaper = {}
    const custom: Record<string, JsonValue> = {}
    for (const mapping of mappings) {
      if (!mapping.target) continue
      const raw = row.values[csv.headers.indexOf(mapping.column)]
      if (!raw.trim() && mapping.blank === 'skip') continue
      const definition = definitions.find(field => mapping.target === `custom.${field.key}`)
      const kind = definition?.field_type ?? bibliographyCsvFields[mapping.target as keyof typeof bibliographyCsvFields]
      try {
        const value = parseCell(raw, kind, mapping)
        if (definition) custom[definition.key] = value
        else paper[mapping.target] = value
      } catch (error) {
        throw new Error(`Row ${row.rowNumber}, ${mapping.column}: ${error instanceof Error ? error.message : 'Invalid value'}`)
      }
    }
    if (Object.keys(custom).length) paper.institution_metadata = { custom_fields: custom }
    return { source_row: row.rowNumber, paper }
  })
  return { schema_version: 2, source, items }
}

export const parseBibliographyJson = (text: string): BibliographyInput => {
  const value: unknown = parseJsonValue(text)
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a Scholar import JSON object')
  const input = value as BibliographyInput
  if (input.schema_version !== 2 || typeof input.source !== 'string' || !input.source.trim() || !Array.isArray(input.items) || !input.items.length || input.items.length > 500 || input.items.some(row => !row || typeof row.paper !== 'object' || !row.paper || Array.isArray(row.paper))) throw new Error('Expected schema_version 2, a source, and 1–500 paper records')
  return input
}
