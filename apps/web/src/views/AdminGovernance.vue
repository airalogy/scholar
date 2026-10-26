<template>
  <main class="governance-page">
    <router-link :to="`/admin/institutions/${slug}/members`">{{ $t('governance.members') }}</router-link>
    <h1>{{ $t('governance.title') }}</h1>
    <a :href="locale.startsWith('en') ? '/docs/en/administration/personnel-review' : '/docs/zh/administration/personnel-review'" target="_blank" rel="noopener">{{ $t('personnel.handbook') }}</a>
    <nav class="tabs" :aria-label="$t('governance.title')"><button :aria-pressed="tab === 'directory'" @click="tab = 'directory'">{{ $t('governance.directory') }}</button><button :aria-pressed="tab === 'people'" @click="tab = 'people'">{{ $t('personnel.title') }}</button><button :aria-pressed="tab === 'review'" @click="tab = 'review'">{{ $t('governance.reviewSettings') }}</button><button :aria-pressed="tab === 'routes'" @click="tab = 'routes'">{{ $t('routing.title') }}</button></nav>
    <DirectorySyncPanel v-if="tab === 'directory'" :key="slug" :slug="slug" />
    <ReviewGovernancePanel v-else-if="tab === 'review'" :key="slug" :slug="slug" />
    <PersonnelHistoryPanel v-else-if="tab === 'people'" :key="slug" :slug="slug" />
    <ReviewRoutePanel v-else :key="slug" :slug="slug" />
  </main>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import DirectorySyncPanel from '@/components/DirectorySyncPanel.vue'
import ReviewGovernancePanel from '@/components/ReviewGovernancePanel.vue'
import PersonnelHistoryPanel from '@/components/PersonnelHistoryPanel.vue'
import ReviewRoutePanel from '@/components/ReviewRoutePanel.vue'
import { useI18n } from 'vue-i18n'
const { locale } = useI18n()
const route = useRoute()
const slug = computed(() => String(route.params.slug))
const tab = ref<'directory' | 'review' | 'people' | 'routes'>('directory')
</script>
<style scoped>
.governance-page { max-width: 1100px; margin: auto; padding: 32px 24px; }
.tabs { display: flex; flex-wrap: wrap; gap: 16px; margin: 24px 0; }
button { padding: 12px 18px; cursor: pointer; }
</style>
