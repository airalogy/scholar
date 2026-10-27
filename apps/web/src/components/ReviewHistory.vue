<template>
  <p v-if="!events.length">{{ t('reviewProgress.noHistory') }}</p>
  <a-timeline v-else>
    <a-timeline-item v-for="event in events" :key="event.id" :label="date(event.createdAt)">
      <strong>{{ action(event.action) }}</strong>
      <p>{{ event.actorName || t('reviewProgress.unknownName') }}<template v-if="event.stageName"> · {{ event.stageName }}</template></p>
      <p v-if="event.assigneeName">{{ t('reviewProgress.designated') }}: {{ event.assigneeName }}</p>
      <p v-if="event.notes" class="history-note">{{ event.notes }}</p>
    </a-timeline-item>
  </a-timeline>
</template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { ProgressEvent } from '@/api/review-progress'
defineProps<{ events: ProgressEvent[] }>()
const { t, te, locale } = useI18n()
const action = (key: string): string => key === 'review_participants_verified' ? t('reviewProgress.participantsVerified') : te(`reviewProgress.actions.${key}`) ? t(`reviewProgress.actions.${key}`) : t('reviewProgress.actions.recorded')
const date = (value: string): string => new Date(value).toLocaleString(locale.value)
</script>
<style scoped>
.history-note { white-space: pre-wrap; overflow-wrap: anywhere; color: var(--color-text-2); }
p { margin: 6px 0; }
</style>
