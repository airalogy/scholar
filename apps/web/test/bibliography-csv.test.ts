import { describe, expect, it } from 'vitest'
import { parseBibliographyCsv, defaultBibliographyMapping, mapBibliographyCsv, parseBibliographyJson } from '@/utils/bibliography-csv'
import type { BibliographyField } from '@/api/bibliography'

const flag: BibliographyField = { key: 'flag', label: 'Flag', label_en: null, field_type: 'boolean', options: [], is_active: true, is_required: false, display_order: 0, visibility: 'admin' }

describe('generic bibliography CSV mapping', () => {
  it('rejects malformed quotes instead of silently changing the source values', () => {
    for (const raw of ['title\nwrong"quote"', 'title\n"closed"suffix', 'title\n"unclosed']) {
      expect(() => parseBibliographyCsv(raw)).toThrow(/quot/)
    }
    expect(parseBibliographyCsv('title\r\n"First\nSecond ""quoted"""').rows[0].values).toEqual(['First\nSecond "quoted"'])
  })
  it('never converts overflowing JSON numbers to null when re-encoding an import', () => {
    expect(() => parseBibliographyJson('{"schema_version":2,"source":"fixture","items":[{"paper":{"institution_metadata":{"custom_fields":{"value":1e999}}}}]}')).toThrow('finite')
    const csv = parseBibliographyCsv('title,institution_metadata\nA,"{""custom_fields"":{""value"":1e999}}"')
    expect(() => mapBibliographyCsv(csv, defaultBibliographyMapping(csv.headers), [], 'fixture')).toThrow('finite')
  })
  it('rejects a saved custom-field clearing policy reused for a standard field', () => {
    const csv = parseBibliographyCsv('title\nA')
    const mappings = defaultBibliographyMapping(csv.headers)
    mappings[0].blank = 'clear'
    expect(() => mapBibliographyCsv(csv, mappings, [], 'fixture')).toThrow('nullable custom fields')
  })
  it('does not infer meanings for arbitrary institution-specific headers', () => {
    expect(defaultBibliographyMapping(['title', 'Local field'])).toEqual([
      { column: 'title', target: 'title', blank: 'skip', boolean_encoding: 'true_false' },
      { column: 'Local field', target: '', blank: 'skip', boolean_encoding: 'true_false' },
    ])
  })
  it('maps numeric booleans only when explicitly configured and distinguishes null, false and omission', () => {
    const csv = parseBibliographyCsv('title,Flag\nA,0\nB,1\nC,\n')
    const mappings = defaultBibliographyMapping(csv.headers)
    mappings[1].target = 'custom.flag'
    expect(() => mapBibliographyCsv(csv, mappings, [flag], 'fixture')).toThrow('Expected true or false')
    mappings[1].boolean_encoding = 'zero_one'
    const input = mapBibliographyCsv(csv, mappings, [flag], 'fixture')
    expect(input.items.map(row => row.paper)).toEqual([
      { title: 'A', institution_metadata: { custom_fields: { flag: false } } },
      { title: 'B', institution_metadata: { custom_fields: { flag: true } } },
      { title: 'C' },
    ])
    mappings[1].blank = 'clear'
    expect(mapBibliographyCsv(csv, mappings, [flag], 'fixture').items[2].paper.institution_metadata).toEqual({ custom_fields: { flag: null } })
  })
  it('rejects duplicate targets, invalid choices, mismatched rows and ambiguous custom mappings', () => {
    expect(() => parseBibliographyCsv('a,a\n1,2')).toThrow('unique')
    expect(() => parseBibliographyCsv('a,b\n1')).toThrow('column count')
    const csv = parseBibliographyCsv('a,b\n1,2')
    const mappings = defaultBibliographyMapping(csv.headers)
    mappings[0].target = 'title'; mappings[1].target = 'title'
    expect(() => mapBibliographyCsv(csv, mappings, [], 'fixture')).toThrow('unique')
    mappings[0].target = 'institution_metadata'; mappings[1].target = 'custom.flag'
    expect(() => mapBibliographyCsv(csv, mappings, [flag], 'fixture')).toThrow('both')
    mappings[0].target = ''; mappings[1].target = 'constructor'
    expect(() => mapBibliographyCsv(csv, mappings, [], 'fixture')).toThrow('Unknown target')
  })
  it('preserves JSON authors and multilingual titles and reports malformed JSON per source row', () => {
    const csv = parseBibliographyCsv('title,authors,publish_year\nExample,"[{""name"":""A"",""order"":1}]",2026')
    const input = mapBibliographyCsv(csv, defaultBibliographyMapping(csv.headers), [], 'fixture')
    expect(input.items[0]).toEqual({ source_row: 2, paper: { title: 'Example', authors: [{ name: 'A', order: 1 }], publish_year: 2026 } })
    const invalid = parseBibliographyCsv('title,authors\nExample,no-json')
    expect(() => mapBibliographyCsv(invalid, defaultBibliographyMapping(invalid.headers), [], 'fixture')).toThrow('Row 2, authors')
    expect(() => parseBibliographyJson('{"schema_version":1}')).toThrow('schema_version 2')
  })
})
