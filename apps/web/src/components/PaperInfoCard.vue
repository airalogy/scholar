<template>
  <article class="library-record">
    <div class="record-heading">
      <h2><router-link :to="to">{{ title }}</router-link></h2>
      <slot name="action" />
    </div>
    <p v-if="subtitle" class="record-subtitle">{{ subtitle }}</p>
    <p v-if="byline.length" class="record-byline">{{ byline.join(' · ') }}</p>
    <p v-if="abstract" class="record-abstract">{{ abstract }}</p>
    <div v-if="details.length || keywords.length" class="record-foot">
      <span v-for="(detail, index) in details" :key="index + ':' + detail">{{ detail }}</span>
      <span v-for="keyword in new Set(keywords)" :key="'keyword:' + keyword" class="record-keyword">{{ keyword }}</span>
    </div>
  </article>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  to: string
  title: string
  subtitle?: string | null
  byline: string[]
  abstract?: string | null
  details: string[]
  keywords: string[]
}>(), { subtitle: '', abstract: '' })
</script>

<style scoped>
.library-record { min-width: 0; padding: 14px 0; border-top: 1px solid var(--scholar-divider); overflow-wrap: anywhere; color: var(--scholar-text-2); }
.record-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.record-heading h2 { min-width: 0; margin: 0; font-size: 18px; font-weight: 650; line-height: 1.4; }
.record-heading a { color: var(--scholar-primary); text-decoration: none; }
.record-heading a:hover, .record-heading a:focus-visible { text-decoration: underline; text-underline-offset: 3px; }
.record-heading a:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
.record-subtitle, .record-byline, .record-abstract { margin: 4px 0 0; font-size: 14px; line-height: 1.5; }
.record-subtitle { color: var(--scholar-text-desc); }
.record-abstract { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.record-foot { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; margin-top: 6px; color: var(--scholar-text-desc); font-size: 12px; line-height: 1.5; }
.record-keyword { max-width: 100%; padding: 1px 6px; background: var(--scholar-bg-sidebar); border-radius: 4px; }
@media (max-width: 640px) { .record-heading h2 { font-size: 17px; } }
</style>
