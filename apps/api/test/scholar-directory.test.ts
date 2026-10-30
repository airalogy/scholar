import assert from 'node:assert/strict'
import { test } from 'node:test'
import Fastify, { type FastifyInstance } from 'fastify'
import sensible from '@fastify/sensible'
import jwtPlugin from '../src/plugins/global/jwt'
import directoryRoutes from '../src/routes/v1/scholars'
import {
  buildDirectoryUnits,
  type DirectoryNode,
  type DirectoryEdge,
} from '../src/utils/scholar-directory-units'
import type { DeploymentRuntimeConfig } from '../src/utils/deployment'
import type { PrismaClient } from '../prisma/generated/client'

const node = (
  id: string,
  name = id,
  kind = 'unit',
  source: string | null = null,
): DirectoryNode => ({ id, name, node_type: kind, directorySourceId: source })
const edge = (from: string, to: string, primary = false): DirectoryEdge => ({
  fromNodeId: from,
  toNodeId: to,
  is_primary: primary,
})

test('directory projects legacy and synced hierarchies without modifying their direction', () => {
  const nodes = [
    node('c', '示例学院', 'school'),
    node('d', '示例系', 'department'),
    node('s', 'Another college', 'faculty', 'source'),
    node('t', 'Another department', 'department', 'source'),
  ]
  const edges = [edge('d', 'c'), edge('s', 't')]
  const before = JSON.stringify({ nodes, edges })
  const units = buildDirectoryUnits(nodes, edges)
  assert.deepEqual(units[1].ancestors, ['org:d', 'org:c'])
  assert.equal(units[1].parent_id, 'org:c')
  assert.deepEqual(units[3].ancestors, ['org:t', 'org:s'])
  assert.equal(units[0].kind, 'college')
  assert.equal(units[3].kind, 'department')
  assert.equal(JSON.stringify({ nodes, edges }), before)
})

test('directory leaves ambiguous parents and cross-source edges flat, but accepts a single primary parent', () => {
  const nodes = ['a', 'b', 'c', 'd'].map((id) => node(id))
  nodes.push(node('source', 'Source', 'school', 'source'))
  const units = buildDirectoryUnits(nodes, [
    edge('c', 'a'),
    edge('c', 'b'),
    edge('d', 'a', true),
    edge('d', 'b'),
    edge('a', 'source'),
  ])
  assert.equal(units[0].parent_id, null)
  assert.equal(units[2].parent_id, null)
  assert.equal(units[3].parent_id, 'org:a')
})

test('directory flattens cycles, ignores broken/self edges and preserves descendants', () => {
  const units = buildDirectoryUnits(
    ['a', 'b', 'c'].map((id) => node(id)),
    [edge('a', 'b'), edge('b', 'a'), edge('c', 'a'), edge('c', 'c'), edge('missing', 'a')],
  )
  assert.equal(units[0].parent_id, null)
  assert.equal(units[1].parent_id, null)
  assert.deepEqual(units[2].ancestors, ['org:c', 'org:a'])
})

test('duplicate or empty names are not auto-matched; node types are not inferred from names', () => {
  const units = buildDirectoryUnits(
    [
      node('a', ' Same '),
      node('b', 'Same'),
      node('c', ' '),
      node('d', 'Looks like a College', 'custom'),
    ],
    [],
  )
  assert.deepEqual(
    units.map((unit) => unit.matchable),
    [false, false, false, true],
  )
  assert.equal(units[3].kind, 'unit')
})

const appFixture = async (
  contentAccess: 'public' | 'authenticated' = 'public',
  institutionExists = true,
): Promise<{ app: FastifyInstance; reads: string[] }> => {
  const reads: string[] = []
  const app = Fastify()
  await app.register(sensible)
  app.decorate('config', { JWT_SECRET: 'fictional-directory-test-secret-32-characters' } as never)
  app.decorate('deployment', {
    contentAccess,
    institution: { slug: 'example-university' },
  } as DeploymentRuntimeConfig)
  app.decorate('prisma', {
    institutions: {
      findUnique: async (): Promise<{ id: string } | null> => {
        reads.push('scope')
        return institutionExists ? { id: '00000000-0000-4000-8000-000000000001' } : null
      },
    },
    institution_org_nodes: {
      findMany: async (): Promise<never[]> => {
        reads.push('nodes')
        return []
      },
    },
    institution_org_edges: {
      findMany: async (): Promise<never[]> => {
        reads.push('edges')
        return []
      },
    },
    $queryRaw: async (sql: unknown): Promise<unknown[]> => {
      reads.push('sql')
      if (Array.isArray(sql)) return [] // no ICU: explicit unicode fallback
      return [
        {
          data: {
            items: [],
            total: 0,
            page: 1,
            limit: 24,
            nameOrder: 'unicode',
            facets: { units: [], subjects: [], letters: [] },
            internalId: 'MUST-NOT-SERIALIZE',
          },
        },
      ]
    },
  } as unknown as PrismaClient)
  await app.register(jwtPlugin)
  await app.register(directoryRoutes, { prefix: '/v1/scholars' })
  await app.ready()
  return { app, reads }
}

test('directory route returns the public envelope and strips undeclared fields', async (t) => {
  const { app, reads } = await appFixture()
  t.after(() => app.close())
  const response = await app.inject('/v1/scholars/directory')
  assert.equal(response.statusCode, 200, response.body)
  assert.equal(response.json().code, 0)
  assert.equal(response.json().data.nameOrder, 'unicode')
  assert.equal(response.body.includes('MUST-NOT-SERIALIZE'), false)
  assert.equal(reads.filter((read) => read === 'sql').length, 2)
})

test('directory rejects other institutions before reading any data and reports missing configuration data', async (t) => {
  const { app, reads } = await appFixture()
  t.after(() => app.close())
  assert.equal(
    (await app.inject('/v1/scholars/directory?institution_slug=other-university')).statusCode,
    403,
  )
  assert.deepEqual(reads, [])
  const missing = await appFixture('public', false)
  t.after(() => missing.app.close())
  assert.equal((await missing.app.inject('/v1/scholars/directory')).statusCode, 404)
})

test('directory validates page, limit, initial, sort, query length and subject identifiers', async (t) => {
  const { app, reads } = await appFixture()
  t.after(() => app.close())
  for (const query of [
    'page=0',
    'page=1.5',
    'page=100001',
    'limit=61',
    'limit=-1',
    'letter=AA',
    'sort=random',
    'subject_id=invalid',
    `q=${'a'.repeat(201)}`,
    `unit=${'a'.repeat(513)}`,
  ]) {
    assert.equal((await app.inject(`/v1/scholars/directory?${query}`)).statusCode, 400, query)
  }
  assert.deepEqual(reads, [])
})

test('directory retains authenticated-content gate and rejects integration and file tokens', async (t) => {
  const { app, reads } = await appFixture('authenticated')
  t.after(() => app.close())
  assert.equal((await app.inject('/v1/scholars/directory')).statusCode, 401)
  for (const token_type of ['integration', 'file_access'] as const) {
    const response = await app.inject({
      url: '/v1/scholars/directory',
      headers: { authorization: `Bearer ${app.jwt.sign({ userId: 'example-user', token_type })}` },
    })
    assert.equal(response.statusCode, token_type === 'integration' ? 403 : 401)
  }
  assert.deepEqual(reads, [])
})
