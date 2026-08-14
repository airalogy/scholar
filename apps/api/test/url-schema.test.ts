import assert from 'node:assert/strict'
import test from 'node:test'
import { Check } from 'typebox/value'
import { UpdateInstitutionBodySchema } from '../src/routes/institutions/schema'
import { UpdateLabBodySchema } from '../src/routes/labs/schema'

test('institution and lab website writes accept only HTTP(S) URLs or a clear value', () => {
  for (const schema of [UpdateInstitutionBodySchema, UpdateLabBodySchema]) {
    assert.equal(Check(schema, { website: 'https://example.com/research' }), true)
    assert.equal(Check(schema, { website: 'http://localhost:5173' }), true)
    assert.equal(Check(schema, { website: '' }), true)
    assert.equal(Check(schema, { website: 'javascript:alert(1)' }), false)
    assert.equal(Check(schema, { website: '//evil.example/path' }), false)
  }
})
