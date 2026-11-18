import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyChanges,
  cleanGitEnvironment,
  containerChanges,
  executePlan,
  fullGroups,
  groups,
  pendingPush,
} from './run-checks.mjs'

test('quick checks cover whole affected modules and default unknown inputs to full', () => {
  assert.deepEqual(classifyChanges(['apps/web/src/Page.vue']).groups, ['repository', 'web'])
  assert.deepEqual(classifyChanges(['docs/zh/releasing.md']).groups, ['repository'])
  assert.deepEqual(classifyChanges(['apps/docs/zh/page.md']).groups, ['repository', 'docs'])
  assert.deepEqual(classifyChanges(['apps/api/src/app.ts', 'apps/web/test/app.test.ts']).groups, [
    'repository',
    'api',
    'web',
  ])
  for (const files of [
    null,
    ['new-unknown.conf'],
    ['pnpm-lock.yaml'],
    ['apps/web/package.json'],
    ['scripts/new.mjs'],
    ['.github/workflows/ci.yml'],
  ]) {
    assert.deepEqual(classifyChanges(files).groups, fullGroups)
    assert.equal(classifyChanges(files).audit, true)
  }
})

test('container checks are conditional, unknown/shared inputs always build both', () => {
  assert.deepEqual(containerChanges(['apps/web/src/Page.vue', 'apps/api/src/app.ts']), {
    api: false,
    web: false,
  })
  assert.deepEqual(containerChanges(['apps/api/Dockerfile']), { api: true, web: false })
  assert.deepEqual(containerChanges(['apps/web/Caddyfile']), { api: false, web: true })
  assert.deepEqual(containerChanges(['apps/web/vite.config.ts']), { api: false, web: true })
  assert.deepEqual(containerChanges(['apps/api/tsconfig.json']), { api: true, web: false })
  for (const files of [
    null,
    ['unknown.conf'],
    ['.npmrc'],
    ['pnpm-lock.yaml'],
    ['apps/docs/package.json'],
    ['deploy/compose.yaml'],
    ['scripts/run-checks.mjs'],
  ]) {
    assert.deepEqual(containerChanges(files), { api: true, web: true })
  }
})

const head = 'a'.repeat(40)
const base = 'b'.repeat(40)
const git = (args) =>
  args[0] === 'rev-parse' ? head : 'apps/web/src/deleted.vue\0apps/api/src/changed.ts\0'
test('push uses remote tip to local tip across all commits, including deletions', () => {
  const calls = []
  const plan = pendingPush(`refs/heads/main ${head} refs/heads/main ${base}`, (args) => {
    calls.push(args)
    return git(args)
  })
  assert.deepEqual(plan.files, ['apps/web/src/deleted.vue', 'apps/api/src/changed.ts'])
  assert.ok(calls.some((args) => args.includes(base) && args.includes(head)))
  assert.equal(
    pendingPush(`refs/heads/topic ${head} refs/heads/topic ${'0'.repeat(40)}`, git).files,
    null,
  )
  assert.equal(pendingPush('', git).files, null)
  assert.equal(pendingPush(`refs/tags/v1 ${head} refs/tags/v1 ${base}`, git).tags, true)
  assert.throws(
    () =>
      pendingPush(
        `refs/tags/v1 ${head} refs/tags/v1 ${base}\nrefs/heads/main ${head} refs/heads/main ${base}`,
        git,
      ),
    /separately from branches/,
  )
  assert.equal(
    pendingPush(`refs/heads/deleted ${'0'.repeat(40)} refs/heads/deleted ${base}`, git).empty,
    true,
  )
  assert.throws(() => pendingPush('malformed', git))
  assert.throws(
    () =>
      pendingPush(`refs/heads/main ${head} refs/heads/main ${base}`, (args) =>
        args[1] === 'HEAD' ? base : head,
      ),
    /different source/,
  )
})

test('parallel failure stays failed and prevents later commands in that group', async () => {
  const commands = []
  const result = await executePlan(['api', 'web'], {
    log: () => {},
    execute: async (command) => {
      commands.push(command)
      if (command === 'db:validate') throw new Error('broken schema')
    },
  })
  assert.equal(result.status, 'failed')
  assert.equal(commands.includes('db:generate'), false)
  assert.ok(commands.includes('--filter @airalogy/scholar-web build'))
  await assert.rejects(executePlan(['unknown'], { execute: async () => {} }))
})

test('complete plan retains all application, integrity, upgrade, identity, governance and bibliography checks', async () => {
  const commands = []
  const result = await executePlan([...fullGroups, 'database'], {
    log: () => {},
    execute: async (command) => {
      commands.push(command)
    },
  })
  assert.equal(result.status, 'passed')
  assert.deepEqual(
    commands.sort(),
    [...fullGroups, 'database'].flatMap((name) => groups[name]).sort(),
  )
  assert.ok(groups.repository.every((command) => commands.includes(command)))
  assert.ok(commands.includes('test:deployment'))
  assert.equal(result.groups.length, 5)
})

test('page-only quick checks retain repository checks and the whole web suite without deployment fixtures', async () => {
  const commands = []
  const plan = classifyChanges(['apps/web/src/Page.vue'])
  await executePlan(plan.groups, {
    log: () => {},
    execute: async (command) => {
      commands.push(command)
    },
  })
  assert.deepEqual(commands.sort(), [...groups.repository, ...groups.web].sort())
  assert.equal(commands.includes('test:deployment'), false)
  assert.ok(classifyChanges(['deploy/scholarctl']).groups.includes('quality'))
})

test('Git hook repository settings do not escape into child repositories', () => {
  assert.deepEqual(
    cleanGitEnvironment({
      PATH: '/bin',
      GITHUB_SHA: head,
      GIT_DIR: '/wrong',
      GIT_WORK_TREE: '/wrong',
      GIT_INDEX_FILE: '/wrong',
      GIT_CONFIG_COUNT: '1',
    }),
    { PATH: '/bin', GITHUB_SHA: head },
  )
})
