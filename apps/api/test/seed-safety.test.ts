import assert from 'node:assert/strict'
import test from 'node:test'
import { assertDestructiveSeedAllowed } from '../src/utils/seed-safety'

test('destructive seed requires explicit opt-in', () => {
  assert.throws(() => assertDestructiveSeedAllowed(undefined), /ALLOW_DESTRUCTIVE_SEED=true/u)
  assert.throws(() => assertDestructiveSeedAllowed('false'), /ALLOW_DESTRUCTIVE_SEED=true/u)
  assert.doesNotThrow(() => assertDestructiveSeedAllowed('true'))
})
