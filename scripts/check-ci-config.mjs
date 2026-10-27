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

if (packageJson.scripts?.prepush !== 'pnpm audit:prod && pnpm check && node scripts/verify-bibliography.mjs --if-configured && node scripts/verify-review-governance.mjs --if-configured') {
  fail(
    packageJsonPath,
    1,
    'prepush must audit production dependencies before running the complete repository checks',
  )
}

const sharedChecks = (packageJson.scripts?.check ?? '').split(' && ')
for (const command of [
  'pnpm ci:config:check',
  'pnpm license:check',
  'pnpm version:check',
  'pnpm docs:check',
  'pnpm release:source:check',
  'pnpm db:validate',
  'pnpm db:generate',
  'pnpm format:check',
  'pnpm lint',
  'pnpm type-check',
  'pnpm test',
  'pnpm build',
  'pnpm --filter @airalogy/scholar-server smoke:dist',
]) {
  if (!sharedChecks.includes(command)) {
    fail(packageJsonPath, 1, `shared check command must include ${command}`)
  }
}

const prepushPath = path.join(repositoryRoot, '.githooks', 'pre-push')
if (!/^pnpm prepush$/m.test(await readFile(prepushPath, 'utf8'))) {
  fail(prepushPath, 1, 'the pre-push hook must run pnpm prepush')
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
  'SCHOLAR_DOCKER_SUBNET=172.30.255.0/28',
  'compose.network.yaml',
  'http://127.0.0.1:18080/docs/zh/',
  'http://127.0.0.1:18080/docs/en/',
  'http://127.0.0.1:18080/api/docs/json',
  'subject-path: scholar-deploy-',
  'sbom: true',
  'artifact-metadata: write',
  'pnpm release:source:verify',
  'pnpm db:verify:identity',
  'pnpm db:verify:governance',
  'pnpm db:verify:bibliography',
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
for (const [file, workflow] of [[ciWorkflowPath, ciWorkflow], [releaseWorkflowPath, releaseWorkflow]]) {
  for (const command of ['pnpm audit:prod', 'pnpm check']) {
    if (!workflow.split('\n').some((line) => line.trim() === `- run: ${command}`)) {
      fail(file, 1, `workflow must run ${command} so local and cloud validation stay aligned`)
    }
  }
}
if (!/^on:\n  push:\n    branches:\n      - main\n  pull_request:/m.test(ciWorkflow)) {
  fail(ciWorkflowPath, 1, 'CI must run branch pushes only on main and use pull_request for changes')
}
if (!ciWorkflow.includes('pnpm release:source:verify')) {
  fail(ciWorkflowPath, 1, 'CI must verify the generated release source snapshot')
}
if (!ciWorkflow.includes('pnpm db:verify:identity')) {
  fail(ciWorkflowPath, 1, 'CI must run the PostgreSQL institution identity verification')
}
if (!ciWorkflow.includes('pnpm db:verify:bibliography')) {
  fail(ciWorkflowPath, 1, 'CI must run the PostgreSQL bibliography verification')
}

// Keep the existing required PR job IDs and matrix entries while separating native builds.
const workflowJob = (workflow, name) => workflow.match(new RegExp(`^  ${name}:\\n[\\s\\S]*?(?=^  [\\w-]+:|$(?![\\s\\S]))`, 'm'))?.[0] ?? ''
const requireFragments = (file, source, fragments) => {
  for (const fragment of fragments) {
    if (!source.includes(fragment)) fail(file, 1, `release acceleration must retain ${fragment}`)
  }
}
const nativeBuilds = workflowJob(releaseWorkflow, 'image-platforms')
requireFragments(releaseWorkflowPath, nativeBuilds, [
  'needs: verify',
  'runs-on: ${{ matrix.runner }}',
  'component: [api, web]',
  'arch: [amd64, arm64]',
  '- arch: amd64\n            runner: ubuntu-24.04',
  '- arch: arm64\n            runner: ubuntu-24.04-arm',
  'platforms: linux/${{ matrix.arch }}',
  'push-by-digest=true,name-canonical=true,push=true',
  'labels: ${{ steps.metadata.outputs.labels }}',
  'cache-from: type=gha,scope=main-${{ matrix.component }}-${{ matrix.arch }},timeout=3m',
  'dist/src/scripts/smoke-built-app.js',
  '--entrypoint caddy "$IMAGE" validate',
  'sbom: true',
  'provenance: mode=max',
  'subject-digest: ${{ steps.build.outputs.digest }}',
])
requireFragments(releaseWorkflowPath, workflowJob(releaseWorkflow, 'images'), [
  'needs: image-platforms',
  '$COMPONENT-amd64.digest',
  '$COMPONENT-arm64.digest',
  'docker buildx imagetools create --metadata-file merged.json',
  '"$IMAGE_REPOSITORY@$amd64" "$IMAGE_REPOSITORY@$arm64"',
  'sort == ["amd64", "arm64"]',
  'subject-digest: ${{ steps.merge.outputs.digest }}',
  '"image-metadata/$COMPONENT.digest"',
])
requireFragments(releaseWorkflowPath, workflowJob(releaseWorkflow, 'release'), ['needs: images', 'scholarctl install'])
if (/^\s+(?:cache-to|continue-on-error):/m.test(releaseWorkflow) || releaseWorkflow.includes('docker/setup-qemu-action')) {
  fail(releaseWorkflowPath, 1, 'Release must use native builds without tag-cache exports or optional checks')
}
const requiredContainerBuild = workflowJob(ciWorkflow, 'container-build')
requireFragments(ciWorkflowPath, requiredContainerBuild, [
  '- deployment-config', '- verify',
  '- component: api\n            dockerfile: apps/api/Dockerfile',
  '- component: web\n            dockerfile: apps/web/Dockerfile',
  'platforms: linux/amd64',
  "scope=${{ github.event_name == 'push' && 'main' || format('pr-{0}', github.event.pull_request.number) }}-${{ matrix.component }}-amd64,timeout=3m,ignore-error=true",
])
requireFragments(ciWorkflowPath, workflowJob(ciWorkflow, 'container-cache-arm64'), [
  "if: github.event_name == 'push' && github.ref == 'refs/heads/main'",
  '- deployment-config', '- verify',
  'runs-on: ubuntu-24.04-arm',
  'platforms: linux/arm64',
  'outputs: type=cacheonly',
  'cache-to: type=gha,mode=max,scope=main-${{ matrix.component }}-arm64,timeout=3m,ignore-error=true',
])
if (/^\s+continue-on-error:/m.test(ciWorkflow)) {
  fail(ciWorkflowPath, 1, 'CI checks cannot be optional; only cache export failures may be ignored')
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

  const fetchIndex = lines.findIndex((line) => line === 'RUN pnpm fetch --frozen-lockfile --ignore-scripts')
  const beforeFetch = lines.slice(0, fetchIndex).flatMap((line) => dockerCopySources(line))
  if (fetchIndex < 0 || fetchIndex >= installIndex ||
    !beforeFetch.includes('pnpm-lock.yaml') || !beforeFetch.includes('pnpm-workspace.yaml') ||
    beforeFetch.some((source) => !['pnpm-lock.yaml', 'pnpm-workspace.yaml'].includes(source))) {
    fail(dockerFile, 1, 'fetch must depend only on the lockfile and workspace configuration before installation')
  }
  if (lines[installIndex] !== 'RUN pnpm install --offline --frozen-lockfile') {
    fail(dockerFile, installIndex + 1, 'Docker dependency installation must be offline and frozen')
  }
  if (copiedSources.some((source) => ['.', 'apps/api', 'apps/web', 'apps/docs', 'VERSION'].includes(source))) {
    fail(dockerFile, 1, 'application source and VERSION must not invalidate the dependency installation layer')
  }

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

requireFragments(dockerFiles[0], await readFile(dockerFiles[0], 'utf8'), [
  'FROM dependencies AS production-dependencies',
  'COPY --from=production-dependencies --chown=node:node /opt/scholar-api/node_modules/ ./node_modules/',
  'COPY --from=build --chown=node:node /workspace/apps/api/dist/ ./dist/',
])

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
