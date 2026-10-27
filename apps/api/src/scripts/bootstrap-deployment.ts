import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../prisma/generated/client'
import { bootstrapDeployment } from '../administrators/deployment'

const required = (key: string): string => {
  const value = process.env[key]?.trim()
  if (!value) throw new Error(`${key} is required`)
  return value
}

const institutionSlug = required('SCHOLAR_BOOTSTRAP_INSTITUTION_SLUG')
if (
  !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(institutionSlug) ||
  (process.env.INSTITUTION_SLUG && process.env.INSTITUTION_SLUG !== institutionSlug)
)
  throw new Error('Bootstrap institution must match INSTITUTION_SLUG')
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: required('DATABASE_URL') }),
})
try {
  console.log(
    JSON.stringify(
      await bootstrapDeployment(prisma, {
        institutionSlug,
        institutionName: required('SCHOLAR_BOOTSTRAP_INSTITUTION_NAME'),
        ownerName: required('SCHOLAR_BOOTSTRAP_OWNER_NAME'),
        ownerEmail: required('SCHOLAR_BOOTSTRAP_OWNER_EMAIL').toLowerCase(),
        ownerUsername: required('SCHOLAR_BOOTSTRAP_OWNER_USERNAME'),
        ownerInternalId: required('SCHOLAR_BOOTSTRAP_OWNER_INTERNAL_ID'),
        ownerPassword: required('SCHOLAR_BOOTSTRAP_OWNER_PASSWORD'),
        makePlatformAdmin: process.env.SCHOLAR_BOOTSTRAP_PLATFORM_ADMIN === 'true',
      }),
    ),
  )
} catch (error) {
  console.error(
    error instanceof Error && !error.name.startsWith('Prisma')
      ? error.message
      : 'Bootstrap failed; verify configuration and database availability',
  )
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
