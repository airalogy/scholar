import { spawnSync } from 'node:child_process'

const databaseUrl = process.env.IDENTITY_TEST_DATABASE_URL || process.env.DATABASE_URL
if (!databaseUrl) throw new Error('A local disposable DATABASE_URL is required for identity verification')
const result = spawnSync('pnpm', ['--filter', '@airalogy/scholar-server', 'exec', 'node', '--import', 'tsx', '--test', 'test/identity-postgres.test.ts'], {
  stdio: 'inherit', env: { ...process.env, IDENTITY_TEST_DATABASE_URL: databaseUrl },
})
if (result.error) throw result.error
process.exit(result.status ?? 1)
