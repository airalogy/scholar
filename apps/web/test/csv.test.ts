import { describe, expect, it } from 'vitest'
import { parseCsv, parseStrictCsvRecords } from '../src/utils/csv'

describe('CSV parsing', () => {
  it('handles BOM, quoted commas, escaped quotes, and multiline fields', () => {
    const rows = parseCsv('\uFEFFname,bio\r\n"Doe, Jane","Line 1\nLine ""2"""')

    expect(rows).toEqual([
      { rowNumber: 1, values: ['name', 'bio'] },
      { rowNumber: 2, values: ['Doe, Jane', 'Line 1\nLine "2"'] },
    ])
  })

  it('enforces the declared import header contract', () => {
    expect(parseStrictCsvRecords('external_id,name\nsch-1,Alice', ['external_id', 'name']))
      .toEqual([
        {
          rowNumber: 2,
          record: { external_id: 'sch-1', name: 'Alice' },
        },
      ])

    expect(() => parseStrictCsvRecords('name,external_id\nAlice,sch-1', [
      'external_id',
      'name',
    ])).toThrow(/headers must be exactly/u)
  })
})
