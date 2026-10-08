import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const usage = 'Usage: pnpm ci:watch RUN_ID [--repo OWNER/REPO] [--interval SECONDS] [--timeout SECONDS]'

export const parseArguments = (input) => {
  const args = input[0] === '--' ? input.slice(1) : input
  if (!/^[1-9]\d*$/.test(args[0] ?? '')) throw new Error(usage)
  const options = { runId: args[0], intervalMs: 15000, timeoutMs: 3600000 }
  const seen = new Set()
  for (let index = 1; index < args.length; index += 2) {
    const key = args[index]
    const value = args[index + 1]
    if (seen.has(key)) throw new Error(`Duplicate option: ${key}`)
    seen.add(key)
    if (key === '--repo' && /^[\w.-]+\/[\w.-]+$/.test(value ?? '')) {
      options.repo = value
    } else if (['--interval', '--timeout'].includes(key) && /^[1-9]\d*$/.test(value ?? '')) {
      const seconds = Number(value)
      const maximum = key === '--interval' ? 300 : 86400
      if (seconds > maximum) throw new Error(`${key} must be between 1 and ${maximum} seconds`)
      options[key === '--interval' ? 'intervalMs' : 'timeoutMs'] = seconds * 1000
    } else {
      throw new Error(`Invalid option: ${key}. ${usage}`)
    }
  }
  return options
}

const errorDetail = (error) => String(error?.stderr || error?.message || error).trim()

export const isTransientError = (error) => {
  const detail = errorDetail(error)
  if (error?.code === 'ENOENT' || /HTTP (?:401|403|404)\b|gh auth login|not logged|authentication failed/i.test(detail)) return false
  return error?.killed === true
    || ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ENOTFOUND'].includes(error?.code)
    || /\bEOF\b|connection reset|connection refused|connection timed out|connection aborted|socket hang up|TLS handshake timeout|i\/o timeout|context deadline exceeded|temporary failure|no such host|network is unreachable|HTTP (?:429|500|502|503|504)\b/i.test(detail)
}

const queryRun = async ({ runId, repo, timeoutMs }) => {
  const args = ['run', 'view', runId, '--json', 'databaseId,status,conclusion,url']
  if (repo) args.push('--repo', repo)
  const { stdout } = await execFileAsync('gh', args, {
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024,
    env: { ...process.env, GH_PROMPT_DISABLED: '1', GH_DEBUG: '' },
  })
  return JSON.parse(stdout)
}

// Exit codes: 0 = confirmed success, 1 = confirmed non-success, 2 = unknown.
export const watchRun = async (options, dependencies = {}) => {
  const { query = queryRun, sleep = delay, now = () => performance.now(), log = console.log, warn = console.error } = dependencies
  const deadline = now() + options.timeoutMs
  let consecutiveErrors = 0
  let previousStatus
  while (now() < deadline) {
    try {
      const run = await query({ ...options, timeoutMs: Math.max(1, Math.min(30000, Math.ceil(deadline - now()))) })
      if (!run || String(run.databaseId) !== options.runId || typeof run.status !== 'string' || !run.status) {
        throw new Error('GitHub returned an invalid run status')
      }
      if (run.status === 'completed') {
        if (typeof run.conclusion !== 'string' || !run.conclusion) throw new Error('Completed run has no conclusion')
        log(`GitHub run ${options.runId}: ${run.conclusion}${run.url ? ` (${run.url})` : ''}`)
        return run.conclusion === 'success' ? 0 : 1
      }
      consecutiveErrors = 0
      if (run.status !== previousStatus) {
        log(`GitHub run ${options.runId}: ${run.status}${run.url ? ` (${run.url})` : ''}`)
        previousStatus = run.status
      }
    } catch (error) {
      consecutiveErrors += 1
      if (!isTransientError(error) || consecutiveErrors > 3) {
        warn(`Unable to confirm GitHub run ${options.runId}; this does not mean the workflow failed. ${errorDetail(error)}`)
        return 2
      }
      const remainingMs = deadline - now()
      if (remainingMs <= 0) break
      const retryMs = Math.min(2000 * 2 ** (consecutiveErrors - 1), remainingMs)
      warn(`GitHub status query interrupted; retry ${consecutiveErrors}/3 in ${retryMs / 1000}s. The workflow is not being restarted.`)
      await sleep(retryMs)
      continue
    }
    const remainingMs = deadline - now()
    if (remainingMs <= 0) break
    await sleep(Math.min(options.intervalMs, remainingMs))
  }
  warn(`Timed out waiting for GitHub run ${options.runId}; its final result is unknown. Query the same run again later.`)
  return 2
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.exitCode = await watchRun(parseArguments(process.argv.slice(2)))
  } catch (error) {
    console.error(errorDetail(error))
    process.exitCode = 2
  }
}
