<template>
  <header class="paper-library-navigation">
    <div class="library-heading">
      <div class="library-identity">
        <h1 v-if="heading">{{ $t('nav.papers') }}</h1>
        <p v-else class="library-label">{{ $t('nav.papers') }}</p>
        <span v-if="context" class="library-context">{{ context }}</span>
      </div>
      <div v-if="$slots.actions" class="library-actions"><slot name="actions" /></div>
    </div>
    <nav v-if="features.degreeTheses" class="library-sections" :aria-label="$t('paperLibrary.navigationLabel')">
      <router-link :to="papersTarget" :class="{ selected: active === 'publications' }" :aria-current="active === 'publications' ? 'page' : undefined">
        {{ $t('paperLibrary.publications') }}
      </router-link>
      <router-link :to="thesesTarget" :class="{ selected: active === 'theses' }" :aria-current="active === 'theses' ? 'page' : undefined">
        {{ $t('paperLibrary.theses') }}
      </router-link>
    </nav>
    <p v-if="heading && hint" class="library-hint">{{ hint }}</p>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, type RouteLocationRaw } from 'vue-router'
import { usePublicConfig } from '@/composables/usePublicConfig'

defineProps<{ active: 'publications' | 'theses', heading?: boolean, context?: string, hint?: string }>()
const route = useRoute()
const { features, paperLibrary } = usePublicConfig()
const searchQuery = computed(() => typeof route.query.q === 'string' && route.query.q.trim()
  ? { q: route.query.q.trim() }
  : {})
const papersTarget = computed<RouteLocationRaw>(() => ({ path: paperLibrary.value.defaultPath, query: searchQuery.value }))
const thesesTarget = computed<RouteLocationRaw>(() => ({ path: '/theses', query: searchQuery.value }))
</script>

<style scoped>
.paper-library-navigation { margin-bottom: 14px; color: var(--scholar-text-1); }
.library-heading, .library-identity, .library-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 12px; min-width: 0; }
.library-heading { justify-content: space-between; }
.library-heading h1 { margin: 0; font-size: clamp(24px, 2vw, 30px); line-height: 1.3; letter-spacing: -.025em; }
.library-context { padding-inline-start: 12px; border-inline-start: 1px solid var(--scholar-border-input); overflow-wrap: anywhere; }
.library-context, .library-label, .library-hint { margin: 0; color: var(--scholar-text-2); font-size: 14px; line-height: 1.5; }
.library-sections { display: flex; gap: 20px; margin-top: 6px; border-bottom: 1px solid var(--scholar-divider); }
.library-sections a { display: inline-flex; align-items: center; min-height: 44px; box-sizing: border-box; padding: 0 2px; border-bottom: 2px solid transparent; color: var(--scholar-text-2); font-weight: 600; text-decoration: none; }
.library-sections a:hover, .library-sections a.selected { color: var(--scholar-primary); }
.library-sections a.selected { border-color: currentColor; }
.library-sections a:focus-visible { outline: 2px solid var(--scholar-primary); outline-offset: 2px; }
.library-hint { margin-top: 8px; }
</style>
