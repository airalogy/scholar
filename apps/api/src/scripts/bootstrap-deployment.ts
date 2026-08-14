import bcrypt from 'bcrypt'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../prisma/generated/client'

interface BootstrapInput {
  institutionName: string
  institutionSlug: string
  ownerName: string
  ownerEmail: string
  ownerUsername: string
  ownerPassword: string
  makePlatformAdmin: boolean
}

const requireEnvironmentValue = (name: string): string => {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} is required`)
  }
  return value
}

const readInput = (): BootstrapInput => {
  const institutionSlug = requireEnvironmentValue('SCHOLAR_BOOTSTRAP_INSTITUTION_SLUG')
  const ownerEmail = requireEnvironmentValue('SCHOLAR_BOOTSTRAP_OWNER_EMAIL').toLowerCase()
  const ownerUsername = requireEnvironmentValue('SCHOLAR_BOOTSTRAP_OWNER_USERNAME')
  const ownerPassword = requireEnvironmentValue('SCHOLAR_BOOTSTRAP_OWNER_PASSWORD')

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(institutionSlug)) {
    throw new Error(
      'SCHOLAR_BOOTSTRAP_INSTITUTION_SLUG must use lowercase letters, numbers, and hyphens',
    )
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(ownerEmail)) {
    throw new Error('SCHOLAR_BOOTSTRAP_OWNER_EMAIL must be a valid email address')
  }
  if (ownerUsername.length < 3 || ownerUsername.length > 64) {
    throw new Error('SCHOLAR_BOOTSTRAP_OWNER_USERNAME must contain 3 to 64 characters')
  }
  if (ownerPassword.length < 12) {
    throw new Error('SCHOLAR_BOOTSTRAP_OWNER_PASSWORD must contain at least 12 characters')
  }

  return {
    institutionName: requireEnvironmentValue('SCHOLAR_BOOTSTRAP_INSTITUTION_NAME'),
    institutionSlug,
    ownerName: requireEnvironmentValue('SCHOLAR_BOOTSTRAP_OWNER_NAME'),
    ownerEmail,
    ownerUsername,
    ownerPassword,
    makePlatformAdmin: process.env.SCHOLAR_BOOTSTRAP_PLATFORM_ADMIN === 'true',
  }
}

const main = async (): Promise<void> => {
  const databaseUrl = requireEnvironmentValue('DATABASE_URL')
  const input = readInput()
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const matchedUsers = await transaction.users.findMany({
        where: {
          OR: [{ email: input.ownerEmail }, { username: input.ownerUsername }],
        },
      })

      if (matchedUsers.length > 1) {
        throw new Error('The bootstrap email and username belong to different existing users')
      }

      const existingUser = matchedUsers[0]
      if (
        existingUser &&
        (existingUser.email !== input.ownerEmail || existingUser.username !== input.ownerUsername)
      ) {
        throw new Error('The existing bootstrap user does not match both email and username')
      }

      const user = existingUser
        ? await transaction.users.update({
            where: { id: existingUser.id },
            data: {
              name: input.ownerName,
              platform_role: input.makePlatformAdmin
                ? 'platform_admin'
                : existingUser.platform_role,
              updatedAt: new Date(),
            },
          })
        : await transaction.users.create({
            data: {
              name: input.ownerName,
              email: input.ownerEmail,
              username: input.ownerUsername,
              password_hash: await bcrypt.hash(input.ownerPassword, 10),
              platform_role: input.makePlatformAdmin ? 'platform_admin' : 'member',
            },
          })

      const institution = await transaction.institutions.upsert({
        where: { slug: input.institutionSlug },
        create: {
          name: input.institutionName,
          slug: input.institutionSlug,
        },
        update: {
          name: input.institutionName,
          updatedAt: new Date(),
        },
      })

      await transaction.institution_memberships.upsert({
        where: {
          institutionId_userId: {
            institutionId: institution.id,
            userId: user.id,
          },
        },
        create: {
          institutionId: institution.id,
          userId: user.id,
          role: 'owner',
          can_review_content: true,
          can_import_data: true,
        },
        update: {
          role: 'owner',
          can_review_content: true,
          can_import_data: true,
          updatedAt: new Date(),
        },
      })

      return { institution, user, createdUser: !existingUser }
    })

    console.log(
      JSON.stringify({
        institution: {
          id: result.institution.id,
          name: result.institution.name,
          slug: result.institution.slug,
        },
        owner: {
          id: result.user.id,
          email: result.user.email,
          username: result.user.username,
          platformRole: result.user.platform_role,
          created: result.createdUser,
        },
      }),
    )
  } finally {
    await prisma.$disconnect()
  }
}

await main()
