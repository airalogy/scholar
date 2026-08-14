import jwt from '@fastify/jwt'
import fp from 'fastify-plugin'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { assertUserExists, isPublicRoute, resolveAccessTokenUserId } from '../../utils/auth'
import { INTEGRATION_TOKEN_TYPE, type IntegrationScope } from '../../utils/integration-auth'

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      userId: string
      token_type?: 'access' | 'file_access' | 'storage_access' | 'integration'
      fileId?: string
      key?: string
      mode?: 'preview' | 'download'
      paperId?: string | null
      credentialId?: string
      institutionId?: string
      scopes?: IntegrationScope[]
      credentialVersion?: number
    }
    user: {
      userId: string
      token_type?: 'access' | 'file_access' | 'storage_access' | 'integration'
      fileId?: string
      key?: string
      mode?: 'preview' | 'download'
      paperId?: string | null
      credentialId?: string
      institutionId?: string
      scopes?: IntegrationScope[]
      credentialVersion?: number
    }
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>
  }

  interface FastifyContextConfig {
    publicRoute?: boolean
    allowIntegrationAuth?: boolean
    integrationScopes?: IntegrationScope[]
  }
}

const authenticateIntegration = async (
  fastify: FastifyInstance,
  request: FastifyRequest,
): Promise<void> => {
  if (request.routeOptions.config.allowIntegrationAuth !== true) {
    throw fastify.httpErrors.forbidden('Integration credentials cannot access this endpoint')
  }

  const credentialId = request.user.credentialId
  const institutionId = request.user.institutionId
  const credentialVersion = request.user.credentialVersion
  const scopes = request.user.scopes ?? []
  if (!credentialId || !institutionId || !Number.isInteger(credentialVersion)) {
    throw fastify.httpErrors.unauthorized('Invalid integration token')
  }

  const credential = await fastify.prisma.institution_api_credentials.findUnique({
    where: { id: credentialId },
  })
  const now = new Date()
  if (
    !credential ||
    credential.institutionId !== institutionId ||
    credential.revokedAt !== null ||
    credential.expiresAt.getTime() <= now.getTime() ||
    credential.secretVersion !== credentialVersion
  ) {
    throw fastify.httpErrors.unauthorized('Integration credential is no longer valid')
  }

  const requiredScopes = request.routeOptions.config.integrationScopes ?? []
  if (
    requiredScopes.some((scope) => !scopes.includes(scope) || !credential.scopes.includes(scope))
  ) {
    throw fastify.httpErrors.forbidden('Integration credential scope is insufficient')
  }

  await fastify.prisma.institution_api_credentials.update({
    where: { id: credential.id },
    data: {
      lastUsedAt: now,
      lastUsedIp: request.ip,
      updatedAt: now,
    },
  })
}

export default fp(async (fastify: FastifyInstance) => {
  await fastify.register(jwt, {
    secret: fastify.config.JWT_SECRET,
    sign: {
      expiresIn: '30d',
    },
  })

  fastify.decorate('authenticate', async (request: FastifyRequest) => {
    try {
      await request.jwtVerify()
    } catch {
      throw fastify.httpErrors.unauthorized('Unauthorized')
    }

    if (request.user.token_type === INTEGRATION_TOKEN_TYPE) {
      await authenticateIntegration(fastify, request)
      return
    }

    const userId = resolveAccessTokenUserId(fastify, request.user)
    await assertUserExists(fastify, userId)
  })

  fastify.addHook('onRequest', async (request) => {
    if (isPublicRoute(request.url, request.routeOptions.config.publicRoute === true)) {
      return
    }

    await fastify.authenticate(request)
  })
})
