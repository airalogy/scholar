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

for (const [description, file, before, after, message] of [
  ['native ARM runner', '.github/workflows/release.yml', 'runner: ubuntu-24.04-arm', 'runner: ubuntu-24.04', /runner: ubuntu-24.04-arm/],
  ['both release architectures', '.github/workflows/release.yml', 'arch: [amd64, arm64]', 'arch: [amd64]', /arch: \[amd64, arm64\]/],
  ['verification before builds', '.github/workflows/release.yml', 'needs: verify', 'needs: []', /needs: verify/],
  ['all native checks before index publication', '.github/workflows/release.yml', 'needs: image-platforms', 'needs: verify', /needs: image-platforms/],
  ['index before packaging', '.github/workflows/release.yml', 'needs: images', 'needs: verify', /needs: images/],
  ['native API smoke test', '.github/workflows/release.yml', 'dist/src/scripts/smoke-built-app.js', 'dist/src/index.js', /smoke-built-app/],
  ['native Web smoke test', '.github/workflows/release.yml', '--entrypoint caddy "$IMAGE" validate', '--entrypoint caddy "$IMAGE" version', /caddy.*validate/],
  ['multi-platform index verification', '.github/workflows/release.yml', 'sort == ["amd64", "arm64"]', 'length > 0', /sort ==/],
  ['trusted release cache', '.github/workflows/release.yml', 'scope=main-', 'scope=pr-', /scope=main-/],
  ['native image metadata labels', '.github/workflows/release.yml', '          labels: ${{ steps.metadata.outputs.labels }}\n', '', /labels: /],
  ['PR cache isolation', '.github/workflows/ci.yml', "github.event_name == 'push' && 'main' || format('pr-{0}', github.event.pull_request.number)", "'main'", /format\('pr-/],
  ['ARM cache restricted to main', '.github/workflows/ci.yml', "if: github.event_name == 'push' && github.ref == 'refs/heads/main'", 'if: always()', /if: github.event_name/],
  ['required PR job identity', '.github/workflows/ci.yml', '  container-build:', '  fast-build:', /release acceleration/],
  ['separate runtime dependency layer', 'apps/api/Dockerfile', '/opt/scholar-api/node_modules/ ./node_modules/', '/opt/scholar-api/ ./', /node_modules/],
]) {
  test(`release acceleration retains ${description}`, async () => {
    const result = await checkConfiguration((edit) => edit(file, (source) => {
      assert.ok(source.includes(before), `Missing mutation target: ${before}`)
      return source.replace(before, after)
    }))
    assert.equal(result.status, 1, result.stdout)
    assert.match(result.stderr, message)
  })
}

for (const component of ['api', 'web']) {
  test(`${component} fetch layer cannot depend on a product version change`, async () => {
    const result = await checkConfiguration((edit) => edit(`apps/${component}/Dockerfile`, (source) =>
      source.replace('COPY pnpm-lock.yaml pnpm-workspace.yaml ./', 'COPY pnpm-lock.yaml pnpm-workspace.yaml VERSION ./')))
    assert.equal(result.status, 1)
    assert.match(result.stderr, /fetch must depend only on the lockfile/)
  })
  test(`${component} cannot silently download dependencies during installation`, async () => {
    const result = await checkConfiguration((edit) => edit(`apps/${component}/Dockerfile`, (source) =>
      source.replace('pnpm install --offline --frozen-lockfile', 'pnpm install --frozen-lockfile')))
    assert.equal(result.status, 1)
    assert.match(result.stderr, /offline and frozen/)
  })
}

test('release does not spend time exporting tag-scoped caches', async () => {
  const result = await checkConfiguration((edit) => edit('.github/workflows/release.yml', (source) =>
    source.replace('          sbom: true', '          cache-to: type=gha,mode=max\n          sbom: true')))
  assert.equal(result.status, 1)
  assert.match(result.stderr, /without tag-cache exports/)
})

for (const workflow of ['ci', 'release']) {
  test(`${workflow} cannot make checks optional to accelerate releases`, async () => {
    const result = await checkConfiguration((edit) => edit(`.github/workflows/${workflow}.yml`, (source) =>
      source.replace('  verify:\n', '  verify:\n    continue-on-error: true\n')))
    assert.equal(result.status, 1)
    assert.match(result.stderr, /optional/)
  })
}
