import type { FastifyInstance } from 'fastify'

export type DeploymentMode = 'public' | 'private'

export interface DeploymentAuthConfig {
  enablePasswordSignin: boolean
  enablePublicSignup: boolean
  enableAiralogyOauth: boolean
  enableInstitutionLogin: boolean
  enableInstitutionProvisionLogin: boolean
  enableInstitutionSso: boolean
}

export interface DeploymentInstitutionSsoConfig {
  type: 'oauth2'
  providerId: string
  displayName: string
  authorizationUrl: string
  tokenUrl: string
  userInfoUrl: string
  clientId: string
  clientSecret: string
  redirectUri: string
  scope: string
  externalIdField: string
  emailField: string
  nameField: string
  userInfoTokenMode: 'bearer' | 'query'
}

export interface DeploymentInstitutionLoginConfig {
  institutionSlug: string
}

export interface DeploymentFeatureConfig {
  aiChat: boolean
  paperUpload: boolean
  degreeTheses: boolean
  forum: boolean
}

export interface DeploymentBrandingConfig {
  appName: string
  showBrandLogo: boolean
  showInstitutionLogo: boolean
  brandLogoUrl: string | null
  institutionLogoUrl: string | null
  institutionWatermarkUrl: string | null
}

export interface DeploymentNavigationConfig {
  defaultHomePath: string
}

export interface DeploymentPaperLibraryConfig {
  defaultPath: string
  fixedInstitutionSlug: string | null
}

export type ScholarTimelineGenerationMode = 'disabled' | 'request_only' | 'preview' | 'admin'

export interface DeploymentScholarTimelineConfig {
  generationMode: ScholarTimelineGenerationMode
}

export interface DeploymentRuntimeConfig {
  mode: DeploymentMode
  auth: DeploymentAuthConfig
  features: DeploymentFeatureConfig
  branding: DeploymentBrandingConfig
  navigation: DeploymentNavigationConfig
  paperLibrary: DeploymentPaperLibraryConfig
  scholarTimeline: DeploymentScholarTimelineConfig
  institutionLogin: DeploymentInstitutionLoginConfig
  institutionSso: DeploymentInstitutionSsoConfig
}

export interface PublicDeploymentConfig {
  deploymentMode: DeploymentMode
  auth: DeploymentAuthConfig
  features: DeploymentFeatureConfig
  branding: DeploymentBrandingConfig
  navigation: DeploymentNavigationConfig
  paperLibrary: DeploymentPaperLibraryConfig
  scholarTimeline: DeploymentScholarTimelineConfig
}

type AuthCapabilityKey = keyof DeploymentAuthConfig
type FeatureKey = keyof DeploymentFeatureConfig

const ensureEnvWhenEnabled = (
  fastify: FastifyInstance,
  enabled: boolean,
  options: {
    value: string
    envName: string
    featureName: string
  },
): void => {
  if (!enabled) {
    return
  }

  if (!options.value.trim()) {
    throw new Error(`${options.envName} is required when ${options.featureName} is enabled`)
  }
}

const resolvePublicAssetUrl = (value: string): string | null => {
  const candidate = value.trim()
  if (!candidate) {
    return null
  }

  if (/^\/(?!\/)/u.test(candidate)) {
    return candidate
  }

  try {
    const parsed = new URL(candidate)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null
  } catch {
    return null
  }
}

const firstConfiguredValue = (...values: string[]): string => {
  return values.find((value) => value.trim().length > 0)?.trim() ?? ''
}

const buildInstitutionSsoConfig = (fastify: FastifyInstance): DeploymentInstitutionSsoConfig => {
  return {
    type: fastify.config.INSTITUTION_SSO_TYPE,
    providerId: firstConfiguredValue(fastify.config.INSTITUTION_SSO_PROVIDER_ID, 'institution-sso'),
    displayName: firstConfiguredValue(
      fastify.config.INSTITUTION_SSO_DISPLAY_NAME,
      '机构统一身份认证',
    ),
    authorizationUrl: fastify.config.INSTITUTION_SSO_AUTHORIZATION_URL.trim(),
    tokenUrl: fastify.config.INSTITUTION_SSO_TOKEN_URL.trim(),
    userInfoUrl: fastify.config.INSTITUTION_SSO_USERINFO_URL.trim(),
    clientId: fastify.config.INSTITUTION_SSO_CLIENT_ID.trim(),
    clientSecret: fastify.config.INSTITUTION_SSO_CLIENT_SECRET.trim(),
    redirectUri: fastify.config.INSTITUTION_SSO_REDIRECT_URI.trim(),
    scope: firstConfiguredValue(fastify.config.INSTITUTION_SSO_SCOPE, 'basic'),
    externalIdField: firstConfiguredValue(fastify.config.INSTITUTION_SSO_EXTERNAL_ID_FIELD, 'sub'),
    emailField: firstConfiguredValue(fastify.config.INSTITUTION_SSO_EMAIL_FIELD, 'email'),
    nameField: firstConfiguredValue(fastify.config.INSTITUTION_SSO_NAME_FIELD, 'name'),
    userInfoTokenMode: fastify.config.INSTITUTION_SSO_USERINFO_TOKEN_MODE,
  }
}

export const buildDeploymentRuntimeConfig = (fastify: FastifyInstance): DeploymentRuntimeConfig => {
  const fixedInstitutionSlug =
    fastify.config.DEPLOYMENT_MODE === 'private'
      ? fastify.config.PRIVATE_INSTITUTION_SLUG.trim() || null
      : null
  const institutionLogin: DeploymentInstitutionLoginConfig = {
    institutionSlug: firstConfiguredValue(
      fastify.config.INSTITUTION_LOGIN_INSTITUTION_SLUG,
      fixedInstitutionSlug ?? '',
    ),
  }
  const institutionSso = buildInstitutionSsoConfig(fastify)
  const auth: DeploymentAuthConfig = {
    enablePasswordSignin: fastify.config.ENABLE_PASSWORD_SIGNIN,
    enablePublicSignup: fastify.config.ENABLE_PUBLIC_SIGNUP,
    enableAiralogyOauth: fastify.config.ENABLE_AIRALOGY_OAUTH,
    enableInstitutionLogin: fastify.config.ENABLE_INSTITUTION_LOGIN,
    enableInstitutionProvisionLogin:
      fastify.config.ENABLE_INSTITUTION_LOGIN && fastify.config.ENABLE_INSTITUTION_PROVISION_LOGIN,
    enableInstitutionSso:
      fastify.config.ENABLE_INSTITUTION_LOGIN && fastify.config.INSTITUTION_SSO_ENABLED,
  }

  const features: DeploymentFeatureConfig = {
    aiChat: fastify.config.ENABLE_AI_CHAT,
    paperUpload: fastify.config.ENABLE_PAPER_UPLOAD,
    degreeTheses: fastify.config.ENABLE_DEGREE_THESES,
    forum: fastify.config.ENABLE_FORUM,
  }

  const institutionLogoUrl = resolvePublicAssetUrl(fastify.config.PUBLIC_INSTITUTION_LOGO_URL)
  const institutionWatermarkUrl = resolvePublicAssetUrl(
    fastify.config.PUBLIC_INSTITUTION_WATERMARK_URL,
  )
  const branding: DeploymentBrandingConfig = {
    appName: fastify.config.PUBLIC_APP_NAME.trim() || 'Airalogy Scholar',
    showBrandLogo: fastify.config.SHOW_BRAND_LOGO,
    showInstitutionLogo:
      fastify.config.SHOW_INSTITUTION_LOGO &&
      Boolean(institutionLogoUrl || institutionWatermarkUrl),
    brandLogoUrl: resolvePublicAssetUrl(fastify.config.PUBLIC_BRAND_LOGO_URL),
    institutionLogoUrl,
    institutionWatermarkUrl,
  }
  const paperLibrary: DeploymentPaperLibraryConfig = {
    defaultPath: fixedInstitutionSlug ? `/institutions/${fixedInstitutionSlug}/papers` : '/papers',
    fixedInstitutionSlug,
  }
  const scholarTimeline: DeploymentScholarTimelineConfig = {
    generationMode: fastify.config.SCHOLAR_TIMELINE_GENERATION_MODE,
  }

  if (auth.enablePublicSignup && !auth.enablePasswordSignin) {
    throw new Error('ENABLE_PUBLIC_SIGNUP requires ENABLE_PASSWORD_SIGNIN to be enabled')
  }

  if (fastify.config.DEPLOYMENT_MODE === 'private' && !fixedInstitutionSlug) {
    throw new Error('PRIVATE_INSTITUTION_SLUG is required when DEPLOYMENT_MODE=private')
  }

  if (
    auth.enableInstitutionLogin &&
    !auth.enableInstitutionProvisionLogin &&
    !auth.enableInstitutionSso
  ) {
    throw new Error(
      'ENABLE_INSTITUTION_LOGIN requires at least one institution login method to remain enabled',
    )
  }

  ensureEnvWhenEnabled(fastify, auth.enableInstitutionLogin, {
    value: institutionLogin.institutionSlug,
    envName: 'INSTITUTION_LOGIN_INSTITUTION_SLUG',
    featureName: 'institution login',
  })

  if (!auth.enablePasswordSignin && !auth.enableAiralogyOauth && !auth.enableInstitutionLogin) {
    throw new Error('At least one login method must remain enabled for this deployment')
  }

  ensureEnvWhenEnabled(fastify, auth.enableAiralogyOauth, {
    value: fastify.config.AIRALOGY_OAUTH_BASE_URL,
    envName: 'AIRALOGY_OAUTH_BASE_URL',
    featureName: 'Airalogy OAuth',
  })
  ensureEnvWhenEnabled(fastify, auth.enableAiralogyOauth, {
    value: fastify.config.AIRALOGY_OAUTH_CLIENT_ID,
    envName: 'AIRALOGY_OAUTH_CLIENT_ID',
    featureName: 'Airalogy OAuth',
  })
  ensureEnvWhenEnabled(fastify, auth.enableAiralogyOauth, {
    value: fastify.config.AIRALOGY_OAUTH_CLIENT_SECRET,
    envName: 'AIRALOGY_OAUTH_CLIENT_SECRET',
    featureName: 'Airalogy OAuth',
  })
  ensureEnvWhenEnabled(fastify, auth.enableAiralogyOauth, {
    value: fastify.config.AIRALOGY_OAUTH_REDIRECT_URI,
    envName: 'AIRALOGY_OAUTH_REDIRECT_URI',
    featureName: 'Airalogy OAuth',
  })

  ensureEnvWhenEnabled(fastify, auth.enableInstitutionSso, {
    value: institutionSso.providerId,
    envName: 'INSTITUTION_SSO_PROVIDER_ID',
    featureName: 'institution SSO',
  })
  ensureEnvWhenEnabled(fastify, auth.enableInstitutionSso, {
    value: institutionSso.authorizationUrl,
    envName: 'INSTITUTION_SSO_AUTHORIZATION_URL',
    featureName: 'institution SSO',
  })
  ensureEnvWhenEnabled(fastify, auth.enableInstitutionSso, {
    value: institutionSso.tokenUrl,
    envName: 'INSTITUTION_SSO_TOKEN_URL',
    featureName: 'institution SSO',
  })
  ensureEnvWhenEnabled(fastify, auth.enableInstitutionSso, {
    value: institutionSso.userInfoUrl,
    envName: 'INSTITUTION_SSO_USERINFO_URL',
    featureName: 'institution SSO',
  })
  ensureEnvWhenEnabled(fastify, auth.enableInstitutionSso, {
    value: institutionSso.clientId,
    envName: 'INSTITUTION_SSO_CLIENT_ID',
    featureName: 'institution SSO',
  })
  ensureEnvWhenEnabled(fastify, auth.enableInstitutionSso, {
    value: institutionSso.clientSecret,
    envName: 'INSTITUTION_SSO_CLIENT_SECRET',
    featureName: 'institution SSO',
  })
  ensureEnvWhenEnabled(fastify, auth.enableInstitutionSso, {
    value: institutionSso.redirectUri,
    envName: 'INSTITUTION_SSO_REDIRECT_URI',
    featureName: 'institution SSO',
  })

  ensureEnvWhenEnabled(fastify, features.aiChat, {
    value: fastify.config.OPENAI_BASE_URL,
    envName: 'OPENAI_BASE_URL',
    featureName: 'AI chat',
  })
  ensureEnvWhenEnabled(fastify, scholarTimeline.generationMode !== 'disabled', {
    value: fastify.config.OPENAI_BASE_URL,
    envName: 'OPENAI_BASE_URL',
    featureName: 'Scholar timeline generation',
  })
  ensureEnvWhenEnabled(fastify, scholarTimeline.generationMode !== 'disabled', {
    value: fastify.config.OPENAI_API_KEY,
    envName: 'OPENAI_API_KEY',
    featureName: 'Scholar timeline generation',
  })
  ensureEnvWhenEnabled(fastify, features.aiChat, {
    value: fastify.config.OPENAI_API_KEY,
    envName: 'OPENAI_API_KEY',
    featureName: 'AI chat',
  })

  return {
    mode: fastify.config.DEPLOYMENT_MODE,
    auth,
    features,
    branding,
    navigation: {
      defaultHomePath: features.aiChat ? '/chat' : paperLibrary.defaultPath,
    },
    paperLibrary,
    scholarTimeline,
    institutionLogin,
    institutionSso,
  }
}

export const toPublicDeploymentConfig = (
  config: DeploymentRuntimeConfig,
): PublicDeploymentConfig => {
  return {
    deploymentMode: config.mode,
    auth: { ...config.auth },
    features: { ...config.features },
    branding: { ...config.branding },
    navigation: { ...config.navigation },
    paperLibrary: { ...config.paperLibrary },
    scholarTimeline: { ...config.scholarTimeline },
  }
}

export const assertAuthCapabilityEnabled = (
  fastify: FastifyInstance,
  capability: AuthCapabilityKey,
  message: string,
): void => {
  if (!fastify.deployment.auth[capability]) {
    throw fastify.httpErrors.notFound(message)
  }
}

export const assertFeatureEnabled = (
  fastify: FastifyInstance,
  feature: FeatureKey,
  message: string,
): void => {
  if (!fastify.deployment.features[feature]) {
    throw fastify.httpErrors.notFound(message)
  }
}
