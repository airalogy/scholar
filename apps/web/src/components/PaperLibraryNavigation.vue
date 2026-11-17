<template>
  <div class="paper-library-navigation">
    <p class="library-label">{{ $t('nav.papers') }}</p>
    <nav v-if="features.degreeTheses" class="library-sections" :aria-label="$t('paperLibrary.navigationLabel')">
      <router-link :to="papersTarget" :class="{ selected: active === 'publications' }" :aria-current="active === 'publications' ? 'page' : undefined">
        {{ $t('paperLibrary.publications') }}
      </router-link>
      <router-link :to="thesesTarget" :class="{ selected: active === 'theses' }" :aria-current="active === 'theses' ? 'page' : undefined">
        {{ $t('paperLibrary.theses') }}
      </router-link>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, type RouteLocationRaw } from 'vue-router'
import { usePublicConfig } from '@/composables/usePublicConfig'

defineProps<{ active: 'publications' | 'theses' }>()
const route = useRoute()
const { features, paperLibrary } = usePublicConfig()
const searchQuery = computed(() => typeof route.query.q === 'string' && route.query.q.trim()
  ? { q: route.query.q.trim() }
  : {})
const papersTarget = computed<RouteLocationRaw>(() => ({ path: paperLibrary.value.defaultPath, query: searchQuery.value }))
const thesesTarget = computed<RouteLocationRaw>(() => ({ path: '/theses', query: searchQuery.value }))
</script>

<style scoped>
.paper-library-navigation { margin-bottom: 24px; }
.library-label { margin: 0 0 12px; color: var(--scholar-text-secondary); font-size: 13px; font-weight: 600; }
.library-sections { display: flex; gap: 8px; padding-bottom: 12px; border-bottom: 1px solid var(--scholar-border-light); }
.library-sections a { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 20px; border-radius: 10px; color: var(--scholar-text-secondary); text-decoration: none; font-weight: 600; }
.library-sections a:hover { background: var(--scholar-primary-light); }
.library-sections a.selected { background: var(--scholar-primary-light); color: var(--scholar-primary); }
.library-sections a:focus-visible { outline: 2px solid var(--scholar-primary); outline-offset: 3px; }
@media (max-width: 640px) { .library-sections a { flex: 1; padding: 0 12px; } }
</style>
