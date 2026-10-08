import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { isTransientError, parseArguments, watchRun } from './watch-github-run.mjs'

const run = (status, conclusion = null) => ({ databaseId: 123, status, conclusion, url: 'https://github.com/example/scholar/actions/runs/123' })
const eof = () => Object.assign(new Error('status query failed'), { stderr: 'failed to get run: EOF' })
const simulate = async (responses, overrides = {}) => {
  let clock = 0
  const calls = []
  const sleeps = []
  const messages = []
  const result = await watchRun({ runId: '123', intervalMs: 1000, timeoutMs: 60000, ...overrides }, {
    query: async (options) => {
      calls.push(options)
      assert.ok(responses.length > 0, 'unexpected query')
      const response = responses.shift()
      if (response instanceof Error) throw response
      return response
    },
    now: () => clock,
    sleep: async (ms) => { sleeps.push(ms); clock += ms },
    log: (message) => messages.push(message),
    warn: (message) => messages.push(message),
  })
  return { result, calls, sleeps, messages }
}

test('CLI parses an explicit run, repository and bounded wait options', () => {
  assert.deepEqual(parseArguments(['--', '123', '--repo', 'example/scholar', '--interval', '10', '--timeout', '600']), {
    runId: '123', repo: 'example/scholar', intervalMs: 10000, timeoutMs: 600000,
  })
})

test('CLI rejects ambiguous run IDs and invalid or repeated flags', () => {
  for (const args of [[], ['latest'], ['--repo', 'example/scholar'], ['123', '--timeout'], ['123', '--timeout', '0'], ['123', '--timeout', '86401'], ['123', '--interval', '301'], ['123', '--repo', '--bad'], ['123', '--retry'], ['123', '--timeout', '3', '--timeout', '4']]) {
    assert.throws(() => parseArguments(args))
  }
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./watch-github-run.mjs', import.meta.url))], { encoding: 'utf8' })
  assert.equal(result.status, 2)
  assert.match(result.stderr, /Usage:/)
})

test('transient network and server failures are distinct from authentication and configuration errors', () => {
  for (const error of [eof(), new Error('HTTP 503: unavailable'), new Error('HTTP 429: too many requests'), { code: 'ETIMEDOUT' }, { killed: true }]) {
    assert.equal(isTransientError(error), true)
  }
  for (const error of [new Error('HTTP 403: forbidden'), new Error('HTTP 401: bad credentials'), new Error('HTTP 404: not found'), new Error('gh auth login'), { code: 'ENOENT' }, new SyntaxError('invalid JSON')]) {
    assert.equal(isTransientError(error), false)
  }
})

test('a query EOF is retried without reporting a failed workflow', async () => {
  const result = await simulate([eof(), run('in_progress'), run('completed', 'success')], { repo: 'example/scholar' })
  assert.equal(result.result, 0)
  assert.deepEqual(result.sleeps, [2000, 1000])
  assert.equal(result.calls.length, 3)
  assert.ok(result.calls.every((call) => call.runId === '123' && call.repo === 'example/scholar'))
  assert.match(result.messages[0], /retry 1\/3/)
  assert.match(result.messages.at(-1), /: success/)
})

for (const conclusion of ['failure', 'cancelled', 'timed_out', 'action_required', 'neutral', 'skipped']) {
  test(`confirmed ${conclusion} stops without a retry or rerun`, async () => {
    const result = await simulate([run('completed', conclusion)])
    assert.equal(result.result, 1)
    assert.equal(result.calls.length, 1)
    assert.deepEqual(result.sleeps, [])
  })
}

test('three exhausted retries return unknown rather than workflow failure', async () => {
  const result = await simulate([eof(), eof(), eof(), eof()])
  assert.equal(result.result, 2)
  assert.equal(result.calls.length, 4)
  assert.deepEqual(result.sleeps, [2000, 4000, 8000])
  assert.match(result.messages.at(-1), /does not mean the workflow failed/)
})

test('a successful status response resets the transient error budget', async () => {
  const result = await simulate([eof(), eof(), eof(), run('queued'), eof(), run('completed', 'success')])
  assert.equal(result.result, 0)
  assert.deepEqual(result.sleeps, [2000, 4000, 8000, 1000, 2000])
})

test('authentication failures are not retried', async () => {
  const result = await simulate([new Error('HTTP 401: bad credentials')])
  assert.equal(result.result, 2)
  assert.equal(result.calls.length, 1)
  assert.deepEqual(result.sleeps, [])
})

test('invalid or mismatched status responses never become success', async () => {
  for (const response of [null, {}, { ...run('completed', 'success'), databaseId: 456 }, run('completed'), { ...run('completed'), conclusion: true }]) {
    const result = await simulate([response])
    assert.equal(result.result, 2)
    assert.deepEqual(result.sleeps, [])
  }
})

test('overall timeout bounds polling and individual query timeouts', async () => {
  const result = await simulate([run('queued'), run('queued')], { timeoutMs: 1500 })
  assert.equal(result.result, 2)
  assert.deepEqual(result.calls.map((call) => call.timeoutMs), [1500, 500])
  assert.deepEqual(result.sleeps, [1000, 500])
  assert.equal(result.messages.filter((message) => message.includes(': queued')).length, 1)
  assert.match(result.messages.at(-1), /final result is unknown/)
})

test('retry delay cannot overrun the overall timeout', async () => {
  const result = await simulate([eof()], { timeoutMs: 500 })
  assert.equal(result.result, 2)
  assert.deepEqual(result.sleeps, [500])
  assert.equal(result.calls.length, 1)
})
