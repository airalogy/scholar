import type { FastifyInstance } from 'fastify'

export const PROTECTED_FILE_SECURITY_PROFILE = 'institution_document'
export const STANDARD_FILE_SECURITY_PROFILE = 'standard'

export type ProtectedFileAccessMode = 'preview' | 'download'

export interface ProtectedFileAccessTokenPayload {
  fileId: string
  userId: string
  mode: ProtectedFileAccessMode
  paperId?: string | null
}

const FILE_ACCESS_TOKEN_TYPE = 'file_access'
const FILE_ACCESS_TOKEN_TTL = '10m'

export const isProtectedSecurityProfile = (profile?: string | null): boolean => {
  return profile === PROTECTED_FILE_SECURITY_PROFILE
}

export const createProtectedFileAccessToken = (
  fastify: FastifyInstance,
  payload: ProtectedFileAccessTokenPayload,
): string => {
  return fastify.jwt.sign(
    {
      token_type: FILE_ACCESS_TOKEN_TYPE,
      ...payload,
    },
    {
      expiresIn: FILE_ACCESS_TOKEN_TTL,
    },
  )
}

export const buildProtectedFileAccessUrl = (fileId: string, token: string): string => {
  return `/api/files/access/${fileId}?token=${encodeURIComponent(token)}`
}

export const buildProtectedFileAccessUrls = (
  fastify: FastifyInstance,
  payload: Omit<ProtectedFileAccessTokenPayload, 'mode'>,
) => {
  const previewToken = createProtectedFileAccessToken(fastify, {
    ...payload,
    mode: 'preview',
  })
  const downloadToken = createProtectedFileAccessToken(fastify, {
    ...payload,
    mode: 'download',
  })

  return {
    previewUrl: buildProtectedFileAccessUrl(payload.fileId, previewToken),
    downloadUrl: buildProtectedFileAccessUrl(payload.fileId, downloadToken),
  }
}

export const verifyProtectedFileAccessToken = (
  fastify: FastifyInstance,
  token: string,
): ProtectedFileAccessTokenPayload => {
  const payload = fastify.jwt.verify<
    ProtectedFileAccessTokenPayload & {
      token_type?: string
    }
  >(token)

  if (payload.token_type !== FILE_ACCESS_TOKEN_TYPE) {
    throw fastify.httpErrors.unauthorized('Invalid file access token')
  }

  if (payload.mode !== 'preview' && payload.mode !== 'download') {
    throw fastify.httpErrors.badRequest('Invalid file access mode')
  }

  return {
    fileId: payload.fileId,
    userId: payload.userId,
    mode: payload.mode,
    paperId: payload.paperId ?? null,
  }
}
