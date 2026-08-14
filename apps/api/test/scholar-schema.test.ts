import assert from 'node:assert/strict'
import test from 'node:test'
import { Check } from 'typebox/value'
import { CreateScholarBodySchema } from '../src/routes/scholars/schema'

test('scholar writes accept structured data and stable subject codes', () => {
  assert.equal(
    Check(CreateScholarBodySchema, {
      name: 'Ada Scholar',
      subject_codes: ['life-sciences'],
      research_directions: [{ name: 'Genomics', description: 'Single-cell analysis' }],
      education: [{ school: 'Example University', degree: 'PhD', period: '2020-2025' }],
      achievements: [
        {
          phase: 'current',
          label: 'Selected work',
          years: [{ year: '2026', items: [{ title: 'Study', description: 'Result' }] }],
        },
      ],
    }),
    true,
  )
})

test('scholar writes reject legacy and unstructured values', () => {
  assert.equal(
    Check(CreateScholarBodySchema, {
      name: 'Legacy Scholar',
      research_directions: ['Genomics'],
      education: [{ school: 'Example University', year: 2025 }],
      achievements: ['Selected work'],
      subjects: ['Life Sciences'],
    }),
    false,
  )
  assert.equal(Check(CreateScholarBodySchema, { name: 'Invalid', education: [42] }), false)
  assert.equal(Check(CreateScholarBodySchema, { name: 'Invalid', education: [{}] }), false)
})
