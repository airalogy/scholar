import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseRecoveryInput } from '../src/administrators/recovery-input'

const fields = [
  'example',
  'create',
  '值班管理员',
  '紧急恢复',
  'RECOVER example',
  'Recovery',
  'recovery@example.invalid',
  'recovery',
  'password with\nline break',
  '',
  '',
]
test('host recovery uses a bounded, deployment-bound NUL protocol without losing Unicode or password delimiters', () => {
  const input = parseRecoveryInput(fields.join('\0'), 'example')
  assert.equal(input.operator, '值班管理员')
  assert.equal(input.reason, '紧急恢复')
  assert.equal(input.password, fields[8])
  assert.throws(() => parseRecoveryInput(fields.join('\0'), 'another'), /does not match/)
  assert.throws(() => parseRecoveryInput(fields.join('\0'), undefined), /does not match/)
  assert.throws(
    () => parseRecoveryInput(fields.slice(0, -1).join('\0'), 'example'),
    /does not match/,
  )
  assert.throws(() => parseRecoveryInput(`${fields.join('\0')}extra`, 'example'), /does not match/)
  assert.throws(
    () =>
      parseRecoveryInput(
        fields.map((value, index) => (index === 1 ? 'reset-password' : value)).join('\0'),
        'example',
      ),
    /does not match/,
  )
  assert.throws(() => parseRecoveryInput('大'.repeat(6000), 'example'), /too large/)
})
