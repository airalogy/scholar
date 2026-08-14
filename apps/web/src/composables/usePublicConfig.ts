import { computed, reactive, toRef } from 'vue'
import { getPublicAppConfig, type PublicAppConfig } from '@/api/public-config'

const DEFAULT_PUBLIC_APP_CONFIG: PublicAppConfig = {
  deploymentMode: 'public',
  auth: {
    enablePasswordSignin: true,
    enablePublicSignup: false,
    enableAiralogyOauth: false,
    enableInstitutionLogin: false,
    enableInstitutionProvisionLogin: false,
    enableInstitutionSso: false,
  },
  features: {
    aiChat: false,
    paperUpload: true,
    degreeTheses: true,
    forum: false,
  },
  branding: {
    appName: 'Airalogy Scholar',
    showBrandLogo: true,
    showInstitutionLogo: false,
    brandLogoUrl: null,
    institutionLogoUrl: null,
    institutionWatermarkUrl: null,
  },
  navigation: {
    defaultHomePath: '/papers',
  },
  paperLibrary: {
    defaultPath: '/papers',
    fixedInstitutionSlug: null,
  },
  scholarTimeline: {
    generationMode: 'disabled',
  },
}

interface PublicConfigState {
  config: PublicAppConfig
  isLoading: boolean
  isLoaded: boolean
  loadError: string
}

const state = reactive<PublicConfigState>({
  config: DEFAULT_PUBLIC_APP_CONFIG,
  isLoading: false,
  isLoaded: false,
  loadError: '',
})

let loadPromise: Promise<PublicAppConfig> | null = null

export const getCurrentPublicConfig = (): PublicAppConfig => state.config

export const ensurePublicConfigLoaded = async (): Promise<PublicAppConfig> => {
  if (state.isLoaded) {
    return state.config
  }

  if (loadPromise) {
    return loadPromise
  }

  state.isLoading = true
  state.loadError = ''
  loadPromise = getPublicAppConfig()
    .then((config) => {
      state.config = config
      state.isLoaded = true
      return config
    })
    .catch((error: unknown) => {
      state.loadError = error instanceof Error ? error.message : 'Failed to load public config'
      state.isLoaded = true
      return state.config
    })
    .finally(() => {
      state.isLoading = false
      loadPromise = null
    })

  return loadPromise
}

export function usePublicConfig() {
  const publicConfig = computed(() => state.config)
  const auth = computed(() => state.config.auth)
  const features = computed(() => state.config.features)
  const branding = computed(() => state.config.branding)
  const defaultHomePath = computed(() => state.config.navigation.defaultHomePath)
  const paperLibrary = computed(() => state.config.paperLibrary)
  const scholarTimeline = computed(() => state.config.scholarTimeline)

  return {
    publicConfig,
    auth,
    features,
    branding,
    defaultHomePath,
    paperLibrary,
    scholarTimeline,
    isLoading: toRef(state, 'isLoading'),
    isLoaded: toRef(state, 'isLoaded'),
    loadError: toRef(state, 'loadError'),
    ensureLoaded: ensurePublicConfigLoaded,
  }
}
