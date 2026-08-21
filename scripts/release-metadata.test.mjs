import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test, { after } from 'node:test'
import { createReleaseMetadata } from './release-metadata-lib.mjs'

const repositoryRoot = path.resolve(import.meta.dirname, '..')
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
    releaseTag: 'v3.0.0',
    gitCommit: 'c'.repeat(40),
    createdAt: '2026-08-12T12:00:00Z',
  })

  assert.equal(result.manifest.productVersion, '3.0.0')
  assert.deepEqual(result.manifest.documentation, {
    bundledIn: 'web',
    sitePath: '/docs/',
    openApiPath: '/api/docs',
  })
  assert.equal(result.manifest.database.migration, await readLatestMigration())
  assert.equal(
    result.manifest.components.api.deploymentReference,
    `ghcr.io/airalogy/scholar-api:3.0.0@${digest('a')}`,
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
  assert.match(releaseEnv, /SCHOLAR_RELEASE_PRODUCT_VERSION=3\.0\.0/)
  assert.match(
    releaseEnv,
    /SCHOLAR_RELEASE_API_TAGGED_IMAGE=ghcr\.io\/airalogy\/scholar-api:3\.0\.0/,
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
      releaseTag: 'v3.0.0',
      gitCommit: 'c'.repeat(40),
      createdAt: '2026-08-12T12:00:00Z',
    }),
    /api digest must be a sha256 digest/,
  )
})

test('deployment write operations reject a concurrent operation lock', async () => {
  const fixture = await prepareFixture()
  const envPath = path.join(fixture.root, '.env')
  const stateDirectory = path.join(fixture.root, 'state')
  await writeFile(envPath, 'SCHOLAR_VERSION=3.0.0\n')
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
    /Another Scholar install, upgrade, backup, or bootstrap operation is already running/,
  )
})

test('deployment preflight accepts one release set and rejects mixed component digests', async () => {
  const fixture = await prepareFixture()
  await createReleaseMetadata({
    repositoryRoot,
    metadataDirectory: fixture.metadataDirectory,
    outputDirectory: fixture.outputDirectory,
    envTemplatePath: path.join(repositoryRoot, 'deploy', '.env.example'),
    releaseTag: 'v3.0.0',
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
  assert.match(output, /Preflight passed for Scholar 3\.0\.0/)

  const offlineOutput = execFileSync(
    'sh',
    [path.join(repositoryRoot, 'deploy', 'scholarctl'), 'preflight'],
    {
      cwd: repositoryRoot,
      env: { ...commandEnvironment, SCHOLAR_OFFLINE: 'true' },
      encoding: 'utf8',
    },
  )
  assert.match(offlineOutput, /Preflight passed for Scholar 3\.0\.0/)

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
    .replace(
      'INSTITUTION_LOGIN_INSTITUTION_SLUG=',
      'INSTITUTION_LOGIN_INSTITUTION_SLUG=example-university',
    )
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
  assert.match(institutionSsoOutput, /Preflight passed for Scholar 3\.0\.0/)

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
      `SCHOLAR_WEB_IMAGE=ghcr.io/airalogy/scholar-web:3.0.0@${digest('b')}`,
      `SCHOLAR_WEB_IMAGE=ghcr.io/airalogy/scholar-web:3.0.0@${digest('e')}`,
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
