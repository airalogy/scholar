import crypto from 'node:crypto'
import bcrypt from 'bcrypt'
import type { FastifyInstance } from 'fastify'
import type {
  CreateInstitutionApiCredentialBody,
  RotateInstitutionApiCredentialBody,
} from './schema'
import { getInstitutionAccessById, type InstitutionAccess } from '../../utils/permissions'
import { INTEGRATION_SCOPES, type IntegrationScope } from '../../utils/integration-auth'
import { lockMutationScope } from '../../utils/advisory-lock'

const SECRET_SALT_ROUNDS = 12
const DEFAULT_EXPIRY_DAYS = 90
const MAX_ACTIVE_CREDENTIALS = 10

interface InstitutionRecord {
  id: string
  slug: string
}

interface CredentialRecord {
  id: string
  name: string
  clientId: string
  scopes: string[]
  expiresAt: Date
  revokedAt: Date | null
  lastUsedAt: Date | null
  lastUsedIp: string | null
  createdAt: Date
  updatedAt: Date
}

const loadInstitution = async (
  fastify: FastifyInstance,
  slug: string,
): Promise<InstitutionRecord> => {
  const institution = await fastify.prisma.institutions.findUnique({
    where: { slug },
    select: { id: true, slug: true },
  })
  if (!institution) {
    throw fastify.httpErrors.notFound('Institution not found')
  }
  return institution
}

const assertCanManageCredentials = async (
  fastify: FastifyInstance,
  userId: string,
  institutionId: string,
): Promise<InstitutionAccess> => {
  const access = await getInstitutionAccessById(fastify, userId, institutionId)
  if (access.platform_role === 'platform_admin' || access.institution_role === 'owner') {
    return access
  }

  throw fastify.httpErrors.forbidden(
    'Only institution owners and platform administrators can manage integration credentials',
  )
}

const normalizeScopes = (scopes: string[]): IntegrationScope[] => {
  const allowed = new Set<string>(INTEGRATION_SCOPES)
  return [...new Set(scopes)].filter((scope): scope is IntegrationScope => allowed.has(scope))
}

const buildExpiry = (days = DEFAULT_EXPIRY_DAYS): Date => {
  const expiresAt = new Date()
  expiresAt.setUTCDate(expiresAt.getUTCDate() + days)
  return expiresAt
}

const buildSecret = (): string => {
  return `sch_secret_${crypto.randomBytes(32).toString('base64url')}`
}

const formatCredential = (credential: CredentialRecord) => {
  const now = Date.now()
  const status = credential.revokedAt
    ? 'revoked'
    : credential.expiresAt.getTime() <= now
      ? 'expired'
      : 'active'

  return {
    id: credential.id,
    name: credential.name,
    clientId: credential.clientId,
    scopes: normalizeScopes(credential.scopes),
    status,
    expiresAt: credential.expiresAt.toISOString(),
    revokedAt: credential.revokedAt?.toISOString() ?? null,
    lastUsedAt: credential.lastUsedAt?.toISOString() ?? null,
    lastUsedIp: credential.lastUsedIp,
    createdAt: credential.createdAt.toISOString(),
    updatedAt: credential.updatedAt.toISOString(),
  } as const
}

const loadCredential = async (
  fastify: FastifyInstance,
  institutionId: string,
  credentialId: string,
) => {
  const credential = await fastify.prisma.institution_api_credentials.findUnique({
    where: { id: credentialId },
  })
  if (!credential || credential.institutionId !== institutionId) {
    throw fastify.httpErrors.notFound('Integration credential not found')
  }
  return credential
}

export const listInstitutionApiCredentials = async (
  fastify: FastifyInstance,
  slug: string,
  currentUserId: string,
) => {
  const institution = await loadInstitution(fastify, slug)
  await assertCanManageCredentials(fastify, currentUserId, institution.id)

  const credentials = await fastify.prisma.institution_api_credentials.findMany({
    where: { institutionId: institution.id },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  })

  return {
    code: 0 as const,
    data: {
      items: credentials.map(formatCredential),
    },
  }
}

export const createInstitutionApiCredential = async (
  fastify: FastifyInstance,
  slug: string,
  currentUserId: string,
  body: CreateInstitutionApiCredentialBody,
) => {
  const institution = await loadInstitution(fastify, slug)
  await assertCanManageCredentials(fastify, currentUserId, institution.id)

  const scopes = normalizeScopes(body.scopes)
  if (scopes.length !== body.scopes.length) {
    throw fastify.httpErrors.badRequest(
      'Credential scopes contain unsupported or duplicated values',
    )
  }

  const clientSecret = buildSecret()
  const now = new Date()
  const secretHash = await bcrypt.hash(clientSecret, SECRET_SALT_ROUNDS)
  const credential = await fastify.prisma.$transaction(async (tx) => {
    await lockMutationScope(tx, 'credentials', institution.id)
    const activeCount = await tx.institution_api_credentials.count({
      where: {
        institutionId: institution.id,
        revokedAt: null,
        expiresAt: { gt: now },
      },
    })
    if (activeCount >= MAX_ACTIVE_CREDENTIALS) {
      throw fastify.httpErrors.badRequest(
        `An institution can have at most ${MAX_ACTIVE_CREDENTIALS} active integration credentials`,
      )
    }

    return tx.institution_api_credentials.create({
      data: {
        institutionId: institution.id,
        name: body.name.trim(),
        clientId: `sch_inst_${crypto.randomBytes(12).toString('hex')}`,
        secretHash,
        scopes,
        expiresAt: buildExpiry(body.expiresInDays),
        createdBy: currentUserId,
        createdAt: now,
        updatedAt: now,
      },
    })
  })

  return {
    code: 0 as const,
    data: {
      credential: formatCredential(credential),
      clientSecret,
    },
  }
}

export const rotateInstitutionApiCredential = async (
  fastify: FastifyInstance,
  slug: string,
  credentialId: string,
  currentUserId: string,
  body: RotateInstitutionApiCredentialBody,
) => {
  const institution = await loadInstitution(fastify, slug)
  await assertCanManageCredentials(fastify, currentUserId, institution.id)
  const existing = await loadCredential(fastify, institution.id, credentialId)
  if (existing.revokedAt) {
    throw fastify.httpErrors.badRequest('Revoked credentials cannot be rotated')
  }

  const clientSecret = buildSecret()
  const now = new Date()
  const credential = await fastify.prisma.institution_api_credentials.update({
    where: { id: credentialId },
    data: {
      secretHash: await bcrypt.hash(clientSecret, SECRET_SALT_ROUNDS),
      secretVersion: { increment: 1 },
      expiresAt: body.expiresInDays ? buildExpiry(body.expiresInDays) : existing.expiresAt,
      updatedAt: now,
    },
  })

  return {
    code: 0 as const,
    data: {
      credential: formatCredential(credential),
      clientSecret,
    },
  }
}

export const revokeInstitutionApiCredential = async (
  fastify: FastifyInstance,
  slug: string,
  credentialId: string,
  currentUserId: string,
) => {
  const institution = await loadInstitution(fastify, slug)
  await assertCanManageCredentials(fastify, currentUserId, institution.id)
  const existing = await loadCredential(fastify, institution.id, credentialId)
  const now = new Date()

  if (!existing.revokedAt) {
    await fastify.prisma.institution_api_credentials.update({
      where: { id: credentialId },
      data: {
        revokedAt: now,
        secretVersion: { increment: 1 },
        updatedAt: now,
      },
    })
  }

  return listInstitutionApiCredentials(fastify, slug, currentUserId)
}
