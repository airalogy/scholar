import bcrypt from 'bcrypt'
import type { FastifyInstance } from 'fastify'
import type {
  ActivateInstitutionProvisionBody,
  InstitutionAuthMethod,
  InstitutionSsoProvisioningMode,
  SignupBody,
  SigninBody,
  TokenResponse,
} from './schema'
import { SALT_ROUNDS } from './oauth/shared'
import {
  normalizeInstitutionProvisionStatus,
  syncInstitutionProvisionToUser,
} from '../../utils/institution-provisions'
import { normalizeInstitutionRole } from '../../utils/permissions'
import { toPublicDeploymentConfig } from '../../utils/deployment'
import { signAccessToken } from '../../utils/auth'

interface PublicInstitutionAuthConfig {
  slug: string
  isDefault: boolean
  allowedMethods: InstitutionAuthMethod[]
  ssoAuthorizePath?: string
  ssoDisplayName?: string
  ssoProvisioningMode?: InstitutionSsoProvisioningMode
}

const resolveEnabledInstitutionAuthConfigs = (
  fastify: FastifyInstance,
): PublicInstitutionAuthConfig[] => {
  if (!fastify.deployment.auth.enableInstitutionLogin) {
    return []
  }

  const institutionSlug = fastify.deployment.institutionLogin.institutionSlug
  if (!institutionSlug) {
    return []
  }

  const allowedMethods: InstitutionAuthMethod[] = []
  if (fastify.deployment.auth.enableInstitutionProvisionLogin) {
    allowedMethods.push('provision_token')
  }

  if (fastify.deployment.auth.enableInstitutionSso) {
    allowedMethods.push('sso')
  }

  if (allowedMethods.length === 0) {
    return []
  }

  return [
    {
      slug: institutionSlug,
      isDefault: true,
      allowedMethods,
      ssoAuthorizePath: allowedMethods.includes('sso')
        ? '/api/auth/institution-sso/authorize'
        : undefined,
      ssoDisplayName: allowedMethods.includes('sso')
        ? fastify.deployment.institutionSso.displayName
        : undefined,
      ssoProvisioningMode: allowedMethods.includes('sso') ? 'jit_member' : undefined,
    },
  ]
}

const assertInstitutionSlugMatch = (
  fastify: FastifyInstance,
  actualSlug: string,
  expectedSlug?: string,
): void => {
  if (expectedSlug && actualSlug !== expectedSlug) {
    throw fastify.httpErrors.badRequest(
      'The activation token does not belong to the selected institution',
    )
  }
}

const getPendingInstitutionProvisionByToken = async (
  fastify: FastifyInstance,
  token: string,
  expectedInstitutionSlug?: string,
) => {
  const provision = await fastify.prisma.institution_user_provisions.findUnique({
    where: { inviteToken: token },
  })

  if (!provision) {
    throw fastify.httpErrors.notFound('Activation token not found')
  }

  if (normalizeInstitutionProvisionStatus(provision.status) !== 'pending_activation') {
    throw fastify.httpErrors.badRequest('This activation token is no longer valid')
  }

  if (provision.expiresAt && provision.expiresAt.getTime() < Date.now()) {
    throw fastify.httpErrors.badRequest('This activation token has expired')
  }

  const institution = await fastify.prisma.institutions.findUnique({
    where: { id: provision.institutionId },
    select: { id: true, name: true, slug: true },
  })

  if (!institution) {
    throw fastify.httpErrors.notFound('Institution not found')
  }

  assertInstitutionSlugMatch(fastify, institution.slug, expectedInstitutionSlug)

  return {
    provision,
    institution,
  }
}

export async function listPublicAuthInstitutions(fastify: FastifyInstance) {
  const enabledConfigs = resolveEnabledInstitutionAuthConfigs(fastify)
  const configuredSlugs = enabledConfigs.map((item) => item.slug)
  if (configuredSlugs.length === 0) {
    return { items: [] }
  }

  const institutions = await fastify.prisma.institutions.findMany({
    where: {
      slug: {
        in: configuredSlugs,
      },
    },
    select: {
      name: true,
      slug: true,
    },
  })

  const institutionMap = new Map(institutions.map((item) => [item.slug, item]))

  return {
    items: enabledConfigs.flatMap((config) => {
      const institution = institutionMap.get(config.slug)
      if (!institution) {
        return []
      }

      if (
        fastify.deployment.paperLibrary.fixedInstitutionSlug &&
        institution.slug !== fastify.deployment.paperLibrary.fixedInstitutionSlug
      ) {
        return []
      }

      return [
        {
          slug: institution.slug,
          name: institution.name,
          isDefault: config.isDefault,
          allowedMethods: [...config.allowedMethods],
          ...(config.ssoAuthorizePath ? { ssoAuthorizePath: config.ssoAuthorizePath } : {}),
          ...(config.ssoDisplayName ? { ssoDisplayName: config.ssoDisplayName } : {}),
          ...(config.ssoProvisioningMode
            ? { ssoProvisioningMode: config.ssoProvisioningMode }
            : {}),
        },
      ]
    }),
  }
}

export async function getPublicAppConfig(fastify: FastifyInstance) {
  return toPublicDeploymentConfig(fastify.deployment)
}

export async function signupUser(
  fastify: FastifyInstance,
  data: SignupBody,
): Promise<TokenResponse> {
  const email = data.email.trim().toLowerCase()
  if (data.password.trim().length < 12) {
    throw fastify.httpErrors.badRequest(
      'Password must contain at least 12 non-whitespace characters',
    )
  }
  const existingUser = await fastify.prisma.users.findFirst({
    where: {
      OR: [{ email }, { username: data.username.trim() }],
    },
  })

  if (existingUser) {
    if (existingUser.email === email) {
      throw fastify.httpErrors.conflict('Email already registered')
    }
    throw fastify.httpErrors.conflict('Username already taken')
  }

  const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS)
  const user = await fastify.prisma.users.create({
    data: {
      email,
      username: data.username.trim(),
      name: data.name.trim(),
      password_hash: passwordHash,
    },
  })

  return {
    access_token: signAccessToken(fastify, user.id),
    token_type: 'bearer',
    name: user.name,
    username: user.username,
  }
}

export async function signinUser(
  fastify: FastifyInstance,
  data: SigninBody,
): Promise<TokenResponse> {
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.username)
  const loginWhere = isEmail
    ? { email: data.username.trim().toLowerCase() }
    : { username: data.username.trim() }

  const user = await fastify.prisma.users.findUnique({
    where: loginWhere,
  })

  if (!user || !user.password_hash) {
    throw fastify.httpErrors.unauthorized('Invalid username or password')
  }

  const isValid = await bcrypt.compare(data.password, user.password_hash)
  if (!isValid) {
    throw fastify.httpErrors.unauthorized('Invalid username or password')
  }

  return {
    access_token: signAccessToken(fastify, user.id),
    token_type: 'bearer',
    name: user.name,
    username: user.username,
  }
}

export async function getInstitutionProvisionPreview(
  fastify: FastifyInstance,
  token: string,
  expectedInstitutionSlug?: string,
) {
  const { provision, institution } = await getPendingInstitutionProvisionByToken(
    fastify,
    token,
    expectedInstitutionSlug,
  )
  const existingUser = await fastify.prisma.users.findUnique({
    where: { email: provision.email },
    select: { id: true },
  })

  return {
    institutionSlug: institution.slug,
    institutionName: institution.name,
    email: provision.email,
    name: provision.name,
    role: normalizeInstitutionRole(provision.role),
    externalId: provision.externalId,
    college: provision.college,
    major: provision.major,
    laboratory: provision.laboratory,
    expiresAt: provision.expiresAt ? provision.expiresAt.toISOString() : null,
    hasExistingUser: Boolean(existingUser),
  }
}

export async function activateInstitutionProvision(
  fastify: FastifyInstance,
  data: ActivateInstitutionProvisionBody,
): Promise<TokenResponse> {
  const { provision } = await getPendingInstitutionProvisionByToken(
    fastify,
    data.token,
    data.institutionSlug,
  )
  const now = new Date()
  let user = await fastify.prisma.users.findUnique({
    where: { email: provision.email },
  })

  if (!user) {
    const username = data.username?.trim()
    const password = data.password

    if (!username || !password) {
      throw fastify.httpErrors.badRequest('Username and password are required for first activation')
    }
    if (password.trim().length < 12) {
      throw fastify.httpErrors.badRequest(
        'Password must contain at least 12 non-whitespace characters',
      )
    }

    const existingUsername = await fastify.prisma.users.findUnique({
      where: { username },
      select: { id: true },
    })

    if (existingUsername) {
      throw fastify.httpErrors.conflict('Username already taken')
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
    user = await fastify.prisma.users.create({
      data: {
        email: provision.email,
        username,
        name: provision.name,
        password_hash: passwordHash,
        college: provision.college,
        major: provision.major,
        laboratory: provision.laboratory,
        createdAt: now,
        updatedAt: now,
      },
    })
  } else {
    const password = data.password
    if (!password || !user.password_hash) {
      throw fastify.httpErrors.unauthorized(
        'Existing accounts must confirm their platform password before activation',
      )
    }
    const passwordMatches = await bcrypt.compare(password, user.password_hash)
    if (!passwordMatches) {
      throw fastify.httpErrors.unauthorized('Invalid username or password')
    }
  }

  await syncInstitutionProvisionToUser(
    fastify,
    {
      id: provision.id,
      institutionId: provision.institutionId,
      claimedUserId: user.id,
      name: provision.name,
      role: provision.role,
      can_review_content: provision.can_review_content === true,
      can_import_data: provision.can_import_data === true,
      college: provision.college,
      major: provision.major,
      laboratory: provision.laboratory,
    },
    user.id,
  )

  await fastify.prisma.institution_user_provisions.update({
    where: { id: provision.id },
    data: {
      claimedUserId: user.id,
      status: 'claimed',
      claimedAt: now,
      updatedAt: now,
    },
  })

  return {
    access_token: signAccessToken(fastify, user.id),
    token_type: 'bearer',
    name: user.name,
    username: user.username,
  }
}
