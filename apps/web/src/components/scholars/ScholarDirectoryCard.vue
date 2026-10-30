<template>
  <article class="directory-card">
    <router-link :to="profilePath" class="profile-link">
      <img
        v-if="avatar && !avatarFailed"
        class="scholar-avatar"
        :src="avatar"
        alt=""
        loading="lazy"
        @error="avatarFailed = true"
      />
      <span v-else class="scholar-avatar avatar-fallback" aria-hidden="true">{{
        scholar.name.charAt(0)
      }}</span>
      <div class="profile-heading">
        <h2>{{ scholar.name }}</h2>
        <p v-if="scholar.title" class="scholar-title">{{ scholar.title }}</p>
      </div>
    </router-link>
    <p class="scholar-units">{{ unitNames || t('scholars.unassigned') }}</p>
    <ul
      v-if="scholar.research.length"
      class="research-tags"
      :aria-label="t('scholars.researchLabel')"
    >
      <li v-for="(topic, index) in scholar.research" :key="`${index}-${topic}`">{{ topic }}</li>
    </ul>
    <p v-else class="scholar-summary">{{ scholar.summary || t('scholars.noResearch') }}</p>
    <router-link
      :to="profilePath"
      class="profile-more"
      :aria-label="t('scholars.viewProfileOf', { name: scholar.name })"
    >
      {{ t('scholars.viewMore') }} <span aria-hidden="true">→</span>
    </router-link>
  </article>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ScholarDirectoryItem } from '@/api/scholars'
import { resolveSafeHttpUrl } from '@/utils/url'

const props = defineProps<{ scholar: ScholarDirectoryItem }>()
const { t } = useI18n()
const avatar = computed(() => resolveSafeHttpUrl(props.scholar.avatar))
const unitNames = computed(() => props.scholar.units.map((unit) => unit.name).join(' · '))
const avatarFailed = ref(false)
watch(avatar, () => {
  avatarFailed.value = false
})
const profilePath = computed(() => `/scholars/${encodeURIComponent(props.scholar.id)}`)
</script>

<style scoped>
.directory-card {
  min-width: 0;
  padding: 24px;
  border: 1px solid var(--scholar-border-light);
  border-radius: 16px;
  background: var(--scholar-bg-white);
  display: flex;
  flex-direction: column;
  gap: 16px;
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}
.directory-card:hover {
  border-color: var(--scholar-primary);
  box-shadow: 0 6px 24px rgb(0 73 143 / 6%);
}
.profile-link {
  display: flex;
  align-items: center;
  gap: 14px;
  color: inherit;
  text-decoration: none;
  border-radius: 6px;
}
.scholar-avatar {
  width: 56px;
  height: 56px;
  flex: 0 0 56px;
  border-radius: 50%;
  object-fit: cover;
}
.avatar-fallback {
  display: grid;
  place-items: center;
  background: var(--scholar-primary-light);
  color: var(--scholar-primary);
  font-size: 24px;
  font-weight: 600;
}
.profile-heading {
  min-width: 0;
}
h2 {
  margin: 0;
  font-size: 19px;
  line-height: 1.4;
  font-weight: 600;
  overflow-wrap: anywhere;
  color: var(--scholar-text-1);
}
.scholar-title {
  margin: 5px 0 0;
  font-size: 13px;
  color: var(--scholar-text-2);
}
.scholar-units,
.scholar-summary {
  margin: 0;
  color: var(--scholar-text-2);
  font-size: 13px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}
.scholar-summary {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
}
.research-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  padding: 0;
  margin: 0;
  list-style: none;
}
.research-tags li {
  max-width: 100%;
  padding: 4px 9px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.5;
  background: var(--scholar-primary-light);
  color: var(--scholar-primary);
  overflow-wrap: anywhere;
}
.profile-more {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 14px;
  margin-top: auto;
  border-top: 1px solid var(--scholar-border-light);
  color: var(--scholar-primary);
  text-decoration: none;
  font-size: 13px;
  min-height: 30px;
}
a:focus-visible {
  outline: 2px solid var(--scholar-primary);
  outline-offset: 4px;
}
@media (prefers-reduced-motion: reduce) {
  .directory-card {
    transition: none;
  }
}
</style>
