import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const repositoryRoot = path.resolve(import.meta.dirname, '..')
const workflowDirectory = path.join(repositoryRoot, '.github', 'workflows')

const minimumActionMajors = new Map([
  ['actions/checkout', 5],
  ['actions/setup-node', 5],
  ['pnpm/action-setup', 6],
  ['docker/setup-buildx-action', 4],
  ['docker/setup-qemu-action', 4],
  ['docker/login-action', 4],
  ['docker/metadata-action', 6],
  ['docker/build-push-action', 7],
  ['actions/upload-artifact', 6],
  ['actions/download-artifact', 7],
  ['actions/attest-build-provenance', 4],
])

const failures = []

const fail = (file, line, message) => {
  failures.push(`${path.relative(repositoryRoot, file)}:${line}: ${message}`)
}

const packageJsonPath = path.join(repositoryRoot, 'package.json')
const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'))
const packageManagerMatch = /^pnpm@(\d+\.\d+\.\d+)(?:\+.+)?$/.exec(packageJson.packageManager ?? '')

if (!packageManagerMatch) {
  fail(packageJsonPath, 1, 'packageManager must pin an exact pnpm version')
}

const apiPackageJsonPath = path.join(repositoryRoot, 'apps', 'api', 'package.json')
const apiPackageJson = JSON.parse(await readFile(apiPackageJsonPath, 'utf8'))

for (const [scriptName, command] of Object.entries(apiPackageJson.scripts ?? {})) {
  if (typeof command === 'string' && command.includes('--env-file=')) {
    fail(
      apiPackageJsonPath,
      1,
      `script ${scriptName} requires a local env file; use --env-file-if-exists so CI and deployments can provide environment variables directly`,
    )
  }
}

const pnpmVersion = packageManagerMatch?.[1]
const nodeVersionPath = path.join(repositoryRoot, '.node-version')
const nodeVersion = (await readFile(nodeVersionPath, 'utf8')).trim()

if (!/^\d+\.\d+\.\d+$/.test(nodeVersion)) {
  fail(nodeVersionPath, 1, '.node-version must contain an exact Node.js version')
}

const workflowNames = (await readdir(workflowDirectory))
  .filter((name) => /\.ya?ml$/.test(name))
  .sort()

let pnpmSetupCount = 0
let nodeSetupCount = 0

for (const workflowName of workflowNames) {
  const workflowPath = path.join(workflowDirectory, workflowName)
  const lines = (await readFile(workflowPath, 'utf8')).split('\n')

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const actionMatch = /^(\s*)(-\s+)?uses:\s+([^\s@]+)@([^\s#]+)(?:\s+#\s+(v[^\s]+))?\s*$/.exec(
      line,
    )

    if (!actionMatch) {
      continue
    }

    const [, indentation, listMarker, actionName, actionReference, versionLabel] = actionMatch
    if (actionName.startsWith('./')) {
      continue
    }
    const stepIndentation = listMarker ? indentation.length : Math.max(0, indentation.length - 2)
    const minimumMajor = minimumActionMajors.get(actionName)
    const versionMatch = /^v(\d+)(?:\.\d+\.\d+)?$/.exec(versionLabel ?? '')
    const major = versionMatch ? Number(versionMatch[1]) : null

    if (!/^[0-9a-f]{40}$/.test(actionReference)) {
      fail(
        workflowPath,
        index + 1,
        `${actionName} must be pinned to a complete 40-character commit SHA`,
      )
    }

    if (minimumMajor !== undefined && major === null) {
      fail(
        workflowPath,
        index + 1,
        `${actionName} must retain a version comment such as # v${minimumMajor}`,
      )
    }

    if (minimumMajor !== undefined && major !== null && major < minimumMajor) {
      fail(
        workflowPath,
        index + 1,
        `${actionName} still uses the deprecated v${major} action runtime; use v${minimumMajor} or newer`,
      )
    }

    if (actionName === 'pnpm/action-setup') {
      pnpmSetupCount += 1

      for (let childIndex = index + 1; childIndex < lines.length; childIndex += 1) {
        const childLine = lines[childIndex]
        const childIndentation = childLine.match(/^\s*/)?.[0].length ?? 0

        if (childLine.trim() && childIndentation <= stepIndentation) {
          break
        }

        if (/^\s+version\s*:/.test(childLine)) {
          fail(
            workflowPath,
            childIndex + 1,
            'pnpm version is already pinned by package.json packageManager; remove the action version input',
          )
        }
      }
    }

    if (actionName === 'actions/setup-node') {
      nodeSetupCount += 1
      let usesVersionFile = false

      for (let childIndex = index + 1; childIndex < lines.length; childIndex += 1) {
        const childLine = lines[childIndex]
        const childIndentation = childLine.match(/^\s*/)?.[0].length ?? 0

        if (childLine.trim() && childIndentation <= stepIndentation) {
          break
        }

        if (/^\s+node-version-file\s*:\s*['"]?\.node-version['"]?\s*$/.test(childLine)) {
          usesVersionFile = true
        }

        if (/^\s+node-version\s*:/.test(childLine)) {
          fail(
            workflowPath,
            childIndex + 1,
            'use node-version-file: .node-version instead of duplicating the Node.js version',
          )
        }
      }

      if (!usesVersionFile) {
        fail(
          workflowPath,
          index + 1,
          'actions/setup-node must use node-version-file: .node-version',
        )
      }
    }
  }
}

if (pnpmSetupCount === 0) {
  fail(workflowDirectory, 1, 'no pnpm/action-setup step was found')
}

if (nodeSetupCount === 0) {
  fail(workflowDirectory, 1, 'no actions/setup-node step was found')
}

const releaseWorkflowPath = path.join(workflowDirectory, 'release.yml')
const releaseWorkflow = await readFile(releaseWorkflowPath, 'utf8')
const requiredReleaseFragments = [
  'scripts/create-release-metadata.mjs',
  'release-manifest.json',
  'release-manifest.env',
  'scholarctl install',
  'OPENAI_BASE_URL=https://models.example.invalid/v1',
  'OPENAI_API_KEY=release-smoke-model-key',
  'http://127.0.0.1:18080/docs/zh/',
  'http://127.0.0.1:18080/docs/en/',
  'http://127.0.0.1:18080/api/docs/json',
  'subject-path: scholar-deploy-',
  'sbom: true',
  'artifact-metadata: write',
  'pnpm release:source:verify',
  'README.zh-CN.md',
  'scholar-${{ matrix.component }}',
  'type=semver,pattern={{major}}.{{minor}}',
]
for (const fragment of requiredReleaseFragments) {
  if (!releaseWorkflow.includes(fragment)) {
    fail(releaseWorkflowPath, 1, `release workflow must include ${fragment}`)
  }
}

const ciWorkflowPath = path.join(workflowDirectory, 'ci.yml')
const ciWorkflow = await readFile(ciWorkflowPath, 'utf8')
if (!/^on:\n  push:\n    branches:\n      - main\n  pull_request:/m.test(ciWorkflow)) {
  fail(ciWorkflowPath, 1, 'CI must run branch pushes only on main and use pull_request for changes')
}
if (!ciWorkflow.includes('pnpm release:source:verify')) {
  fail(ciWorkflowPath, 1, 'CI must verify the generated release source snapshot')
}

const lifecycleScriptPaths = new Set()
const lifecycleNames = ['preinstall', 'install', 'postinstall', 'prepare']

for (const lifecycleName of lifecycleNames) {
  const command = packageJson.scripts?.[lifecycleName]

  if (typeof command !== 'string') {
    continue
  }

  for (const match of command.matchAll(/\bnode\s+([./\w-]+\.mjs)\b/g)) {
    lifecycleScriptPaths.add(match[1].replace(/^\.\//, ''))
  }
}

const dockerCopySources = (line) => {
  const match = /^\s*COPY\s+(.+)$/.exec(line)

  if (!match || match[1].startsWith('[')) {
    return []
  }

  const tokens = match[1].trim().split(/\s+/)
  while (tokens[0]?.startsWith('--')) {
    tokens.shift()
  }
  tokens.pop()
  return tokens
}

const dockerFiles = [
  path.join(repositoryRoot, 'apps', 'api', 'Dockerfile'),
  path.join(repositoryRoot, 'apps', 'web', 'Dockerfile'),
]

for (const dockerFile of dockerFiles) {
  const lines = (await readFile(dockerFile, 'utf8')).split('\n')
  const installIndex = lines.findIndex((line) => /\bpnpm install\b/.test(line))

  if (installIndex < 0) {
    fail(dockerFile, 1, 'Dockerfile must install workspace dependencies')
    continue
  }

  const copiedSources = lines.slice(0, installIndex).flatMap((line) => dockerCopySources(line))

  for (const scriptPath of lifecycleScriptPaths) {
    const copiedBeforeInstall = copiedSources.some((source) => {
      const normalizedSource = source.replace(/\/$/, '')
      return (
        normalizedSource === '.' ||
        normalizedSource === scriptPath ||
        scriptPath.startsWith(`${normalizedSource}/`)
      )
    })

    if (!copiedBeforeInstall) {
      fail(
        dockerFile,
        installIndex + 1,
        `pnpm install runs the root lifecycle script ${scriptPath}; copy it before the install layer`,
      )
    }
  }
}

const versionedFiles = [...dockerFiles, path.join(repositoryRoot, 'deploy', 'compose.build.yaml')]

for (const versionedFile of versionedFiles) {
  const lines = (await readFile(versionedFile, 'utf8')).split('\n')

  lines.forEach((line, index) => {
    for (const match of line.matchAll(/node:(\d+\.\d+\.\d+)-/g)) {
      if (match[1] !== nodeVersion) {
        fail(
          versionedFile,
          index + 1,
          `Node.js ${match[1]} does not match .node-version (${nodeVersion})`,
        )
      }
    }

    for (const match of line.matchAll(/corepack prepare pnpm@(\d+\.\d+\.\d+)/g)) {
      if (pnpmVersion && match[1] !== pnpmVersion) {
        fail(
          versionedFile,
          index + 1,
          `pnpm ${match[1]} does not match packageManager (${pnpmVersion})`,
        )
      }
    }
  })
}

if (failures.length > 0) {
  console.error('CI configuration validation failed:\n')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log(
  `CI configuration is consistent: Node.js ${nodeVersion}, pnpm ${pnpmVersion}, ${workflowNames.length} workflows`,
)
