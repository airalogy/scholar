import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
})
