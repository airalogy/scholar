<template>
  <main class="governance-page">
    <router-link :to="`/admin/institutions/${slug}/members`">{{ $t('governance.members') }}</router-link>
    <h1>{{ $t('governance.title') }}</h1>
    <nav class="tabs" :aria-label="$t('governance.title')"><button :aria-pressed="tab === 'directory'" @click="tab = 'directory'">{{ $t('governance.directory') }}</button><button :aria-pressed="tab === 'review'" @click="tab = 'review'">{{ $t('governance.reviewSettings') }}</button></nav>
    <DirectorySyncPanel v-if="tab === 'directory'" :key="slug" :slug="slug" />
    <ReviewGovernancePanel v-else :key="slug" :slug="slug" />
  </main>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import DirectorySyncPanel from '@/components/DirectorySyncPanel.vue'
import ReviewGovernancePanel from '@/components/ReviewGovernancePanel.vue'
const route = useRoute()
const slug = computed(() => String(route.params.slug))
const tab = ref<'directory' | 'review'>('directory')
</script>
<style scoped>
.governance-page { max-width: 1100px; margin: auto; padding: 32px 24px; }
.tabs { display: flex; gap: 16px; margin: 24px 0; }
button { padding: 12px 18px; cursor: pointer; }
</style>
