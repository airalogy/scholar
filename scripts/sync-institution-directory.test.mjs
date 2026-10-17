import assert from 'node:assert/strict'
import test from 'node:test'
import { synchronizeDirectory, watchDirectory } from './sync-institution-directory.mjs'

const input = { baseUrl: 'https://scholar.example.invalid', slug: 'example', sourceId: 'source', clientId: 'fixture-client', clientSecret: 'fixture-secret', manifest: { sequence: 1, mode: 'full', rows: [] } }
test('standard sync paginates, exchanges short-lived credentials and preserves idempotency', async () => {
  const calls = []
  const fetcher = async (url, options) => {
    calls.push({ url, ...options })
    return Response.json(url.endsWith('/integration-token') ? { access_token: 'fixture-token' } : { code: 0, data: { id: 'run', status: url.endsWith('/apply') ? 'applied' : url.endsWith('/validate') ? 'validated' : 'staging' } })
  }
  const result = await synchronizeDirectory({ ...input, manifest: { ...input.manifest, rows: Array.from({ length: 501 }, (_, i) => ({ kind: 'unit', externalId: String(i), name: 'Example', active: true })) } }, fetcher)
  assert.equal(result.status, 'applied')
  assert.deepEqual(calls.filter(item => item.url.includes('/pages/')).map(item => JSON.parse(item.body).rows.length), [500, 1])
  assert.equal(calls[1].headers['Idempotency-Key'], 'directory-sync:1')
  assert.equal(calls[1].headers.Authorization, 'Bearer fixture-token')
  assert.ok(calls.every(item => item.redirect === 'error' && item.signal instanceof AbortSignal))
})
test('sync never automatically confirms a dangerous departure snapshot', async () => {
  const paths = []
  const result = await synchronizeDirectory(input, async url => {
    paths.push(url)
    return Response.json(url.endsWith('/integration-token') ? { access_token: 'fixture-token' } : { data: { id: 'run', status: url.endsWith('/validate') ? 'needs_confirmation' : 'staging' } })
  })
  assert.equal(result.status, 'needs_confirmation')
  assert.ok(!paths.some(url => url.endsWith('/apply')))
})
test('sync replay of an applied run performs no writes; transport and sequence constraints fail closed', async () => {
  let calls = 0
  await synchronizeDirectory(input, async () => Response.json(++calls === 1 ? { access_token: 'fixture-token' } : { data: { id: 'run', status: 'applied' } }))
  assert.equal(calls, 2)
  await assert.rejects(synchronizeDirectory({ ...input, baseUrl: 'http://school.example.invalid' }), /HTTPS/)
  await assert.rejects(synchronizeDirectory({ ...input, manifest: { ...input.manifest, sequence: 0 } }), /Invalid/)
  await assert.rejects(synchronizeDirectory(input, async () => Response.json({ message: 'sensitive upstream error' }, { status: 401 })), error => !error.message.includes('sensitive'))
})
test('scheduled sync cancels promptly, never overlaps runs, and requires a safe interval', async () => {
  const controller = new AbortController()
  let calls = 0
  await watchDirectory(async () => { calls++; controller.abort() }, { signal: controller.signal, intervalSeconds: 60 })
  assert.equal(calls, 1)
  await assert.rejects(watchDirectory(async () => {}, { signal: controller.signal, intervalSeconds: 1 }), /60/)
})
