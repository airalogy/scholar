import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const digestPattern = /^sha256:[0-9a-f]{64}$/
const commitPattern = /^[0-9a-f]{40}$/

const readRequiredText = async (filePath) => {
  const value = (await readFile(filePath, 'utf8')).trim()
  if (!value) {
    throw new Error(`${filePath} is empty`)
  }
  return value
}

const assertDigest = (value, label) => {
  if (!digestPattern.test(value)) {
    throw new Error(`${label} must be a sha256 digest`)
  }
}

const assertRepository = (value, label) => {
  if (!/^[a-z0-9][a-z0-9._/-]*$/i.test(value) || value.includes('@') || value.endsWith('/')) {
    throw new Error(`${label} must be an untagged container repository`)
  }
}

const parseDigestReference = (value, label) => {
  const match = /^(.+)@(sha256:[0-9a-f]{64})$/.exec(value)
  if (!match) {
    throw new Error(`${label} must be pinned by sha256 digest`)
  }
  return { taggedReference: match[1], digest: match[2] }
}

const replaceEnvValue = (source, key, value) => {
  const linePattern = new RegExp(`^${key}=.*$`, 'mu')
  if (!linePattern.test(source)) {
    throw new Error(`Deployment environment template is missing ${key}`)
  }
  return source.replace(linePattern, `${key}=${value}`)
}

const latestMigration = async (repositoryRoot) => {
  const migrationsDirectory = path.join(repositoryRoot, 'apps', 'api', 'prisma', 'migrations')
  const entries = await readdir(migrationsDirectory, { withFileTypes: true })
  const migrations = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  const migration = migrations.at(-1)
  if (!migration) {
    throw new Error('No Prisma migration was found')
  }
  return migration
}

const readImageMetadata = async (metadataDirectory, component) => {
  const repository = await readRequiredText(path.join(metadataDirectory, `${component}.repository`))
  const digest = await readRequiredText(path.join(metadataDirectory, `${component}.digest`))
  assertRepository(repository, `${component} repository`)
  assertDigest(digest, `${component} digest`)
  return { repository, digest }
}

const serializeReleaseEnv = (manifest, manifestDigest) => {
  const values = {
    SCHOLAR_RELEASE_SCHEMA_VERSION: manifest.schemaVersion,
    SCHOLAR_RELEASE_MANIFEST_SHA256: manifestDigest,
    SCHOLAR_RELEASE_PRODUCT_VERSION: manifest.productVersion,
    SCHOLAR_RELEASE_TAG: manifest.releaseTag,
    SCHOLAR_RELEASE_COMMIT: manifest.gitCommit,
    SCHOLAR_RELEASE_DATABASE_MIGRATION: manifest.database.migration,
    SCHOLAR_RELEASE_API_IMAGE: manifest.components.api.deploymentReference,
    SCHOLAR_RELEASE_API_TAGGED_IMAGE: manifest.components.api.taggedReference,
    SCHOLAR_RELEASE_API_DIGEST: manifest.components.api.digest,
    SCHOLAR_RELEASE_WEB_IMAGE: manifest.components.web.deploymentReference,
    SCHOLAR_RELEASE_WEB_TAGGED_IMAGE: manifest.components.web.taggedReference,
    SCHOLAR_RELEASE_WEB_DIGEST: manifest.components.web.digest,
    SCHOLAR_RELEASE_POSTGRES_IMAGE: manifest.components.postgres.deploymentReference,
    SCHOLAR_RELEASE_POSTGRES_TAGGED_IMAGE: manifest.components.postgres.taggedReference,
    SCHOLAR_RELEASE_POSTGRES_DIGEST: manifest.components.postgres.digest,
  }
  return `${Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')}\n`
}

export const createReleaseMetadata = async ({
  repositoryRoot,
  metadataDirectory,
  outputDirectory,
  envTemplatePath,
  releaseTag,
  gitCommit,
  createdAt,
}) => {
  const version = await readRequiredText(path.join(repositoryRoot, 'VERSION'))
  const expectedTag = `v${version}`
  if (releaseTag !== expectedTag) {
    throw new Error(`Release tag ${releaseTag} does not match VERSION ${version}`)
  }
  if (!commitPattern.test(gitCommit)) {
    throw new Error('Git commit must be a complete 40-character SHA')
  }
  if (Number.isNaN(Date.parse(createdAt))) {
    throw new Error('Release creation time must be an ISO-compatible timestamp')
  }

  const [api, web, migration, envTemplate] = await Promise.all([
    readImageMetadata(metadataDirectory, 'api'),
    readImageMetadata(metadataDirectory, 'web'),
    latestMigration(repositoryRoot),
    readFile(envTemplatePath, 'utf8'),
  ])
  const postgresReference = /^POSTGRES_IMAGE=(.+)$/mu.exec(envTemplate)?.[1]?.trim()
  if (!postgresReference) {
    throw new Error('Deployment environment template is missing POSTGRES_IMAGE')
  }
  const postgres = parseDigestReference(postgresReference, 'PostgreSQL image')

  const component = ({ repository, digest }) => ({
    repository,
    digest,
    taggedReference: `${repository}:${version}`,
    deploymentReference: `${repository}:${version}@${digest}`,
  })
  const manifest = {
    schemaVersion: 1,
    product: 'Airalogy Scholar',
    productVersion: version,
    releaseTag,
    gitCommit,
    createdAt: new Date(createdAt).toISOString(),
    database: {
      engine: 'PostgreSQL 17 with pgvector',
      migration,
    },
    documentation: {
      bundledIn: 'web',
      sitePath: '/docs/',
      openApiPath: '/api/docs',
    },
    components: {
      api: component(api),
      web: component(web),
      postgres: {
        digest: postgres.digest,
        taggedReference: postgres.taggedReference,
        deploymentReference: postgresReference,
      },
    },
  }
  const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`
  const manifestDigest = createHash('sha256').update(manifestJson).digest('hex')
  const releaseEnv = serializeReleaseEnv(manifest, manifestDigest)

  let renderedEnv = envTemplate
  const replacements = {
    SCHOLAR_VERSION: version,
    SCHOLAR_API_IMAGE: manifest.components.api.deploymentReference,
    SCHOLAR_WEB_IMAGE: manifest.components.web.deploymentReference,
    POSTGRES_IMAGE: manifest.components.postgres.deploymentReference,
    SCHOLAR_RELEASE_METADATA_REQUIRED: 'true',
  }
  for (const [key, value] of Object.entries(replacements)) {
    renderedEnv = replaceEnvValue(renderedEnv, key, value)
  }

  await Promise.all([
    writeFile(path.join(outputDirectory, 'release-manifest.json'), manifestJson),
    writeFile(path.join(outputDirectory, 'release-manifest.env'), releaseEnv),
    writeFile(path.join(outputDirectory, '.env.example'), renderedEnv),
  ])

  return { manifest, manifestDigest }
}
