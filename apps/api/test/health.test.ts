import assert from 'node:assert/strict'
import test from 'node:test'
import Fastify from 'fastify'
import type { PrismaClient } from '../prisma/generated/client'
import healthRoutes from '../src/routes/health/index'

const buildHealthApp = (databaseReady: boolean) => {
  const app = Fastify({ logger: false })
  const prisma = {
    $queryRaw: async (): Promise<unknown[]> => {
      if (!databaseReady) {
        throw new Error('database unavailable')
      }
      return [{ result: 1 }]
    },
  } as unknown as PrismaClient

  app.decorate('prisma', prisma)
  app.register(healthRoutes, { prefix: '/health' })
  return app
}

test('health endpoints distinguish liveness from database readiness', async (t) => {
  const readyApp = buildHealthApp(true)
  const unavailableApp = buildHealthApp(false)
  t.after(async () => {
    await Promise.all([readyApp.close(), unavailableApp.close()])
  })

  const liveResponse = await unavailableApp.inject({ method: 'GET', url: '/health' })
  assert.equal(liveResponse.statusCode, 200)
  assert.deepEqual(liveResponse.json(), { code: 0, data: { status: 'ok' } })

  const readyResponse = await readyApp.inject({ method: 'GET', url: '/health/ready' })
  assert.equal(readyResponse.statusCode, 200)

  const unavailableResponse = await unavailableApp.inject({
    method: 'GET',
    url: '/health/ready',
  })
  assert.equal(unavailableResponse.statusCode, 503)
  assert.deepEqual(unavailableResponse.json(), {
    code: 503,
    message: 'Service is not ready',
  })
})
