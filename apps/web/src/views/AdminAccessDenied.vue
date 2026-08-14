<template>
  <div class="access-page">
    <section class="access-card">
      <div class="access-code">403</div>
      <p class="access-eyebrow">{{ $t('adminAccessDenied.eyebrow') }}</p>
      <h1>{{ $t('adminAccessDenied.title') }}</h1>
      <p class="access-message">
        {{ message }}
      </p>
      <div class="access-actions">
        <router-link v-if="canAccessAdmin" to="/admin" class="primary-action">
          {{ $t('adminAccessDenied.backToAdmin') }}
        </router-link>
        <router-link to="/" class="secondary-action">
          {{ $t('adminAccessDenied.backToHome') }}
        </router-link>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useAuth } from '@/composables/useAuth'

const route = useRoute()
const { t } = useI18n()
const { canAccessAdmin } = useAuth()

const message = computed(() => {
  return route.query.reason === 'verification'
    ? t('adminAccessDenied.verificationFailed')
    : t('adminAccessDenied.message')
})
</script>

<style lang="sass" scoped>
.access-page
  min-height: calc(100vh - var(--scholar-navbar-height))
  display: grid
  place-items: center
  padding: 40px 24px
  background: linear-gradient(180deg, #f7f9fc 0%, #ffffff 100%)

.access-card
  width: min(560px, 100%)
  padding: 48px
  border: 1px solid rgba(15, 47, 87, 0.1)
  border-radius: 28px
  background: #fff
  box-shadow: 0 24px 64px rgba(15, 47, 87, 0.1)
  text-align: center

.access-code
  font-size: 64px
  line-height: 1
  font-weight: 750
  color: rgba(15, 47, 87, 0.12)

.access-eyebrow
  margin: 20px 0 0
  font-size: 12px
  letter-spacing: 0.18em
  text-transform: uppercase
  color: #60728a

h1
  margin: 12px 0 0
  font-size: 30px
  color: #172b4d

.access-message
  margin: 16px auto 0
  max-width: 440px
  color: #667085
  font-size: 15px
  line-height: 1.8

.access-actions
  display: flex
  justify-content: center
  gap: 12px
  margin-top: 28px

.primary-action, .secondary-action
  display: inline-flex
  align-items: center
  justify-content: center
  min-height: 42px
  padding: 0 18px
  border-radius: 999px
  font-size: 14px
  font-weight: 600
  text-decoration: none

.primary-action
  color: #fff
  background: #0f2f57

.secondary-action
  color: #0f2f57
  background: #eef4ff

@media (max-width: 560px)
  .access-card
    padding: 36px 24px

  .access-actions
    flex-direction: column
</style>
