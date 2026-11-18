import { spawn, execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const repositoryChecks = [
  'ci:config:check',
  'license:check',
  'version:check',
  'docs:check',
  'release:source:check',
]
export const groups = {
  repository: repositoryChecks,
  quality: [...repositoryChecks, 'test:deployment'],
  api: [
    'db:validate',
    'db:generate',
    'format:check',
    '--filter @airalogy/scholar-server lint',
    '--filter @airalogy/scholar-server type-check',
    '--filter @airalogy/scholar-server test',
    '--filter @airalogy/scholar-server build',
    '--filter @airalogy/scholar-server smoke:dist',
  ],
  web: [
    '--filter @airalogy/scholar-web lint',
    '--filter @airalogy/scholar-web type-check',
    '--filter @airalogy/scholar-web test',
    '--filter @airalogy/scholar-web build',
  ],
  docs: [
    '--filter @airalogy/scholar-docs lint',
    '--filter @airalogy/scholar-docs type-check',
    '--filter @airalogy/scholar-docs test',
    '--filter @airalogy/scholar-docs build',
  ],
  database: [
    'db:generate',
    'db:migrate:deploy',
    'db:audit:integrity',
    'db:verify:upgrade',
    'db:verify:identity',
    'db:verify:governance',
    'db:verify:bibliography',
  ],
}
export const fullGroups = ['quality', 'api', 'web', 'docs']

// Git hooks export repository-local settings. Never leak these into test fixtures.
export const cleanGitEnvironment = (env = process.env) =>
  Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith('GIT_')))
const git = (args) =>
  execFileSync('git', args, { encoding: 'utf8', env: cleanGitEnvironment() }).trim()
const zero = /^0{40,64}$/

export const classifyChanges = (files) => {
  if (files === null)
    return { groups: fullGroups, audit: true, reason: 'unknown base: full checks' }
  const selected = new Set(['repository'])
  for (const file of files) {
    if (
      /^(apps\/(api|web|docs)\/package\.json|pnpm-|package\.json|\.node-version|\.npmrc|scripts\/|\.github\/|\.githooks\/|deploy\/)/.test(
        file,
      )
    ) {
      return { groups: fullGroups, audit: true, reason: 'shared toolchain or check policy changed' }
    }
    const module = /^apps\/(api|web|docs)\//.exec(file)?.[1]
    if (module) selected.add(module)
    else if (!/^(docs\/|[^/]+\.md$|LICENSE$|NOTICE$|RELEASE-SOURCE-MANIFEST\.json$)/.test(file)) {
      return { groups: fullGroups, audit: true, reason: `unclassified input: ${file}` }
    }
  }
  return {
    groups: [...selected],
    audit: false,
    reason: 'whole affected modules (not individual test guesses)',
  }
}

export const containerChanges = (files) => {
  if (files === null) return { api: true, web: true }
  const selection = { api: false, web: false }
  for (const file of files) {
    if (
      /^(pnpm-|package\.json$|\.node-version$|\.npmrc$|\.dockerignore$|\.github\/|\.githooks\/|scripts\/|deploy\/)/.test(
        file,
      ) ||
      /^apps\/[^/]+\/package\.json$/.test(file)
    )
      return { api: true, web: true }
    if (/^apps\/api\/(Dockerfile$|prisma\/|prisma\.config\.ts$|tsconfig[^/]*\.json$)/.test(file))
      selection.api = true
    else if (
      /^apps\/web\/(Dockerfile$|Caddyfile$|docker\/|vite\.config\.|tsconfig[^/]*\.json$)/.test(file)
    )
      selection.web = true
    else if (
      !/^(apps\/(api|web)\/(src|test|public)\/|apps\/docs\/|docs\/|[^/]+\.md$|LICENSE$|NOTICE$|RELEASE-SOURCE-MANIFEST\.json$)/.test(
        file,
      )
    )
      return { api: true, web: true }
  }
  return selection
}

export const pendingPush = (input, readGit = git) => {
  const lines = input.trim().split('\n').filter(Boolean)
  if (!lines.length) return { files: null, tags: false }
  let tags = true
  let hasTag = false
  let unknown = false
  let active = false
  const files = new Set()
  for (const line of lines) {
    const fields = line.trim().split(/\s+/)
    if (fields.length !== 4) throw new Error('Invalid pre-push ref input')
    const [, local, remoteRef, remote] = fields
    if (![local, remote].every((value) => /^[0-9a-f]{40,64}$/.test(value)))
      throw new Error('Invalid push object ID')
    if (zero.test(local)) continue
    active = true
    const commit = readGit(['rev-parse', `${local}^{commit}`])
    if (commit !== readGit(['rev-parse', 'HEAD']))
      throw new Error('Push each checked HEAD separately; another ref points to different source')
    if (!remoteRef.startsWith('refs/tags/')) tags = false
    else hasTag = true
    if (zero.test(remote)) unknown = true
    else {
      try {
        for (const file of readGit(['diff', '--name-only', '--no-renames', '-z', remote, commit])
          .split('\0')
          .filter(Boolean))
          files.add(file)
      } catch {
        unknown = true
      }
    }
  }
  if (hasTag && !tags)
    throw new Error(
      'Push release tags separately from branches so exact-commit CI is verified first',
    )
  return { files: unknown ? null : [...files], tags: active && tags, empty: !active }
}

export const executePlan = async (
  names,
  { execute, log = console.log, concurrency = 2, now = () => performance.now() } = {},
) => {
  if (!names.every((name) => Object.hasOwn(groups, name))) throw new Error('Unknown check group')
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4)
    throw new Error('Concurrency must be 1–4')
  const results = []
  const queue = [...names]
  const started = now()
  const worker = async () => {
    while (queue.length) {
      const name = queue.shift()
      const begin = now()
      let failed = null
      for (const command of groups[name]) {
        log(`[${name}] pnpm ${command}`)
        try {
          await execute(command, name)
        } catch (error) {
          failed = String(error.message || error)
          break
        }
      }
      const result = {
        group: name,
        status: failed ? 'failed' : 'passed',
        seconds: Math.round((now() - begin) / 100) / 10,
        error: failed,
      }
      results.push(result)
      log(`[${name}] ${result.status} (${result.seconds}s)${failed ? `: ${failed}` : ''}`)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, names.length) }, worker))
  return {
    status: results.every((result) => result.status === 'passed') ? 'passed' : 'failed',
    seconds: Math.round((now() - started) / 100) / 10,
    groups: results,
  }
}

const execute = (command) =>
  new Promise((resolve, reject) => {
    const child = spawn('pnpm', command.split(' '), {
      stdio: 'inherit',
      env: cleanGitEnvironment(),
    })
    child.on('error', reject)
    child.on('exit', (code, signal) =>
      code === 0 ? resolve() : reject(new Error(`${command}: ${signal || code}`)),
    )
  })

const main = async () => {
  const args = process.argv.slice(2).filter((arg) => arg !== '--')
  const mode = args[0]
  if (
    !['--full', '--quick', '--pre-push', '--group', '--containers'].includes(mode) ||
    args.length !== (['--group', '--containers'].includes(mode) ? 2 : 1)
  )
    throw new Error('Use --full, --quick, --pre-push, --group NAME, or --containers BASE')
  if (mode === '--containers') {
    let files = null
    if (/^[0-9a-f]{40}$/.test(args[1]) && !zero.test(args[1])) {
      try {
        files = git(['diff', '--name-only', '--no-renames', '-z', args[1], 'HEAD'])
          .split('\0')
          .filter(Boolean)
      } catch {
        /* Missing base requires both builds. */
      }
    }
    const selection = containerChanges(files)
    for (const [key, value] of Object.entries(selection)) {
      console.log(`${key}=${value}`)
      if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`)
    }
    return
  }
  let plan = {
    groups: mode === '--group' ? [args[1]] : fullGroups,
    audit: mode === '--full',
    reason: mode,
  }
  if (mode === '--quick' || mode === '--pre-push') {
    let files = null
    if (mode === '--pre-push') {
      const pending = pendingPush(readFileSync(0, 'utf8'))
      if (pending.empty) {
        console.log('No source update in this push')
        return
      }
      if (git(['status', '--porcelain=v1']))
        throw new Error(
          'Pre-push requires a clean worktree so validation matches the pushed commit',
        )
      if (pending.tags) {
        await execute('release:check')
        await execute('release:ci:check')
        return
      }
      files = pending.files
    } else {
      try {
        files = [
          ...new Set(
            [
              ...git(['diff', '--name-only', '--no-renames', '-z', 'origin/main...HEAD']).split(
                '\0',
              ),
              ...git(['diff', '--name-only', '--no-renames', '-z', 'HEAD']).split('\0'),
              ...git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0'),
            ].filter(Boolean),
          ),
        ]
      } catch {
        /* New repositories conservatively run all checks. */
      }
    }
    plan = classifyChanges(files)
  }
  console.log(`Check plan: ${plan.groups.join(', ')}; ${plan.reason}`)
  if (plan.audit) await execute('audit:prod')
  const summary = await executePlan(plan.groups, { execute })
  console.log(`CHECK_SUMMARY ${JSON.stringify(summary)}`)
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `\nCheck result: ${summary.status}; ${summary.seconds}s\n\n${summary.groups.map((group) => `- ${group.group}: ${group.status}, ${group.seconds}s`).join('\n')}\n`,
    )
  if (summary.status !== 'passed') process.exitCode = 1
  if (mode !== '--group')
    console.log(
      'Local checks are not release approval. Full exact-commit CI, native release images and installation smoke checks remain required.',
    )
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await main()
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
