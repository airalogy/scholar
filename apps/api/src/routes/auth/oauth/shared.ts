import { createHmac, timingSafeEqual } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { OauthCallbackResponse } from '../schema'
import { signAccessToken } from '../../../utils/auth'

const DEFAULT_RETURN_TO = '/chat'
const OAUTH_STATE_EXPIRES_IN_SECONDS = 10 * 60
const MAX_USERNAME_LENGTH = 64
const MAX_PHONE_LENGTH = 11

export const SALT_ROUNDS = 10

interface OauthStatePayload {
  provider: string
  returnTo: string
  exp: number
}

export interface ProviderRequestResult {
  response: Response
  payload: Record<string, unknown> | null
}

export const normalizeReturnTo = (returnTo?: string): string => {
  const rawValue = returnTo?.trim()
  if (!rawValue || !rawValue.startsWith('/') || rawValue.startsWith('//')) {
    return DEFAULT_RETURN_TO
  }

  try {
    const normalized = new URL(rawValue, 'https://airalogy-scholar.local')
    return `${normalized.pathname}${normalized.search}${normalized.hash}` || DEFAULT_RETURN_TO
  } catch {
    return DEFAULT_RETURN_TO
  }
}

export const getConfiguredOauthRedirectUri = (
  fastify: FastifyInstance,
  redirectUri: string,
  expectedPathname: string,
  envName: string,
): string => {
  try {
    const url = new URL(redirectUri)
    if (url.pathname !== expectedPathname) {
      throw new Error(`${envName} must point to ${expectedPathname}`)
    }
    return url.toString()
  } catch (error) {
    fastify.log.error({ err: error }, `Invalid ${envName}`)
    throw fastify.httpErrors.internalServerError('OAuth redirect URI is misconfigured')
  }
}

export const getOauthProviderUrl = (
  fastify: FastifyInstance,
  baseUrl: string,
  pathname: string,
  envName: string,
): string => {
  try {
    return new URL(pathname, baseUrl).toString()
  } catch (error) {
    fastify.log.error({ err: error }, `Invalid ${envName}`)
    throw fastify.httpErrors.internalServerError('OAuth provider URL is misconfigured')
  }
}

const signOauthState = (fastify: FastifyInstance, payload: OauthStatePayload): string => {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', fastify.config.JWT_SECRET)
    .update(encodedPayload)
    .digest('base64url')

  return `${encodedPayload}.${signature}`
}

export const createOauthState = (
  fastify: FastifyInstance,
  provider: string,
  returnTo?: string,
): string => {
  return signOauthState(fastify, {
    provider,
    returnTo: normalizeReturnTo(returnTo),
    exp: Date.now() + OAUTH_STATE_EXPIRES_IN_SECONDS * 1000,
  })
}

export const verifyOauthState = (
  fastify: FastifyInstance,
  provider: string,
  state: string,
): string => {
  const [encodedPayload, signature] = state.split('.')
  if (!encodedPayload || !signature) {
    throw fastify.httpErrors.badRequest('OAuth state is invalid or expired')
  }

  const expectedSignature = createHmac('sha256', fastify.config.JWT_SECRET)
    .update(encodedPayload)
    .digest('base64url')
  const signatureBuffer = Buffer.from(signature)
  const expectedSignatureBuffer = Buffer.from(expectedSignature)

  if (
    signatureBuffer.length !== expectedSignatureBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
  ) {
    throw fastify.httpErrors.badRequest('OAuth state is invalid or expired')
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as Partial<OauthStatePayload>

    if (
      payload.provider !== provider ||
      typeof payload.returnTo !== 'string' ||
      typeof payload.exp !== 'number' ||
      payload.exp < Date.now()
    ) {
      throw new Error('Invalid OAuth state payload')
    }

    return normalizeReturnTo(payload.returnTo)
  } catch {
    throw fastify.httpErrors.badRequest('OAuth state is invalid or expired')
  }
}

export const readJsonObject = async (
  response: Response,
): Promise<Record<string, unknown> | null> => {
  try {
    const responseBody = await response.text()
    let payload: unknown

    try {
      payload = JSON.parse(responseBody)
    } catch {
      payload = Object.fromEntries(new URLSearchParams(responseBody))
    }

    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      return payload as Record<string, unknown>
    }
    return null
  } catch {
    return null
  }
}

export const pickErrorMessage = (
  payload: Record<string, unknown> | null,
  fallback: string,
): string => {
  const candidates = [payload?.detail, payload?.message, payload?.error_description, payload?.error]
  const message = candidates.find(
    (candidate) => typeof candidate === 'string' && candidate.trim().length > 0,
  )

  return typeof message === 'string' ? message : fallback
}

export const requestProvider = async (
  fastify: FastifyInstance,
  options: {
    url: string
    init?: RequestInit
    connectionLogMessage: string
    connectionErrorMessage: string
  },
): Promise<ProviderRequestResult> => {
  let response: Response

  try {
    response = await fetch(options.url, options.init)
  } catch (error) {
    fastify.log.error({ err: error }, options.connectionLogMessage)
    throw fastify.httpErrors.badGateway(options.connectionErrorMessage)
  }

  return {
    response,
    payload: await readJsonObject(response),
  }
}

export const trimToNull = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  return normalized ? normalized : null
}

export const normalizePhoneValue = (phone: string | null): string | null => {
  const normalized = trimToNull(phone)
  if (!normalized || normalized.length > MAX_PHONE_LENGTH) {
    return null
  }
  return normalized
}

const getEmailLocalPart = (email: string): string => {
  const [localPart = ''] = email.split('@')
  return localPart.trim()
}

export const normalizeDisplayName = (
  username: string | null,
  email: string,
  fallback?: string | null,
): string => {
  const emailLocalPart = getEmailLocalPart(email)
  return (trimToNull(username) ?? trimToNull(fallback) ?? emailLocalPart) || 'OAuth User'
}

const normalizeUsernameSeed = (username: string | null, email: string): string => {
  const emailLocalPart = getEmailLocalPart(email)
  const rawValue = (trimToNull(username) ?? emailLocalPart) || 'oauth_user'
  const normalized = rawValue.replace(/\s+/g, '_').replace(/^_+|_+$/g, '')

  if (normalized.length >= 3) {
    return normalized.slice(0, MAX_USERNAME_LENGTH)
  }

  return 'oauth_user'
}

const buildUsernameCandidate = (base: string, suffix = ''): string => {
  if (!suffix) {
    return base.slice(0, MAX_USERNAME_LENGTH)
  }

  const trimmedBase = base.slice(0, Math.max(1, MAX_USERNAME_LENGTH - suffix.length))
  return `${trimmedBase}${suffix}`
}

export const createUniqueUsername = async (
  fastify: FastifyInstance,
  username: string | null,
  email: string,
): Promise<string> => {
  const baseUsername = normalizeUsernameSeed(username, email)

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const suffix = attempt === 0 ? '' : `_${attempt + 1}`
    const candidate = buildUsernameCandidate(baseUsername, suffix)
    const existingUser = await fastify.prisma.users.findUnique({
      where: { username: candidate },
      select: { id: true },
    })

    if (!existingUser) {
      return candidate
    }
  }

  const fallbackCandidate = buildUsernameCandidate(baseUsername, `_${Date.now().toString(36)}`)
  const existingFallback = await fastify.prisma.users.findUnique({
    where: { username: fallbackCandidate },
    select: { id: true },
  })

  if (existingFallback) {
    throw fastify.httpErrors.conflict('Unable to generate a unique username for the OAuth user')
  }

  return fallbackCandidate
}

export const normalizeGenderValue = (value: string | null | undefined): string | null => {
  const normalized = trimToNull(value)?.toLowerCase()
  if (!normalized) {
    return null
  }

  if (['male', 'm', '1', '男'].includes(normalized)) {
    return 'male'
  }

  if (['female', 'f', '2', '女'].includes(normalized)) {
    return 'female'
  }

  if (['other', '3', '其他', 'unknown', '未知'].includes(normalized)) {
    return 'other'
  }

  return null
}

export const buildOauthCallbackResponse = (
  fastify: FastifyInstance,
  user: {
    id: string
    name: string
    username: string
  },
  avatarUrl: string | null,
  returnTo: string,
): OauthCallbackResponse => {
  return {
    access_token: signAccessToken(fastify, user.id),
    token_type: 'bearer',
    name: user.name,
    username: user.username,
    avatar_url: avatarUrl,
    redirect_to: normalizeReturnTo(returnTo),
  }
}

export const ensureInstitutionMembershipBySlug = async (
  fastify: FastifyInstance,
  options: {
    institutionSlug: string
    userId: string
  },
): Promise<void> => {
  const institution = await fastify.prisma.institutions.findUnique({
    where: {
      slug: options.institutionSlug,
    },
    select: {
      id: true,
    },
  })

  if (!institution) {
    throw fastify.httpErrors.internalServerError(
      `${options.institutionSlug} institution is not configured`,
    )
  }

  const now = new Date()
  await fastify.prisma.institution_memberships.upsert({
    where: {
      institutionId_userId: {
        institutionId: institution.id,
        userId: options.userId,
      },
    },
    create: {
      institutionId: institution.id,
      userId: options.userId,
      role: 'member',
      can_review_content: false,
      createdAt: now,
      updatedAt: now,
    },
    update: {
      updatedAt: now,
    },
  })
}
