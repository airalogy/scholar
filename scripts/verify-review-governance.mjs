import { spawnSync } from 'node:child_process'

const databaseUrl = process.env.GOVERNANCE_TEST_DATABASE_URL || process.env.DATABASE_URL
if (!databaseUrl && process.argv.includes('--if-configured')) {
  console.log('PostgreSQL governance verification skipped: no disposable test database configured')
} else {
  if (!databaseUrl) throw new Error('A local disposable DATABASE_URL is required for governance verification')
  const result = spawnSync('pnpm', ['--filter', '@airalogy/scholar-server', 'exec', 'node', '--import', 'tsx', '--test', 'test/governance-postgres.test.ts'], { stdio: 'inherit', env: { ...process.env, GOVERNANCE_TEST_DATABASE_URL: databaseUrl } })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
}
