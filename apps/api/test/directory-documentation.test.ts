import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { Check } from 'typebox/value'
import {
  DirectoryRowSchema,
  DirectoryRunSchema,
  DirectoryPageSchema,
  DirectoryApplySchema,
  type DirectoryRow,
} from '../src/directory/schema'

const document = (path: string): string =>
  readFileSync(new URL(`../../docs/${path}`, import.meta.url), 'utf8')

interface Manifest {
  schemaVersion: number
  sequence: number
  mode: string
  rows: DirectoryRow[]
}
const manifest = JSON.parse(document('public/examples/personnel-sync-v2.json')) as Manifest

test('downloadable personnel fixture satisfies the real schemas and contains complete same-source references', () => {
  assert.equal(Check(DirectoryPageSchema, { rows: manifest.rows }), true)
  assert.equal(
    Check(DirectoryRunSchema, {
      schemaVersion: manifest.schemaVersion,
      sequence: manifest.sequence,
      mode: manifest.mode,
      expectedPages: 1,
      expectedRows: manifest.rows.length,
    }),
    true,
  )
  const keys = new Set(manifest.rows.map((row) => `${row.kind}:${row.externalId}`))
  assert.equal(keys.size, manifest.rows.length)
  assert.equal(new Set(manifest.rows.map((row) => row.kind)).size, 6)
  for (const row of manifest.rows) {
    const references = [
      ['personExternalId', 'person'],
      ['relatedPersonExternalId', 'person'],
      ['unitExternalId', 'unit'],
      ['parentExternalId', 'unit'],
      ['positionExternalId', 'position'],
    ] as const
    for (const [field, kind] of references) {
      if (field in row) {
        const value = (row as unknown as Record<string, unknown>)[field]
        if (value !== null) assert.ok(keys.has(`${kind}:${String(value)}`), `Missing ${field}`)
      }
    }
    if (row.kind === 'relationship')
      assert.notEqual(row.personExternalId, row.relatedPersonExternalId)
    if ('startsAt' in row && row.startsAt && row.endsAt)
      assert.ok(new Date(row.endsAt) > new Date(row.startsAt))
  }
})

test('Chinese and English request examples validate against runtime schemas and share the same payloads', () => {
  const examples: Record<string, unknown> = {}
  for (const locale of ['zh', 'en']) {
    const source = document(`${locale}/integration/personnel-sync.md`)
    for (const [label, schema] of [
      ['directory-run', DirectoryRunSchema],
      ['directory-apply', DirectoryApplySchema],
    ] as const) {
      const match = new RegExp(
        `<!-- contract: ${label} -->\\s*\x60\x60\x60json\\n([\\s\\S]*?)\\n\x60\x60\x60`,
        'u',
      ).exec(source)
      assert.ok(match, `${locale} needs a ${label} example`)
      const value = JSON.parse(match[1]!) as Record<string, unknown>
      assert.equal(Check(schema, value), true, `${locale}/${label}`)
      if (locale === 'en') assert.deepEqual(value, examples[label])
      examples[label] = value
      if (label === 'directory-run') assert.equal(value.expectedRows, manifest.rows.length)
    }
    // Every fenced JSON block is parseable, including response excerpts.
    for (const match of source.matchAll(/```json\n([\s\S]*?)\n```/gu)) JSON.parse(match[1]!)
  }
})

test('both field dictionaries enumerate every schema property, required flag and string enum', () => {
  for (const locale of ['zh', 'en']) {
    const source = document(`${locale}/integration/personnel-fields.md`)
    for (const schema of DirectoryRowSchema.anyOf) {
      const kind = schema.properties.kind.const
      const section = source
        .split('\n### ')
        .find((part) => part.startsWith(`${kind}\n`))
        ?.split('\n## ')[0]
      assert.ok(section, `${locale}/${kind}`)
      const required = new Set<string>(schema.required)
      const documented = new Map(
        [...section.matchAll(/^\| `([^`]+)` \| (是|否|Yes|No) \|/gmu)].map((match) => [
          match[1],
          ['是', 'Yes'].includes(match[2]!),
        ]),
      )
      assert.deepEqual([...documented.keys()].sort(), Object.keys(schema.properties).sort())
      for (const [field, property] of Object.entries(schema.properties)) {
        assert.equal(
          documented.get(field),
          required.has(field),
          `${locale}/${kind}/${field} required`,
        )
        const nodes = 'anyOf' in property ? property.anyOf : [property]
        for (const node of nodes) {
          if ('const' in node && typeof node.const === 'string')
            assert.ok(
              section.includes(`\x60${node.const}\x60`),
              `${locale}/${kind}/${field} enum ${node.const}`,
            )
        }
      }
    }
  }
})
