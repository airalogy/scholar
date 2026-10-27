import bcrypt from 'bcrypt'
import type { PrismaClient } from '../../prisma/generated/client'
import { lockMutationScope } from '../utils/advisory-lock'
import { permissionContext } from './access'
import { upsertInstitutionPerson } from '../utils/institution-people'
import { assertInstitutionInternalId } from '../utils/institution-identifiers'

export interface BootstrapInput {
  institutionName: string
  institutionSlug: string
  ownerName: string
  ownerEmail: string
  ownerUsername: string
  ownerInternalId: string
  ownerPassword: string
  makePlatformAdmin: boolean
}

const validateAccount = (name: string, email: string, username: string, password: string): void => {
  if (
    !name.trim() ||
    name.length > 100 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) ||
    email.length > 100 ||
    username.length < 3 ||
    username.length > 64 ||
    password.trim().length < 12 ||
    Buffer.byteLength(password, 'utf8') > 72
  )
    throw new Error(
      'Valid name, email, username (3–64) and password (12+ characters, at most 72 UTF-8 bytes) are required',
    )
}

export const bootstrapDeployment = async (
  prisma: PrismaClient,
  input: BootstrapInput,
): Promise<{ institutionId: string; userId: string }> => {
  validateAccount(input.ownerName, input.ownerEmail, input.ownerUsername, input.ownerPassword)
  const internalId = assertInstitutionInternalId(input.ownerInternalId)
  const passwordHash = await bcrypt.hash(input.ownerPassword, 10)
  return prisma.$transaction(async (tx) => {
    await lockMutationScope(tx, 'institution', `bootstrap:${input.institutionSlug}`)
    let institution = await tx.institutions.findUnique({ where: { slug: input.institutionSlug } })
    if (institution) {
      await lockMutationScope(tx, 'institution-identity', institution.id)
      institution = await tx.institutions.findUniqueOrThrow({ where: { id: institution.id } })
      if (
        institution.administratorInitializedAt ||
        (await tx.institution_memberships.count({ where: { institutionId: institution.id } }))
      )
        throw new Error(
          'Institution is already initialized; bootstrap never repairs or restores authority. Use recover-admin.',
        )
    } else
      institution = await tx.institutions.create({
        data: { name: input.institutionName, slug: input.institutionSlug },
      })
    if (
      await tx.users.count({
        where: { OR: [{ email: input.ownerEmail }, { username: input.ownerUsername }] },
      })
    )
      throw new Error('Bootstrap requires a new account; existing accounts cannot be adopted')
    await permissionContext(tx, {
      institutionId: institution.id,
      actorLabel: 'Deployment operator',
      source: 'deployment_bootstrap',
      reason: 'First installation owner initialization',
    })
    const user = await tx.users.create({
      data: {
        name: input.ownerName,
        email: input.ownerEmail,
        username: input.ownerUsername,
        password_hash: passwordHash,
        platform_role: input.makePlatformAdmin ? 'platform_admin' : 'member',
      },
    })
    await upsertInstitutionPerson(tx, {
      institutionId: institution.id,
      internalId,
      name: input.ownerName,
      email: input.ownerEmail,
      userId: user.id,
      source: 'deployment_bootstrap',
    })
    await tx.institution_memberships.create({
      data: {
        institutionId: institution.id,
        userId: user.id,
        role: 'owner',
        can_review_content: true,
        can_import_data: true,
      },
    })
    await tx.institutions.update({
      where: { id: institution.id },
      data: { administratorInitializedAt: new Date() },
    })
    return { institutionId: institution.id, userId: user.id }
  })
}

export interface RecoveryInput {
  institutionSlug: string
  operator: string
  reason: string
  confirmation: string
  action: 'create' | 'revoke-platform'
  name?: string
  email?: string
  username?: string
  password?: string
  userId?: string
}

// Host-only entrypoint. No HTTP route calls this function.
export const recoverAdministrator = async (
  prisma: PrismaClient,
  input: RecoveryInput,
): Promise<{ userId: string; expiresAt: string | null }> => {
  if (
    input.confirmation !== `RECOVER ${input.institutionSlug}` ||
    input.operator.trim().length < 3 ||
    input.operator.length > 200 ||
    input.reason.trim().length < 3 ||
    input.reason.length > 1000
  )
    throw new Error('Exact institution confirmation, operator and reason are required')
  if (input.action === 'create')
    validateAccount(input.name ?? '', input.email ?? '', input.username ?? '', input.password ?? '')
  const hash = input.action === 'create' ? await bcrypt.hash(input.password!, 10) : null
  return prisma.$transaction(async (tx) => {
    const institution = await tx.institutions.findUniqueOrThrow({
      where: { slug: input.institutionSlug },
    })
    await lockMutationScope(tx, 'institution-identity', institution.id)
    await permissionContext(tx, {
      institutionId: institution.id,
      actorLabel: input.operator.trim(),
      source: 'host_recovery',
      reason: input.reason.trim(),
    })
    if (input.action === 'revoke-platform') {
      if (!input.userId) throw new Error('An exact user ID is required')
      const user = await tx.users.findUniqueOrThrow({ where: { id: input.userId } })
      if (user.platform_role !== 'platform_admin')
        throw new Error('Target is not a platform administrator')
      await tx.users.update({
        where: { id: user.id },
        data: {
          platform_role: 'member',
          administratorAccessExpiresAt: user.administratorAccessExpiresAt ? new Date() : null,
          updatedAt: new Date(),
        },
      })
      return {
        userId: user.id,
        expiresAt: user.administratorAccessExpiresAt ? new Date().toISOString() : null,
      }
    }
    if (
      await tx.users.count({
        where: { OR: [{ email: input.email! }, { username: input.username! }] },
      })
    )
      throw new Error(
        'Recovery must use a new independent account; no account takeover or password reset is allowed',
      )
    const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000)
    const user = await tx.users.create({
      data: {
        name: input.name!,
        email: input.email!,
        username: input.username!,
        password_hash: hash,
        platform_role: 'platform_admin',
        administratorAccessExpiresAt: expiresAt,
      },
    })
    return { userId: user.id, expiresAt: expiresAt.toISOString() }
  })
}
