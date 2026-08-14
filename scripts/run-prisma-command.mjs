import { spawnSync } from 'node:child_process'
import process from 'node:process'

const scriptName = process.argv[2]
const allowedScripts = new Set(['db:generate', 'db:validate'])
if (!allowedScripts.has(scriptName)) {
  throw new Error(`Unsupported Prisma command: ${scriptName ?? 'missing'}`)
}

const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const result = spawnSync(pnpmCommand, ['--filter', '@airalogy/scholar-server', scriptName], {
  env: {
    ...process.env,
    DATABASE_URL:
      process.env.DATABASE_URL ??
      'postgresql://scholar:scholar@127.0.0.1:5432/scholar?schema=public',
  },
  stdio: 'inherit',
})

if (result.error) {
  throw result.error
}
process.exit(result.status ?? 1)
