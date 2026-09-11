import { spawnSync } from 'node:child_process'

const databaseUrl = process.env.BIBLIOGRAPHY_TEST_DATABASE_URL
  || (process.argv.includes('--if-configured') ? undefined : process.env.DATABASE_URL)
if (!databaseUrl && process.argv.includes('--if-configured')) {
  console.warn('Scholar pre-push: database bibliography tests were not run. Set BIBLIOGRAPHY_TEST_DATABASE_URL to a local test database to include them; CI and release validation require them.')
  process.exit(0)
}
if (!databaseUrl) throw new Error('A local disposable BIBLIOGRAPHY_TEST_DATABASE_URL or DATABASE_URL is required for bibliography verification')
const result = spawnSync('pnpm', ['--filter', '@airalogy/scholar-server', 'exec', 'node', '--import', 'tsx', '--test', 'test/bibliography-postgres.test.ts'], {
  stdio: 'inherit', env: { ...process.env, BIBLIOGRAPHY_TEST_DATABASE_URL: databaseUrl },
})
if (result.error) throw result.error
process.exit(result.status ?? 1)
