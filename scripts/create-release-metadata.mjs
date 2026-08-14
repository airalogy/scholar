import { execFileSync } from 'node:child_process'
import { parseArgs } from 'node:util'
import path from 'node:path'
import { createReleaseMetadata } from './release-metadata-lib.mjs'

const { values } = parseArgs({
  options: {
    'metadata-directory': { type: 'string' },
    'output-directory': { type: 'string' },
    'env-template': { type: 'string' },
    'release-tag': { type: 'string' },
    'git-commit': { type: 'string' },
    'created-at': { type: 'string' },
  },
})

const repositoryRoot = path.resolve(import.meta.dirname, '..')
const metadataDirectory = path.resolve(values['metadata-directory'] ?? '')
const outputDirectory = path.resolve(values['output-directory'] ?? '')
const envTemplatePath = path.resolve(values['env-template'] ?? '')
const releaseTag = values['release-tag']?.trim()
const gitCommit =
  values['git-commit']?.trim() ||
  execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim()
const createdAt = values['created-at']?.trim() || new Date().toISOString()

if (!values['metadata-directory'] || !values['output-directory'] || !values['env-template']) {
  throw new Error('--metadata-directory, --output-directory, and --env-template are required')
}
if (!releaseTag) {
  throw new Error('--release-tag is required')
}

const { manifest } = await createReleaseMetadata({
  repositoryRoot,
  metadataDirectory,
  outputDirectory,
  envTemplatePath,
  releaseTag,
  gitCommit,
  createdAt,
})

console.log(`Created Scholar ${manifest.productVersion} release metadata for ${manifest.gitCommit}`)
