<template>
  <aside class="sidebar" :class="{ 'sidebar--mobile-open': mobileOpen }">
    <nav class="sidebar-nav">
      <div class="nav-group">
        <router-link v-if="showUpload" to="/upload" class="nav-upload">
          <div class="nav-upload-icon-wrapper">
            <UploadIcon class="nav-upload-icon nav-icon-default" />
            <UploadActiveIcon class="nav-upload-icon nav-icon-active" />
          </div>
          <span>{{ $t('nav.upload') }}</span>
        </router-link>

        <router-link
          v-if="showAiChat"
          to="/chat"
          class="nav-item"
          :class="{ 'nav-item--active': isActive('/chat') }"
        >
          <span class="nav-item-icon">
            <AiChatIcon class="nav-icon nav-icon-default" />
            <AiChatActiveIcon class="nav-icon nav-icon-active" />
          </span>
          <span>{{ $t('nav.aiChat') }}</span>
        </router-link>

        <router-link
          :to="papersPath"
          class="nav-item"
          :class="{ 'nav-item--active': isPaperRouteActive() }"
        >
          <span class="nav-item-icon">
            <PapersIcon class="nav-icon nav-icon-default" />
            <PapersActiveIcon class="nav-icon nav-icon-active" />
          </span>
          <span>{{ $t('nav.papers') }}</span>
        </router-link>

        <router-link
          to="/scholars"
          class="nav-item"
          :class="{ 'nav-item--active': isActive('/scholars') }"
        >
          <span class="nav-item-icon">
            <ScholarIcon class="nav-icon nav-icon-default" />
            <ScholarActiveIcon class="nav-icon nav-icon-active" />
          </span>
          <span>{{ $t('nav.scholars') }}</span>
        </router-link>

        <router-link
          v-if="showDegreeTheses"
          to="/theses"
          class="nav-item"
          :class="{ 'nav-item--active': isThesisRouteActive() }"
        >
          <span class="nav-item-icon">
            <IconFile class="nav-icon-font" />
          </span>
          <span>{{ $t('nav.theses') }}</span>
        </router-link>

        <div class="nav-expandable">
          <button
            class="nav-item"
            :class="{ 'nav-item--active': isActive('/my-library') }"
            @click="libraryExpanded = !libraryExpanded"
          >
            <span class="nav-item-icon">
              <LibraryIcon class="nav-icon nav-icon-default" />
              <LibraryActiveIcon class="nav-icon nav-icon-active" />
            </span>
            <span class="nav-item-text">{{ $t('nav.library') }}</span>
            <IconDown class="nav-chevron" :class="{ 'nav-chevron--open': libraryExpanded }" />
          </button>
          <div v-if="libraryExpanded" class="nav-sub-items">
            <router-link to="/my-library/favorites" class="nav-sub-item">{{ $t('nav.favorites') }}</router-link>
            <router-link to="/my-library/uploads" class="nav-sub-item">{{ $t('nav.uploads') }}</router-link>
          </div>
        </div>

        <router-link
          v-if="isLoggedIn && canAccessAdmin"
          to="/admin"
          class="nav-item"
          :class="{ 'nav-item--active': isActive('/admin') }"
        >
          <span class="nav-item-icon">
            <IconSettings class="nav-icon-font" />
          </span>
          <span>{{ $t('nav.admin') }}</span>
        </router-link>
      </div>
    </nav>

    <div v-if="showInstitutionWatermark && resolvedInstitutionWatermarkUrl" class="sidebar-watermark">
      <img :src="resolvedInstitutionWatermarkUrl" alt="" class="watermark-img" />
    </div>

    <div class="sidebar-bottom">
      <a class="documentation-link" :href="documentationUrl" target="_blank" rel="noopener">
        <IconBook class="documentation-link-icon" />
        <span>{{ $t('nav.documentation') }}</span>
      </a>

      <div v-if="isLoggedIn" class="user-section">
        <router-link to="/settings" class="user-card">
          <div class="user-avatar">
            <img v-if="userAvatar" :src="userAvatar" :alt="$t('nav.profileAlt')" />
            <IconUser v-else class="user-avatar-icon" />
          </div>
          <span class="user-name">{{ userName }}</span>
        </router-link>
        <button class="logout-btn" :title="$t('nav.logout')" @click="$emit('logout')">
          <LogoutIcon class="logout-icon" />
        </button>
      </div>
      <button v-else class="login-btn" @click="$emit('login')">
        {{ $t('nav.login') }}
      </button>

      <div class="sidebar-copyright">
        <p class="copyright-line">{{ $t('footer.copyright', { year: currentYear }) }}</p>
        <p class="copyright-line">{{ $t('footer.companyName') }}</p>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { IconBook, IconDown, IconFile, IconSettings, IconUser } from '@arco-design/web-vue/es/icon'
import UploadIcon from '@/assets/icons/upload.svg?component'
import UploadActiveIcon from '@/assets/icons/upload-active.svg?component'
import AiChatIcon from '@/assets/icons/ai-chat-2.svg?component'
import AiChatActiveIcon from '@/assets/icons/ai-chat-active-2.svg?component'
import PapersIcon from '@/assets/icons/papers.svg?component'
import PapersActiveIcon from '@/assets/icons/papers-active.svg?component'
import ScholarIcon from '@/assets/icons/scholar.svg?component'
import ScholarActiveIcon from '@/assets/icons/scholar-active.svg?component'
import LibraryIcon from '@/assets/icons/library.svg?component'
import LibraryActiveIcon from '@/assets/icons/library-active.svg?component'
import LogoutIcon from '@/assets/icons/logout.svg?component'
import { resolveSafeHttpUrl } from '@/utils/url'

const props = withDefaults(defineProps<{
  isLoggedIn?: boolean
  userName?: string
  userAvatar?: string
  canAccessAdmin?: boolean
  showAiChat?: boolean
  showUpload?: boolean
  showDegreeTheses?: boolean
  showInstitutionWatermark?: boolean
  institutionWatermarkUrl?: string | null
  papersPath?: string
  mobileOpen?: boolean
}>(), {
  papersPath: '/papers',
  mobileOpen: false,
})

defineEmits<{
  login: []
  logout: []
}>()

const route = useRoute()
const { locale } = useI18n()
const libraryExpanded = ref(true)
const currentYear: number = new Date().getFullYear()
const documentationUrl = computed<string>(() => {
  return locale.value.startsWith('en') ? '/docs/en/' : '/docs/zh/'
})
const resolvedInstitutionWatermarkUrl = computed(() => {
  return resolveSafeHttpUrl(props.institutionWatermarkUrl)
})

const isActive = (path: string): boolean => {
  return route.path === path || route.path.startsWith(path + '/')
}

const isPaperRouteActive = (): boolean => {
  return [
    'Papers',
    'InstitutionPapers',
    'InstitutionCollegePapers',
    'LabPapers',
    'ScholarPapers',
    'PaperDetail',
  ].includes(String(route.name ?? ''))
}

const isThesisRouteActive = (): boolean => {
  return ['Theses', 'ThesisSubmit', 'MyTheses', 'ThesisEdit', 'ThesisDetail'].includes(
    String(route.name ?? ''),
  )
}
</script>

<style lang="sass" scoped>
.sidebar
  position: fixed
  top: 64px
  left: 0
  bottom: 0
  width: var(--scholar-sidebar-width)
  background: var(--scholar-bg-sidebar)
  border-right: 1px solid var(--scholar-border-light)
  display: flex
  flex-direction: column
  z-index: 90

.sidebar-nav
  flex: 1
  padding: 40px 20px 0
  overflow-y: auto

.nav-group
  display: flex
  flex-direction: column
  gap: 2px

/* 上传论文 - 描边按钮 */
.nav-upload
  display: flex
  align-items: center
  justify-content: center
  gap: 6px
  height: 44px
  border: 1px solid var(--scholar-primary)
  border-radius: var(--scholar-radius-lg)
  color: var(--scholar-primary)
  font-size: 14px
  font-weight: 500
  text-decoration: none
  margin-bottom: 16px
  transition: all 0.2s ease
  letter-spacing: -0.31px

.nav-upload-icon-wrapper
  position: relative
  width: 18px
  height: 18px
  display: block
  flex-shrink: 0

.nav-upload-icon
  width: 18px
  height: 18px
  display: block
  flex-shrink: 0
  object-fit: contain
  position: absolute
  top: 0
  left: 0
  transition: opacity 0.2s ease

.nav-icon-default
  opacity: 1

.nav-icon-active
  opacity: 0

/* 上传论文图标始终显示默认状态 */
.nav-upload .nav-icon-active
  display: none

.nav-upload:hover
  background: var(--scholar-primary-light)

/* 普通菜单项 */
.nav-item
  display: flex
  align-items: center
  gap: 12px
  height: var(--scholar-nav-item-height)
  padding: 0 16px
  box-sizing: border-box
  border-radius: var(--scholar-radius-md)
  font-size: 14px
  font-weight: 500
  color: var(--scholar-text-2)
  text-decoration: none
  transition: all 0.2s ease
  cursor: pointer
  border: none
  background: none
  width: 100%
  letter-spacing: -0.31px

.nav-item:hover
  background: var(--scholar-primary-light)

.nav-item:hover:not(.nav-item--active) .nav-icon-default
  opacity: 0

.nav-item:hover:not(.nav-item--active) .nav-icon-active
  opacity: 1

.nav-item--active
  background: var(--scholar-primary)
  color: #fff

.nav-item--active:hover
  background: var(--scholar-primary)

.nav-item--active .nav-icon-default
  opacity: 1

.nav-item--active .nav-icon-active
  opacity: 0

.nav-item-icon
  display: flex
  align-items: center
  justify-content: center
  width: 22px
  height: 22px
  flex-shrink: 0
  padding: 2px
  box-sizing: border-box
  position: relative

.nav-item-icon .nav-icon
  position: absolute
  top: 50%
  left: 50%
  transform: translate(-50%, -50%)

.nav-icon
  width: 18px
  height: 18px
  display: block
  flex-shrink: 0
  object-fit: contain
  transition: opacity 0.2s ease

.nav-icon-font
  font-size: 18px

.nav-icon-default
  opacity: 1

.nav-icon-active
  opacity: 0


.nav-item-text
  flex: 1
  text-align: left

.nav-chevron
  color: var(--scholar-text-3)
  transition: transform 0.2s
  flex-shrink: 0
  font-size: 14px

.nav-chevron--open
  transform: rotate(180deg)

.nav-item--active .nav-chevron
  color: #fff

/* 子菜单 */
.nav-sub-items
  display: flex
  flex-direction: column
  padding-left: 44px
  gap: 0

.nav-sub-item
  display: flex
  align-items: center
  height: 36px
  font-size: 13px
  font-weight: 500
  color: var(--scholar-text-2)
  text-decoration: none
  transition: color 0.15s
  letter-spacing: -0.31px

.nav-sub-item:hover
  color: var(--scholar-primary)

/* 底部水印 */
.sidebar-watermark
  position: absolute
  bottom: 80px
  left: -70px
  width: 264px
  height: 265px
  pointer-events: none
  overflow: hidden

.watermark-img
  width: 100%
  height: 100%

/* 底部区域 */
.sidebar-bottom
  padding: 20px
  position: relative
  z-index: 1
  display: flex
  flex-direction: column
  gap: 16px

.documentation-link
  display: flex
  align-items: center
  justify-content: center
  gap: 6px
  color: var(--scholar-text-2)
  font-size: 12px
  text-decoration: none

.documentation-link:hover
  color: var(--scholar-primary)

.documentation-link-icon
  font-size: 14px

.user-section
  display: flex
  align-items: center
  gap: 8px

.user-card
  display: flex
  align-items: center
  gap: 10px
  padding: 11px 16px
  background: #fff
  border-radius: var(--scholar-radius-lg)
  box-shadow: var(--scholar-shadow-card)
  flex: 1
  min-width: 0

.user-avatar
  width: 34px
  height: 34px
  border-radius: 50%
  overflow: hidden
  flex-shrink: 0
  background: #e8eaed
  display: flex
  align-items: center
  justify-content: center

.user-avatar-icon
  font-size: 20px
  color: #b0b8c4

.user-avatar img
  width: 100%
  height: 100%
  object-fit: cover

.user-name
  font-size: 14px
  color: var(--scholar-text-user)
  white-space: nowrap
  overflow: hidden
  text-overflow: ellipsis

.user-settings-link
  margin-left: auto
  font-size: 12px
  color: var(--scholar-primary)
  text-decoration: none
  padding: 2px 6px
  border-radius: 8px

.user-settings-link:hover
  background: var(--scholar-primary-light)

.logout-btn
  display: flex
  align-items: center
  justify-content: center
  width: 24px
  height: 24px
  background: none
  border: none
  cursor: pointer
  padding: 0
  flex-shrink: 0

.logout-icon
  width: 16px
  height: 16px

.logout-btn:hover
  opacity: 0.7

.login-btn
  width: 130px
  height: 34px
  background: var(--scholar-primary)
  color: #fff
  border: none
  border-radius: var(--scholar-radius-sm)
  font-size: 14px
  font-weight: 500
  cursor: pointer
  transition: all 0.2s
  margin: 0 auto
  display: block

.login-btn:hover
  background: var(--scholar-primary-hover)
  transform: translateY(-1px)
  box-shadow: 0 4px 8px rgba(0, 73, 143, 0.2)

.sidebar-copyright
  display: flex
  flex-direction: column
  gap: 4px
  color: var(--scholar-text-3)
  font-size: 11px
  line-height: 1.5
  text-align: center

.copyright-line
  margin: 0

@media (max-width: 760px)
  .sidebar
    width: min(300px, 84vw)
    transform: translateX(-100%)
    transition: transform 0.2s ease
    box-shadow: 12px 0 32px rgba(15, 23, 42, 0.16)

  .sidebar--mobile-open
    transform: translateX(0)
</style>
