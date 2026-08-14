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
const targetArgument = process.argv
  .slice(2)
  .find((argument) => argument !== '--check' && argument !== '--verify')
const initialMigrationPath =
  'apps/api/prisma/migrations/00000000000000_v3_initial/migration.sql'
const migrationLockPath = 'apps/api/prisma/migrations/migration_lock.toml'
const publicHistoryBaseline = '3.0.0'
const prismaDatabaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://scholar:scholar@127.0.0.1:5432/scholar?schema=public'

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

const isPrivateMigration = (file) => {
  return file.startsWith('apps/api/prisma/migrations/') && file !== migrationLockPath
}

const listCandidateFiles = () => {
  const output = run('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'])
  return output
    .split('\0')
    .filter(Boolean)
    .filter((file) => !isPrivateMigration(file))
    .sort()
}

const generateInitialMigration = async () => {
  const schemaSql = run(
    'pnpm',
    [
      '--filter',
      '@airalogy/scholar-server',
      'exec',
      'prisma',
      'migrate',
      'diff',
      '--from-empty',
      '--to-schema',
      'prisma/schema.prisma',
      '--script',
    ],
    {
      cwd: path.join(repositoryRoot, 'apps/api'),
      env: { ...process.env, DATABASE_URL: prismaDatabaseUrl },
    },
  )
  const coreSubjects = await readFile(
    path.join(repositoryRoot, 'apps/api/prisma/core-academic-subjects.sql'),
    'utf8',
  )
  const searchPathSql = [
    '-- Keep extension types visible when they are already installed in public.',
    "SELECT set_config('search_path', quote_ident(current_schema()) || ', public', false);",
  ].join('\n')
  return `${searchPathSql}\n\n${schemaSql.trim()}\n\n-- Install the provider-neutral core academic subject catalog.\n${coreSubjects.trim()}\n`
}

const isBinary = (content) => content.includes(0)

const auditText = (file, text) => {
  const forbiddenInstitutionMarkers = (process.env.PUBLIC_SNAPSHOT_FORBIDDEN_MARKERS ?? '')
    .split(',')
    .map((marker) => marker.trim())
    .filter(Boolean)
  for (const marker of forbiddenInstitutionMarkers) {
    if (text.toLocaleLowerCase('en-US').includes(marker.toLocaleLowerCase('en-US'))) {
      throw new Error(`Public snapshot contains an institution-specific marker in ${file}`)
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
      throw new Error(`Public snapshot contains a credential-shaped value in ${file}`)
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
  const releaseVersions = [...text.matchAll(/^## \[(\d+\.\d+\.\d+)\]/gmu)].map(
    (match) => match[1],
  )
  if (!releaseVersions.includes(publicHistoryBaseline)) {
    throw new Error(`${file} does not start the public release history at 3.0.0`)
  }
  const privateHistoryVersion = releaseVersions.find(
    (version) => compareReleaseVersions(version, publicHistoryBaseline) < 0,
  )
  if (privateHistoryVersion) {
    throw new Error(`${file} contains pre-public release ${privateHistoryVersion}`)
  }
}

const auditCandidates = async (files, initialMigration) => {
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
  auditText(initialMigrationPath, initialMigration)
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

const createManifest = async (targetRoot, files, sourceCommit) => {
  const entries = {}
  for (const file of [...files, initialMigrationPath].sort()) {
    entries[file] = sha256(await readFile(path.join(targetRoot, file)))
  }
  const version = (await readFile(path.join(repositoryRoot, 'VERSION'), 'utf8')).trim()
  return `${JSON.stringify({ version, sourceCommit, files: entries }, null, 2)}\n`
}

const writeSnapshot = async (targetRoot, files, initialMigration, sourceCommit) => {
  await assertTargetDoesNotExist(targetRoot)
  await mkdir(targetRoot, { recursive: true })
  for (const file of files) {
    await copyCandidate(file, targetRoot)
  }
  const migrationTarget = path.join(targetRoot, initialMigrationPath)
  await mkdir(path.dirname(migrationTarget), { recursive: true })
  await writeFile(migrationTarget, initialMigration)

  const manifest = await createManifest(targetRoot, files, sourceCommit)
  await writeFile(path.join(targetRoot, 'PUBLIC-SNAPSHOT-MANIFEST.json'), manifest)
}

const verifySnapshot = (targetRoot) => {
  const databaseUrl = process.env.PUBLIC_SNAPSHOT_DATABASE_URL?.trim()
  if (!databaseUrl) {
    throw new Error(
      'PUBLIC_SNAPSHOT_DATABASE_URL must point to an empty, disposable PostgreSQL schema',
    )
  }
  const parsedDatabaseUrl = new URL(databaseUrl)
  const schema = parsedDatabaseUrl.searchParams.get('schema')
  if (!schema || schema === 'public') {
    throw new Error('PUBLIC_SNAPSHOT_DATABASE_URL must use a non-public disposable schema')
  }
  if (!/^[a-z][a-z0-9_]{0,62}$/u.test(schema)) {
    throw new Error(
      'PUBLIC_SNAPSHOT_DATABASE_URL schema must be a lowercase PostgreSQL identifier',
    )
  }

  parsedDatabaseUrl.searchParams.set('options', `-c search_path=${schema},public`)
  const env = { ...process.env, DATABASE_URL: parsedDatabaseUrl.toString() }
  console.log('Public snapshot verification: pnpm install --frozen-lockfile')
  run('pnpm', ['install', '--frozen-lockfile'], {
    cwd: targetRoot,
    env,
    stdio: 'inherit',
  })

  const administrativeDatabaseUrl = new URL(databaseUrl)
  administrativeDatabaseUrl.searchParams.set('schema', 'public')
  administrativeDatabaseUrl.searchParams.set('options', '-c search_path=public')
  console.log(`Public snapshot verification: recreate disposable schema ${schema}`)
  run(
    'pnpm',
    [
      '--filter',
      '@airalogy/scholar-server',
      'exec',
      'prisma',
      'db',
      'execute',
      '--stdin',
    ],
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
  ]

  for (const [command, args] of commands) {
    console.log(`Public snapshot verification: ${command} ${args.join(' ')}`)
    run(command, args, { cwd: targetRoot, env, stdio: 'inherit' })
  }
}

const main = async () => {
  if (checkOnly && verifyOnly) {
    throw new Error('--check and --verify cannot be used together')
  }
  const files = listCandidateFiles()
  const initialMigration = await generateInitialMigration()
  await auditCandidates(files, initialMigration)

  if (checkOnly) {
    console.log(`Public snapshot audit passed for ${files.length + 1} files`)
    return
  }

  const sourceCommit = run('git', ['rev-parse', 'HEAD']).trim()
  if (verifyOnly) {
    const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'scholar-public-snapshot-'))
    const targetRoot = path.join(temporaryRoot, 'source')
    try {
      await writeSnapshot(targetRoot, files, initialMigration, sourceCommit)
      verifySnapshot(targetRoot)
      console.log(`Verified audited public source snapshot with ${files.length + 1} files`)
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true })
    }
    return
  }

  if (!targetArgument) {
    throw new Error(
      'Usage: node scripts/create-public-source-snapshot.mjs <new-target-directory> | --check | --verify',
    )
  }
  const status = run('git', ['status', '--porcelain=v1', '--untracked-files=all'])
  if (status.trim()) {
    throw new Error('Commit or remove all working-tree changes before creating a public snapshot')
  }

  const targetRoot = path.resolve(repositoryRoot, targetArgument)
  if (targetRoot === repositoryRoot || targetRoot.startsWith(`${repositoryRoot}${path.sep}`)) {
    throw new Error('Public snapshot target must be outside the source repository')
  }
  await writeSnapshot(targetRoot, files, initialMigration, sourceCommit)
  console.log(`Created audited public source snapshot at ${targetRoot}`)
}

await main()
