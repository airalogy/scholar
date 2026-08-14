import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeDoi, requireNormalizedDoi } from '../src/utils/doi'

test('normalizeDoi canonicalizes common DOI representations', () => {
  assert.equal(normalizeDoi(' HTTPS://doi.org/10.1000/ABC.123 '), '10.1000/abc.123')
  assert.equal(normalizeDoi('http://dx.doi.org/10.1000/ABC.123'), '10.1000/abc.123')
  assert.equal(normalizeDoi('doi: 10.1000/ABC.123'), '10.1000/abc.123')
})

test('requireNormalizedDoi rejects an empty DOI representation', () => {
  assert.throws(() => requireNormalizedDoi('doi:   '), /must not be empty/u)
})
