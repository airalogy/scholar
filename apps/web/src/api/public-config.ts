import { apiClient } from './client'

export interface PublicAuthConfig {
  enablePasswordSignin: boolean
  enablePublicSignup: boolean
  enableAiralogyOauth: boolean
  enableInstitutionLogin: boolean
  enableInstitutionProvisionLogin: boolean
  enableInstitutionSso: boolean
}

export interface PublicFeatureConfig {
  aiChat: boolean
  paperUpload: boolean
  degreeTheses: boolean
  forum: boolean
}

export interface PublicBrandingConfig {
  appName: string
  showBrandLogo: boolean
  showInstitutionLogo: boolean
  brandLogoUrl: string | null
  institutionLogoUrl: string | null
  institutionWatermarkUrl: string | null
}

export interface PublicNavigationConfig {
  defaultHomePath: string
}

export interface PublicPaperLibraryConfig {
  defaultPath: string
  fixedInstitutionSlug: string | null
}

export type ScholarTimelineGenerationMode = 'disabled' | 'request_only' | 'preview' | 'admin'

export interface PublicScholarTimelineConfig {
  generationMode: ScholarTimelineGenerationMode
}

export interface PublicAppConfig {
  deploymentMode: 'public' | 'private'
  auth: PublicAuthConfig
  features: PublicFeatureConfig
  branding: PublicBrandingConfig
  navigation: PublicNavigationConfig
  paperLibrary: PublicPaperLibraryConfig
  scholarTimeline: PublicScholarTimelineConfig
}

export function getPublicAppConfig(): Promise<PublicAppConfig> {
  return apiClient.get<PublicAppConfig>('/auth/public-config').then((r) => r.data)
}
