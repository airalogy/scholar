<template>
  <section class="oauth-callback-page">
    <div class="oauth-callback-card">
      <div v-if="status === 'loading'" class="oauth-callback-loading">
        <a-spin :size="28" />
      </div>

      <h1 class="oauth-callback-title">{{ pageTitle }}</h1>

      <p class="oauth-callback-message">
        {{
          status === 'loading'
            ? $t('oauthCallback.processingDescription', { provider: providerLabel })
            : status === 'review' ? $t('identity.conflictDescription') : errorMessage
        }}
      </p>

      <IdentityReviewRequest
        v-if="status === 'review' && conflict"
        :proof-token="conflict.proofToken"
        :expires-at="conflict.expiresAt"
        @reauthenticate="retryOauth"
      />

      <div v-if="status === 'error'" class="oauth-callback-actions">
        <a-button type="primary" @click="retryOauth">
          {{ $t('oauthCallback.retry') }}
        </a-button>
        <a-button @click="goHome">
          {{ $t('oauthCallback.backHome') }}
        </a-button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import {
  buildOauthAuthorizeUrl,
  completeOauth,
  type OauthProvider,
} from '@/api/auth'
import { useAuth } from '@/composables/useAuth'
import { usePublicConfig } from '@/composables/usePublicConfig'
import IdentityReviewRequest from '@/components/IdentityReviewRequest.vue'
import { cacheIdentityConflict, getIdentityConflict, restoreIdentityConflict, type IdentityConflict } from '@/api/identity'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { login } = useAuth()
const { auth: publicAuthConfig, features, defaultHomePath } = usePublicConfig()

const status = ref<'loading' | 'error' | 'review'>('loading')
const conflict = ref<IdentityConflict | null>(null)
const errorMessage = ref('')
const provider = computed<OauthProvider>(() => {
  return route.meta.oauthProvider === 'institution-sso' ? 'institution-sso' : 'airalogy'
})
const authorizePath = computed(() => {
  return typeof route.meta.oauthAuthorizePath === 'string'
    ? route.meta.oauthAuthorizePath
    : `/api/auth/${provider.value}/authorize`
})
const providerLabel = computed(() => {
  return provider.value === 'institution-sso'
    ? t('oauthCallback.providers.institutionSso')
    : t('oauthCallback.providers.airalogy')
})
const pageTitle = computed(() => status.value === 'review'
  ? t('identity.conflictTitle')
  : t(status.value === 'loading' ? 'oauthCallback.processingTitle' : 'oauthCallback.failedTitle', { provider: providerLabel.value }))

const getQueryValue = (value: unknown): string => {
  return typeof value === 'string' ? value : ''
}

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

const retryOauth = (): void => {
  cacheIdentityConflict(null)
  const isEnabled = provider.value === 'airalogy'
    ? publicAuthConfig.value.enableAiralogyOauth
    : publicAuthConfig.value.enableInstitutionSso

  if (!isEnabled) {
    void goHome()
    return
  }

  window.location.assign(buildOauthAuthorizeUrl(authorizePath.value, defaultHomePath.value))
}

const goHome = async (): Promise<void> => {
  await router.replace(defaultHomePath.value)
}

const handleCallback = async (): Promise<void> => {
  const providerError = getQueryValue(route.query.error)
  const providerErrorDescription = getQueryValue(route.query.error_description)

  if (providerError) {
    status.value = 'error'
    errorMessage.value = providerErrorDescription || providerError
    return
  }

  const code = getQueryValue(route.query.code)
  const state = getQueryValue(route.query.state)

  if (provider.value === 'institution-sso' && !code && !state) {
    conflict.value = restoreIdentityConflict()
    if (conflict.value) { status.value = 'review'; return }
  }

  if (!code || !state) {
    status.value = 'error'
    errorMessage.value = t('oauthCallback.missingParams', { provider: providerLabel.value })
    return
  }

  try {
    const result = await completeOauth(provider.value, { code, state })
    const redirectTo = result.redirect_to.startsWith('/') ? result.redirect_to : defaultHomePath.value
    const safeRedirectTo = redirectTo === '/chat' && !features.value.aiChat
      ? defaultHomePath.value
      : redirectTo

    cacheIdentityConflict(null)
    login(result.access_token, result.name, result.avatar_url ?? '')
    await router.replace(safeRedirectTo)
  } catch (error) {
    const identityConflict = provider.value === 'institution-sso' ? getIdentityConflict(error) : null
    if (identityConflict) {
      conflict.value = identityConflict
      cacheIdentityConflict(identityConflict)
      status.value = 'review'
      await router.replace({ path: route.path, query: {} })
      return
    }
    status.value = 'error'
    errorMessage.value = getErrorMessage(
      error,
      t('oauthCallback.failedDescription', { provider: providerLabel.value }),
    )
  }
}

onMounted(() => {
  void handleCallback()
})
</script>

<style lang="sass" scoped>
.oauth-callback-page
  min-height: calc(100vh - var(--scholar-navbar-height))
  display: flex
  align-items: center
  justify-content: center
  padding: 32px 20px
  background: linear-gradient(180deg, #f6f9fc 0%, #eef4fb 100%)

.oauth-callback-card
  width: min(100%, 520px)
  padding: 36px 32px
  border: 1px solid rgba(0, 73, 143, 0.08)
  border-radius: 24px
  background: rgba(255, 255, 255, 0.92)
  box-shadow: 0 18px 48px rgba(15, 47, 87, 0.08)
  text-align: center

.oauth-callback-loading
  display: flex
  justify-content: center
  margin-bottom: 20px

.oauth-callback-title
  margin: 0
  font-size: 24px
  font-weight: 600
  color: #15314f

.oauth-callback-message
  margin: 14px 0 0
  font-size: 14px
  line-height: 1.7
  color: #5b6b7d

.oauth-callback-actions
  display: flex
  justify-content: center
  gap: 12px
  margin-top: 24px

@media (max-width: 640px)
  .oauth-callback-card
    padding: 28px 20px

  .oauth-callback-actions
    flex-direction: column
</style>
