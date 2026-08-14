<template>
  <header class="navbar">
    <button
      class="menu-toggle"
      type="button"
      :aria-label="menuLabel"
      :aria-expanded="menuOpen"
      @click="$emit('toggle-menu')"
    >
      <IconClose v-if="menuOpen" />
      <IconMenu v-else />
    </button>
    <router-link :to="homePath" class="navbar-brand">
      <img v-if="showBrandLogo" :src="resolvedBrandLogoUrl" :alt="appName" class="brand-logo" />
      <span v-else class="brand-text">{{ appName }}</span>
      <img
        v-if="showInstitutionLogo && resolvedInstitutionLogoUrl"
        :alt="$t('nav.institutionAlt')"
        :src="resolvedInstitutionLogoUrl"
        class="institution-logo"
      />
    </router-link>
    <div class="navbar-right">
      <slot name="right" />
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { IconClose, IconMenu } from '@arco-design/web-vue/es/icon'
import defaultBrandLogoUrl from '@/assets/logo-brand.png'
import { resolveSafeHttpUrl } from '@/utils/url'

const props = defineProps<{
  homePath: string
  appName: string
  showBrandLogo: boolean
  showInstitutionLogo: boolean
  brandLogoUrl?: string | null
  institutionLogoUrl?: string | null
  menuLabel: string
  menuOpen: boolean
}>()

defineEmits<{
  'toggle-menu': []
}>()

const resolvedBrandLogoUrl = computed(() => {
  return resolveSafeHttpUrl(props.brandLogoUrl) ?? defaultBrandLogoUrl
})
const resolvedInstitutionLogoUrl = computed(() => {
  return resolveSafeHttpUrl(props.institutionLogoUrl)
})
</script>

<style lang="sass" scoped>
.navbar
  position: fixed
  top: 0
  left: 0
  right: 0
  height: var(--scholar-navbar-height)
  display: flex
  align-items: center
  justify-content: space-between
  padding: 0 30px
  background: var(--scholar-bg-navbar)
  backdrop-filter: blur(20px)
  border-bottom: 1px solid var(--scholar-border-medium)
  z-index: 100

.navbar-brand
  display: flex
  align-items: center
  gap: 16px
  text-decoration: none

.menu-toggle
  display: none

.brand-logo
  height: 36px
  flex-shrink: 0

.brand-text
  font-size: 20px
  font-weight: 700
  color: var(--scholar-text-1)
  letter-spacing: -0.4px

.institution-logo
  height: 30px
  flex-shrink: 0

.navbar-right
  display: flex
  align-items: center
  gap: 16px

@media (max-width: 760px)
  .navbar
    justify-content: flex-start
    gap: 10px
    padding: 0 16px

  .menu-toggle
    display: grid
    place-items: center
    width: 36px
    height: 36px
    flex: 0 0 36px
    border: 0
    border-radius: 8px
    color: var(--scholar-text-1)
    background: transparent
    font-size: 20px
    cursor: pointer

  .menu-toggle:hover
    background: var(--scholar-primary-light)

  .navbar-brand
    min-width: 0

  .brand-logo
    max-width: 174px
    height: 32px
    object-fit: contain

  .institution-logo
    display: none

  .navbar-right
    margin-left: auto
</style>
