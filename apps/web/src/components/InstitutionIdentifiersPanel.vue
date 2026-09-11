<template>
  <section class="identity-panel">
    <h2>{{ $t('identity.manageTitle') }}</h2>
    <p>{{ $t('identity.adminHint') }}</p>
    <IdentityPersonPicker :slug="slug" :selected-id="selected?.id" :disabled="saving" @select="selectPerson" />
    <p v-if="errorKey" role="alert">{{ $t(errorKey) }}</p>
    <p v-if="loading">{{ $t('common.loading') }}</p>
    <div v-if="detail && selected" class="person-detail">
      <h3>{{ selected.name }} · {{ selected.internalId }}</h3>
      <p>{{ $t('identity.canonicalHint') }}</p>
      <label for="identity-admin-notes">{{ $t('identity.verificationNotes') }}</label>
      <a-textarea v-model="notes" :textarea-attrs="{ id: 'identity-admin-notes' }" :disabled="saving" :max-length="2000" :auto-size="{ minRows: 2, maxRows: 6 }" />
      <a-checkbox v-model="confirmed" :disabled="saving">{{ $t('identity.adminConfirmed') }}</a-checkbox>
      <ul class="identifier-list">
        <li v-for="identifier in detail.identifiers" :key="identifier.id">
          <div><strong>{{ identifier.value }}</strong> <span v-if="identifier.isPrimary">{{ $t('identity.primary') }}</span><small>{{ identifier.revokedAt ? $t('identity.revoked') : $t('identity.active') }}</small></div>
          <a-popconfirm v-if="!identifier.revokedAt" :content="$t('identity.revokeConfirm')" @ok="revoke(identifier.id)">
            <a-button status="danger" size="small" :disabled="!canChange">{{ $t('identity.revoke') }}</a-button>
          </a-popconfirm>
          <a-button v-else size="small" :disabled="!canChange" @click="add(identifier.value)">{{ $t('identity.restore') }}</a-button>
        </li>
      </ul>
      <form class="add-identifier" @submit.prevent="add(value)">
        <label for="identity-add-value">{{ $t('identity.addId') }}</label>
        <a-input v-model="value" :input-attrs="{ id: 'identity-add-value', autocomplete: 'off' }" :disabled="saving" :max-length="100" />
        <a-button html-type="submit" type="primary" :disabled="!canChange || !value.trim()" :loading="saving">{{ $t('identity.addVerified') }}</a-button>
      </form>
      <IdentityAuditLog :events="detail.events" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import IdentityPersonPicker from './IdentityPersonPicker.vue'
import IdentityAuditLog from './IdentityAuditLog.vue'
import { addIdentityIdentifier, getIdentityPerson, identityErrorKey, revokeIdentityIdentifier, type IdentityPerson, type IdentityPersonDetail } from '@/api/identity'
const props = defineProps<{ slug: string }>()
const selected = ref<IdentityPerson | null>(null)
const detail = ref<IdentityPersonDetail | null>(null)
const notes = ref('')
const value = ref('')
const confirmed = ref(false)
const saving = ref(false)
const loading = ref(false)
const errorKey = ref('')
let controller = new AbortController()
const canChange = computed(() => !saving.value && !loading.value && Boolean(notes.value.trim()) && confirmed.value)
const load = async (): Promise<void> => {
  if (!selected.value) return
  const request = controller
  const id = selected.value.id
  loading.value = true
  try {
    const result = await getIdentityPerson(props.slug, id, request.signal)
    if (!request.signal.aborted && selected.value.id === id) detail.value = result
  } catch (error) { if (!request.signal.aborted) errorKey.value = identityErrorKey(error) } finally { if (!request.signal.aborted) loading.value = false }
}
const selectPerson = (person: IdentityPerson): void => {
  if (saving.value) return
  controller.abort(); controller = new AbortController()
  selected.value = person; detail.value = null; notes.value = ''; value.value = ''; confirmed.value = false; errorKey.value = ''
  void load()
}
const mutate = async (operation: (signal: AbortSignal) => Promise<void>): Promise<void> => {
  if (!canChange.value || !selected.value) return
  saving.value = true
  errorKey.value = ''
  const request = controller
  try {
    await operation(request.signal)
    if (request.signal.aborted) return
    notes.value = ''; value.value = ''; confirmed.value = false
    await load()
  } catch (error) { if (!request.signal.aborted) errorKey.value = identityErrorKey(error) } finally { if (!request.signal.aborted) saving.value = false }
}
const add = async (identifier: string): Promise<void> => {
  const id = selected.value?.id
  if (!id || !identifier.trim()) return
  await mutate(signal => addIdentityIdentifier(props.slug, id, identifier.trim(), notes.value.trim(), signal))
}
const revoke = async (identifierId: string): Promise<void> => {
  const id = selected.value?.id
  if (!id) return
  await mutate(signal => revokeIdentityIdentifier(props.slug, id, identifierId, notes.value.trim(), signal))
}
watch(() => props.slug, () => { controller.abort(); controller = new AbortController(); selected.value = null; detail.value = null; saving.value = false; loading.value = false })
onUnmounted(() => controller.abort())
</script>

<style scoped>
.identity-panel { padding: 24px; background: var(--color-bg-2); border: 1px solid var(--color-border-2); border-radius: 12px; margin-bottom: 24px; }
.identity-panel h2 { font-size: 18px; margin: 0 0 8px; }
.identity-panel p { color: var(--color-text-2); line-height: 1.6; }
.person-detail { display: grid; gap: 12px; margin-top: 24px; }
.identifier-list { list-style: none; padding: 0; }
.identifier-list li { display: flex; justify-content: space-between; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--color-border-1); }
.identifier-list strong { overflow-wrap: anywhere; }
.identifier-list small { display: block; color: var(--color-text-3); margin-top: 4px; }
.identifier-list span { margin-left: 8px; font-size: 12px; }
.add-identifier { display: grid; gap: 8px; }
</style>
