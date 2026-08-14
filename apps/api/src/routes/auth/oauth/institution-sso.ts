import type { FastifyInstance } from 'fastify'
import type { OauthCallbackBody, OauthCallbackResponse } from '../schema'
import {
  buildOauthCallbackResponse,
  createOauthState,
  createUniqueUsername,
  ensureInstitutionMembershipBySlug,
  getConfiguredOauthRedirectUri,
  normalizeDisplayName,
  pickErrorMessage,
  requestProvider,
  trimToNull,
  verifyOauthState,
} from './shared'

const INSTITUTION_SSO_CALLBACK_PATH = '/institution_sso_callback'

interface InstitutionSsoProfile {
  email: string
  externalId: string
  name: string
}

interface InstitutionSsoUser {
  id: string
  name: string
  username: string
}

interface InstitutionSsoSyncResult {
  user: InstitutionSsoUser
}

const getInstitutionSsoUrl = (fastify: FastifyInstance, value: string, envName: string): string => {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error(`${envName} must use http or https`)
    }
    return url.toString()
  } catch (error) {
    fastify.log.error({ err: error }, `Invalid ${envName}`)
    throw fastify.httpErrors.internalServerError('Institution SSO provider URL is misconfigured')
  }
}

const getInstitutionSsoRedirectUri = (fastify: FastifyInstance): string => {
  return getConfiguredOauthRedirectUri(
    fastify,
    fastify.deployment.institutionSso.redirectUri,
    INSTITUTION_SSO_CALLBACK_PATH,
    'INSTITUTION_SSO_REDIRECT_URI',
  )
}

const readProfileString = (payload: Record<string, unknown>, fieldPath: string): string | null => {
  const value = fieldPath.split('.').reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return null
    }
    return (current as Record<string, unknown>)[key]
  }, payload)

  if (typeof value === 'string') {
    return trimToNull(value)
  }

  if (typeof value === 'number') {
    return value.toString()
  }

  return null
}

const exchangeAuthorizationCode = async (
  fastify: FastifyInstance,
  code: string,
): Promise<string> => {
  const config = fastify.deployment.institutionSso
  const { response, payload } = await requestProvider(fastify, {
    url: getInstitutionSsoUrl(fastify, config.tokenUrl, 'INSTITUTION_SSO_TOKEN_URL'),
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: getInstitutionSsoRedirectUri(fastify),
        grant_type: 'authorization_code',
        code,
      }),
    },
    connectionLogMessage: 'Failed to connect to institution SSO token endpoint',
    connectionErrorMessage: 'Failed to connect to institution SSO provider',
  })

  if (!response.ok) {
    throw fastify.httpErrors.badGateway(
      `Failed to exchange institution SSO code: ${pickErrorMessage(payload, response.statusText)}`,
    )
  }

  const accessToken = trimToNull(
    typeof payload?.access_token === 'string' ? payload.access_token : null,
  )
  if (!accessToken) {
    throw fastify.httpErrors.badGateway('Institution SSO token response is missing access_token')
  }

  return accessToken
}

const fetchInstitutionSsoProfile = async (
  fastify: FastifyInstance,
  accessToken: string,
): Promise<InstitutionSsoProfile> => {
  const config = fastify.deployment.institutionSso
  const url = new URL(
    getInstitutionSsoUrl(fastify, config.userInfoUrl, 'INSTITUTION_SSO_USERINFO_URL'),
  )
  const headers: Record<string, string> = {}

  if (config.userInfoTokenMode === 'query') {
    url.searchParams.set('access_token', accessToken)
  } else {
    headers.Authorization = `Bearer ${accessToken}`
  }

  const { response, payload } = await requestProvider(fastify, {
    url: url.toString(),
    init: { headers },
    connectionLogMessage: 'Failed to connect to institution SSO user-info endpoint',
    connectionErrorMessage: 'Failed to connect to institution SSO provider',
  })

  if (!response.ok) {
    throw fastify.httpErrors.badGateway(
      `Failed to fetch institution SSO user info: ${pickErrorMessage(payload, response.statusText)}`,
    )
  }
  if (!payload) {
    throw fastify.httpErrors.badGateway('Institution SSO user-info response is invalid')
  }

  const email = readProfileString(payload, config.emailField)
  const externalId = readProfileString(payload, config.externalIdField)
  const name = readProfileString(payload, config.nameField)

  if (!email) {
    throw fastify.httpErrors.badGateway(`Institution SSO user info is missing ${config.emailField}`)
  }
  if (!externalId) {
    throw fastify.httpErrors.badGateway(
      `Institution SSO user info is missing ${config.externalIdField}`,
    )
  }

  return {
    email: email.toLowerCase(),
    externalId,
    name: name ?? '',
  }
}

const syncInstitutionSsoUser = async (
  fastify: FastifyInstance,
  profile: InstitutionSsoProfile,
): Promise<InstitutionSsoSyncResult> => {
  const config = fastify.deployment.institutionSso
  const now = new Date()
  const displayName = normalizeDisplayName(profile.name, profile.email, profile.externalId)
  const identity = await fastify.prisma.user_external_identities.findUnique({
    where: {
      provider_externalId: {
        provider: config.providerId,
        externalId: profile.externalId,
      },
    },
    include: {
      user: true,
    },
  })
  let user = identity?.user

  if (!user) {
    const existingByEmail = await fastify.prisma.users.findUnique({
      where: { email: profile.email },
      include: {
        institution_memberships: {
          where: {
            institution: {
              slug: fastify.deployment.institutionLogin.institutionSlug,
            },
          },
          select: { id: true },
        },
      },
    })
    if (existingByEmail) {
      if (existingByEmail.institution_memberships.length === 0) {
        throw fastify.httpErrors.conflict(
          'A local account already uses this email but is not linked to the SSO institution',
        )
      }

      await fastify.prisma.user_external_identities.create({
        data: {
          userId: existingByEmail.id,
          provider: config.providerId,
          externalId: profile.externalId,
          createdAt: now,
          updatedAt: now,
        },
      })
      user = existingByEmail
    }

    if (!user) {
      const username = await createUniqueUsername(fastify, null, profile.email)
      user = await fastify.prisma.users.create({
        data: {
          email: profile.email,
          username,
          password_hash: null,
          name: displayName,
          createdAt: now,
          updatedAt: now,
          external_identities: {
            create: {
              provider: config.providerId,
              externalId: profile.externalId,
              createdAt: now,
              updatedAt: now,
            },
          },
        },
      })
    }

    return { user }
  }

  const updateData: {
    name?: string
    updatedAt?: Date
  } = {}

  if (!user.name.trim()) {
    updateData.name = displayName
  }
  if (Object.keys(updateData).length > 0) {
    updateData.updatedAt = now
    user = await fastify.prisma.users.update({
      where: { id: user.id },
      data: updateData,
    })
  }

  return { user }
}

export const createInstitutionSsoAuthorization = (
  fastify: FastifyInstance,
  returnTo?: string,
): string => {
  const config = fastify.deployment.institutionSso
  const url = new URL(
    getInstitutionSsoUrl(fastify, config.authorizationUrl, 'INSTITUTION_SSO_AUTHORIZATION_URL'),
  )

  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', getInstitutionSsoRedirectUri(fastify))
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', config.scope)
  url.searchParams.set('state', createOauthState(fastify, config.providerId, returnTo))

  return url.toString()
}

export const completeInstitutionSsoLogin = async (
  fastify: FastifyInstance,
  data: OauthCallbackBody,
): Promise<OauthCallbackResponse> => {
  const config = fastify.deployment.institutionSso
  const returnTo = verifyOauthState(fastify, config.providerId, data.state)
  const accessToken = await exchangeAuthorizationCode(fastify, data.code)
  const profile = await fetchInstitutionSsoProfile(fastify, accessToken)
  const { user } = await syncInstitutionSsoUser(fastify, profile)

  await ensureInstitutionMembershipBySlug(fastify, {
    institutionSlug: fastify.deployment.institutionLogin.institutionSlug,
    userId: user.id,
  })

  return buildOauthCallbackResponse(fastify, user, null, returnTo)
}
