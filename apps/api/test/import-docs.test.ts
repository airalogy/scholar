import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { Check } from 'typebox/value'
import { PreviewBody } from '../src/routes/v2/institutions/schema'
import { ScholarImportBodySchema } from '../src/routes/v1/institutions/schema'
import { normalizePaperMetadata } from '../src/bibliography/normalize'

for (const language of ['en', 'zh']) {
  test(`${language} import documentation examples match the actual JSON contracts`, () => {
    const text = readFileSync(
      new URL(`../../docs/${language}/integration/bulk-import.md`, import.meta.url),
      'utf8',
    )
    const examples = [...text.matchAll(/-d '(\{[\s\S]*?\})'/gu)].map(
      (match) => JSON.parse(match[1]) as Record<string, unknown>,
    )
    const papers = examples.find((example) => example.schema_version === 2)
    assert.ok(
      Check(PreviewBody, papers),
      'The paper preview example must conform to the API schema',
    )
    for (const row of papers.items) assert.ok(normalizePaperMetadata(row.paper).item)
    const scholars = examples.find(
      (example) => example.schema_version === undefined && Array.isArray(example.items),
    )
    assert.ok(
      Check(ScholarImportBodySchema, scholars),
      'The scholar example must conform to the API schema',
    )
    assert.equal(examples.length, 3)
  })
}
