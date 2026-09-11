<template>
  <section class="about-page" aria-labelledby="about-title">
    <div class="about-card">
      <h1 id="about-title">{{ $t('about.title') }}</h1>
      <p v-if="isDevelopment" class="development-note">{{ $t('about.development') }}</p>
      <dl class="version-details" aria-live="polite" :aria-busy="loading">
        <div>
          <dt>{{ $t('about.webVersion') }}</dt>
          <dd>v{{ webVersion }}</dd>
        </div>
        <div>
          <dt>{{ $t('about.apiVersion') }}</dt>
          <dd>{{ loading ? $t('common.loading') : server ? `v${server.version}` : $t('about.unavailable') }}</dd>
        </div>
        <template v-if="server && !loading">
          <div v-if="server.commit && server.commit !== 'unknown'">
            <dt>{{ $t('about.commit') }}</dt>
            <dd class="build-commit">{{ server.commit }}</dd>
          </div>
          <div v-if="buildTime">
            <dt>{{ $t('about.buildTime') }}</dt>
            <dd>{{ buildTime }}</dd>
          </div>
        </template>
      </dl>
      <p v-if="versionMismatch" class="version-warning" role="status">{{ $t('about.mismatch') }}</p>
      <p v-if="server?.dirty && !loading" class="development-note">{{ $t('about.modifiedBuild') }}</p>
      <div v-if="failed" class="version-error" role="status">
        <p>{{ $t('about.loadFailed') }}</p>
        <a-button @click="loadVersion">{{ $t('common.refresh') }}</a-button>
      </div>
      <footer class="product-notice">
        <p>{{ $t('about.copyright', { company: bilingualCompanyName }) }}</p>
        <p>{{ $t('about.trademark') }}</p>
      </footer>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { getSystemVersion, type SystemVersion } from '@/api/version'
import { webVersion } from '@/utils/version'

const { t, locale } = useI18n()
const bilingualCompanyName = computed<string>(() => {
  const chinese = t('footer.companyName', {}, { locale: 'zh-CN' })
  const english = t('footer.companyName', {}, { locale: 'en-US' })
  return locale.value.startsWith('en') ? `${english} (${chinese})` : `${chinese}（${english}）`
})
const isDevelopment = import.meta.env.DEV
const server = ref<SystemVersion | null>(null)
const loading = ref(false)
const failed = ref(false)
let controller: AbortController | undefined
const versionMismatch = computed<boolean>(() => !loading.value && Boolean(server.value && server.value.version !== webVersion))
const buildTime = computed<string | null>(() => {
  const raw = server.value?.buildTime
  if (!raw || !Number.isFinite(Date.parse(raw))) return null
  return new Date(raw).toLocaleString(locale.value)
})
const loadVersion = async (): Promise<void> => {
  controller?.abort()
  const activeController = new AbortController()
  controller = activeController
  loading.value = true
  failed.value = false
  server.value = null
  try {
    const result = await getSystemVersion(activeController.signal)
    if (!activeController.signal.aborted) server.value = result
  } catch {
    if (!activeController.signal.aborted) failed.value = true
  } finally {
    if (!activeController.signal.aborted) loading.value = false
  }
}
onMounted(() => { void loadVersion() })
onUnmounted(() => { controller?.abort() })
</script>

<style scoped>
.about-page {
  padding: clamp(24px, 5vw, 64px) 20px;
}
.about-card {
  max-width: 640px;
  margin: 0 auto;
  padding: clamp(20px, 4vw, 36px);
  background: var(--color-bg-2, #fff);
  border: 1px solid var(--scholar-border-light);
  border-radius: var(--scholar-radius-lg);
}
.about-card h1 {
  margin: 0 0 24px;
  font-size: 24px;
  color: var(--scholar-text-1);
}
.version-details {
  margin: 0 0 24px;
}
.version-details > div {
  display: grid;
  grid-template-columns: minmax(100px, 1fr) minmax(0, 2fr);
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid var(--scholar-border-light);
}
.version-details dt, .development-note {
  color: var(--scholar-text-3);
}
.version-details dd {
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--scholar-text-1);
}
.build-commit {
  font-family: monospace;
}
.version-warning {
  padding: 12px;
  color: var(--color-text-1);
  background: var(--color-warning-light-1, #fff7e8);
  border-radius: 8px;
}
.version-error, .version-warning, .development-note {
  margin: 0 0 20px;
  line-height: 1.7;
}
.product-notice {
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid var(--scholar-border-light);
  color: var(--scholar-text-3);
  font-size: 13px;
  line-height: 1.8;
  overflow-wrap: anywhere;
}
.product-notice p {
  margin: 0 0 6px;
}
</style>
