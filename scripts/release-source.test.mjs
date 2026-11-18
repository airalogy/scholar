import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

test('release exports preserve and checksum the complete published migration chain', async () => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'scholar-migration-snapshot-'))
  const source = path.join(temporaryRoot, 'source')
  const target = path.join(temporaryRoot, 'export')
  const script = 'scripts/create-release-source-snapshot.mjs'
  const initial = 'apps/api/prisma/migrations/00000000000000_v3_initial/migration.sql'
  const upgrade =
    'apps/api/prisma/migrations/20260826000000_institution_people_identity/migration.sql'
  const fixtureFiles = {
    VERSION: '4.0.0\n',
    'CHANGELOG.md': '## [4.0.0]\n\n## [3.0.0]\n',
    'CHANGELOG.zh-CN.md': '## [4.0.0]\n\n## [3.0.0]\n',
    [initial]: 'CREATE TABLE old_identity (id INTEGER PRIMARY KEY);\n',
    [upgrade]: 'ALTER TABLE old_identity RENAME TO institution_people;\n',
    'apps/api/prisma/migrations/migration_lock.toml': 'provider = "postgresql"\n',
  }
  const run = (command, args) =>
    execFileSync(command, args, {
      cwd: source,
      encoding: 'utf8',
      stdio: 'pipe',
      env: Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
      ),
    })
  try {
    for (const [file, content] of Object.entries(fixtureFiles)) {
      await mkdir(path.dirname(path.join(source, file)), { recursive: true })
      await writeFile(path.join(source, file), content)
    }
    await mkdir(path.join(source, 'scripts'))
    await copyFile(path.join(import.meta.dirname, path.basename(script)), path.join(source, script))
    run('git', ['init', '--quiet'])
    run('node', [script, '--update-manifest'])
    run('git', ['add', '.'])
    run('git', [
      '-c',
      'user.name=Release Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '--quiet',
      '-m',
      'test fixture',
    ])
    run('node', [script, target])
    // Even a hook pointing at a different repository must not redirect the snapshot index.
    const contaminated = execFileSync('node', [script, '--check'], {
      cwd: source,
      env: {
        ...process.env,
        GIT_DIR: path.join(temporaryRoot, 'not-a-repository'),
        GIT_WORK_TREE: target,
        GIT_INDEX_FILE: path.join(temporaryRoot, 'wrong-index'),
      },
      encoding: 'utf8',
    })
    assert.match(contaminated, /Release source audit passed/)

    const manifest = JSON.parse(
      await readFile(path.join(target, 'RELEASE-SOURCE-MANIFEST.json'), 'utf8'),
    )
    for (const migration of [initial, upgrade]) {
      assert.equal(await readFile(path.join(target, migration), 'utf8'), fixtureFiles[migration])
      assert.equal(
        manifest.files[migration],
        createHash('sha256').update(fixtureFiles[migration]).digest('hex'),
      )
    }
    await writeFile(path.join(source, upgrade), `${fixtureFiles[upgrade]}-- modified\n`)
    assert.throws(
      () => run('node', [script, '--check']),
      /manifest is stale|MANIFEST.json is stale/,
    )
    assert.throws(
      () => run('node', [script, '--verify', '--group', 'web']),
      /MANIFEST.json is stale/,
    )
    assert.throws(
      () => run('node', [script, '--verify', '--group', 'unknown']),
      /known check group/,
    )
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
})

test('isolated verification groups initialize shared database extensions only when required', async () => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'scholar-source-groups-'))
  const source = path.join(temporaryRoot, 'source')
  const bin = path.join(temporaryRoot, 'bin')
  const log = path.join(temporaryRoot, 'commands.jsonl')
  const script = 'scripts/create-release-source-snapshot.mjs'
  const initial = 'apps/api/prisma/migrations/00000000000000_v3_initial/migration.sql'
  const recorder = `import { appendFileSync, readFileSync } from 'node:fs'
const args = process.argv.slice(2)
appendFileSync(process.env.FIXTURE_LOG, JSON.stringify({
  args, database: process.env.DATABASE_URL,
  overrides: ['IDENTITY', 'GOVERNANCE', 'BIBLIOGRAPHY'].map(name => process.env[name + '_TEST_DATABASE_URL']),
  sql: args.includes('--stdin') ? readFileSync(0, 'utf8') : null
}) + '\\n')
if (process.env.FIXTURE_FAIL && args.includes('--group')) process.exitCode = 1
`
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))),
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    FIXTURE_LOG: log,
    RELEASE_SOURCE_DATABASE_URL:
      'postgresql://fixture:fixture@localhost/fixture?schema=source_fixture',
    IDENTITY_TEST_DATABASE_URL: 'do-not-use',
    GOVERNANCE_TEST_DATABASE_URL: 'do-not-use',
    BIBLIOGRAPHY_TEST_DATABASE_URL: 'do-not-use',
  }
  const run = (command, args, overrides = {}) =>
    execFileSync(command, args, {
      cwd: source,
      env: { ...env, ...overrides },
      encoding: 'utf8',
      stdio: 'pipe',
    })
  try {
    await mkdir(path.join(source, path.dirname(initial)), { recursive: true })
    await mkdir(path.join(source, 'scripts'))
    await mkdir(bin)
    await writeFile(path.join(source, initial), '-- disposable fixture\n')
    await writeFile(path.join(source, 'VERSION'), '5.2.0\n')
    await copyFile(path.join(import.meta.dirname, path.basename(script)), path.join(source, script))
    await writeFile(path.join(source, 'scripts/run-checks.mjs'), recorder)
    await writeFile(path.join(bin, 'pnpm'), `#!${process.execPath}\n${recorder}`)
    await chmod(path.join(bin, 'pnpm'), 0o755)
    run('git', ['init', '--quiet'])
    run('node', [script, '--update-manifest'])
    for (const group of ['web', 'quality', 'database', null]) {
      await writeFile(log, '')
      run('node', [script, '--verify', ...(group ? ['--group', group] : [])], {
        RELEASE_SOURCE_DATABASE_URL: group === 'web' ? '' : env.RELEASE_SOURCE_DATABASE_URL,
      })
      const calls = (await readFile(log, 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
      assert.deepEqual(calls[0].args, ['install', '--frozen-lockfile'])
      const database = calls.filter((call) => call.sql)
      assert.equal(database.length, !group || group === 'database' ? 1 : 0)
      if (database.length) {
        assert.match(database[0].sql, /CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public/)
        assert.match(database[0].sql, /CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public/)
        assert.match(database[0].sql, /DROP SCHEMA IF EXISTS "source_fixture" CASCADE/)
        assert.equal(new URL(database[0].database).searchParams.get('schema'), 'public')
      }
      const checks = calls.filter(
        (call) => call.args.includes('--group') || call.args[0] === 'check',
      )
      assert.deepEqual(
        checks.map((call) => call.args),
        group ? [['--group', group]] : [['check'], ['--group', 'database']],
      )
      for (const call of checks) assert.deepEqual(call.overrides, ['', '', ''])
      assert.equal(
        calls.some((call) => call.args[0] === 'audit:prod'),
        group === 'quality',
      )
    }
    assert.throws(() => run('node', [script, '--verify', '--group', 'web'], { FIXTURE_FAIL: '1' }))
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
})
