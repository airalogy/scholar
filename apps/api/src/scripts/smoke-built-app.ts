import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildApp } from '../app'

const storageDirectory = await mkdtemp(join(tmpdir(), 'scholar-api-smoke-'))

process.env.NODE_ENV = 'test'
process.env.LOG_LEVEL = 'silent'
process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@127.0.0.1:5432/scholar_smoke'
process.env.JWT_SECRET ??= 'scholar-smoke-test-secret-at-least-32-characters'
process.env.STORAGE_PROVIDER = 'local'
process.env.LOCAL_STORAGE_DIR = storageDirectory
process.env.ENABLE_AIRALOGY_OAUTH = 'false'
process.env.INSTITUTION_SSO_ENABLED = 'false'
process.env.ENABLE_AI_CHAT = 'false'

const app = buildApp({ logger: false })

try {
  await app.ready()

  const versionResponse = await app.inject({ method: 'GET', url: '/version' })
  assert.equal(versionResponse.statusCode, 200)
  assert.match(versionResponse.json().data.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u)
  assert.equal(versionResponse.headers['x-ratelimit-limit'], '300')

  const healthResponse = await app.inject({ method: 'GET', url: '/health' })
  assert.equal(healthResponse.statusCode, 200)
  assert.deepEqual(healthResponse.json(), { code: 0, data: { status: 'ok' } })

  const protectedResponse = await app.inject({ method: 'GET', url: '/users/me' })
  assert.equal(protectedResponse.statusCode, 401)

  console.log('Built Scholar API started and served smoke-test requests successfully')
} finally {
  await app.close()
  await rm(storageDirectory, { recursive: true, force: true })
}
