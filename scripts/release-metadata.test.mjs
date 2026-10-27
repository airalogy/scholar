import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test, { after } from 'node:test'
import { createReleaseMetadata } from './release-metadata-lib.mjs'

const repositoryRoot = path.resolve(import.meta.dirname, '..')
const version = (await readFile(path.join(repositoryRoot, 'VERSION'), 'utf8')).trim()
const releaseTag = `v${version}`
const digest = (character) => `sha256:${character.repeat(64)}`
const fixtureRoots = []

const readLatestMigration = async () => {
  const migrationsDirectory = path.join(repositoryRoot, 'apps', 'api', 'prisma', 'migrations')
  const entries = await readdir(migrationsDirectory, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .at(-1)
}

after(async () => {
  await Promise.all(fixtureRoots.map((root) => rm(root, { recursive: true, force: true })))
})

const prepareFixture = async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'scholar-release-metadata-'))
  fixtureRoots.push(root)
  const metadataDirectory = path.join(root, 'metadata')
  const outputDirectory = path.join(root, 'output')
  await Promise.all([mkdir(metadataDirectory), mkdir(outputDirectory)])
  await Promise.all([
    writeFile(
      path.join(metadataDirectory, 'api.repository'),
      'ghcr.io/airalogy/scholar-api\n',
    ),
    writeFile(path.join(metadataDirectory, 'api.digest'), `${digest('a')}\n`),
    writeFile(
      path.join(metadataDirectory, 'web.repository'),
      'ghcr.io/airalogy/scholar-web\n',
    ),
    writeFile(path.join(metadataDirectory, 'web.digest'), `${digest('b')}\n`),
  ])
  return { root, metadataDirectory, outputDirectory }
}

test('release metadata binds one product version to exact component digests', async () => {
  const fixture = await prepareFixture()
  const result = await createReleaseMetadata({
    repositoryRoot,
    metadataDirectory: fixture.metadataDirectory,
    outputDirectory: fixture.outputDirectory,
    envTemplatePath: path.join(repositoryRoot, 'deploy', '.env.example'),
    releaseTag,
    gitCommit: 'c'.repeat(40),
    createdAt: '2026-08-12T12:00:00Z',
  })

  assert.equal(result.manifest.productVersion, version)
  assert.deepEqual(result.manifest.documentation, {
    bundledIn: 'web',
    sitePath: '/docs/',
    openApiPath: '/api/docs',
  })
  assert.equal(result.manifest.database.migration, await readLatestMigration())
  assert.equal(
    result.manifest.components.api.deploymentReference,
    `ghcr.io/airalogy/scholar-api:${version}@${digest('a')}`,
  )

  const manifestJson = await readFile(
    path.join(fixture.outputDirectory, 'release-manifest.json'),
    'utf8',
  )
  const releaseEnv = await readFile(
    path.join(fixture.outputDirectory, 'release-manifest.env'),
    'utf8',
  )
  const renderedEnv = await readFile(path.join(fixture.outputDirectory, '.env.example'), 'utf8')
  const checksum = createHash('sha256').update(manifestJson).digest('hex')

  assert.match(releaseEnv, new RegExp(`SCHOLAR_RELEASE_MANIFEST_SHA256=${checksum}`))
  assert.ok(releaseEnv.split('\n').includes(`SCHOLAR_RELEASE_PRODUCT_VERSION=${version}`))
  assert.ok(
    releaseEnv.split('\n').includes(
      `SCHOLAR_RELEASE_API_TAGGED_IMAGE=ghcr.io/airalogy/scholar-api:${version}`,
    ),
  )
  assert.match(renderedEnv, new RegExp(`SCHOLAR_API_IMAGE=.*@${digest('a')}`))
  assert.match(renderedEnv, /SCHOLAR_RELEASE_METADATA_REQUIRED=true/)
})

test('release metadata rejects an invalid image digest', async () => {
  const fixture = await prepareFixture()
  await writeFile(path.join(fixture.metadataDirectory, 'api.digest'), 'sha256:not-a-digest\n')

  await assert.rejects(
    createReleaseMetadata({
      repositoryRoot,
      metadataDirectory: fixture.metadataDirectory,
      outputDirectory: fixture.outputDirectory,
      envTemplatePath: path.join(repositoryRoot, 'deploy', '.env.example'),
      releaseTag,
      gitCommit: 'c'.repeat(40),
      createdAt: '2026-08-12T12:00:00Z',
    }),
    /api digest must be a sha256 digest/,
  )
})

test('release metadata rejects a tag that differs from the product version', async () => {
  const fixture = await prepareFixture()
  await assert.rejects(
    createReleaseMetadata({
      repositoryRoot,
      metadataDirectory: fixture.metadataDirectory,
      outputDirectory: fixture.outputDirectory,
      envTemplatePath: path.join(repositoryRoot, 'deploy', '.env.example'),
      releaseTag: `${releaseTag}-mismatch`,
      gitCommit: 'c'.repeat(40),
      createdAt: '2026-08-12T12:00:00Z',
    }),
    /does not match VERSION/,
  )
})

test('administrator recovery rejects non-interactive input before invoking containers', async () => {
  const fixture = await prepareFixture()
  const envPath = path.join(fixture.root, '.env')
  await writeFile(envPath, `SCHOLAR_VERSION=${version}\nINSTITUTION_SLUG=example\n`)
  assert.throws(() => execFileSync('sh', [path.join(repositoryRoot, 'deploy', 'scholarctl'), 'recover-admin'], {
    cwd: repositoryRoot,
    env: { ...process.env, SCHOLAR_ENV_FILE: envPath, SCHOLAR_STATE_DIR: path.join(fixture.root, 'state') },
    encoding: 'utf8', stdio: 'pipe',
  }), /requires an interactive terminal/)
  const source = await readFile(path.join(repositoryRoot, 'deploy', 'scholarctl'), 'utf8')
  const recovery = source.slice(source.indexOf('recover_admin() {'), source.indexOf('\nusage() {'))
  assert.match(recovery, /stty -echo/)
  assert.match(recovery, /printf '%s\\000'/)
  assert.match(recovery, /--no-deps -T --entrypoint node api dist\/src\/scripts\/recover-administrator.js/)
  assert.doesNotMatch(recovery, /-e .*PASSWORD|--password/)
})

test('deployment write operations reject a concurrent operation lock', async () => {
  const fixture = await prepareFixture()
  const envPath = path.join(fixture.root, '.env')
  const stateDirectory = path.join(fixture.root, 'state')
  await writeFile(envPath, `SCHOLAR_VERSION=${version}\n`)
  await mkdir(path.join(stateDirectory, 'operation.lock'), { recursive: true })

  assert.throws(
    () =>
      execFileSync('sh', [path.join(repositoryRoot, 'deploy', 'scholarctl'), 'backup'], {
        cwd: repositoryRoot,
        env: {
          ...process.env,
          SCHOLAR_ENV_FILE: envPath,
          SCHOLAR_STATE_DIR: stateDirectory,
        },
        encoding: 'utf8',
        stdio: 'pipe',
      }),
    /Another Scholar prepare, install, upgrade, backup, bootstrap, or recovery operation is already running/,
  )
})

// The fake engine has no network or database access. Unknown commands fail closed.
const prepareDeploymentFixture = async () => {
  const fixture = await prepareFixture()
  const { manifest } = await createReleaseMetadata({
    repositoryRoot,
    metadataDirectory: fixture.metadataDirectory,
    outputDirectory: fixture.outputDirectory,
    envTemplatePath: path.join(repositoryRoot, 'deploy', '.env.example'),
    releaseTag,
    gitCommit: 'c'.repeat(40),
    createdAt: '2026-08-12T12:00:00Z',
  })
  const envPath = path.join(fixture.outputDirectory, '.env')
  const template = await readFile(path.join(fixture.outputDirectory, '.env.example'), 'utf8')
  const configured = template
    .replaceAll('replace-with-a-long-random-database-password', 'synthetic-database-password')
    .replace('replace-with-at-least-32-random-characters', 'a'.repeat(48))
    .replace('INSTITUTION_SLUG=replace-with-institution-slug', 'INSTITUTION_SLUG=release-test')
    .replace('ENABLE_AI_CHAT=true', 'ENABLE_AI_CHAT=false')
  await writeFile(envPath, configured)
  const fakeBin = path.join(fixture.root, 'bin')
  await mkdir(fakeBin)
  const cachePath = path.join(fixture.root, 'images.json')
  const logPath = path.join(fixture.root, 'docker.log')
  const statePath = path.join(fixture.root, 'engine-state.json')
  const backupDirectory = path.join(fixture.root, 'backups')
  const stateDirectory = path.join(fixture.root, 'state')
  const imageReferences = Object.values(manifest.components).map((component) => component.deploymentReference)
  await writeFile(cachePath, '{}')
  await writeFile(statePath, '{}')
  await writeFile(logPath, '')
  const fakeDocker = path.join(fakeBin, 'docker')
  await writeFile(fakeDocker, `#!${process.execPath}
const fs = require('node:fs')
const args = process.argv.slice(2)
const command = args.join(' ')
const env = process.env
fs.appendFileSync(env.FAKE_LOG, command + '\\n')
const cache = JSON.parse(fs.readFileSync(env.FAKE_CACHE, 'utf8'))
const state = JSON.parse(fs.readFileSync(env.FAKE_STATE, 'utf8'))
const fail = (message) => { process.stderr.write(message + '\\n'); process.exit(9) }
const output = (value) => { process.stdout.write(value + '\\n'); process.exit(0) }
if (args[0] === 'version') output('linux/arm64')
if (args[0] === 'pull') {
  if (env.FAKE_FAIL === 'pull') fail('synthetic download failure')
  cache[args.at(-1)] = env.FAKE_FAIL === 'platform' ? 'linux/amd64' : 'linux/arm64'
  fs.writeFileSync(env.FAKE_CACHE, JSON.stringify(cache))
  output('pulled')
}
if (args[0] === 'image' && args[1] === 'inspect') {
  const image = args.at(-1)
  if (!cache[image]) fail('not present')
  if (command.includes('.Architecture')) output(cache[image])
  if (command.includes('image.version')) output(env.FAKE_FAIL === 'label' ? '0.0.0' : env.FAKE_VERSION)
  if (command.includes('image.revision')) output(env.FAKE_FAIL === 'commit' ? 'd'.repeat(40) : 'c'.repeat(40))
  output('{}')
}
if (args[0] === 'inspect') output('example.invalid/previous-image@sha256:' + 'e'.repeat(64))
if (args[0] !== 'compose') fail('unexpected Docker command: ' + command)
if (args[1] === 'version') output('Docker Compose version v2.test')
if (command.endsWith('config --images')) {
  if (env.FAKE_FAIL === 'config') fail('synthetic Compose failure')
  const images = env.SCHOLAR_API_IMAGE
    ? [env.SCHOLAR_API_IMAGE, env.SCHOLAR_WEB_IMAGE, env.POSTGRES_IMAGE]
    : JSON.parse(env.FAKE_IMAGES)
  output(images.join('\\n'))
}
if (command.endsWith('config --quiet')) process.exit(0)
if (/ ps -q (api|web)$/.test(command)) output('previous-container')
if (command.includes('pg_dump')) {
  if (env.FAKE_FAIL === 'database-backup') fail('synthetic database backup failure')
  if (env.FAKE_FAIL === 'empty-backup') process.exit(0)
  output('synthetic database backup')
}
if (command.includes('tar -C')) {
  if (env.FAKE_FAIL === 'uploads-backup') fail('synthetic upload backup failure')
  output('synthetic upload backup')
}
if (command.endsWith('stop web api')) {
  if (env.FAKE_FAIL === 'stop') fail('synthetic stop failure')
  process.exit(0)
}
if (command.endsWith('start api web')) process.exit(0)
if (command.includes(' up -d --wait')) {
  if (!command.endsWith('--pull never')) fail('startup must not pull images')
  if (env.FAKE_FAIL === 'start') fail('synthetic startup failure')
  state.started = true
  fs.writeFileSync(env.FAKE_STATE, JSON.stringify(state))
  process.exit(0)
}
if (command.includes('audit-data-integrity.js')) {
  if (env.FAKE_FAIL === 'audit') fail('synthetic integrity failure')
  output('integrity passed')
}
if (command.includes('/api/version')) {
  output(JSON.stringify({
    version: state.started && env.FAKE_FAIL !== 'running-version' ? env.FAKE_VERSION : '0.0.0',
    tag: env.FAKE_TAG,
    commit: 'c'.repeat(40)
  }))
}
fail('unexpected Compose command: ' + command)
`)
  await chmod(fakeDocker, 0o755)
  const run = (command, environment = {}) => spawnSync('sh', [path.join(repositoryRoot, 'deploy', 'scholarctl'), command], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH}`,
      SCHOLAR_ENV_FILE: envPath,
      SCHOLAR_STATE_DIR: stateDirectory,
      SCHOLAR_BACKUP_DIR: backupDirectory,
      SCHOLAR_RELEASE_MANIFEST_FILE: path.join(fixture.outputDirectory, 'release-manifest.json'),
      SCHOLAR_RELEASE_METADATA_FILE: path.join(fixture.outputDirectory, 'release-manifest.env'),
      FAKE_CACHE: cachePath,
      FAKE_STATE: statePath,
      FAKE_LOG: logPath,
      FAKE_IMAGES: JSON.stringify(imageReferences),
      FAKE_VERSION: version,
      FAKE_TAG: releaseTag,
      ...environment,
    },
    encoding: 'utf8',
  })
  const log = () => readFile(logPath, 'utf8')
  const clearLog = () => writeFile(logPath, '')
  const seedCache = (images = imageReferences, platform = 'linux/arm64') =>
    writeFile(cachePath, JSON.stringify(Object.fromEntries(images.map((image) => [image, platform]))))
  const upgradeRecord = async () => {
    const files = await readdir(path.join(stateDirectory, 'upgrades'))
    assert.equal(files.length, 1)
    return readFile(path.join(stateDirectory, 'upgrades', files[0]), 'utf8')
  }
  return { ...fixture, run, log, clearLog, seedCache, upgradeRecord, envPath, configured, stateDirectory, backupDirectory, imageReferences }
}

test('prepare is repeatable, reuses exact native digests, and never changes services or data', async () => {
  const fixture = await prepareDeploymentFixture()
  const first = fixture.run('prepare')
  assert.equal(first.status, 0, first.stderr)
  assert.equal((await fixture.log()).split('\n').filter((line) => line.startsWith('pull ')).length, 3)
  assert.match(first.stdout, /Stage images finished in \d+s \(exit 0\)/)
  await fixture.clearLog()
  const second = fixture.run('prepare')
  assert.equal(second.status, 0, second.stderr)
  assert.match(second.stdout, /Upgrade still requires a fresh backup/)
  assert.doesNotMatch(await fixture.log(), /(?:^pull | stop | start | up | exec | run )/m)
  assert.equal(await readFile(fixture.envPath, 'utf8'), fixture.configured)
  assert.deepEqual(await readdir(fixture.stateDirectory), [])
})

test('prepare shares the deployment operation lock', async () => {
  const fixture = await prepareDeploymentFixture()
  await mkdir(path.join(fixture.stateDirectory, 'operation.lock'), { recursive: true })
  const result = fixture.run('prepare')
  assert.equal(result.status, 1)
  assert.match(result.stderr, /already running/)
  assert.equal(await fixture.log(), '')
})

for (const failure of ['pull', 'platform', 'config', 'label', 'commit']) {
  test(`upgrade rejects ${failure} failure before stopping services`, async () => {
    const fixture = await prepareDeploymentFixture()
    const result = fixture.run('upgrade', { FAKE_FAIL: failure })
    assert.notEqual(result.status, 0, result.stdout)
    assert.doesNotMatch(await fixture.log(), / stop | up |pg_dump|tar -C/)
    assert.deepEqual(await readdir(fixture.stateDirectory), [])
  })
}

test('upgrade revalidates prepared image labels instead of trusting a prepare marker', async () => {
  const fixture = await prepareDeploymentFixture()
  assert.equal(fixture.run('prepare').status, 0)
  await fixture.clearLog()
  const result = fixture.run('upgrade', { FAKE_FAIL: 'label' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /image reports version/)
  assert.doesNotMatch(await fixture.log(), /^pull | stop | up /m)
})

test('wrong-architecture local images are fetched again rather than silently emulated', async () => {
  const fixture = await prepareDeploymentFixture()
  await fixture.seedCache(fixture.imageReferences, 'linux/amd64')
  const result = fixture.run('prepare')
  assert.equal(result.status, 0, result.stderr)
  assert.equal((await fixture.log()).split('\n').filter((line) => line.startsWith('pull --platform linux/arm64 ')).length, 3)
})

test('offline preparation never downloads, rejects missing or wrong-architecture images, and verifies labels', async () => {
  const fixture = await prepareDeploymentFixture()
  const offline = { SCHOLAR_OFFLINE: 'true' }
  assert.match(fixture.run('prepare', offline).stderr, /Offline image is not loaded/)
  const tags = fixture.imageReferences.map((image) => image.split('@')[0])
  await fixture.seedCache(tags, 'linux/amd64')
  assert.match(fixture.run('prepare', offline).stderr, /does not match Docker server/)
  await fixture.seedCache(tags)
  assert.match(fixture.run('prepare', { ...offline, FAKE_FAIL: 'label' }).stderr, /image reports version/)
  const result = fixture.run('prepare', offline)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /offline mode/)
  assert.doesNotMatch(await fixture.log(), /^pull | stop | up /m)
})

test('preparation cannot bypass the release manifest checksum', async () => {
  const fixture = await prepareDeploymentFixture()
  const manifestPath = path.join(fixture.outputDirectory, 'release-manifest.json')
  await writeFile(manifestPath, `${await readFile(manifestPath, 'utf8')} `)
  const result = fixture.run('prepare')
  assert.equal(result.status, 1)
  assert.match(result.stderr, /checksum does not match/)
  assert.doesNotMatch(await fixture.log(), /^pull /m)
})

test('prepared upgrade still stops writes, backs up both stores, and verifies the running release', async () => {
  const fixture = await prepareDeploymentFixture()
  assert.equal(fixture.run('prepare').status, 0)
  await fixture.clearLog()
  const result = fixture.run('upgrade')
  assert.equal(result.status, 0, result.stderr)
  const log = await fixture.log()
  assert.doesNotMatch(log, /^pull /m)
  const phases = [' stop web api', 'pg_dump', 'tar -C', ' up -d --wait --pull never', 'audit-data-integrity.js']
  let previousIndex = -1
  for (const phase of phases) {
    const index = log.indexOf(phase)
    assert.ok(index > previousIndex, `Wrong phase order: ${phase}`)
    previousIndex = index
  }
  assert.match(log, /run --rm --no-deps --pull never --entrypoint sh/)
  assert.equal((await readdir(fixture.backupDirectory)).length, 2)
  const record = await fixture.upgradeRecord()
  assert.match(record, /SCHOLAR_UPGRADE_STATUS_EVENT=backed_up/)
  assert.match(record, /SCHOLAR_UPGRADE_STATUS_EVENT=succeeded/)
  assert.match(record, /SCHOLAR_DATABASE_BACKUP=.*\.dump/)
  assert.match(record, /SCHOLAR_UPLOADS_BACKUP=.*\.tar\.gz/)
  for (const stage of ['preflight', 'images', 'image-verification', 'stop', 'backup', 'start', 'integrity-audit', 'release-verification']) {
    assert.match(result.stdout, new RegExp(`Stage ${stage} finished in \\d+s \\(exit 0\\)`))
  }
  assert.equal(await readFile(fixture.envPath, 'utf8'), fixture.configured)
})

for (const failure of ['database-backup', 'empty-backup', 'uploads-backup']) {
  test(`${failure} failure preserves the old service and prevents migration`, async () => {
    const fixture = await prepareDeploymentFixture()
    await fixture.seedCache()
    const result = fixture.run('upgrade', { FAKE_FAIL: failure })
    assert.equal(result.status, 1)
    assert.match(result.stdout, /Stage backup finished in \d+s \(exit 1\)/)
    assert.match(await fixture.log(), / start api web/)
    assert.doesNotMatch(await fixture.log(), / up |audit-data-integrity/)
    assert.match(await fixture.upgradeRecord(), /SCHOLAR_UPGRADE_STATUS_EVENT=backup_failed/)
  })
}

test('a failed shutdown cannot proceed to backup or startup', async () => {
  const fixture = await prepareDeploymentFixture()
  await fixture.seedCache()
  const result = fixture.run('upgrade', { FAKE_FAIL: 'stop' })
  assert.notEqual(result.status, 0)
  assert.match(result.stdout, /Stage stop finished in \d+s \(exit 9\)/)
  assert.doesNotMatch(await fixture.log(), /pg_dump|tar -C| up /)
})

for (const [failure, status] of [['start', 'deployment_failed'], ['audit', 'integrity_audit_failed'], ['running-version', 'release_verification_failed']]) {
  test(`${failure} failure retains recovery records without unsafe automatic downgrade`, async () => {
    const fixture = await prepareDeploymentFixture()
    await fixture.seedCache()
    const result = fixture.run('upgrade', { FAKE_FAIL: failure })
    assert.equal(result.status, 1)
    const record = await fixture.upgradeRecord()
    assert.match(record, new RegExp(`SCHOLAR_UPGRADE_STATUS_EVENT=${status}`))
    assert.doesNotMatch(record, /SCHOLAR_UPGRADE_STATUS_EVENT=succeeded/)
    assert.doesNotMatch(await fixture.log(), / start api web/)
    assert.equal((await readdir(fixture.backupDirectory)).length, 2)
    assert.ok(!(await readdir(fixture.stateDirectory)).includes('current-release.env'))
  })
}

test('external backups still require explicit confirmation after prepare', async () => {
  const fixture = await prepareDeploymentFixture()
  assert.equal(fixture.run('prepare').status, 0)
  for (const environment of [{ SCHOLAR_DATABASE_MODE: 'external' }, { STORAGE_PROVIDER: 'oss' }]) {
    await fixture.clearLog()
    const result = fixture.run('upgrade', environment)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /BACKUP_CONFIRMED=true/)
    assert.doesNotMatch(await fixture.log(), / stop | up /)
  }
})

test('deployment preflight accepts one release set and rejects mixed component digests', async () => {
  const fixture = await prepareFixture()
  await createReleaseMetadata({
    repositoryRoot,
    metadataDirectory: fixture.metadataDirectory,
    outputDirectory: fixture.outputDirectory,
    envTemplatePath: path.join(repositoryRoot, 'deploy', '.env.example'),
    releaseTag,
    gitCommit: 'c'.repeat(40),
    createdAt: '2026-08-12T12:00:00Z',
  })

  const fakeBin = path.join(fixture.root, 'bin')
  const fakeDocker = path.join(fakeBin, 'docker')
  await mkdir(fakeBin)
  await writeFile(
    fakeDocker,
    `#!/bin/sh
if [ -n "$FAKE_DOCKER_LOG" ]; then
  printf '%s\\n' "$*" >>"$FAKE_DOCKER_LOG"
fi
case "$*" in
  *"network ls -q"*)
    if [ -n "$FAKE_DOCKER_NETWORK_ROWS" ]; then
      printf '%s\\n' fake-network
    fi
    ;;
  *"network inspect"*)
    printf '%s\\n' "$FAKE_DOCKER_NETWORK_ROWS"
    ;;
  *"config --images"*)
    if [ -n "$SCHOLAR_API_IMAGE" ]; then
      case "$SCHOLAR_API_IMAGE" in
        *@*) exit 9 ;;
      esac
      printf '%s\\n' "$SCHOLAR_API_IMAGE" "$SCHOLAR_WEB_IMAGE" "$POSTGRES_IMAGE"
    else
      printf '%s\\n' 'example.invalid/image@${digest('d')}'
    fi
    ;;
esac
exit 0
`,
  )
  await chmod(fakeDocker, 0o755)
  const fakeIp = path.join(fakeBin, 'ip')
  await writeFile(
    fakeIp,
    `#!/bin/sh
case "$*" in
  "-o -4 route show") printf '%s\\n' "$FAKE_IP_ROUTES" ;;
esac
`,
  )
  await chmod(fakeIp, 0o755)

  const envPath = path.join(fixture.outputDirectory, '.env')
  const rendered = await readFile(path.join(fixture.outputDirectory, '.env.example'), 'utf8')
  const configured = rendered
    .replace('replace-with-a-long-random-database-password', 'release-test-database-password')
    .replace('replace-with-a-long-random-database-password', 'release-test-database-password')
    .replace('replace-with-at-least-32-random-characters', 'a'.repeat(48))
    .replace('INSTITUTION_SLUG=replace-with-institution-slug', 'INSTITUTION_SLUG=release-test')
    .replace('OPENAI_BASE_URL=', 'OPENAI_BASE_URL=https://models.example.invalid/v1')
    .replace('OPENAI_API_KEY=', 'OPENAI_API_KEY=release-test-model-key')
  await writeFile(envPath, configured)

  const commandEnvironment = {
    ...process.env,
    PATH: `${fakeBin}:${process.env.PATH}`,
    SCHOLAR_ENV_FILE: envPath,
    SCHOLAR_RELEASE_MANIFEST_FILE: path.join(fixture.outputDirectory, 'release-manifest.json'),
    SCHOLAR_RELEASE_METADATA_FILE: path.join(fixture.outputDirectory, 'release-manifest.env'),
  }
  const runPreflight = (environment = {}) =>
    execFileSync('sh', [path.join(repositoryRoot, 'deploy', 'scholarctl'), 'preflight'], {
      cwd: repositoryRoot,
      env: { ...commandEnvironment, ...environment },
      encoding: 'utf8',
      stdio: 'pipe',
    })
  const output = execFileSync(
    'sh',
    [path.join(repositoryRoot, 'deploy', 'scholarctl'), 'preflight'],
    {
      cwd: repositoryRoot,
      env: commandEnvironment,
      encoding: 'utf8',
    },
  )
  assert.ok(output.includes(`Preflight passed for Scholar ${version}`))

  const offlineOutput = execFileSync(
    'sh',
    [path.join(repositoryRoot, 'deploy', 'scholarctl'), 'preflight'],
    {
      cwd: repositoryRoot,
      env: { ...commandEnvironment, SCHOLAR_OFFLINE: 'true' },
      encoding: 'utf8',
    },
  )
  assert.ok(offlineOutput.includes(`Preflight passed for Scholar ${version}`))

  await writeFile(
    envPath,
    configured.replace('OPENAI_API_KEY=release-test-model-key', 'OPENAI_API_KEY='),
  )
  assert.throws(
    () =>
      execFileSync('sh', [path.join(repositoryRoot, 'deploy', 'scholarctl'), 'preflight'], {
        cwd: repositoryRoot,
        env: commandEnvironment,
        encoding: 'utf8',
        stdio: 'pipe',
      }),
    /OPENAI_API_KEY must contain at least 1 characters/,
  )
  await writeFile(envPath, configured)

  const configuredWithInstitutionSso = configured
    .replace('ENABLE_INSTITUTION_LOGIN=false', 'ENABLE_INSTITUTION_LOGIN=true')
    .replace('INSTITUTION_SSO_ENABLED=false', 'INSTITUTION_SSO_ENABLED=true')
    .replace(
      'INSTITUTION_SSO_AUTHORIZATION_URL=',
      'INSTITUTION_SSO_AUTHORIZATION_URL=https://identity.example.invalid/oauth/authorize',
    )
    .replace(
      'INSTITUTION_SSO_TOKEN_URL=',
      'INSTITUTION_SSO_TOKEN_URL=https://identity.example.invalid/oauth/token',
    )
    .replace(
      'INSTITUTION_SSO_USERINFO_URL=',
      'INSTITUTION_SSO_USERINFO_URL=https://identity.example.invalid/oauth/userinfo',
    )
    .replace('INSTITUTION_SSO_CLIENT_ID=', 'INSTITUTION_SSO_CLIENT_ID=scholar-client')
    .replace(
      'INSTITUTION_SSO_CLIENT_SECRET=',
      'INSTITUTION_SSO_CLIENT_SECRET=institution-sso-test-secret',
    )
  await writeFile(envPath, configuredWithInstitutionSso)
  const institutionSsoOutput = execFileSync(
    'sh',
    [path.join(repositoryRoot, 'deploy', 'scholarctl'), 'preflight'],
    {
      cwd: repositoryRoot,
      env: commandEnvironment,
      encoding: 'utf8',
    },
  )
  assert.ok(institutionSsoOutput.includes(`Preflight passed for Scholar ${version}`))

  await writeFile(
    envPath,
    configuredWithInstitutionSso.replace(
      'INSTITUTION_SSO_CLIENT_SECRET=institution-sso-test-secret',
      'INSTITUTION_SSO_CLIENT_SECRET=',
    ),
  )
  assert.throws(
    () =>
      execFileSync('sh', [path.join(repositoryRoot, 'deploy', 'scholarctl'), 'preflight'], {
        cwd: repositoryRoot,
        env: commandEnvironment,
        encoding: 'utf8',
        stdio: 'pipe',
      }),
    /INSTITUTION_SSO_CLIENT_SECRET must contain at least 1 characters/,
  )
  await writeFile(envPath, configured)

  const configuredWithDockerNetwork = configured
    .replace('SCHOLAR_DOCKER_SUBNET=', 'SCHOLAR_DOCKER_SUBNET=172.30.20.0/24')
    .replace('SCHOLAR_DOCKER_GATEWAY=', 'SCHOLAR_DOCKER_GATEWAY=172.30.20.1')
    .replace(
      'SCHOLAR_RESERVED_SUBNETS=',
      'SCHOLAR_RESERVED_SUBNETS=10.0.0.0/8,192.168.0.0/16',
    )
  const dockerLog = path.join(fixture.root, 'docker.log')
  await writeFile(envPath, configuredWithDockerNetwork)
  const networkOutput = runPreflight({
    FAKE_DOCKER_LOG: dockerLog,
    FAKE_IP_ROUTES: 'default via 192.0.2.1 dev eth0\n192.0.2.0/24 dev eth0',
  })
  assert.match(networkOutput, /Docker network preflight passed for 172\.30\.20\.0\/24/)
  assert.match(await readFile(dockerLog, 'utf8'), /compose\.network\.yaml/)

  await writeFile(
    envPath,
    configuredWithDockerNetwork.replace(
      'SCHOLAR_DOCKER_GATEWAY=172.30.20.1',
      'SCHOLAR_DOCKER_GATEWAY=172.31.20.1',
    ),
  )
  assert.throws(
    () => runPreflight({ FAKE_IP_ROUTES: 'default via 192.0.2.1 dev eth0' }),
    /SCHOLAR_DOCKER_GATEWAY must be a usable address inside SCHOLAR_DOCKER_SUBNET/,
  )

  await writeFile(
    envPath,
    configuredWithDockerNetwork.replace(
      'SCHOLAR_RESERVED_SUBNETS=10.0.0.0/8,192.168.0.0/16',
      'SCHOLAR_RESERVED_SUBNETS=172.30.0.0/16',
    ),
  )
  assert.throws(
    () => runPreflight({ FAKE_IP_ROUTES: 'default via 192.0.2.1 dev eth0' }),
    /overlaps reserved subnet 172\.30\.0\.0\/16/,
  )

  await writeFile(envPath, configuredWithDockerNetwork)
  assert.throws(
    () =>
      runPreflight({
        FAKE_IP_ROUTES:
          'default via 192.0.2.1 dev eth0\n172.30.20.0/24 via 192.0.2.1 dev eth0',
      }),
    /overlaps host route 172\.30\.20\.0\/24/,
  )
  assert.throws(
    () =>
      runPreflight({
        FAKE_DOCKER_NETWORK_ROWS: 'other|default|other_default|172.30.20.0/24 ',
        FAKE_IP_ROUTES: 'default via 192.0.2.1 dev eth0',
      }),
    /overlaps Docker network other_default \(172\.30\.20\.0\/24\)/,
  )

  const existingNetworkOutput = runPreflight({
    FAKE_DOCKER_NETWORK_ROWS: 'scholar|default|scholar_default|172.30.20.0/24 ',
    FAKE_IP_ROUTES: 'default via 192.0.2.1 dev eth0\n172.30.20.0/24 dev br-test',
  })
  assert.match(existingNetworkOutput, /Docker network preflight passed/)
  assert.throws(
    () =>
      runPreflight({
        FAKE_DOCKER_NETWORK_ROWS: 'scholar|default|scholar_default|172.30.21.0/24 ',
        FAKE_IP_ROUTES: 'default via 192.0.2.1 dev eth0\n172.30.21.0/24 dev br-test',
      }),
    /Existing Scholar network scholar_default uses 172\.30\.21\.0\/24/,
  )
  await writeFile(envPath, configured)

  const manifestPath = path.join(fixture.outputDirectory, 'release-manifest.json')
  const manifestJson = await readFile(manifestPath, 'utf8')
  await writeFile(manifestPath, `${manifestJson} `)
  assert.throws(
    () =>
      execFileSync('sh', [path.join(repositoryRoot, 'deploy', 'scholarctl'), 'preflight'], {
        cwd: repositoryRoot,
        env: commandEnvironment,
        encoding: 'utf8',
        stdio: 'pipe',
      }),
    /release-manifest\.json checksum does not match release-manifest\.env/,
  )
  await writeFile(manifestPath, manifestJson)

  await writeFile(
    envPath,
    configured.replace(
      `SCHOLAR_WEB_IMAGE=ghcr.io/airalogy/scholar-web:${version}@${digest('b')}`,
      `SCHOLAR_WEB_IMAGE=ghcr.io/airalogy/scholar-web:${version}@${digest('e')}`,
    ),
  )
  assert.throws(
    () =>
      execFileSync('sh', [path.join(repositoryRoot, 'deploy', 'scholarctl'), 'preflight'], {
        cwd: repositoryRoot,
        env: commandEnvironment,
        encoding: 'utf8',
        stdio: 'pipe',
      }),
    /SCHOLAR_WEB_IMAGE digest does not match the Scholar release manifest/,
  )
})
