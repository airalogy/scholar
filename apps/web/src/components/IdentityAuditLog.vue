<template>
  <details class="identity-audit">
    <summary>{{ $t('identity.auditTitle') }}</summary>
    <ol v-if="events.length">
      <li v-for="event in events" :key="event.id">
        <strong>{{ $t(`identity.events.${event.action}`) }}</strong>
        <time>{{ new Date(event.createdAt).toLocaleString(locale) }}</time>
        <span>{{ event.actorUserId ? `${$t('identity.operator')} ${event.actorUserId}` : $t('identity.applicant') }}</span>
        <p>{{ event.notes }}</p>
      </li>
    </ol>
    <p v-else>{{ $t('identity.noAudit') }}</p>
  </details>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { IdentityEvent } from '@/api/identity'
defineProps<{ events: IdentityEvent[] }>()
const { locale } = useI18n()
</script>

<style scoped>
.identity-audit { margin-top: 20px; text-align: left; }
.identity-audit summary { cursor: pointer; }
.identity-audit li { padding: 12px 0; overflow-wrap: anywhere; }
.identity-audit time, .identity-audit span { display: block; color: var(--color-text-3); font-size: 12px; margin-top: 4px; }
.identity-audit p { white-space: pre-wrap; }
</style>
