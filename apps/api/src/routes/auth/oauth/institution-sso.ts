import type { FastifyInstance } from 'fastify'
import type { OauthCallbackBody, OauthCallbackResponse } from '../schema'
import {
  buildOauthCallbackResponse,
  createOauthState,
  createUniqueUsername,
  getConfiguredOauthRedirectUri,
  normalizeDisplayName,
  pickErrorMessage,
  requestProvider,
  trimToNull,
  verifyOauthState,
} from './shared'
import {
  normalizeInstitutionInternalId,
  upsertInstitutionPerson,
} from '../../../utils/institution-people'
import {
  assertInstitutionInternalId,
  resolveInstitutionIdentifier,
} from '../../../utils/institution-identifiers'
import { lockMutationScope } from '../../../utils/advisory-lock'
import { InstitutionIdentityLinkRequired } from '../../../identity/challenges'

const INSTITUTION_SSO_CALLBACK_PATH = '/institution_sso_callback'

interface InstitutionSsoProfile {
  email: string
  internalId: string
  name: string
}

interface InstitutionSsoUser {
  id: string
  name: string
  username: string
}

interface InstitutionSsoSyncResult {
  user: InstitutionSsoUser
  identifierId: string
  identifierVersion: number
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
  const internalId = readProfileString(payload, config.internalIdField)
  const name = readProfileString(payload, config.nameField)

  if (!email) {
    throw fastify.httpErrors.badGateway(`Institution SSO user info is missing ${config.emailField}`)
  }
  if (!internalId) {
    throw fastify.httpErrors.badGateway(
      `Institution SSO user info is missing ${config.internalIdField}`,
    )
  }
  assertInstitutionInternalId(internalId)
  if (email.length > 100 || (name?.length ?? 0) > 100) {
    throw fastify.httpErrors.badGateway('Institution SSO profile exceeds supported field lengths')
  }

  return {
    email: email.toLowerCase(),
    internalId,
    name: name ?? '',
  }
}

const syncInstitutionSsoUser = async (
  fastify: FastifyInstance,
  profile: InstitutionSsoProfile,
): Promise<InstitutionSsoSyncResult> => {
  const config = fastify.deployment.institutionSso
  const now = new Date()
  const displayName = normalizeDisplayName(profile.name, profile.email, profile.internalId)
  const normalizedInternalId = normalizeInstitutionInternalId(profile.internalId)
  const username = await createUniqueUsername(fastify, null, profile.email)
  const institution = await fastify.prisma.institutions.findUnique({
    where: { slug: fastify.deployment.institutionLogin.institutionSlug },
    select: { id: true },
  })
  if (!institution) {
    throw fastify.httpErrors.internalServerError('Institution SSO target is not configured')
  }
  return fastify.prisma.$transaction(async (tx) => {
    await lockMutationScope(tx, 'institution-identity', institution.id)
    const identifier = await resolveInstitutionIdentifier(tx, institution.id, profile.internalId)
    let person = identifier?.person ?? null
    const identity = await tx.user_external_identities.findUnique({
      where: {
        provider_externalId: {
          provider: config.providerId,
          externalId: normalizedInternalId,
        },
      },
      include: { user: true },
    })
    if (identity && person?.userId && identity.userId !== person.userId) {
      throw new InstitutionIdentityLinkRequired(profile)
    }

    if (!person && identity) {
      person = await tx.institution_people.findUnique({
        where: {
          institutionId_userId: { institutionId: institution.id, userId: identity.userId },
        },
      })
    }
    if (person && !person.is_active)
      throw fastify.httpErrors.forbidden('Institution identity is inactive')

    let linkedUser = identity?.user
    if (!linkedUser && person?.userId) {
      linkedUser = (await tx.users.findUnique({ where: { id: person.userId } })) ?? undefined
    }
    if (!linkedUser) {
      const emailAccount = await tx.users.findUnique({ where: { email: profile.email } })
      if (emailAccount) {
        throw new InstitutionIdentityLinkRequired(profile)
      }
      const pending = await tx.institution_identity_requests.findFirst({
        where: {
          institutionId: institution.id,
          provider: config.providerId,
          normalizedId: normalizedInternalId,
          status: { in: ['pending', 'needs_information'] },
        },
      })
      if (pending) throw new InstitutionIdentityLinkRequired(profile)
      linkedUser = await tx.users.create({
        data: {
          email: profile.email,
          username,
          password_hash: null,
          name: displayName,
          createdAt: now,
          updatedAt: now,
        },
      })
    }
    if (!linkedUser.name.trim()) {
      linkedUser = await tx.users.update({
        where: { id: linkedUser.id },
        data: { name: displayName, updatedAt: now },
      })
    }

    // Keep the provider's canonical account mapping. Aliases live on the person,
    // rather than weakening other providers' one-account-per-user constraint.
    const canonicalIdentity = await tx.user_external_identities.findFirst({
      where: { userId: linkedUser.id, provider: config.providerId },
    })
    if (!canonicalIdentity) {
      await tx.user_external_identities.create({
        data: {
          userId: linkedUser.id,
          provider: config.providerId,
          externalId: person?.normalizedInternalId ?? normalizedInternalId,
          createdAt: now,
          updatedAt: now,
        },
      })
    } else if (identity && identity.userId !== linkedUser.id) {
      throw fastify.httpErrors.conflict('Institution SSO identity is linked to another user')
    }

    if (!identifier && person && identity?.userId === linkedUser.id) {
      await tx.institution_person_identifiers.create({
        data: {
          institutionId: institution.id,
          personId: person.id,
          value: profile.internalId,
          normalizedValue: normalizedInternalId,
          source: 'legacy_sso',
        },
      })
    }
    const linkedPerson = await upsertInstitutionPerson(tx, {
      institutionId: institution.id,
      internalId: profile.internalId,
      name: person?.name || displayName,
      email: person?.email ?? profile.email,
      userId: linkedUser.id,
      source: 'institution_sso',
      actorUserId: linkedUser.id,
    })

    await tx.institution_memberships.upsert({
      where: {
        institutionId_userId: {
          institutionId: institution.id,
          userId: linkedUser.id,
        },
      },
      create: {
        institutionId: institution.id,
        userId: linkedUser.id,
        role: 'member',
        createdAt: now,
        updatedAt: now,
      },
      update: { updatedAt: now },
    })

    let loginIdentifier =
      identifier ??
      (await tx.institution_person_identifiers.findUnique({
        where: {
          institutionId_normalizedValue: {
            institutionId: institution.id,
            normalizedValue: normalizedInternalId,
          },
        },
      }))
    if (!loginIdentifier && identity?.userId === linkedUser.id) {
      // Preserve an already verified legacy SSO mapping after a historical ID correction.
      loginIdentifier = await tx.institution_person_identifiers.create({
        data: {
          institutionId: institution.id,
          personId: linkedPerson.id,
          value: profile.internalId,
          normalizedValue: normalizedInternalId,
          source: 'legacy_sso',
        },
      })
    }
    if (
      !loginIdentifier ||
      loginIdentifier.revokedAt ||
      loginIdentifier.personId !== linkedPerson.id
    ) {
      throw fastify.httpErrors.conflict('Institution login identifier could not be verified')
    }
    return {
      user: linkedUser,
      identifierId: loginIdentifier.id,
      identifierVersion: loginIdentifier.version,
    }
  })
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
  const { user, identifierId, identifierVersion } = await syncInstitutionSsoUser(fastify, profile)

  return buildOauthCallbackResponse(fastify, user, null, returnTo, {
    institutionIdentifierId: identifierId,
    institutionIdentifierVersion: identifierVersion,
  })
}
