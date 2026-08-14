import assert from 'node:assert/strict'
import test from 'node:test'
import Fastify, { type FastifyInstance } from 'fastify'
import sensible from '@fastify/sensible'
import jwtPlugin from '../src/plugins/global/jwt'
import paperRoutes from '../src/routes/papers'
import degreeThesisRoutes from '../src/routes/v1/theses'

const JWT_SECRET = 'test-jwt-secret-that-is-longer-than-thirty-two-characters'

const buildApp = async (): Promise<FastifyInstance> => {
  const app = Fastify({ logger: false })
  await app.register(sensible)
  app.decorate('config', { JWT_SECRET } as never)
  app.decorate('deployment', {
    features: {
      degreeTheses: true,
      paperUpload: true,
    },
  } as never)
  app.decorate('prisma', {
    $queryRaw: async () => [],
    degree_theses: {
      findMany: async () => [],
      count: async () => 0,
    },
    users: {
      findUnique: async () => null,
    },
  } as never)
  await app.register(jwtPlugin)
  await app.register(paperRoutes, { prefix: '/papers' })
  await app.register(degreeThesisRoutes, { prefix: '/v1/theses' })
  await app.ready()
  return app
}

test('anonymous visitors can browse public papers and published degree theses', async (t) => {
  const app = await buildApp()
  t.after(async () => app.close())

  const papers = await app.inject({ method: 'GET', url: '/papers' })
  assert.equal(papers.statusCode, 200)
  assert.deepEqual(papers.json(), {
    items: [],
    total: 0,
    statusTotals: {
      draft: 0,
      pending_review: 0,
      changes_requested: 0,
      approved: 0,
      archived: 0,
    },
  })

  const theses = await app.inject({ method: 'GET', url: '/v1/theses' })
  assert.equal(theses.statusCode, 200)
  assert.deepEqual(theses.json(), {
    code: 0,
    data: { items: [], total: 0 },
  })
})

test('private collections still require a user session', async (t) => {
  const app = await buildApp()
  t.after(async () => app.close())

  const myPapers = await app.inject({ method: 'GET', url: '/papers/my' })
  assert.equal(myPapers.statusCode, 401)

  const myTheses = await app.inject({ method: 'GET', url: '/v1/theses/mine' })
  assert.equal(myTheses.statusCode, 401)
})

test('stale user tokens fall back to public access but integration tokens are rejected', async (t) => {
  const app = await buildApp()
  t.after(async () => app.close())

  const staleTokenResponse = await app.inject({
    method: 'GET',
    url: '/papers',
    headers: { authorization: 'Bearer expired-or-invalid' },
  })
  assert.equal(staleTokenResponse.statusCode, 200)

  const integrationToken = app.jwt.sign({
    userId: 'integration:test',
    token_type: 'integration',
    credentialId: '11111111-1111-4111-8111-111111111111',
    institutionId: '22222222-2222-4222-8222-222222222222',
    credentialVersion: 1,
    scopes: ['imports:read'],
  })
  const integrationResponse = await app.inject({
    method: 'GET',
    url: '/papers',
    headers: { authorization: `Bearer ${integrationToken}` },
  })
  assert.equal(integrationResponse.statusCode, 403)
})
