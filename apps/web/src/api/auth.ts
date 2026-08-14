import { apiClient } from './client'

export interface SigninBody {
  username: string
  password: string
}

export interface SignupBody {
  email: string
  username: string
  password: string
  name: string
}

export interface TokenResponse {
  access_token: string
  token_type: string
  name: string
  username: string
}

export type OauthProvider = 'airalogy' | 'institution-sso'

export interface OauthCallbackBody {
  code: string
  state: string
}

export interface OauthCallbackResponse extends TokenResponse {
  avatar_url: string | null
  redirect_to: string
}

export interface InstitutionProvisionPreview {
  institutionSlug: string
  institutionName: string
  email: string
  name: string
  role: 'owner' | 'admin' | 'member'
  externalId: string | null
  college: string | null
  major: string | null
  laboratory: string | null
  expiresAt: string | null
  hasExistingUser: boolean
}

export interface ActivateInstitutionProvisionBody {
  token: string
  institutionSlug?: string
  username?: string
  password?: string
}

export type InstitutionAuthMethod = 'provision_token' | 'platform_account' | 'sso'
export type InstitutionSsoProvisioningMode = 'manual' | 'jit_member'

export interface AuthInstitutionItem {
  slug: string
  name: string
  isDefault: boolean
  allowedMethods: InstitutionAuthMethod[]
  ssoAuthorizePath?: string
  ssoDisplayName?: string
  ssoProvisioningMode?: InstitutionSsoProvisioningMode
}

interface AuthInstitutionListResponse {
  items: AuthInstitutionItem[]
}

export function buildOauthAuthorizeUrl(authorizePath: string, returnTo: string): string {
  const params = new URLSearchParams()

  if (returnTo.trim()) {
    params.set('returnTo', returnTo)
  }

  const queryString = params.toString()
  return queryString
    ? `${authorizePath}?${queryString}`
    : authorizePath
}

export function signin(body: SigninBody): Promise<TokenResponse> {
  return apiClient.post<TokenResponse>('/auth/signin', body).then((r) => r.data)
}

export function signup(body: SignupBody): Promise<TokenResponse> {
  return apiClient.post<TokenResponse>('/auth/signup', body).then((r) => r.data)
}

export function getInstitutionProvisionPreview(
  token: string,
  institutionSlug?: string,
): Promise<InstitutionProvisionPreview> {
  return apiClient.post<InstitutionProvisionPreview>('/auth/institution-provisions/preview', {
    token,
    institutionSlug,
  }).then((r) => r.data)
}

export function activateInstitutionProvision(
  body: ActivateInstitutionProvisionBody,
): Promise<TokenResponse> {
  return apiClient.post<TokenResponse>('/auth/institution-provisions/activate', body)
    .then((r) => r.data)
}

export function listAuthInstitutions(): Promise<AuthInstitutionItem[]> {
  return apiClient.get<AuthInstitutionListResponse>('/auth/institutions')
    .then((r) => r.data.items)
}

export async function completeOauth(
  provider: OauthProvider,
  body: OauthCallbackBody,
): Promise<OauthCallbackResponse> {
  const response = await apiClient.post<OauthCallbackResponse>(
    `/auth/${provider}/callback`,
    body,
  )
  return response.data
}
