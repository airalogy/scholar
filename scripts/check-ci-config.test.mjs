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
      'scripts/check-ci-config.mjs',
      'scripts/run-checks.mjs',
      'package.json',
      '.node-version',
      '.githooks/pre-push',
      'apps/api/package.json',
      'apps/api/Dockerfile',
      'apps/web/Dockerfile',
      'deploy/compose.build.yaml',
      ...(await readdir(path.join(root, '.github/workflows'))).map(
        (name) => `.github/workflows/${name}`,
      ),
    ]
    for (const file of files) {
      await mkdir(path.dirname(path.join(fixture, file)), { recursive: true })
      await copyFile(path.join(root, file), path.join(fixture, file))
    }
    await mutate(async (file, transform) => {
      const target = path.join(fixture, file)
      await writeFile(target, transform(await readFile(target, 'utf8')))
    })
    return spawnSync(process.execPath, [path.join(fixture, 'scripts/check-ci-config.mjs')], {
      encoding: 'utf8',
    })
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
}

test('local, CI and release configuration share the required checks', async () => {
  const result = await checkConfiguration()
  assert.equal(result.status, 0, result.stderr)
})

test('omitting license validation from shared checks is rejected', async () => {
  const result = await checkConfiguration((edit) =>
    edit('scripts/run-checks.mjs', (source) => source.replace(/'license:check',\s*/, '')),
  )
  assert.equal(result.status, 1)
  assert.match(result.stderr, /shared check command must include pnpm license:check/)
})

test('defined but unscheduled groups cannot satisfy full validation coverage', async () => {
  const result = await checkConfiguration((edit) =>
    edit('scripts/run-checks.mjs', (source) =>
      source.replace(
        "export const fullGroups = ['quality', 'api', 'web', 'docs']",
        "export const fullGroups = ['quality', 'api', 'docs']",
      ),
    ),
  )
  assert.equal(result.status, 1)
  assert.match(
    result.stderr,
    /shared check command must include pnpm --filter @airalogy\/scholar-web/,
  )
})

test('quick-only repository checks cannot replace the scheduled quality group', async () => {
  const result = await checkConfiguration((edit) =>
    edit('scripts/run-checks.mjs', (source) =>
      source.replace(
        "quality: [...repositoryChecks, 'test:deployment']",
        "quality: ['test:deployment']",
      ),
    ),
  )
  assert.equal(result.status, 1)
  assert.match(result.stderr, /shared check command must include pnpm license:check/)
})

test('bypassing shared prepush selection is rejected', async () => {
  const result = await checkConfiguration((edit) =>
    edit('package.json', (source) =>
      source.replace('node scripts/run-checks.mjs --pre-push', 'true'),
    ),
  )
  assert.equal(result.status, 1)
  assert.match(result.stderr, /shared scoped\/full check runner/)
})

test('the installed hook must delegate to the shared prepush command', async () => {
  const result = await checkConfiguration((edit) =>
    edit('.githooks/pre-push', (source) =>
      source.replace('node scripts/run-checks.mjs --pre-push', 'pnpm check'),
    ),
  )
  assert.equal(result.status, 1)
  assert.match(result.stderr, /preserve stdin/)
})

for (const workflow of ['release']) {
  for (const command of ['pnpm audit:prod']) {
    test(`${workflow} cannot omit ${command}`, async () => {
      const result = await checkConfiguration((edit) =>
        edit(`.github/workflows/${workflow}.yml`, (source) =>
          source.replace(`      - run: ${command}\n`, ''),
        ),
      )
      assert.equal(result.status, 1)
      assert.ok(result.stderr.includes(`release must run a fresh ${command}`), result.stderr)
    })
  }
}

for (const [description, file, before, after, message] of [
  [
    'native ARM runner',
    '.github/workflows/release.yml',
    'runner: ubuntu-24.04-arm',
    'runner: ubuntu-24.04',
    /runner: ubuntu-24.04-arm/,
  ],
  [
    'both release architectures',
    '.github/workflows/release.yml',
    'arch: [amd64, arm64]',
    'arch: [amd64]',
    /arch: \[amd64, arm64\]/,
  ],
  [
    'verification before builds',
    '.github/workflows/release.yml',
    'needs: verify',
    'needs: []',
    /needs: verify/,
  ],
  [
    'all native checks before index publication',
    '.github/workflows/release.yml',
    'needs: image-platforms',
    'needs: verify',
    /needs: image-platforms/,
  ],
  [
    'index before packaging',
    '.github/workflows/release.yml',
    'needs: images',
    'needs: verify',
    /needs: images/,
  ],
  [
    'native API smoke test',
    '.github/workflows/release.yml',
    'dist/src/scripts/smoke-built-app.js',
    'dist/src/index.js',
    /smoke-built-app/,
  ],
  [
    'native Web smoke test',
    '.github/workflows/release.yml',
    '--entrypoint caddy "$IMAGE" validate',
    '--entrypoint caddy "$IMAGE" version',
    /caddy.*validate/,
  ],
  [
    'multi-platform index verification',
    '.github/workflows/release.yml',
    'sort == ["amd64", "arm64"]',
    'length > 0',
    /sort ==/,
  ],
  [
    'trusted release cache',
    '.github/workflows/release.yml',
    'scope=main-',
    'scope=pr-',
    /scope=main-/,
  ],
  [
    'native image metadata labels',
    '.github/workflows/release.yml',
    '          labels: ${{ steps.metadata.outputs.labels }}\n',
    '',
    /labels: /,
  ],
  [
    'PR cache isolation',
    '.github/workflows/ci.yml',
    "github.event_name == 'push' && 'main' || format('pr-{0}', github.event.pull_request.number)",
    "'main'",
    /format\('pr-/,
  ],
  [
    'full clean-source matrix',
    '.github/workflows/ci.yml',
    'group: [quality, api, web, docs, database]',
    'group: [web]',
    /group:/,
  ],
  [
    'fail-closed aggregate',
    '.github/workflows/ci.yml',
    'length == 3 and all(.[]; .result == "success")',
    'true',
    /length == 3/,
  ],
  [
    'release evidence fallback',
    '.github/workflows/release.yml',
    "if: steps.evidence.outputs.reused == 'false'",
    'if: false',
    /evidence.outputs/,
  ],
  [
    'release evidence verification',
    '.github/workflows/release.yml',
    'run: node scripts/verify-release-ci.mjs',
    'run: echo green',
    /verify-release-ci/,
  ],
  [
    'required PR job identity',
    '.github/workflows/ci.yml',
    '  container-build:',
    '  fast-build:',
    /release acceleration/,
  ],
  [
    'real image build metadata',
    'apps/api/Dockerfile',
    'RUN node scripts/write-build-info.mjs apps/api/dist/build-info.json',
    'RUN true',
    /write-build-info/,
  ],
  [
    'separate runtime dependency layer',
    'apps/api/Dockerfile',
    '/opt/scholar-api/node_modules/ ./node_modules/',
    '/opt/scholar-api/ ./',
    /node_modules/,
  ],
]) {
  test(`release acceleration retains ${description}`, async () => {
    const result = await checkConfiguration((edit) =>
      edit(file, (source) => {
        assert.ok(source.includes(before), `Missing mutation target: ${before}`)
        return source.replace(before, after)
      }),
    )
    assert.equal(result.status, 1, result.stdout)
    assert.match(result.stderr, message)
  })
}

for (const component of ['api', 'web']) {
  test(`${component} fetch layer cannot depend on a product version change`, async () => {
    const result = await checkConfiguration((edit) =>
      edit(`apps/${component}/Dockerfile`, (source) =>
        source.replace(
          'COPY pnpm-lock.yaml pnpm-workspace.yaml ./',
          'COPY pnpm-lock.yaml pnpm-workspace.yaml VERSION ./',
        ),
      ),
    )
    assert.equal(result.status, 1)
    assert.match(result.stderr, /fetch must depend only on the lockfile/)
  })
  test(`${component} cannot silently download dependencies during installation`, async () => {
    const result = await checkConfiguration((edit) =>
      edit(`apps/${component}/Dockerfile`, (source) =>
        source.replace(
          'pnpm install --offline --frozen-lockfile',
          'pnpm install --frozen-lockfile',
        ),
      ),
    )
    assert.equal(result.status, 1)
    assert.match(result.stderr, /offline and frozen/)
  })
}

test('release does not spend time exporting tag-scoped caches', async () => {
  const result = await checkConfiguration((edit) =>
    edit('.github/workflows/release.yml', (source) =>
      source.replace(
        '          sbom: true',
        '          cache-to: type=gha,mode=max\n          sbom: true',
      ),
    ),
  )
  assert.equal(result.status, 1)
  assert.match(result.stderr, /without tag-cache exports/)
})

for (const workflow of ['ci', 'release']) {
  test(`${workflow} cannot make checks optional to accelerate releases`, async () => {
    const result = await checkConfiguration((edit) =>
      edit(`.github/workflows/${workflow}.yml`, (source) =>
        source.replace('  verify:\n', '  verify:\n    continue-on-error: true\n'),
      ),
    )
    assert.equal(result.status, 1)
    assert.match(result.stderr, /optional/)
  })
}
