<template>
  <a-config-provider :locale="arcoLocale">
    <div class="app">
      <NavBar
        :home-path="defaultHomePath"
        :app-name="branding.appName"
        :show-brand-logo="branding.showBrandLogo"
        :show-institution-logo="branding.showInstitutionLogo"
        :brand-logo-url="branding.brandLogoUrl"
        :institution-logo-url="branding.institutionLogoUrl"
        :menu-label="$t(mobileSidebarOpen ? 'nav.closeMenu' : 'nav.openMenu')"
        :menu-open="mobileSidebarOpen"
        @toggle-menu="mobileSidebarOpen = !mobileSidebarOpen"
      >
        <template #right>
          <a-select
            :model-value="locale"
            size="small"
            class="locale-select"
            @change="handleLocaleChange"
          >
            <a-option
              v-for="option in languageOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ $t(option.labelKey) }}
            </a-option>
          </a-select>
        </template>
      </NavBar>
      <SideBar
        :is-logged-in="isLoggedIn"
        :user-name="name"
        :user-avatar="avatarUrl"
        :can-access-admin="canAccessAdmin"
        :show-ai-chat="features.aiChat"
        :show-upload="features.paperUpload"
        :show-degree-theses="features.degreeTheses"
        :show-institution-watermark="branding.showInstitutionLogo"
        :institution-watermark-url="branding.institutionWatermarkUrl"
        :papers-path="paperLibrary.defaultPath"
        :mobile-open="mobileSidebarOpen"
        @login="openLoginModal()"
        @logout="handleLogout"
      />
      <button
        v-if="mobileSidebarOpen"
        class="sidebar-overlay"
        type="button"
        :aria-label="$t('nav.closeMenu')"
        @click="mobileSidebarOpen = false"
      />
      <main class="app-main">
        <router-view />
      </main>
      <FeedbackWidget />
      <LoginModal
        v-model:visible="showLoginModal"
        :preferred-tab="loginModalPreferredTab"
        :return-to="pendingLoginPath"
        @authenticated="handleAuthenticated"
        @cancelled="pendingLoginPath = ''"
      />
    </div>
  </a-config-provider>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useLocale } from '@/composables/useLocale'
import NavBar from '@/components/layout/NavBar.vue'
import SideBar from '@/components/layout/SideBar.vue'
import FeedbackWidget from '@/components/FeedbackWidget.vue'
import LoginModal from '@/components/LoginModal.vue'
import { getMyProfile } from '@/api/users'
import { useAuth } from '@/composables/useAuth'
import { usePublicConfig } from '@/composables/usePublicConfig'
import { isDevAuthBypassEnabled } from '@/utils/devAuth'
import { ApiError } from '@/api/client'

type LoginPreferredTab = 'institution' | 'airalogy'

interface OpenLoginEventDetail {
  preferredTab?: LoginPreferredTab
  returnTo?: string
}

const router = useRouter()
const showLoginModal = ref(false)
const mobileSidebarOpen = ref(false)
const loginModalPreferredTab = ref<LoginPreferredTab | undefined>(undefined)
const pendingLoginPath = ref('')
const {
  isLoggedIn,
  token,
  name,
  avatarUrl,
  canAccessAdmin,
  logout,
  updateAvatar,
  updateAdminAccess,
} = useAuth()
const { locale, arcoLocale, languageOptions, updateLocale } = useLocale()
const { branding, features, defaultHomePath, paperLibrary } = usePublicConfig()
const openLoginModal = (preferredTab?: LoginPreferredTab): void => {
  loginModalPreferredTab.value = preferredTab
  showLoginModal.value = true
}

const handleUnauthorized = (event: Event): void => {
  if (isDevAuthBypassEnabled) {
    return
  }
  const detail = (event as CustomEvent<OpenLoginEventDetail>).detail
  pendingLoginPath.value = detail?.returnTo ?? ''
  if (isLoggedIn.value) {
    logout()
  }
  openLoginModal(detail?.preferredTab)
}

const handleOpenLogin = (event: Event): void => {
  if (isDevAuthBypassEnabled) {
    return
  }

  const detail = (event as CustomEvent<OpenLoginEventDetail>).detail
  pendingLoginPath.value = detail?.returnTo ?? ''
  openLoginModal(detail?.preferredTab)
}

const handleAuthenticated = (): void => {
  const returnTo = pendingLoginPath.value
  pendingLoginPath.value = ''
  if (returnTo && returnTo.startsWith('/') && returnTo !== router.currentRoute.value.fullPath) {
    void router.push(returnTo)
  }
}

const handleLogout = (): void => {
  logout()
  router.push('/')
}

const handleLocaleChange = (value: unknown): void => {
  if (typeof value === 'string' && (value === 'zh-CN' || value === 'en-US')) {
    updateLocale(value)
  }
}

const syncUserAvatar = async (): Promise<void> => {
  if (!isLoggedIn.value || isDevAuthBypassEnabled) {
    return
  }

  try {
    const profile = await getMyProfile(false)
    updateAvatar(profile.avatar_url ?? profile.avatar ?? '')
    updateAdminAccess(profile.admin_access)
  } catch (error) {
    updateAdminAccess(null)
    if (error instanceof ApiError && error.response.status === 401) {
      logout()
    }
    // 忽略头像拉取失败，避免影响页面可用性
  }
}

onMounted(() => {
  window.addEventListener('auth:unauthorized', handleUnauthorized)
  window.addEventListener('auth:open-login', handleOpenLogin)
  void syncUserAvatar()
})

watch(token, (nextToken) => {
  if (nextToken) {
    void syncUserAvatar()
    return
  }

  updateAdminAccess(null)
})

watch(showLoginModal, (visible) => {
  if (!visible) {
    loginModalPreferredTab.value = undefined
  }
})

watch(
  () => router.currentRoute.value.fullPath,
  () => {
    mobileSidebarOpen.value = false
  },
)

onUnmounted(() => {
  window.removeEventListener('auth:unauthorized', handleUnauthorized)
  window.removeEventListener('auth:open-login', handleOpenLogin)
})
</script>

<style lang="sass" scoped>
.app
  height: 100vh
  overflow: hidden

.locale-select
  width: 122px

.app-main
  margin-left: var(--scholar-sidebar-width)
  margin-top: var(--scholar-navbar-height)
  height: calc(100vh - var(--scholar-navbar-height))
  overflow-y: auto
  overflow-x: hidden

.sidebar-overlay
  display: none

@media (max-width: 760px)
  .locale-select
    width: 82px

  .app-main
    margin-left: 0

  .sidebar-overlay
    position: fixed
    display: block
    inset: var(--scholar-navbar-height) 0 0
    z-index: 80
    border: 0
    background: rgba(15, 23, 42, 0.38)
</style>
