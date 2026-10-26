import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

// A private adapter owns source-specific extraction. This client only accepts
// the published Scholar directory contract; no institutional mappings live here.
export const synchronizeDirectory = async ({ baseUrl, slug, sourceId, clientId, clientSecret, manifest, signal }, fetcher = fetch) => {
  const origin = new URL(baseUrl)
  if (origin.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) throw new Error('Directory synchronization requires HTTPS')
  if (!Number.isSafeInteger(manifest.sequence) || manifest.sequence < 1 || !['full', 'incremental'].includes(manifest.mode) || !Array.isArray(manifest.rows) || manifest.rows.length > 100000) throw new Error('Invalid standard directory manifest')
  const request = async (path, method, body, token, extraHeaders = {}) => {
    const response = await fetcher(`${baseUrl.replace(/\/$/u, '')}${path}`, {
      method, redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(150000)]) : AbortSignal.timeout(150000),
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extraHeaders },
      body: JSON.stringify(body),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(`Directory request failed (${response.status}); inspect the authenticated sync history`)
    return result
  }
  const credentials = await request('/auth/integration-token', 'POST', { client_id: clientId, client_secret: clientSecret })
  const token = credentials.access_token
  if (typeof token !== 'string') throw new Error('Token exchange returned no access token')
  const endpoint = `/v1/institutions/${encodeURIComponent(slug)}/directory/sources/${encodeURIComponent(sourceId)}/runs`
  const pages = Math.max(1, Math.ceil(manifest.rows.length / 500))
  const { data: run } = await request(endpoint, 'POST', { schemaVersion: manifest.schemaVersion ?? 1, sequence: manifest.sequence, mode: manifest.mode, expectedPages: pages, expectedRows: manifest.rows.length }, token, { 'Idempotency-Key': `directory-sync:${manifest.sequence}` })
  if (run.status === 'applied') return run
  if (run.status === 'staging') for (let page = 1; page <= pages; page++) await request(`${endpoint}/${run.id}/pages/${page}`, 'PUT', { rows: manifest.rows.slice((page - 1) * 500, page * 500) }, token)
  const { data: validated } = await request(`${endpoint}/${run.id}/validate`, 'POST', {}, token)
  if (validated.status === 'needs_confirmation') return validated
  return (await request(`${endpoint}/${run.id}/apply`, 'POST', {}, token)).data
}

export const watchDirectory = async (synchronize, { intervalSeconds, signal, onError = () => {} }) => {
  if (!Number.isSafeInteger(intervalSeconds) || intervalSeconds < 60) throw new Error('Sync interval must be an integer of at least 60 seconds')
  while (!signal.aborted) {
    try { await synchronize() } catch (error) { if (!signal.aborted) onError(error) }
    try { await delay(intervalSeconds * 1000, undefined, { signal }) } catch { if (!signal.aborted) throw new Error('Sync scheduler interrupted') }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const input = process.argv[2]
  if (!input) throw new Error('Usage: node scripts/sync-institution-directory.mjs /private/path/standard-directory.json')
  const required = ['SCHOLAR_API_URL', 'SCHOLAR_INSTITUTION_SLUG', 'SCHOLAR_DIRECTORY_SOURCE_ID', 'SCHOLAR_DIRECTORY_CLIENT_ID', 'SCHOLAR_DIRECTORY_CLIENT_SECRET']
  for (const key of required) if (!process.env[key]) throw new Error(`Missing ${key}`)
  const controller = new AbortController()
  process.once('SIGINT', () => controller.abort())
  process.once('SIGTERM', () => controller.abort())
  const run = async () => {
    const raw = await readFile(input, 'utf8')
    if (Buffer.byteLength(raw) > 30 * 1024 * 1024) throw new Error('Directory manifest exceeds 30 MB')
    const result = await synchronizeDirectory({ baseUrl: process.env.SCHOLAR_API_URL, slug: process.env.SCHOLAR_INSTITUTION_SLUG, sourceId: process.env.SCHOLAR_DIRECTORY_SOURCE_ID, clientId: process.env.SCHOLAR_DIRECTORY_CLIENT_ID, clientSecret: process.env.SCHOLAR_DIRECTORY_CLIENT_SECRET, manifest: JSON.parse(raw), signal: controller.signal })
    console.log(JSON.stringify({ runId: result.id, status: result.status, created: result.createdCount, updated: result.updatedCount, deactivated: result.deactivatedCount }))
    return result
  }
  if (process.env.SCHOLAR_DIRECTORY_SYNC_INTERVAL_SECONDS) await watchDirectory(run, { intervalSeconds: Number(process.env.SCHOLAR_DIRECTORY_SYNC_INTERVAL_SECONDS), signal: controller.signal, onError: () => console.error('Directory synchronization failed; will retry on the next interval') })
  else if ((await run()).status !== 'applied') process.exitCode = 2
}
