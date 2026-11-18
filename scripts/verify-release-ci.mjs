import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const requiredJobs = [
  'deployment-config',
  'verify',
  ...['quality', 'api', 'web', 'docs', 'database'].map((group) => `source-checks (${group})`),
  'container-build (api, apps/api/Dockerfile)',
  'container-build (web, apps/web/Dockerfile)',
]

export const resolveCommit = (checkoutSha, environmentSha) => {
  if (!/^[0-9a-f]{40}$/.test(checkoutSha) || (environmentSha && environmentSha !== checkoutSha)) {
    throw new Error('CI commit must match the checked-out HEAD')
  }
  return checkoutSha
}

export const assessRun = (run, jobs, { repo, sha, workflowId }) => {
  if (
    run.head_sha !== sha ||
    run.head_branch !== 'main' ||
    run.event !== 'push' ||
    run.repository?.full_name !== repo ||
    run.head_repository?.full_name !== repo ||
    run.workflow_id !== workflowId ||
    run.path !== '.github/workflows/ci.yml'
  ) {
    throw new Error('CI evidence does not belong to the exact trusted main push')
  }
  if (run.status !== 'completed' || run.conclusion !== 'success')
    throw new Error(`Main CI is not successful: ${run.status}/${run.conclusion}`)
  for (const name of requiredJobs) {
    const matches = jobs.filter((job) => job.name === name)
    if (
      matches.length !== 1 ||
      matches[0].head_sha !== sha ||
      matches[0].run_id !== run.id ||
      matches[0].run_attempt !== run.run_attempt ||
      matches[0].status !== 'completed' ||
      matches[0].conclusion !== 'success'
    ) {
      throw new Error(`Required CI job is missing, stale or not successful: ${name}`)
    }
  }
  return { reused: true, runId: run.id, attempt: run.run_attempt, sha, url: run.html_url }
}

// Query all pages and select the newest run, never an older successful run.
export const verifyReleaseCi = async ({ repo, sha }, request) => {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !/^[0-9a-f]{40}$/.test(sha))
    throw new Error('An exact repository and 40-character commit SHA are required')
  const workflow = await request(`repos/${repo}/actions/workflows/ci.yml`)
  if (
    !Number.isInteger(workflow.id) ||
    workflow.path !== '.github/workflows/ci.yml' ||
    workflow.state !== 'active'
  )
    throw new Error('Trusted CI workflow is unavailable')
  const pages = await request(
    `repos/${repo}/actions/workflows/${workflow.id}/runs?head_sha=${sha}&branch=main&event=push&per_page=100`,
    true,
  )
  if (!Array.isArray(pages) || !pages.every((page) => Array.isArray(page.workflow_runs)))
    throw new Error('Invalid CI run response')
  const runs = pages.flatMap((page) => page.workflow_runs).sort((a, b) => b.id - a.id)
  if (!runs.length)
    return {
      reused: false,
      reason: 'No exact-commit main CI evidence; full clean-source verification is required',
      sha,
    }
  const listed = runs[0]
  const run = await request(`repos/${repo}/actions/runs/${listed.id}`)
  if (run.id !== listed.id || !Number.isInteger(run.run_attempt))
    throw new Error('Invalid CI attempt')
  const jobPages = await request(
    `repos/${repo}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`,
    true,
  )
  if (!Array.isArray(jobPages) || !jobPages.every((page) => Array.isArray(page.jobs)))
    throw new Error('Invalid CI job response')
  const result = assessRun(
    run,
    jobPages.flatMap((page) => page.jobs),
    { repo, sha, workflowId: workflow.id },
  )
  // Refuse evidence invalidated by a concurrent rerun while jobs were being read.
  const final = await request(`repos/${repo}/actions/runs/${run.id}`)
  if (
    final.run_attempt !== run.run_attempt ||
    final.status !== 'completed' ||
    final.conclusion !== 'success'
  )
    throw new Error('CI changed during verification; check again')
  assessRun(
    final,
    jobPages.flatMap((page) => page.jobs),
    { repo, sha, workflowId: workflow.id },
  )
  const latestPages = await request(
    `repos/${repo}/actions/workflows/${workflow.id}/runs?head_sha=${sha}&branch=main&event=push&per_page=100`,
    true,
  )
  if (
    !Array.isArray(latestPages) ||
    !latestPages.every((page) => Array.isArray(page.workflow_runs)) ||
    latestPages.flatMap((page) => page.workflow_runs).sort((a, b) => b.id - a.id)[0]?.id !== run.id
  )
    throw new Error('CI changed during verification; check again')
  return result
}

const request = (endpoint, paginate = false) =>
  JSON.parse(
    execFileSync('gh', ['api', endpoint, ...(paginate ? ['--paginate', '--slurp'] : [])], {
      encoding: 'utf8',
      timeout: 60000,
      maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, GH_PROMPT_DISABLED: '1' },
    }),
  )

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.slice(2).some((arg) => arg !== '--require'))
      throw new Error('Only --require is supported')
    const repo =
      process.env.GITHUB_REPOSITORY ||
      JSON.parse(
        execFileSync('gh', ['repo', 'view', '--json', 'nameWithOwner'], { encoding: 'utf8' }),
      ).nameWithOwner
    const sha = resolveCommit(
      execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      process.env.GITHUB_SHA,
    )
    const result = await verifyReleaseCi({ repo, sha }, request)
    if (process.argv.includes('--require') && !result.reused) throw new Error(result.reason)
    console.log(JSON.stringify(result))
    if (process.env.GITHUB_OUTPUT)
      appendFileSync(process.env.GITHUB_OUTPUT, `reused=${result.reused}\n`)
    if (process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `\nCI evidence for ${sha}: ${result.reused ? `verified run ${result.runId}, attempt ${result.attempt}` : result.reason}\n`,
      )
  } catch (error) {
    console.error(`Release blocked: ${error.message}`)
    process.exitCode = 1
  }
}
