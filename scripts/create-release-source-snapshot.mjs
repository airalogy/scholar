import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  copyFile,
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readlink,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
const checkOnly = process.argv.includes('--check')
const verifyOnly = process.argv.includes('--verify')
const updateManifest = process.argv.includes('--update-manifest')
const targetArgument = process.argv
  .slice(2)
  .find(
    (argument) =>
      argument !== '--check' && argument !== '--verify' && argument !== '--update-manifest',
  )
const initialMigrationPath = 'apps/api/prisma/migrations/00000000000000_v3_initial/migration.sql'
const releaseManifestPath = 'RELEASE-SOURCE-MANIFEST.json'
const releaseHistoryBaseline = '3.0.0'

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  })
  if (result.status !== 0) {
    const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : ''
    const stdout = typeof result.stdout === 'string' ? result.stdout.trim() : ''
    throw new Error(stderr || stdout || `${command} failed`)
  }
  return typeof result.stdout === 'string' ? result.stdout : ''
}

const listCandidateFiles = () => {
  const output = run('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'])
  const deletedFiles = new Set(
    run('git', ['ls-files', '--deleted', '-z']).split('\0').filter(Boolean),
  )
  return output
    .split('\0')
    .filter(Boolean)
    .filter((file) => !deletedFiles.has(file))
    .filter((file) => file !== releaseManifestPath)
    .sort()
}

const isBinary = (content) => content.includes(0)

const auditText = (file, text) => {
  const forbiddenInstitutionMarkers = (process.env.RELEASE_SOURCE_FORBIDDEN_MARKERS ?? '')
    .split(',')
    .map((marker) => marker.trim())
    .filter(Boolean)
  for (const marker of forbiddenInstitutionMarkers) {
    if (text.toLocaleLowerCase('en-US').includes(marker.toLocaleLowerCase('en-US'))) {
      throw new Error(`Release source contains an institution-specific marker in ${file}`)
    }
  }

  const secretPatterns = [
    /-----BEGIN (?:EC |OPENSSH |RSA )?PRIVATE KEY-----/u,
    /\bAKIA[0-9A-Z]{16}\b/u,
    /\bASIA[0-9A-Z]{16}\b/u,
    /\bAIza[0-9A-Za-z_-]{35}\b/u,
    /\bgh[pousr]_[0-9A-Za-z_]{30,}\b/u,
    /\bgithub_pat_[0-9A-Za-z_]{30,}\b/u,
    /\bglpat-[0-9A-Za-z_-]{20,}\b/u,
    /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/u,
    /\bnpm_[0-9A-Za-z]{36}\b/u,
    /\bsk-[0-9A-Za-z]{32,}\b/u,
    /\b(?:rk|sk)_live_[0-9A-Za-z]{16,}\b/u,
    /\beyJ[0-9A-Za-z_-]+\.eyJ[0-9A-Za-z_-]+\.[0-9A-Za-z_-]+\b/u,
    /^\s*\/\/registry\.[^:]+\/:_authToken\s*=/mu,
    /\/Users\/[^/\s]+/u,
    /\bC:\\Users\\[^\\\s]+/iu,
  ]
  for (const pattern of secretPatterns) {
    if (pattern.test(text)) {
      throw new Error(`Release source contains a credential-shaped value in ${file}`)
    }
  }
}

const compareReleaseVersions = (left, right) => {
  const leftParts = left.split('.').map(Number)
  const rightParts = right.split('.').map(Number)
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index]
    }
  }
  return 0
}

const auditPublicChangelog = (file, text) => {
  const releaseVersions = [...text.matchAll(/^## \[(\d+\.\d+\.\d+)\]/gmu)].map((match) => match[1])
  if (!releaseVersions.includes(releaseHistoryBaseline)) {
    throw new Error(`${file} does not contain the 3.0.0 release baseline`)
  }
  const unsupportedHistoryVersion = releaseVersions.find(
    (version) => compareReleaseVersions(version, releaseHistoryBaseline) < 0,
  )
  if (unsupportedHistoryVersion) {
    throw new Error(`${file} contains unsupported release ${unsupportedHistoryVersion}`)
  }
}

const auditCandidates = async (files) => {
  if (!files.includes(initialMigrationPath)) {
    throw new Error('Release source must preserve the published 3.0.0 initial migration')
  }
  for (const file of files) {
    const content = await readFile(path.join(repositoryRoot, file))
    if (!isBinary(content)) {
      const text = content.toString('utf8')
      auditText(file, text)
      if (file === 'CHANGELOG.md' || file === 'CHANGELOG.zh-CN.md') {
        auditPublicChangelog(file, text)
      }
    }
  }
}

const assertTargetDoesNotExist = async (target) => {
  try {
    await stat(target)
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return
    }
    throw error
  }
  throw new Error(`Target already exists: ${target}`)
}

const copyCandidate = async (file, targetRoot) => {
  const source = path.join(repositoryRoot, file)
  const target = path.join(targetRoot, file)
  const sourceStat = await lstat(source)
  await mkdir(path.dirname(target), { recursive: true })
  if (sourceStat.isSymbolicLink()) {
    await symlink(await readlink(source), target)
    return
  }
  await copyFile(source, target)
}

const sha256 = (content) => createHash('sha256').update(content).digest('hex')

const createManifest = async (targetRoot, files) => {
  const entries = {}
  for (const file of files) {
    entries[file] = sha256(await readFile(path.join(targetRoot, file)))
  }
  const version = (await readFile(path.join(repositoryRoot, 'VERSION'), 'utf8')).trim()
  return `${JSON.stringify({ version, files: entries }, null, 2)}\n`
}

const writeSnapshot = async (targetRoot, files) => {
  await assertTargetDoesNotExist(targetRoot)
  await mkdir(targetRoot, { recursive: true })
  for (const file of files) {
    await copyCandidate(file, targetRoot)
  }
  const manifest = await createManifest(targetRoot, files)
  await writeFile(path.join(targetRoot, releaseManifestPath), manifest)
}

const verifySnapshot = (targetRoot) => {
  const databaseUrl = process.env.RELEASE_SOURCE_DATABASE_URL?.trim()
  if (!databaseUrl) {
    throw new Error(
      'RELEASE_SOURCE_DATABASE_URL must point to an empty, disposable PostgreSQL schema',
    )
  }
  const parsedDatabaseUrl = new URL(databaseUrl)
  const schema = parsedDatabaseUrl.searchParams.get('schema')
  if (!schema || schema === 'public') {
    throw new Error('RELEASE_SOURCE_DATABASE_URL must use a non-public disposable schema')
  }
  if (!/^[a-z][a-z0-9_]{0,62}$/u.test(schema)) {
    throw new Error('RELEASE_SOURCE_DATABASE_URL schema must be a lowercase PostgreSQL identifier')
  }

  parsedDatabaseUrl.searchParams.set('options', `-c search_path=${schema},public`)
  const env = { ...process.env, DATABASE_URL: parsedDatabaseUrl.toString() }
  console.log('Release source verification: pnpm install --frozen-lockfile')
  run('pnpm', ['install', '--frozen-lockfile'], {
    cwd: targetRoot,
    env,
    stdio: 'inherit',
  })

  const administrativeDatabaseUrl = new URL(databaseUrl)
  administrativeDatabaseUrl.searchParams.set('schema', 'public')
  administrativeDatabaseUrl.searchParams.set('options', '-c search_path=public')
  console.log(`Release source verification: recreate disposable schema ${schema}`)
  run(
    'pnpm',
    ['--filter', '@airalogy/scholar-server', 'exec', 'prisma', 'db', 'execute', '--stdin'],
    {
      cwd: targetRoot,
      env: { ...process.env, DATABASE_URL: administrativeDatabaseUrl.toString() },
      input: `DROP SCHEMA IF EXISTS "${schema}" CASCADE;\nCREATE SCHEMA "${schema}";\n`,
      stdio: ['pipe', 'inherit', 'inherit'],
    },
  )

  const commands = [
    ['pnpm', ['ci:config:check']],
    ['pnpm', ['version:check']],
    ['pnpm', ['db:validate']],
    ['pnpm', ['db:generate']],
    ['pnpm', ['format:check']],
    ['pnpm', ['lint']],
    ['pnpm', ['type-check']],
    ['pnpm', ['test']],
    ['pnpm', ['build']],
    ['pnpm', ['--filter', '@airalogy/scholar-server', 'smoke:dist']],
    ['pnpm', ['db:migrate:deploy']],
    ['pnpm', ['db:audit:integrity']],
    ['pnpm', ['db:verify:upgrade']],
    ['pnpm', ['db:verify:identity']],
    ['pnpm', ['db:verify:bibliography']],
  ]

  for (const [command, args] of commands) {
    console.log(`Release source verification: ${command} ${args.join(' ')}`)
    run(command, args, { cwd: targetRoot, env, stdio: 'inherit' })
  }
}

const initializeVerificationGitIndex = (targetRoot) => {
  run('git', ['init', '--quiet'], { cwd: targetRoot })
  run('git', ['add', '--all'], { cwd: targetRoot })
}

const main = async () => {
  if ([checkOnly, verifyOnly, updateManifest].filter(Boolean).length > 1) {
    throw new Error('--check, --verify, and --update-manifest cannot be used together')
  }
  const files = listCandidateFiles()
  await auditCandidates(files)

  if (updateManifest) {
    const manifest = await createManifest(repositoryRoot, files)
    await writeFile(path.join(repositoryRoot, releaseManifestPath), manifest)
    console.log(`Updated ${releaseManifestPath} for ${files.length} files`)
    return
  }

  if (checkOnly) {
    const expectedManifest = await createManifest(repositoryRoot, files)
    const actualManifest = await readFile(path.join(repositoryRoot, releaseManifestPath), 'utf8')
    if (actualManifest !== expectedManifest) {
      throw new Error(`${releaseManifestPath} is stale; run pnpm release:source:manifest`)
    }
    console.log(`Release source audit passed for ${files.length} files`)
    return
  }

  if (verifyOnly) {
    const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'scholar-release-source-'))
    const targetRoot = path.join(temporaryRoot, 'source')
    try {
      await writeSnapshot(targetRoot, files)
      initializeVerificationGitIndex(targetRoot)
      verifySnapshot(targetRoot)
      console.log(`Verified release source snapshot with ${files.length} files`)
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true })
    }
    return
  }

  if (!targetArgument) {
    throw new Error(
      'Usage: node scripts/create-release-source-snapshot.mjs <new-target-directory> | --check | --verify | --update-manifest',
    )
  }
  const status = run('git', ['status', '--porcelain=v1', '--untracked-files=all'])
  if (status.trim()) {
    throw new Error('Commit or remove all working-tree changes before creating a release source')
  }

  const targetRoot = path.resolve(repositoryRoot, targetArgument)
  if (targetRoot === repositoryRoot || targetRoot.startsWith(`${repositoryRoot}${path.sep}`)) {
    throw new Error('Release source target must be outside the source repository')
  }
  await writeSnapshot(targetRoot, files)
  console.log(`Created audited release source snapshot at ${targetRoot}`)
}

await main()
