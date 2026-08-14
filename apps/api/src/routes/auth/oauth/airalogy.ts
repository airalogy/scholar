import type { FastifyInstance } from 'fastify'
import type { OauthCallbackBody, OauthCallbackResponse } from '../schema'
import {
  buildOauthCallbackResponse,
  createOauthState,
  createUniqueUsername,
  getConfiguredOauthRedirectUri,
  getOauthProviderUrl,
  normalizeDisplayName,
  normalizePhoneValue,
  pickErrorMessage,
  requestProvider,
  trimToNull,
  verifyOauthState,
} from './shared'

const AIRALOGY_PROVIDER = 'airalogy'
const AIRALOGY_CALLBACK_PATH = '/airalogy_oauth_callback'
const AIRALOGY_USER_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface AiralogyUserInfo {
  id: string
  name: string
  username: string
  email: string
  phone: string | null
  avatar_url: string | null
}

const getAiralogyRedirectUri = (fastify: FastifyInstance): string => {
  return getConfiguredOauthRedirectUri(
    fastify,
    fastify.config.AIRALOGY_OAUTH_REDIRECT_URI,
    AIRALOGY_CALLBACK_PATH,
    'AIRALOGY_OAUTH_REDIRECT_URI',
  )
}

const getAiralogyUrl = (fastify: FastifyInstance, pathname: string): string => {
  return getOauthProviderUrl(
    fastify,
    fastify.config.AIRALOGY_OAUTH_BASE_URL,
    pathname,
    'AIRALOGY_OAUTH_BASE_URL',
  )
}

const exchangeAiralogyAuthorizationCode = async (
  fastify: FastifyInstance,
  code: string,
): Promise<string> => {
  const { response, payload } = await requestProvider(fastify, {
    url: getAiralogyUrl(fastify, '/api/oauth/token'),
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: getAiralogyRedirectUri(fastify),
        client_id: fastify.config.AIRALOGY_OAUTH_CLIENT_ID,
        client_secret: fastify.config.AIRALOGY_OAUTH_CLIENT_SECRET,
      }),
    },
    connectionLogMessage: 'Failed to connect to Airalogy token endpoint',
    connectionErrorMessage: 'Failed to connect to Airalogy OAuth provider',
  })

  if (!response.ok) {
    throw fastify.httpErrors.badGateway(
      `Failed to exchange Airalogy OAuth code: ${pickErrorMessage(payload, response.statusText)}`,
    )
  }

  const accessToken = trimToNull(
    typeof payload?.access_token === 'string' ? payload.access_token : null,
  )

  if (!accessToken) {
    throw fastify.httpErrors.badGateway('Airalogy OAuth token response is missing access_token')
  }

  return accessToken
}

const fetchAiralogyUserInfo = async (
  fastify: FastifyInstance,
  accessToken: string,
): Promise<AiralogyUserInfo> => {
  const { response, payload } = await requestProvider(fastify, {
    url: getAiralogyUrl(fastify, '/api/oauth/userinfo'),
    init: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    connectionLogMessage: 'Failed to connect to Airalogy userinfo endpoint',
    connectionErrorMessage: 'Failed to connect to Airalogy OAuth provider',
  })

  if (!response.ok) {
    throw fastify.httpErrors.badGateway(
      `Failed to fetch Airalogy user info: ${pickErrorMessage(payload, response.statusText)}`,
    )
  }

  const id = trimToNull(typeof payload?.id === 'string' ? payload.id : null)
  const name = trimToNull(typeof payload?.name === 'string' ? payload.name : null)
  const username = trimToNull(typeof payload?.username === 'string' ? payload.username : null)
  const email = trimToNull(typeof payload?.email === 'string' ? payload.email : null)
  const phone = trimToNull(typeof payload?.phone === 'string' ? payload.phone : null)
  const avatarUrl = trimToNull(typeof payload?.avatar_url === 'string' ? payload.avatar_url : null)

  if (!id || !AIRALOGY_USER_ID_RE.test(id)) {
    throw fastify.httpErrors.badGateway('Airalogy user info contains an invalid user id')
  }

  if (!email) {
    throw fastify.httpErrors.badGateway('Airalogy user info is missing email')
  }

  return {
    id,
    name: name ?? '',
    username: username ?? '',
    email: email.toLowerCase(),
    phone,
    avatar_url: avatarUrl,
  }
}

const syncAiralogyUser = async (fastify: FastifyInstance, userInfo: AiralogyUserInfo) => {
  const now = new Date()
  const existingByAiralogyId = await fastify.prisma.users.findUnique({
    where: { airalogy_user_id: userInfo.id },
  })
  const existingByEmail = await fastify.prisma.users.findUnique({
    where: { email: userInfo.email },
  })
  let user = existingByAiralogyId

  if (existingByAiralogyId && existingByEmail && existingByAiralogyId.id !== existingByEmail.id) {
    throw fastify.httpErrors.conflict('This Airalogy account is already linked to another user')
  }

  if (!existingByAiralogyId && existingByEmail) {
    throw fastify.httpErrors.conflict(
      'An existing account uses this email; sign in first and ask an administrator to link Airalogy',
    )
  }

  const avatarUrl = trimToNull(userInfo.avatar_url)
  const phone = normalizePhoneValue(userInfo.phone)
  const displayName =
    trimToNull(userInfo.name) ?? normalizeDisplayName(userInfo.username, userInfo.email)

  if (!user) {
    const username = await createUniqueUsername(fastify, userInfo.username, userInfo.email)
    user = await fastify.prisma.users.create({
      data: {
        email: userInfo.email,
        username,
        name: displayName,
        password_hash: null,
        phone: phone ?? null,
        avatar: avatarUrl,
        airalogy_user_id: userInfo.id,
        createdAt: now,
        updatedAt: now,
      },
    })

    return {
      user,
      avatarUrl,
    }
  }

  const updateData: {
    airalogy_user_id?: string
    avatar?: string | null
    name?: string
    username?: string
    phone?: string
    updatedAt?: Date
  } = {}

  if (avatarUrl) {
    updateData.avatar = avatarUrl
  }

  if (!user.name.trim()) {
    updateData.name = displayName
  }

  if (!user.username.trim()) {
    updateData.username = await createUniqueUsername(fastify, userInfo.username, userInfo.email)
  }

  if (!user.phone && phone) {
    updateData.phone = phone
  }

  if (Object.keys(updateData).length > 0) {
    updateData.updatedAt = now
    user = await fastify.prisma.users.update({
      where: { id: user.id },
      data: updateData,
    })
  }

  return {
    user,
    avatarUrl,
  }
}

export async function createAiralogyOauthAuthorization(
  fastify: FastifyInstance,
  returnTo?: string,
): Promise<string> {
  const url = new URL(getAiralogyUrl(fastify, '/authorize'))

  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', fastify.config.AIRALOGY_OAUTH_CLIENT_ID)
  url.searchParams.set('redirect_uri', getAiralogyRedirectUri(fastify))
  url.searchParams.set('scope', fastify.config.AIRALOGY_OAUTH_SCOPE)
  url.searchParams.set('state', createOauthState(fastify, AIRALOGY_PROVIDER, returnTo))

  return url.toString()
}

export async function completeAiralogyOauthLogin(
  fastify: FastifyInstance,
  data: OauthCallbackBody,
): Promise<OauthCallbackResponse> {
  const returnTo = verifyOauthState(fastify, AIRALOGY_PROVIDER, data.state)
  const accessToken = await exchangeAiralogyAuthorizationCode(fastify, data.code)
  const userInfo = await fetchAiralogyUserInfo(fastify, accessToken)
  const { user, avatarUrl } = await syncAiralogyUser(fastify, userInfo)

  return buildOauthCallbackResponse(fastify, user, avatarUrl, returnTo)
}
