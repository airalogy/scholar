import type { FastifyInstance, FastifyRequest } from 'fastify'

export const ACCESS_TOKEN_TYPE = 'access'

interface JwtPayload {
  userId?: unknown
  token_type?: unknown
}

const PUBLIC_INFRASTRUCTURE_PREFIXES = ['/docs'] as const

const isPathOrChild = (pathname: string, prefix: string): boolean => {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

const getRequestPathname = (requestUrl: string): string => {
  try {
    return new URL(requestUrl, 'http://localhost').pathname
  } catch {
    return requestUrl.split('?')[0] ?? '/'
  }
}

export const isPublicRoute = (requestUrl: string, explicitlyPublic = false): boolean => {
  if (explicitlyPublic) {
    return true
  }

  const pathname = getRequestPathname(requestUrl)
  return PUBLIC_INFRASTRUCTURE_PREFIXES.some((prefix) => isPathOrChild(pathname, prefix))
}

export const resolveAccessTokenUserId = (fastify: FastifyInstance, payload: JwtPayload): string => {
  if (payload.token_type !== undefined && payload.token_type !== ACCESS_TOKEN_TYPE) {
    throw fastify.httpErrors.unauthorized('Unauthorized')
  }

  if (typeof payload.userId !== 'string' || !payload.userId) {
    throw fastify.httpErrors.unauthorized('Unauthorized')
  }

  return payload.userId
}

export const assertUserExists = async (fastify: FastifyInstance, userId: string): Promise<void> => {
  const user = await fastify.prisma.users.findUnique({
    where: { id: userId },
    select: { id: true },
  })

  if (!user) {
    throw fastify.httpErrors.unauthorized('Unauthorized')
  }
}

export const assertTokenUserExists = async (
  fastify: FastifyInstance,
  userId: string,
): Promise<void> => {
  if (!userId) {
    throw fastify.httpErrors.unauthorized('Unauthorized')
  }

  await assertUserExists(fastify, userId)
}

export const resolveOptionalAccessTokenUserId = async (
  fastify: FastifyInstance,
  request: FastifyRequest,
): Promise<string | null> => {
  if (!request.headers.authorization?.startsWith('Bearer ')) {
    return null
  }

  try {
    await request.jwtVerify()
  } catch {
    return null
  }

  if (request.user.token_type === 'integration') {
    throw fastify.httpErrors.forbidden('Integration credentials cannot access user-facing pages')
  }

  try {
    const userId = resolveAccessTokenUserId(fastify, request.user)
    await assertUserExists(fastify, userId)
    return userId
  } catch {
    return null
  }
}

export const signAccessToken = (fastify: FastifyInstance, userId: string): string => {
  return fastify.jwt.sign({ userId, token_type: ACCESS_TOKEN_TYPE })
}
