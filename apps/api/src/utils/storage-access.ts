import type { FastifyInstance } from 'fastify'

export interface SignedStorageAccessTokenPayload {
  key: string
}

const STORAGE_ACCESS_TOKEN_TYPE = 'storage_access'

export const createSignedStorageAccessToken = (
  fastify: FastifyInstance,
  payload: SignedStorageAccessTokenPayload,
  expiresInSeconds = 3600,
): string => {
  const tokenPayload = {
    userId: '',
    token_type: STORAGE_ACCESS_TOKEN_TYPE,
    key: payload.key,
  } as const

  return fastify.jwt.sign(tokenPayload, {
    expiresIn: `${expiresInSeconds}s`,
  })
}

export const buildSignedStorageAccessUrl = (token: string): string => {
  return `/api/files/access/storage?token=${encodeURIComponent(token)}`
}

export const verifySignedStorageAccessToken = (
  fastify: FastifyInstance,
  token: string,
): SignedStorageAccessTokenPayload => {
  const payload = fastify.jwt.verify<
    SignedStorageAccessTokenPayload & {
      token_type?: string
    }
  >(token)

  if (payload.token_type !== STORAGE_ACCESS_TOKEN_TYPE) {
    throw fastify.httpErrors.unauthorized('Invalid storage access token')
  }

  return {
    key: payload.key,
  }
}
