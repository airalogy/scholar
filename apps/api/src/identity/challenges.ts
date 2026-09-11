import crypto from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { getConfiguredInstitution } from '../utils/institution-scope'
import { normalizeInstitutionInternalId } from '../utils/institution-identifiers'
import type { institution_identity_challenges } from '../../prisma/generated/client'
import type { Static } from 'typebox'
import type { IdentityConflictResponse } from './schema'

export interface VerifiedSsoProfile {
  email: string
  internalId: string
  name: string
}

export class InstitutionIdentityLinkRequired extends Error {
  readonly statusCode = 409
  constructor(readonly profile: VerifiedSsoProfile) {
    super('Institution identity verification is required')
  }
}

export const assertHumanIdentityRequest = async (
  fastify: FastifyInstance,
  request: FastifyRequest,
): Promise<void> => {
  if (!fastify.deployment.auth.enableInstitutionSso) throw fastify.httpErrors.notFound('Not found')
  if (!request.headers.authorization) return
  try {
    await request.jwtVerify()
  } catch {
    // Applicant access is established exclusively by the short-lived proof.
    // An expired unrelated login cookie does not prevent identity recovery.
    return
  }
  if (request.user.token_type === 'integration')
    throw fastify.httpErrors.forbidden('Integration credentials cannot verify personal identities')
}

const hashProof = (token: string): string => crypto.createHash('sha256').update(token).digest('hex')

export const createIdentityChallenge = async (
  fastify: FastifyInstance,
  profile: VerifiedSsoProfile,
): Promise<Static<typeof IdentityConflictResponse>> => {
  const institution = await getConfiguredInstitution(fastify)
  const token = crypto.randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
  // No provider tokens or passwords are persisted. Expired proof data is removed.
  await fastify.prisma.institution_identity_challenges.deleteMany({
    where: { institutionId: institution.id, expiresAt: { lte: new Date() } },
  })
  await fastify.prisma.institution_identity_challenges.create({
    data: {
      institutionId: institution.id,
      tokenHash: hashProof(token),
      provider: fastify.deployment.institutionSso.providerId,
      internalId: profile.internalId,
      normalizedId: normalizeInstitutionInternalId(profile.internalId),
      name: profile.name,
      email: profile.email,
      expiresAt,
    },
  })
  return {
    code: 409 as const,
    message: 'Institution identity verification is required',
    data: {
      reason: 'institution_identity_conflict' as const,
      proofToken: token,
      expiresAt: expiresAt.toISOString(),
    },
  }
}

export const readIdentityChallenge = async (
  fastify: FastifyInstance,
  token: string,
): Promise<institution_identity_challenges> => {
  const institution = await getConfiguredInstitution(fastify)
  const challenge = await fastify.prisma.institution_identity_challenges.findUnique({
    where: { tokenHash: hashProof(token) },
  })
  if (
    !challenge ||
    challenge.expiresAt.getTime() <= Date.now() ||
    challenge.institutionId !== institution.id ||
    challenge.provider !== fastify.deployment.institutionSso.providerId
  ) {
    throw fastify.httpErrors.unauthorized(
      'Verification session expired; sign in with your institution again',
    )
  }
  const identifier = await fastify.prisma.institution_person_identifiers.findUnique({
    where: {
      institutionId_normalizedValue: {
        institutionId: institution.id,
        normalizedValue: challenge.normalizedId,
      },
    },
    include: { person: { select: { is_active: true } } },
  })
  if (identifier?.revokedAt || identifier?.person.is_active === false)
    throw fastify.httpErrors.forbidden('Institution identity is inactive')
  return challenge
}
