<template>
  <a-modal
    :visible="visible"
    :footer="false"
    :closable="false"
    :mask-closable="true"
    :width="460"
    modal-class="login-modal"
    @cancel="closeModal"
  >
    <div class="login-content">
      <button class="close-btn" @click="closeModal">
        <IconClose />
      </button>

      <h2 class="login-title">
        {{ $t('loginModal.title', { appName: branding.appName }) }}
      </h2>

      <div v-if="hasMultipleTabs" class="login-tabs">
        <button
          class="tab-item"
          :class="{ 'tab-item--active': activeTab === 'airalogy' }"
          type="button"
          @click="switchTab('airalogy')"
        >
          {{ $t('loginModal.platformLoginTab') }}
        </button>
        <button
          class="tab-item"
          :class="{ 'tab-item--active': activeTab === 'institution' }"
          type="button"
          @click="switchTab('institution')"
        >
          {{ $t('loginModal.institutionActivationTab') }}
        </button>
        <div class="tab-line" />
        <div class="tab-indicator" :class="`tab-indicator--${activeTab}`" />
      </div>

      <template v-if="activeTab === 'airalogy'">
        <template v-if="platformMode === 'signin'">
          <template v-if="supportsPasswordSignin">
            <div class="login-form">
              <input
                v-model="signinForm.account"
                class="login-input"
                type="text"
                :placeholder="$t('loginModal.accountPlaceholder')"
                @keyup.enter="handleSignin"
              />
              <input
                v-model="signinForm.password"
                class="login-input"
                type="password"
                :placeholder="$t('loginModal.passwordPlaceholder')"
                @keyup.enter="handleSignin"
              />
            </div>

            <button
              class="login-submit-btn"
              :class="{ 'login-submit-btn--disabled': !canSubmitSignin }"
              :disabled="!canSubmitSignin"
              @click="handleSignin"
            >
              {{ isSubmittingSignin ? $t('loginModal.loggingIn') : $t('loginModal.login') }}
            </button>

            <div v-if="signinError" class="login-error">{{ signinError }}</div>

            <div v-if="supportsPublicSignup" class="login-links">
              <button
                type="button"
                class="link-register"
                @click="switchPlatformMode('signup')"
              >
                {{ $t('common.register') }}
              </button>
            </div>
          </template>

          <div v-if="supportsAiralogyOauth" class="other-login">
            <div v-if="supportsPasswordSignin" class="other-login-divider">
              <span class="divider-line" />
              <span class="divider-text">{{ $t('common.otherLoginMethods') }}</span>
              <span class="divider-line" />
            </div>
            <button
              class="oauth-authorize-btn"
              :disabled="isRedirectingToAiralogy"
              type="button"
              @click="handleAiralogyOauth"
            >
              {{ isRedirectingToAiralogy ? $t('loginModal.oauthRedirecting') : $t('loginModal.oauthAuthorize') }}
            </button>
            <div class="oauth-helper">{{ $t('loginModal.oauthHelper') }}</div>
          </div>
        </template>

        <template v-else>
          <div class="login-form">
            <input
              v-model="signupForm.name"
              class="login-input"
              type="text"
              :placeholder="$t('loginModal.namePlaceholder')"
              @keyup.enter="handleSignup"
            />
            <input
              v-model="signupForm.email"
              class="login-input"
              type="email"
              :placeholder="$t('loginModal.emailPlaceholder')"
              @keyup.enter="handleSignup"
            />
            <input
              v-model="signupForm.username"
              class="login-input"
              type="text"
              :placeholder="$t('loginModal.signupUsernamePlaceholder')"
              @keyup.enter="handleSignup"
            />
            <input
              v-model="signupForm.password"
              class="login-input"
              type="password"
              :placeholder="$t('loginModal.signupPasswordPlaceholder')"
              @keyup.enter="handleSignup"
            />
            <input
              v-model="signupForm.confirmPassword"
              class="login-input"
              type="password"
              :placeholder="$t('loginModal.confirmPasswordPlaceholder')"
              @keyup.enter="handleSignup"
            />
          </div>

          <button
            class="login-submit-btn"
            :class="{ 'login-submit-btn--disabled': !canSubmitSignup }"
            :disabled="!canSubmitSignup"
            @click="handleSignup"
          >
            {{ isSubmittingSignup ? $t('loginModal.signingUp') : $t('loginModal.signup') }}
          </button>

          <div v-if="signupError" class="login-error">{{ signupError }}</div>

          <div class="login-links login-links--center">
            <button type="button" class="link-register" @click="switchPlatformMode('signin')">
              {{ $t('loginModal.backToSignin') }}
            </button>
          </div>
        </template>
      </template>

      <template v-else>
        <div class="login-helper">{{ institutionHelperText }}</div>

        <div v-if="isLoadingInstitutions" class="login-helper">
          {{ $t('loginModal.loadingInstitutions') }}
        </div>

        <template v-else-if="selectedInstitution">
          <div class="institution-block">
            <div class="institution-label">{{ $t('loginModal.institutionLabel') }}</div>
            <a-select
              v-if="authInstitutions.length > 1"
              v-model="selectedInstitutionSlug"
              class="institution-select"
            >
              <a-option v-for="institution in authInstitutions" :key="institution.slug" :value="institution.slug">
                {{ institution.name }}
              </a-option>
            </a-select>
            <div v-else class="institution-static">{{ selectedInstitution.name }}</div>
          </div>

          <div v-if="selectedInstitution.allowedMethods.length" class="institution-block">
            <div class="institution-label">{{ $t('loginModal.loginMethodsLabel') }}</div>
            <div class="method-chip-list">
              <span v-for="method in selectedInstitution.allowedMethods" :key="method" class="method-chip">
                {{ getMethodLabel(method) }}
              </span>
            </div>
          </div>

          <div v-if="supportsInstitutionSso" class="login-form">
            <button
              class="oauth-authorize-btn"
              :disabled="isRedirectingInstitutionSso"
              type="button"
              @click="handleInstitutionSso"
            >
              {{
                isRedirectingInstitutionSso
                  ? $t('loginModal.institutionSsoRedirecting')
                  : $t('loginModal.institutionSsoAuthorize', { provider: institutionSsoName })
              }}
            </button>
            <div class="oauth-helper">
              {{ $t('loginModal.institutionSsoHelper', { institution: selectedInstitution.name }) }}
            </div>
            <div
              v-if="supportsInstitutionSsoJitProvisioning"
              class="oauth-helper oauth-helper--highlight"
            >
              {{
                $t('loginModal.institutionSsoProvisioningHint', {
                  institution: selectedInstitution.name,
                })
              }}
            </div>
          </div>

          <div v-if="supportsProvisionToken" class="login-form">
            <div class="oauth-helper">
              {{ $t('loginModal.activationHelper') }}
            </div>
            <div class="token-row">
              <input
                v-model="activationForm.token"
                class="login-input"
                type="text"
                :placeholder="$t('loginModal.activationTokenPlaceholder')"
              />
              <button
                class="token-verify-btn"
                :class="{ 'token-verify-btn--disabled': !canLoadProvision }"
                :disabled="!canLoadProvision"
                @click="loadProvisionPreview"
              >
                {{ isLoadingProvision ? $t('loginModal.verifyingToken') : $t('loginModal.verifyToken') }}
              </button>
            </div>

            <div v-if="activationPreview" class="activation-card">
              <div class="activation-title">{{ $t('loginModal.activationInfo') }}</div>
              <div class="activation-meta">{{ activationPreview.institutionName }}</div>
              <div class="activation-meta">{{ activationPreview.name }} / {{ activationPreview.email }}</div>
              <div class="activation-meta">
                {{ activationRoleLabel }}{{ activationPreview.externalId ? ` / ${activationPreview.externalId}` : '' }}
              </div>
              <div v-if="activationPreview.college || activationPreview.major || activationPreview.laboratory" class="activation-meta">
                {{ [activationPreview.college, activationPreview.major, activationPreview.laboratory].filter(Boolean).join(' / ') }}
              </div>
              <div v-if="activationPreview.expiresAt" class="activation-meta">
                {{ $t('loginModal.activationExpiresAt', { date: formatDateTime(activationPreview.expiresAt) }) }}
              </div>
              <div class="activation-status">
                {{ activationPreview.hasExistingUser ? $t('loginModal.activationExistingAccount') : $t('loginModal.activationFirstTime') }}
              </div>
            </div>

            <template v-if="activationPreview">
              <input
                v-if="needsNewCredentials"
                v-model="activationForm.username"
                class="login-input"
                type="text"
                :placeholder="$t('loginModal.usernamePlaceholder')"
                @keyup.enter="handleActivate"
              />
              <input
                v-model="activationForm.password"
                class="login-input"
                type="password"
                :placeholder="$t('loginModal.activationPasswordPlaceholder')"
                @keyup.enter="handleActivate"
              />
              <input
                v-if="needsNewCredentials"
                v-model="activationForm.confirmPassword"
                class="login-input"
                type="password"
                :placeholder="$t('loginModal.confirmPasswordPlaceholder')"
                @keyup.enter="handleActivate"
              />
            </template>
          </div>

          <button
            class="login-submit-btn"
            :class="{ 'login-submit-btn--disabled': !canSubmitActivation }"
            :disabled="!canSubmitActivation"
            @click="handleActivate"
          >
            {{ isSubmittingActivation ? $t('loginModal.activating') : $t('loginModal.activateAndLogin') }}
          </button>

          <div v-if="activationError" class="login-error">{{ activationError }}</div>
        </template>

        <div v-else class="login-error">{{ $t('loginModal.noInstitutionAvailable') }}</div>
      </template>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Message } from '@arco-design/web-vue'
import { IconClose } from '@arco-design/web-vue/es/icon'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import {
  activateInstitutionProvision,
  buildOauthAuthorizeUrl,
  getInstitutionProvisionPreview,
  listAuthInstitutions,
  signin,
  signup,
  type AuthInstitutionItem,
  type InstitutionAuthMethod,
  type InstitutionProvisionPreview,
} from '@/api/auth'
import { useAuth } from '@/composables/useAuth'
import { usePublicConfig } from '@/composables/usePublicConfig'
import { INSTITUTION_ROLE_LABEL_KEYS } from '@/i18n/helpers'

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

const props = defineProps<{
  visible: boolean
  preferredTab?: 'institution' | 'airalogy'
}>()

const { login } = useAuth()
const { t, locale } = useI18n()
const route = useRoute()
const { auth: publicAuthConfig, branding, defaultHomePath } = usePublicConfig()
const AIRALOGY_AUTHORIZE_PATH = '/api/auth/airalogy/authorize'

const activeTab = ref<'institution' | 'airalogy'>('airalogy')
const platformMode = ref<'signin' | 'signup'>('signin')
const authInstitutions = ref<AuthInstitutionItem[]>([])
const isLoadingInstitutions = ref(false)
const isSubmittingSignin = ref(false)
const isSubmittingSignup = ref(false)
const isLoadingProvision = ref(false)
const isSubmittingActivation = ref(false)
const isRedirectingToAiralogy = ref(false)
const isRedirectingInstitutionSso = ref(false)
const signinError = ref('')
const signupError = ref('')
const activationError = ref('')
const activationPreview = ref<InstitutionProvisionPreview | null>(null)
const loadedToken = ref('')
const selectedInstitutionSlug = ref('')

const signinForm = reactive({
  account: '',
  password: '',
})

const signupForm = reactive({
  name: '',
  email: '',
  username: '',
  password: '',
  confirmPassword: '',
})

const activationForm = reactive({
  token: '',
  username: '',
  password: '',
  confirmPassword: '',
})

const hasPlatformLoginTab = computed(() => {
  return publicAuthConfig.value.enablePasswordSignin || publicAuthConfig.value.enableAiralogyOauth
})

const hasInstitutionLoginTab = computed(() => {
  return publicAuthConfig.value.enableInstitutionLogin
})

const hasMultipleTabs = computed(() => {
  return hasPlatformLoginTab.value && hasInstitutionLoginTab.value
})

const supportsPasswordSignin = computed(() => {
  return publicAuthConfig.value.enablePasswordSignin
})

const supportsPublicSignup = computed(() => {
  return publicAuthConfig.value.enablePublicSignup && supportsPasswordSignin.value
})

const supportsAiralogyOauth = computed(() => {
  return publicAuthConfig.value.enableAiralogyOauth
})

const canSubmitSignin = computed(() => {
  return supportsPasswordSignin.value &&
    !isSubmittingSignin.value &&
    Boolean(signinForm.account.trim()) &&
    Boolean(signinForm.password.trim())
})

const canSubmitSignup = computed(() => {
  return supportsPublicSignup.value &&
    !isSubmittingSignup.value &&
    Boolean(signupForm.name.trim()) &&
    Boolean(signupForm.email.trim()) &&
    Boolean(signupForm.username.trim()) &&
    signupForm.password.length >= 12 &&
    signupForm.password === signupForm.confirmPassword
})

const canLoadProvision = computed(() => {
  return !isLoadingProvision.value &&
    Boolean(selectedInstitution.value) &&
    supportsProvisionToken.value &&
    Boolean(activationForm.token.trim())
})

const needsNewCredentials = computed(() => {
  return activationPreview.value ? !activationPreview.value.hasExistingUser : false
})

const canSubmitActivation = computed(() => {
  if (
    isSubmittingActivation.value ||
    !selectedInstitution.value ||
    !supportsProvisionToken.value ||
    !activationPreview.value ||
    !activationForm.token.trim()
  ) {
    return false
  }

  if (!activationForm.password.trim()) {
    return false
  }

  return !needsNewCredentials.value ||
    (Boolean(activationForm.username.trim()) &&
      activationForm.password.length >= 12 &&
      activationForm.password === activationForm.confirmPassword)
})

const selectedInstitution = computed(() => {
  if (!authInstitutions.value.length) {
    return null
  }

  return authInstitutions.value.find((item) => item.slug === selectedInstitutionSlug.value)
    ?? authInstitutions.value.find((item) => item.isDefault)
    ?? authInstitutions.value[0]
})

const supportsProvisionToken = computed(() => {
  return selectedInstitution.value?.allowedMethods.includes('provision_token') ?? false
})

const supportsInstitutionSso = computed(() => {
  return Boolean(
    selectedInstitution.value?.allowedMethods.includes('sso') &&
    selectedInstitution.value?.ssoAuthorizePath,
  )
})

const supportsInstitutionSsoJitProvisioning = computed(() => {
  return supportsInstitutionSso.value &&
    selectedInstitution.value?.ssoProvisioningMode === 'jit_member'
})

const institutionSsoName = computed(() => {
  return selectedInstitution.value?.ssoDisplayName ?? selectedInstitution.value?.name ?? ''
})

const activationRoleLabel = computed(() => {
  if (!activationPreview.value) {
    return ''
  }

  return t(INSTITUTION_ROLE_LABEL_KEYS[activationPreview.value.role])
})

const resolvePreferredTab = (): 'institution' | 'airalogy' => {
  if (props.preferredTab === 'institution' && hasInstitutionLoginTab.value) {
    return 'institution'
  }

  if (props.preferredTab === 'airalogy' && hasPlatformLoginTab.value) {
    return 'airalogy'
  }

  if (hasPlatformLoginTab.value) {
    return 'airalogy'
  }

  return 'institution'
}

const institutionHelperText = computed(() => {
  if (isLoadingInstitutions.value) {
    return t('loginModal.loadingInstitutions')
  }

  if (!hasInstitutionLoginTab.value) {
    return t('loginModal.noInstitutionAvailable')
  }

  if (!selectedInstitution.value) {
    return t('loginModal.noInstitutionAvailable')
  }

  if (supportsProvisionToken.value || supportsInstitutionSso.value) {
    return t('loginModal.institutionHelper', { institution: selectedInstitution.value.name })
  }

  return t('loginModal.noSupportedMethod', { institution: selectedInstitution.value.name })
})

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as {
      response?: { data?: { message?: string } }
    }).response
    if (response?.data?.message) {
      return response.data.message
    }
  }

  return error instanceof Error ? error.message : fallback
}

const formatDateTime = (value: string): string => {
  return new Intl.DateTimeFormat(locale.value, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

const resetSigninForm = (): void => {
  signinForm.account = ''
  signinForm.password = ''
  signinError.value = ''
}

const resetSignupForm = (): void => {
  signupForm.name = ''
  signupForm.email = ''
  signupForm.username = ''
  signupForm.password = ''
  signupForm.confirmPassword = ''
  signupError.value = ''
}

const resetActivationForm = (): void => {
  activationForm.token = ''
  activationForm.username = ''
  activationForm.password = ''
  activationForm.confirmPassword = ''
  activationError.value = ''
  activationPreview.value = null
  loadedToken.value = ''
}

const resetAll = (): void => {
  activeTab.value = resolvePreferredTab()
  platformMode.value = 'signin'
  isRedirectingToAiralogy.value = false
  isRedirectingInstitutionSso.value = false
  resetSigninForm()
  resetSignupForm()
  resetActivationForm()
  selectedInstitutionSlug.value = authInstitutions.value.find((item) => item.isDefault)?.slug
    ?? authInstitutions.value[0]?.slug
    ?? ''
}

const closeModal = (): void => {
  emit('update:visible', false)
  resetAll()
}

const switchTab = (tab: 'institution' | 'airalogy'): void => {
  if (tab === 'airalogy' && !hasPlatformLoginTab.value) {
    return
  }

  if (tab === 'institution' && !hasInstitutionLoginTab.value) {
    return
  }

  activeTab.value = tab
  platformMode.value = 'signin'
  signinError.value = ''
  signupError.value = ''
  activationError.value = ''
  if (tab === 'institution') {
    void loadAuthInstitutionOptions()
  }
}

const switchPlatformMode = (mode: 'signin' | 'signup'): void => {
  platformMode.value = mode
  signinError.value = ''
  signupError.value = ''
}

const applyLogin = (token: string, name: string): void => {
  login(token, name)
  emit('update:visible', false)
  resetAll()
}

const getMethodLabel = (method: InstitutionAuthMethod): string => {
  if (method === 'platform_account') {
    return t('loginModal.methods.platformAccount')
  }

  if (method === 'sso') {
    return t('loginModal.methods.sso')
  }

  return t('loginModal.methods.provisionToken')
}

const loadAuthInstitutionOptions = async (): Promise<void> => {
  if (!hasInstitutionLoginTab.value) {
    authInstitutions.value = []
    selectedInstitutionSlug.value = ''
    return
  }

  if (isLoadingInstitutions.value) {
    return
  }

  isLoadingInstitutions.value = true
  try {
    const items = await listAuthInstitutions()
    authInstitutions.value = items

    const defaultInstitution = items.find((item) => item.isDefault) ?? items[0]
    if (
      defaultInstitution &&
      !items.some((item) => item.slug === selectedInstitutionSlug.value)
    ) {
      selectedInstitutionSlug.value = defaultInstitution.slug
    }
  } catch {
    authInstitutions.value = []
    selectedInstitutionSlug.value = ''
  } finally {
    isLoadingInstitutions.value = false
  }
}

const loadProvisionPreview = async (): Promise<void> => {
  const token = activationForm.token.trim()
  const institutionSlug = selectedInstitution.value?.slug
  if (!token || !institutionSlug) {
    return
  }

  isLoadingProvision.value = true
  activationError.value = ''
  try {
    activationPreview.value = await getInstitutionProvisionPreview(token, institutionSlug)
    loadedToken.value = token
    Message.success(t('loginModal.tokenVerified'))
  } catch (error) {
    activationPreview.value = null
    loadedToken.value = ''
    activationError.value = getErrorMessage(error, t('loginModal.invalidToken'))
  } finally {
    isLoadingProvision.value = false
  }
}

const handleSignin = async (): Promise<void> => {
  if (!canSubmitSignin.value) {
    return
  }

  isSubmittingSignin.value = true
  signinError.value = ''
  try {
    const res = await signin({
      username: signinForm.account.trim(),
      password: signinForm.password,
    })
    applyLogin(res.access_token, res.name)
    Message.success(t('loginModal.loginSuccess'))
  } catch {
    signinError.value = t('loginModal.loginFailed')
  } finally {
    isSubmittingSignin.value = false
  }
}

const handleSignup = async (): Promise<void> => {
  if (signupForm.password !== signupForm.confirmPassword) {
    signupError.value = t('loginModal.passwordMismatch')
    return
  }

  if (!canSubmitSignup.value) {
    return
  }

  isSubmittingSignup.value = true
  signupError.value = ''
  try {
    const res = await signup({
      email: signupForm.email.trim(),
      username: signupForm.username.trim(),
      password: signupForm.password,
      name: signupForm.name.trim(),
    })
    applyLogin(res.access_token, res.name)
    Message.success(t('loginModal.signupSuccess'))
  } catch (error) {
    signupError.value = getErrorMessage(error, t('loginModal.signupFailed'))
  } finally {
    isSubmittingSignup.value = false
  }
}

const handleAiralogyOauth = (): void => {
  if (!supportsAiralogyOauth.value || isRedirectingToAiralogy.value) {
    return
  }

  isRedirectingToAiralogy.value = true
  signinError.value = ''
  window.location.assign(
    buildOauthAuthorizeUrl(AIRALOGY_AUTHORIZE_PATH, route.fullPath || defaultHomePath.value),
  )
}

const handleInstitutionSso = (): void => {
  const authorizePath = selectedInstitution.value?.ssoAuthorizePath
  if (!authorizePath || isRedirectingInstitutionSso.value) {
    return
  }

  isRedirectingInstitutionSso.value = true
  activationError.value = ''
  window.location.assign(
    buildOauthAuthorizeUrl(authorizePath, route.fullPath || defaultHomePath.value),
  )
}

const handleActivate = async (): Promise<void> => {
  const token = activationForm.token.trim()
  const institutionSlug = selectedInstitution.value?.slug
  if (!token || !institutionSlug) {
    return
  }

  if (!activationPreview.value || loadedToken.value !== token) {
    await loadProvisionPreview()
  }

  if (!activationPreview.value) {
    return
  }

  if (needsNewCredentials.value && activationForm.password !== activationForm.confirmPassword) {
    activationError.value = t('loginModal.passwordMismatch')
    return
  }

  if (!canSubmitActivation.value) {
    activationError.value = needsNewCredentials.value
      ? t('loginModal.activationIncomplete')
      : t('loginModal.activationNeedVerify')
    return
  }

  isSubmittingActivation.value = true
  activationError.value = ''
  try {
    const res = await activateInstitutionProvision({
      token,
      institutionSlug,
      username: needsNewCredentials.value ? activationForm.username.trim() : undefined,
      password: activationForm.password,
    })
    applyLogin(res.access_token, res.name)
    Message.success(t('loginModal.activationSuccess'))
  } catch (error) {
    activationError.value = getErrorMessage(error, t('loginModal.activationFailed'))
  } finally {
    isSubmittingActivation.value = false
  }
}

watch(
  () => activationForm.token,
  (token) => {
    if (token.trim() !== loadedToken.value) {
      activationPreview.value = null
    }
    activationError.value = ''
  },
)

watch(
  () => selectedInstitutionSlug.value,
  () => {
    resetActivationForm()
  },
)

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      activeTab.value = resolvePreferredTab()
      platformMode.value = 'signin'
      if (hasInstitutionLoginTab.value) {
        void loadAuthInstitutionOptions()
      }
    } else {
      resetAll()
    }
  },
)
</script>

<style lang="sass" scoped>
.login-content
  position: relative
  padding: 36px 32px 32px

.close-btn
  position: absolute
  top: 8px
  right: 8px
  width: 30px
  height: 30px
  display: flex
  align-items: center
  justify-content: center
  background: none
  border: none
  border-radius: 50%
  cursor: pointer
  padding: 0

  :deep(.arco-icon)
    font-size: 18px
    color: #666

.close-btn:hover
  background: #f3f4f6

.login-title
  font-size: 18px
  font-weight: 500
  color: #364153
  text-align: center
  margin: 0 0 24px

.login-tabs
  position: relative
  display: flex
  margin-bottom: 24px

.tab-item
  flex: 1
  background: none
  border: none
  padding: 0 0 12px
  font-size: 14px
  font-weight: 500
  color: #4a5565
  cursor: pointer
  text-align: center
  transition: color 0.2s

.tab-item--active
  color: #00498f

.tab-line
  position: absolute
  bottom: 0
  left: 0
  right: 0
  height: 1px
  background: #e5e7eb

.tab-indicator
  position: absolute
  bottom: 0
  width: 50%
  height: 2px
  background: #00498f
  border-radius: 18px
  transition: transform 0.2s ease

.tab-indicator--airalogy
  transform: translateX(0)

.tab-indicator--institution
  transform: translateX(100%)

.login-helper
  margin-bottom: 16px
  font-size: 13px
  line-height: 1.6
  color: #667085

.institution-block
  margin-bottom: 16px

.institution-label
  margin-bottom: 8px
  font-size: 12px
  font-weight: 600
  color: #667085

.institution-select
  width: 100%

.institution-static
  min-height: 48px
  display: flex
  align-items: center
  padding: 0 14px
  border: 1px solid #e5e7eb
  border-radius: 10px
  background: #f8fafc
  font-size: 14px
  color: #344054

.method-chip-list
  display: flex
  flex-wrap: wrap
  gap: 8px

.method-chip
  display: inline-flex
  align-items: center
  min-height: 30px
  padding: 0 12px
  border-radius: 999px
  background: #eef4ff
  color: #00498f
  font-size: 12px
  font-weight: 600

.login-form
  display: flex
  flex-direction: column
  gap: 16px
  margin-bottom: 24px

.token-row
  display: grid
  grid-template-columns: minmax(0, 1fr) auto
  gap: 12px

.login-input
  width: 100%
  height: 48px
  padding: 0 14px
  border: 1px solid #e5e7eb
  border-radius: 10px
  font-size: 14px
  color: #333
  background: #fff
  outline: none
  transition: border-color 0.2s

.login-input::placeholder
  color: #9da3ab

.login-input:focus
  border-color: #00498f

.token-verify-btn
  height: 48px
  padding: 0 18px
  border: none
  border-radius: 10px
  background: #e8eef7
  color: #0f2f57
  font-size: 13px
  font-weight: 600
  cursor: pointer

.token-verify-btn--disabled
  opacity: 0.35
  cursor: not-allowed

.activation-card
  padding: 14px 16px
  border-radius: 14px
  background: #f7faff
  border: 1px solid rgba(0, 73, 143, 0.1)

.activation-title
  font-size: 14px
  font-weight: 700
  color: #1f2937

.activation-meta
  margin-top: 6px
  font-size: 13px
  color: #667085
  line-height: 1.5

.activation-status
  margin-top: 10px
  font-size: 13px
  color: #0f62fe
  line-height: 1.6

.login-submit-btn
  width: 100%
  height: 48px
  background: #00498f
  color: #fff
  border: none
  border-radius: 10px
  font-size: 14px
  font-weight: 500
  cursor: pointer
  transition: opacity 0.2s

.login-submit-btn:hover:not(.login-submit-btn--disabled)
  opacity: 0.9

.login-submit-btn--disabled
  opacity: 0.23
  cursor: not-allowed

.login-error
  margin-top: 10px
  font-size: 13px
  color: #e53935
  text-align: center

.login-links
  display: flex
  justify-content: flex-end
  margin-top: 12px
  margin-bottom: 24px

.login-links--center
  justify-content: center

.link-register
  padding: 0
  border: 0
  background: transparent
  font-size: 14px
  color: #00498f
  text-decoration: none
  cursor: pointer

.link-register:hover
  text-decoration: underline

.other-login
  display: flex
  flex-direction: column
  align-items: center
  gap: 14px
  margin-top: 8px

.other-login-divider
  display: flex
  align-items: center
  gap: 12px
  width: 100%

.divider-line
  flex: 1
  height: 1px
  background: #e5e7eb

.divider-text
  font-size: 12px
  color: #4a5565
  white-space: nowrap

.oauth-authorize-btn
  width: 100%
  height: 46px
  border: 1px solid #bfd5ea
  border-radius: 12px
  background: linear-gradient(180deg, #f8fbff 0%, #edf5ff 100%)
  color: #0f2f57
  font-size: 14px
  font-weight: 600
  cursor: pointer
  transition: border-color 0.2s, transform 0.2s

.oauth-authorize-btn:hover:not(:disabled)
  border-color: #7aa9d8
  transform: translateY(-1px)

.oauth-authorize-btn:disabled
  opacity: 0.6
  cursor: not-allowed

.oauth-helper
  font-size: 12px
  line-height: 1.6
  color: #667085
  text-align: center

.oauth-helper--highlight
  color: #0f62fe

@media (max-width: 640px)
  .login-content
    padding: 28px 20px 24px

  .token-row
    grid-template-columns: 1fr
</style>

<style lang="sass">
.login-modal .arco-modal-header
  display: none

.login-modal .arco-modal-body
  padding: 0
</style>
