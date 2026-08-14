import assert from 'node:assert/strict'
import test from 'node:test'
import Fastify from 'fastify'
import versionRoutes from '../src/routes/version'
import { isPublicRoute } from '../src/utils/auth'

test('version endpoint exposes repository build identity without authentication', async () => {
  const app = Fastify()
  await app.register(versionRoutes, { prefix: '/version' })

  const response = await app.inject({ method: 'GET', url: '/version' })
  assert.equal(response.statusCode, 200)
  const payload = response.json()
  assert.equal(payload.code, 0)
  assert.equal(payload.data.version, '3.0.0')
  assert.equal(payload.data.tag === null || typeof payload.data.tag === 'string', true)
  assert.equal(typeof payload.data.commit, 'string')
  assert.equal(typeof payload.data.dirty, 'boolean')
  assert.equal(isPublicRoute('/version', true), true)
  assert.equal(isPublicRoute('/version'), false)
  assert.equal(isPublicRoute('/auth/future-internal-route'), false)
  assert.equal(isPublicRoute('/docs/static/index.css'), true)

  await app.close()
})
