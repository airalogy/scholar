import { Type, type Static } from 'typebox'

export const SignupBodySchema = Type.Object({
  email: Type.String({ format: 'email' }),
  username: Type.String({ minLength: 3, maxLength: 64 }),
  password: Type.String({ minLength: 12 }),
  name: Type.String({ minLength: 1, maxLength: 100 }),
})

export type SignupBody = Static<typeof SignupBodySchema>

export const SigninBodySchema = Type.Object({
  username: Type.String({ description: 'Username or email' }),
  password: Type.String(),
})

export type SigninBody = Static<typeof SigninBodySchema>

export const IntegrationTokenBodySchema = Type.Object({
  client_id: Type.String({ minLength: 1, maxLength: 64 }),
  client_secret: Type.String({ minLength: 32, maxLength: 256 }),
})

export type IntegrationTokenBody = Static<typeof IntegrationTokenBodySchema>

export const IntegrationTokenResponseSchema = Type.Object({
  access_token: Type.String(),
  token_type: Type.Literal('bearer'),
  expires_in: Type.Integer(),
  scope: Type.String(),
})

export const OauthAuthorizeQuerySchema = Type.Object({
  returnTo: Type.Optional(Type.String({ minLength: 1 })),
})

export type OauthAuthorizeQuery = Static<typeof OauthAuthorizeQuerySchema>

export const OauthCallbackBodySchema = Type.Object({
  code: Type.String({ minLength: 1, maxLength: 512 }),
  state: Type.String({ minLength: 1, maxLength: 2048 }),
})

export type OauthCallbackBody = Static<typeof OauthCallbackBodySchema>

export const InstitutionProvisionPreviewBodySchema = Type.Object({
  token: Type.String({ minLength: 16 }),
  institutionSlug: Type.Optional(Type.String({ minLength: 1 })),
})

export type InstitutionProvisionPreviewBody = Static<typeof InstitutionProvisionPreviewBodySchema>

export const InstitutionProvisionPreviewSchema = Type.Object({
  institutionSlug: Type.String(),
  institutionName: Type.String(),
  email: Type.String({ format: 'email' }),
  name: Type.String(),
  role: Type.String(),
  externalId: Type.Union([Type.String(), Type.Null()]),
  college: Type.Union([Type.String(), Type.Null()]),
  major: Type.Union([Type.String(), Type.Null()]),
  laboratory: Type.Union([Type.String(), Type.Null()]),
  expiresAt: Type.Union([Type.String(), Type.Null()]),
  hasExistingUser: Type.Boolean(),
})

export const ActivateInstitutionProvisionBodySchema = Type.Object({
  token: Type.String({ minLength: 16 }),
  institutionSlug: Type.Optional(Type.String({ minLength: 1 })),
  username: Type.Optional(Type.String({ minLength: 3, maxLength: 64 })),
  password: Type.Optional(Type.String({ minLength: 6 })),
})

export type ActivateInstitutionProvisionBody = Static<typeof ActivateInstitutionProvisionBodySchema>

export const TokenResponseSchema = Type.Object({
  access_token: Type.String(),
  token_type: Type.Literal('bearer'),
  name: Type.String(),
  username: Type.String(),
})

export type TokenResponse = Static<typeof TokenResponseSchema>

export const OauthCallbackResponseSchema = Type.Object({
  ...TokenResponseSchema.properties,
  avatar_url: Type.Union([Type.String(), Type.Null()]),
  redirect_to: Type.String(),
})

export type OauthCallbackResponse = Static<typeof OauthCallbackResponseSchema>

export const InstitutionAuthMethodSchema = Type.Union([
  Type.Literal('provision_token'),
  Type.Literal('platform_account'),
  Type.Literal('sso'),
])

export type InstitutionAuthMethod = Static<typeof InstitutionAuthMethodSchema>

export const InstitutionSsoProvisioningModeSchema = Type.Union([
  Type.Literal('manual'),
  Type.Literal('jit_member'),
])

export type InstitutionSsoProvisioningMode = Static<typeof InstitutionSsoProvisioningModeSchema>

export const AuthInstitutionSchema = Type.Object({
  slug: Type.String(),
  name: Type.String(),
  isDefault: Type.Boolean(),
  allowedMethods: Type.Array(InstitutionAuthMethodSchema),
  ssoAuthorizePath: Type.Optional(Type.String({ minLength: 1 })),
  ssoDisplayName: Type.Optional(Type.String({ minLength: 1 })),
  ssoProvisioningMode: Type.Optional(InstitutionSsoProvisioningModeSchema),
})

export const AuthInstitutionListResponseSchema = Type.Object({
  items: Type.Array(AuthInstitutionSchema),
})

export const DeploymentModeSchema = Type.Union([Type.Literal('public'), Type.Literal('private')])

export const PublicAuthConfigSchema = Type.Object({
  enablePasswordSignin: Type.Boolean(),
  enablePublicSignup: Type.Boolean(),
  enableAiralogyOauth: Type.Boolean(),
  enableInstitutionLogin: Type.Boolean(),
  enableInstitutionProvisionLogin: Type.Boolean(),
  enableInstitutionSso: Type.Boolean(),
})

export const PublicFeatureConfigSchema = Type.Object({
  aiChat: Type.Boolean(),
  paperUpload: Type.Boolean(),
  degreeTheses: Type.Boolean(),
  forum: Type.Boolean(),
})

export const PublicBrandingConfigSchema = Type.Object({
  appName: Type.String(),
  showBrandLogo: Type.Boolean(),
  showInstitutionLogo: Type.Boolean(),
  brandLogoUrl: Type.Union([Type.String(), Type.Null()]),
  institutionLogoUrl: Type.Union([Type.String(), Type.Null()]),
  institutionWatermarkUrl: Type.Union([Type.String(), Type.Null()]),
})

export const PublicNavigationConfigSchema = Type.Object({
  defaultHomePath: Type.String({ minLength: 1 }),
})

export const PublicPaperLibraryConfigSchema = Type.Object({
  defaultPath: Type.String({ minLength: 1 }),
  fixedInstitutionSlug: Type.Union([Type.String(), Type.Null()]),
})

export const PublicScholarTimelineConfigSchema = Type.Object({
  generationMode: Type.Union([
    Type.Literal('disabled'),
    Type.Literal('request_only'),
    Type.Literal('preview'),
    Type.Literal('admin'),
  ]),
})

export const PublicAppConfigSchema = Type.Object({
  deploymentMode: DeploymentModeSchema,
  auth: PublicAuthConfigSchema,
  features: PublicFeatureConfigSchema,
  branding: PublicBrandingConfigSchema,
  navigation: PublicNavigationConfigSchema,
  paperLibrary: PublicPaperLibraryConfigSchema,
  scholarTimeline: PublicScholarTimelineConfigSchema,
})
