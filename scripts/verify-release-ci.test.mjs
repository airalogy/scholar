import assert from 'node:assert/strict'
import test from 'node:test'
import { assessRun, requiredJobs, resolveCommit, verifyReleaseCi } from './verify-release-ci.mjs'

const options = { repo: 'example/scholar', sha: 'a'.repeat(40), workflowId: 9 }
const run = {
  id: 10,
  run_attempt: 2,
  head_sha: options.sha,
  head_branch: 'main',
  event: 'push',
  repository: { full_name: options.repo },
  head_repository: { full_name: options.repo },
  workflow_id: 9,
  path: '.github/workflows/ci.yml',
  status: 'completed',
  conclusion: 'success',
}
const jobs = () =>
  requiredJobs.map((name) => ({
    name,
    head_sha: options.sha,
    run_id: 10,
    run_attempt: 2,
    status: 'completed',
    conclusion: 'success',
  }))

test('environment overrides cannot select CI for a different checkout', () => {
  assert.equal(resolveCommit(options.sha), options.sha)
  assert.equal(resolveCommit(options.sha, options.sha), options.sha)
  assert.throws(() => resolveCommit(options.sha, 'b'.repeat(40)), /checked-out HEAD/)
  assert.throws(() => resolveCommit('main'))
})

test('only complete exact-commit trusted main evidence can be reused', () => {
  assert.equal(assessRun(run, jobs(), options).reused, true)
  for (const mutation of [
    { head_sha: 'b'.repeat(40) },
    { head_branch: 'topic' },
    { event: 'pull_request' },
    { workflow_id: 8 },
    { path: 'other.yml' },
    { head_repository: { full_name: 'fork/scholar' } },
    { repository: { full_name: 'other/scholar' } },
    { status: 'in_progress' },
    { conclusion: 'failure' },
    { conclusion: 'cancelled' },
  ]) {
    assert.throws(() => assessRun({ ...run, ...mutation }, jobs(), options))
  }
})

test('missing, skipped, duplicated, stale and failed required jobs cannot pass', () => {
  assert.throws(() => assessRun(run, jobs().slice(1), options))
  assert.throws(() => assessRun(run, [...jobs(), jobs()[0]], options))
  for (const mutation of [
    { conclusion: 'skipped' },
    { conclusion: 'failure' },
    { status: 'queued' },
    { run_attempt: 1 },
    { run_id: 11 },
    { head_sha: 'b'.repeat(40) },
  ]) {
    const changed = jobs()
    Object.assign(changed[0], mutation)
    assert.throws(() => assessRun(run, changed, options))
  }
})

const fake =
  (runs, overrides = {}) =>
  async (endpoint) => {
    if (endpoint.endsWith('/workflows/ci.yml'))
      return { id: 9, path: '.github/workflows/ci.yml', state: 'active' }
    if (endpoint.includes('/runs?')) return [{ workflow_runs: runs }]
    if (endpoint.includes('/jobs?'))
      return [{ jobs: jobs().slice(0, 3) }, { jobs: jobs().slice(3) }]
    return { ...run, ...overrides }
  }

test('no evidence selects full fallback, while API errors never become success', async () => {
  assert.equal((await verifyReleaseCi(options, fake([]))).reused, false)
  await assert.rejects(
    verifyReleaseCi(options, async () => {
      throw new Error('HTTP 403')
    }),
    /403/,
  )
  await assert.rejects(verifyReleaseCi(options, async () => ({})))
})

test('latest failed rerun cannot reuse an older green result', async () => {
  await assert.rejects(
    verifyReleaseCi(options, fake([{ id: 9 }, { id: 10 }], { conclusion: 'failure' })),
    /not successful/,
  )
  assert.equal((await verifyReleaseCi(options, fake([{ id: 10 }]))).attempt, 2)
})

test('concurrent rerun invalidates evidence', async () => {
  let reads = 0
  const request = fake([{ id: 10 }])
  await assert.rejects(
    verifyReleaseCi(options, async (endpoint) => {
      const result = await request(endpoint)
      if (endpoint.endsWith('/runs/10') && ++reads === 2) return { ...result, run_attempt: 3 }
      return result
    }),
    /changed during/,
  )
})

test('a newly created run invalidates previously selected evidence', async () => {
  let listings = 0
  const request = fake([{ id: 10 }])
  await assert.rejects(
    verifyReleaseCi(options, async (endpoint) => {
      if (endpoint.includes('/runs?') && ++listings === 2)
        return [{ workflow_runs: [{ id: 11 }, { id: 10 }] }]
      return request(endpoint)
    }),
    /changed during/,
  )
})
