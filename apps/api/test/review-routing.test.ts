import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Check } from 'typebox/value'
import { matchReviewRoutes, type RoutingContext } from '../src/review/routing'
import { DirectoryRowSchema } from '../src/directory/schema'
import { CorrectionSchema } from '../src/directory/corrections'

const context: RoutingContext = {
  verified: true,
  personIds: ['student'],
  nodeIds: ['college'],
  identities: [
    {
      personId: 'student',
      codes: ['doctoral_student', 'research_assistant'],
      revisionIds: ['revision'],
    },
  ],
  requestKind: 'submission',
  at: '2026-10-26T00:00:00Z',
}
const rule = {
  id: 'doctoral-route',
  key: 'doctoral',
  revision: 1,
  name: 'Doctoral route',
  priority: 100,
  identityCodes: ['doctoral_student'],
  nodeIds: ['college'],
  requestKinds: ['submission'],
}
test('routing uses verified participant identities and scope, not an uploader category', () => {
  assert.equal(matchReviewRoutes([rule], context).selected?.id, rule.id)
  assert.equal(matchReviewRoutes([rule], { ...context, verified: false }).selected, null)
  assert.ok(matchReviewRoutes([rule], { ...context, verified: false }).error)
  assert.ok(
    matchReviewRoutes([rule], {
      ...context,
      identities: [{ personId: 'student', codes: [], revisionIds: [] }],
    }).error,
  )
  assert.equal(
    matchReviewRoutes([rule], { ...context, nodeIds: ['another-college'] }).selected,
    null,
  )
})
test('equal highest priorities are a blocking conflict, while lower matches are explained', () => {
  assert.ok(matchReviewRoutes([rule, { ...rule, id: 'other', key: 'other' }], context).error)
  const result = matchReviewRoutes(
    [rule, { ...rule, id: 'other', key: 'other', priority: 99 }],
    context,
  )
  assert.equal(result.selected?.id, rule.id)
  assert.deepEqual(result.matched, ['doctoral-route', 'other'])
  assert.equal(
    matchReviewRoutes([rule], { ...context, requestKind: 'access', verified: false }).error,
    null,
  )
})
test('new personnel records cannot smuggle privileges or arbitrary labels', () => {
  const row = {
    kind: 'identity',
    externalId: 'doctoral-role',
    personExternalId: 'one',
    code: 'doctoral_student',
    status: 'active',
    startsAt: null,
    endsAt: null,
  }
  assert.equal(Check(DirectoryRowSchema, row), true)
  assert.equal(Check(DirectoryRowSchema, { ...row, can_review_content: true }), false)
  assert.equal(Check(DirectoryRowSchema, { ...row, code: 'automatically_admin' }), false)
  assert.equal(
    Check(CorrectionSchema, {
      personId: '00000000-0000-4000-8000-000000000001',
      field: 'userId',
      value: 'another-account',
      reason: 'bad',
      expiresAt: '2026-10-27T00:00:00Z',
    }),
    false,
  )
})
