import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve(import.meta.dirname, '..')
const checkConfiguration = async (mutate = () => {}) => {
  const fixture = await mkdtemp(path.join(tmpdir(), 'scholar-ci-config-'))
  try {
    const files = [
      'scripts/check-ci-config.mjs', 'package.json', '.node-version', '.githooks/pre-push',
      'apps/api/package.json', 'apps/api/Dockerfile', 'apps/web/Dockerfile', 'deploy/compose.build.yaml',
      ...(await readdir(path.join(root, '.github/workflows'))).map((name) => `.github/workflows/${name}`),
    ]
    for (const file of files) {
      await mkdir(path.dirname(path.join(fixture, file)), { recursive: true })
      await copyFile(path.join(root, file), path.join(fixture, file))
    }
    await mutate(async (file, transform) => {
      const target = path.join(fixture, file)
      await writeFile(target, transform(await readFile(target, 'utf8')))
    })
    return spawnSync(process.execPath, [path.join(fixture, 'scripts/check-ci-config.mjs')], { encoding: 'utf8' })
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
}

test('local, CI and release configuration share the required checks', async () => {
  const result = await checkConfiguration()
  assert.equal(result.status, 0, result.stderr)
})

test('omitting license validation from shared checks is rejected', async () => {
  const result = await checkConfiguration((edit) => edit('package.json', (source) => source.replace('pnpm license:check && ', '')))
  assert.equal(result.status, 1)
  assert.match(result.stderr, /shared check command must include pnpm license:check/)
})

test('omitting dependency audit from prepush is rejected', async () => {
  const result = await checkConfiguration((edit) => edit('package.json', (source) => source.replace('pnpm audit:prod && ', '')))
  assert.equal(result.status, 1)
  assert.match(result.stderr, /prepush must audit production dependencies/)
})

test('the installed hook must delegate to the shared prepush command', async () => {
  const result = await checkConfiguration((edit) => edit('.githooks/pre-push', (source) => source.replace('pnpm prepush', 'pnpm check')))
  assert.equal(result.status, 1)
  assert.match(result.stderr, /the pre-push hook must run pnpm prepush/)
})

for (const workflow of ['ci', 'release']) {
  for (const command of ['pnpm check', 'pnpm audit:prod']) {
    test(`${workflow} cannot omit ${command}`, async () => {
      const result = await checkConfiguration((edit) => edit(`.github/workflows/${workflow}.yml`, (source) => source.replace(`      - run: ${command}\n`, '')))
      assert.equal(result.status, 1)
      assert.ok(result.stderr.includes(`workflow must run ${command}`), result.stderr)
    })
  }
}
