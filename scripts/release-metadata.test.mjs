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
case "$*" in
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
