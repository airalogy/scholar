import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../prisma/generated/client'
import { recoverAdministrator } from '../administrators/deployment'
import { parseRecoveryInput } from '../administrators/recovery-input'

// Bounded NUL-delimited stdin keeps passwords out of command arguments and env.
let raw = ''
process.stdin.setEncoding('utf8')
for await (const chunk of process.stdin) {
  raw += String(chunk)
  if (Buffer.byteLength(raw, 'utf8') > 16000) throw new Error('Recovery input is too large')
}
const input = parseRecoveryInput(raw, process.env.INSTITUTION_SLUG)
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
})
try {
  console.log(JSON.stringify(await recoverAdministrator(prisma, input)))
} catch (error) {
  console.error(
    error instanceof Error && !error.name.startsWith('Prisma')
      ? error.message
      : 'Recovery failed; verify target account, institution and database availability',
  )
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
