<template>
  <section class="administrator-panel">
    <h2>{{ t('administrators.title') }}</h2>
    <p>{{ t('administrators.identityRule') }}</p>
    <p v-if="audit && audit.activeOwners < 2" role="status" class="warning">{{ t('administrators.ownerWarning', { count: audit.activeOwners }) }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="completed" role="status">{{ t('administrators.completed') }}</p>
    <form class="handoff-form" @submit.prevent="previewHandoff">
      <label>{{ t('administrators.departing') }}
        <select v-model="pair.fromUserId" :disabled="busy" required>
          <option value="" disabled>{{ t('administrators.choose') }}</option>
          <option v-for="member in administrators" :key="member.userId" :value="member.userId">{{ member.name }} · {{ member.internalId || member.userId }}</option>
        </select>
      </label>
      <label>{{ t('administrators.successor') }}
        <select v-model="pair.toUserId" :disabled="busy" required>
          <option value="" disabled>{{ t('administrators.choose') }}</option>
          <option v-for="member in successors" :key="member.userId" :value="member.userId">{{ member.name }} · {{ member.internalId || member.userId }}</option>
        </select>
      </label>
      <button :disabled="busy || !pair.fromUserId || !pair.toUserId">{{ t('administrators.preview') }}</button>
    </form>
    <div v-if="preview" class="handoff-preview">
      <h3>{{ preview.from.user.name }} → {{ preview.to.user.name }}</h3>
      <p>{{ t('administrators.checklist', { labs: preview.labs.length, grants: preview.grants.length, tasks: preview.tasks.length, invitations: preview.invitations.length, credentials: preview.credentials.length }) }}</p>
      <p class="warning">{{ t('administrators.taskWarning') }}</p>
      <ul v-if="preview.tasks.length">
        <li v-for="task in preview.tasks" :key="task.id"><router-link :to="`/reviews/cases/${task.step.caseId}`">{{ task.kind }} · {{ task.id }}</router-link></li>
      </ul>
      <form @submit.prevent="complete">
        <label>{{ t('administrators.reason') }}<textarea v-model="reason" required minlength="3" maxlength="1000" :disabled="busy" /></label>
        <label class="acknowledgement"><input v-model="acknowledged" type="checkbox" :disabled="busy">{{ t('administrators.acknowledge') }}</label>
        <button :disabled="busy || !acknowledged || reason.trim().length < 3">{{ t('administrators.confirm') }}</button>
      </form>
    </div>
    <h3>{{ t('administrators.audit') }}</h3>
    <button :disabled="busy" type="button" @click="refresh">{{ t('administrators.refresh') }}</button>
    <div class="audit-list">
      <article v-for="event in audit?.items ?? []" :key="event.id">
        <p>{{ event.createdAt }} · {{ event.actorLabel }} · {{ event.source }}</p>
        <p>{{ event.reason }}</p>
        <details><summary>{{ event.entity }} · {{ event.entityId }}</summary>
          <p>{{ t('administrators.before') }}</p><pre>{{ JSON.stringify(event.before, null, 2) }}</pre>
          <p>{{ t('administrators.after') }}</p><pre>{{ JSON.stringify(event.after, null, 2) }}</pre>
        </details>
      </article>
    </div>
    <p v-if="audit?.items.length === 0">{{ t('administrators.empty') }}</p>
    <nav :aria-label="t('administrators.audit')">
      <button :disabled="busy || offset === 0" @click="page(-50)">{{ t('administrators.previous') }}</button>
      <span>{{ audit?.items.length ? offset + 1 : 0 }}–{{ offset + (audit?.items.length ?? 0) }}</span>
      <button :disabled="busy || audit?.items.length !== 50" @click="page(50)">{{ t('administrators.next') }}</button>
    </nav>
    <p>{{ t('administrators.recovery') }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { InstitutionMembershipItem } from '@/api/institutions'
import { completeAdministratorHandoff, loadAdministratorAudit, previewAdministratorHandoff, type AdministratorAudit, type HandoffPreview } from '@/api/administrators'

const props = defineProps<{ slug: string; memberships: InstitutionMembershipItem[] }>()
const emit = defineEmits<{ completed: [] }>()
const { t } = useI18n()
const controller = new AbortController()
onBeforeUnmount(() => controller.abort())
const pair = reactive({ fromUserId: '', toUserId: '' })
const audit = ref<AdministratorAudit | null>(null)
const preview = ref<HandoffPreview | null>(null)
const reason = ref('')
const acknowledged = ref(false)
const error = ref('')
const completed = ref(false)
const busy = ref(false)
const offset = ref(0)
const administrators = computed(() => props.memberships.filter((member) => member.role !== 'member'))
const successors = computed(() => props.memberships.filter((member) => member.userId !== pair.fromUserId && member.institutionPersonId))
watch(pair, () => { preview.value = null; acknowledged.value = false })
const run = async (operation: () => Promise<void>): Promise<void> => {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try { await operation() } catch (cause) {
    if (!controller.signal.aborted) error.value = cause instanceof Error ? cause.message : t('administrators.failed')
  } finally { busy.value = false }
}
const refresh = async (): Promise<void> => run(async () => {
  audit.value = await loadAdministratorAudit(props.slug, offset.value, controller.signal)
})
const page = async (delta: number): Promise<void> => {
  const nextOffset = Math.max(0, offset.value + delta)
  await run(async () => {
    const result = await loadAdministratorAudit(props.slug, nextOffset, controller.signal)
    audit.value = result
    offset.value = nextOffset
  })
}
const previewHandoff = async (): Promise<void> => run(async () => {
  preview.value = null
  acknowledged.value = false
  completed.value = false
  preview.value = await previewAdministratorHandoff(props.slug, { ...pair }, controller.signal)
})
const complete = async (): Promise<void> => {
  if (!preview.value || !acknowledged.value || reason.value.trim().length < 3) return
  const input = { ...pair, digest: preview.value.digest, reason: reason.value.trim(), acknowledgeOutstanding: acknowledged.value }
  await run(async () => {
    // Discard the preview on any result: a network timeout may already have committed.
    preview.value = null
    await completeAdministratorHandoff(props.slug, input, controller.signal)
    completed.value = true
    emit('completed')
    await refreshAuditAfterHandoff()
  })
}
const refreshAuditAfterHandoff = async (): Promise<void> => {
  offset.value = 0
  audit.value = await loadAdministratorAudit(props.slug, 0, controller.signal)
}
watch(() => props.slug, () => {
  pair.fromUserId = ''
  pair.toUserId = ''
  offset.value = 0
  audit.value = null
  void refresh()
}, { immediate: true })
</script>

<style scoped>
.administrator-panel { margin: 24px 0; padding: 24px; border: 1px solid var(--color-border-2); border-radius: 12px; background: var(--color-bg-2); }
.handoff-form, .handoff-preview form { display: grid; gap: 12px; margin: 16px 0; }
label { display: grid; gap: 6px; }
select, textarea, button { font: inherit; padding: 8px; }
textarea { min-height: 72px; }
button { cursor: pointer; }
button:disabled { cursor: default; opacity: 0.5; }
.acknowledgement { display: flex; align-items: flex-start; }
.warning { color: var(--color-danger-6, #a83d00); }
.handoff-preview, article { padding: 12px; border-bottom: 1px solid var(--color-border-2); }
pre { white-space: pre-wrap; overflow-wrap: anywhere; }
nav { display: flex; gap: 12px; align-items: center; margin-top: 16px; }
</style>
