import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import Fastify, { type FastifyInstance } from 'fastify'
import sensible from '@fastify/sensible'
import { Check } from 'typebox/value'
import { DirectoryRowSchema, type DirectoryRow } from '../src/directory/schema'
import { directoryRoutes } from '../src/routes/v1/institutions/routes.directory'
import { reviewGovernanceRoutes } from '../src/routes/v1/institutions/routes.review-governance'
import intakeRoutes from '../src/routes/v1/papers'
import { ReviewRoutesResponseSchema } from '../src/review/routing-response'
import {
  IntegrationTokenBodySchema,
  IntegrationTokenResponseSchema,
} from '../src/routes/auth/schema'

const id = '00000000-0000-4000-8000-000000000001'
const labId = '00000000-0000-4000-8000-000000000002'
const camelCase = /^[a-z][a-z0-9]*(?:[A-Z][a-z0-9]+)*$/u
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

// Only declared property names are governed: enum values, headers and map keys are not.
const checkSchemaNames = (schema: unknown, path: string): number => {
  if (Array.isArray(schema))
    return schema.reduce((count: number, item: unknown) => count + checkSchemaNames(item, path), 0)
  if (!object(schema)) return 0
  let count = 0
  if (object(schema.properties)) {
    for (const name of Object.keys(schema.properties)) {
      assert.match(name, camelCase, `${path}.${name}`)
      count++
    }
  }
  for (const [key, value] of Object.entries(schema))
    count += checkSchemaNames(value, `${path}.${key}`)
  return count
}
const checkPayloadNames = (value: unknown): void => {
  if (Array.isArray(value)) {
    for (const item of value) checkPayloadNames(item)
  } else if (object(value)) {
    for (const [key, item] of Object.entries(value)) {
      assert.match(key, camelCase)
      checkPayloadNames(item)
    }
  }
}

test('directory and new governance routes declare camelCase business fields', async (t) => {
  const app = Fastify()
  t.after(async () => app.close())
  let count = 0
  const urls = new Set<string>()
  app.addHook('onRoute', (route) => {
    urls.add(route.url)
    for (const part of ['body', 'querystring', 'params', 'response'] as const)
      count += checkSchemaNames(route.schema?.[part], `${route.url}/${part}`)
  })
  await app.register(directoryRoutes, { prefix: '/v1/institutions' })
  await app.register(reviewGovernanceRoutes, { prefix: '/v1/institutions' })
  await app.register(intakeRoutes, { prefix: '/v1/papers' })
  await app.ready()
  assert.ok(count > 100, 'The guard must inspect actual registered schemas')
  assert.ok(urls.has('/v1/papers/submission-check'))
  assert.ok(urls.has('/v1/institutions/:slug/review-governance/routes'))
})

test('directory records reject snake_case aliases without changing enum values', () => {
  const fixture = JSON.parse(
    readFileSync(
      new URL('../../docs/public/examples/personnel-sync-v2.json', import.meta.url),
      'utf8',
    ),
  ) as { rows: DirectoryRow[] }
  for (const row of fixture.rows) {
    assert.equal(Check(DirectoryRowSchema, row), true)
    checkPayloadNames(row)
    for (const [key, value] of Object.entries(row)) {
      const snake = key.replace(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`)
      if (key === snake) continue
      const renamed = { ...row } as Record<string, unknown>
      delete renamed[key]
      renamed[snake] = value
      assert.equal(Check(DirectoryRowSchema, renamed), false, `${row.kind}/${key}`)
      assert.equal(Check(DirectoryRowSchema, { ...row, [snake]: value }), false)
    }
  }
  assert.ok(fixture.rows.some((row) => row.kind === 'identity' && row.code === 'doctoral_student'))
})

const mockAccess = async (
  app: FastifyInstance,
  extra: Record<string, unknown> = {},
): Promise<void> => {
  await app.register(sensible)
  app.decorate('deployment', {
    institution: { slug: 'example' },
    features: { paperUpload: true },
  } as never)
  app.decorate('prisma', {
    institutions: { findUnique: async () => ({ id, slug: 'example', name: 'Example' }) },
    users: { findUnique: async () => ({ id, platform_role: 'platform_admin' }) },
    institution_memberships: { findUnique: async () => null },
    ...extra,
  } as never)
  app.addHook('onRequest', async (request) => {
    request.user = { userId: id } as typeof request.user
  })
}

test('upload preflight accepts camelCase scope and rejects alternate or mixed spellings', async (t) => {
  const app = Fastify()
  t.after(async () => app.close())
  let reads = 0
  await mockAccess(app, {
    labs: { findUnique: async () => ({ id: labId, institutionId: id }) },
    paper_claims: {
      findFirst: async () => {
        reads++
        return null
      },
    },
  })
  await app.register(intakeRoutes, { prefix: '/v1/papers' })
  const send = async (payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: '/v1/papers/submission-check', payload })
  const accepted = await send({ doi: '10.5555/example', institutionId: id, labId })
  assert.equal(accepted.statusCode, 200, accepted.body)
  assert.deepEqual(accepted.json(), { code: 0, data: { action: 'new', paperId: null } })
  for (const fields of [
    { institution_id: id },
    { institutionId: id, lab_id: labId },
    { institutionId: id, institution_id: labId },
  ])
    assert.equal((await send({ doi: '10.5555/example', ...fields })).statusCode, 400)
  assert.equal(reads, 1, 'Invalid spelling must fail before querying paper claims')
})

test('route responses explicitly map database names and preserve stored history and enum values', async (t) => {
  const app = Fastify()
  t.after(async () => app.close())
  const date = new Date('2026-10-26T00:00:00Z')
  const config = {
    name: 'Final review',
    groups: [{ kind: 'role', role: 'library_final' }],
    deadlineHours: 24,
    ccPersonIds: [],
  }
  const stored = {
    id,
    institutionId: id,
    key: 'doctoral_rule',
    revision: 1,
    name: 'Doctoral',
    contentType: 'degree_thesis',
    priority: 10,
    identityCodes: ['doctoral_student'],
    nodeIds: [],
    requestKinds: ['submission'],
    enabled: true,
    workflowId: id,
    createdBy: id,
    notes: 'Verified',
    createdAt: date,
    supersededAt: null,
    workflow: {
      id,
      name: 'Doctoral',
      is_active: true,
      steps: [
        {
          id,
          name: 'Final review',
          step_order: 1,
          resolver_type: 'governance',
          resolver_config: config,
        },
      ],
      metadata: { legacy_key: 'Not part of the public contract' },
    },
  }
  const before = structuredClone(stored)
  await mockAccess(app, { institution_review_routes: { findMany: async () => [stored] } })
  await app.register(reviewGovernanceRoutes, { prefix: '/v1/institutions' })
  const response = await app.inject('/v1/institutions/example/review-governance/routes')
  assert.equal(response.statusCode, 200, response.body)
  const result = response.json()
  assert.equal(Check(ReviewRoutesResponseSchema, result), true)
  checkPayloadNames(result)
  assert.equal(result.data.items[0].workflow.isActive, true)
  assert.deepEqual(result.data.items[0].workflow.steps[0], {
    id,
    name: 'Final review',
    stepOrder: 1,
    resolverType: 'governance',
    resolverConfig: config,
  })
  assert.deepEqual(result.data.items[0].identityCodes, ['doctoral_student'])
  assert.equal(result.data.items[0].contentType, 'degree_thesis')
  assert.equal(result.data.items[0].key, 'doctoral_rule')
  assert.deepEqual(stored, before)
})

test('existing credential exchange retains its snake_case contract', () => {
  assert.deepEqual(Object.keys(IntegrationTokenBodySchema.properties), [
    'client_id',
    'client_secret',
  ])
  assert.deepEqual(Object.keys(IntegrationTokenResponseSchema.properties), [
    'access_token',
    'token_type',
    'expires_in',
    'scope',
  ])
})
