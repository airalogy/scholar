import bcrypt from 'bcrypt'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { IntegrationTokenBody } from './schema'
import {
  INTEGRATION_SCOPES,
  INTEGRATION_TOKEN_TYPE,
  type IntegrationScope,
} from '../../utils/integration-auth'

const INTEGRATION_TOKEN_TTL_SECONDS = 60 * 60

const assertSecureProductionRequest = (fastify: FastifyInstance, request: FastifyRequest): void => {
  if (fastify.config.NODE_ENV !== 'production') {
    return
  }

  if (request.protocol !== 'https') {
    throw fastify.httpErrors.badRequest('HTTPS is required for integration authentication')
  }
}

export const exchangeIntegrationToken = async (
  fastify: FastifyInstance,
  request: FastifyRequest,
  body: IntegrationTokenBody,
): Promise<{
  access_token: string
  token_type: 'bearer'
  expires_in: number
  scope: string
}> => {
  assertSecureProductionRequest(fastify, request)

  const credential = await fastify.prisma.institution_api_credentials.findUnique({
    where: { clientId: body.client_id },
  })
  const now = new Date()
  const isUsable =
    credential !== null &&
    credential.revokedAt === null &&
    credential.expiresAt.getTime() > now.getTime()
  const secretMatches = isUsable
    ? await bcrypt.compare(body.client_secret, credential.secretHash)
    : false

  if (!credential || !isUsable || !secretMatches) {
    throw fastify.httpErrors.unauthorized('Invalid integration credentials')
  }

  const scopes = credential.scopes.filter((scope): scope is IntegrationScope => {
    return INTEGRATION_SCOPES.includes(scope as IntegrationScope)
  })

  const accessToken = fastify.jwt.sign(
    {
      userId: credential.createdBy,
      token_type: INTEGRATION_TOKEN_TYPE,
      credentialId: credential.id,
      institutionId: credential.institutionId,
      scopes,
      credentialVersion: credential.secretVersion,
    },
    {
      expiresIn: INTEGRATION_TOKEN_TTL_SECONDS,
    },
  )

  await fastify.prisma.institution_api_credentials.update({
    where: { id: credential.id },
    data: {
      lastUsedAt: now,
      lastUsedIp: request.ip,
      updatedAt: now,
    },
  })

  return {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: INTEGRATION_TOKEN_TTL_SECONDS,
    scope: scopes.join(' '),
  }
}
