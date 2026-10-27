<template>
  <details v-if="context && (context.canPropose || context.canClaim)" class="change-request">
    <summary>{{ $t('governance.proposeChange') }}</summary>
    <p>{{ $t('governance.proposalNotice') }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="submitted" role="status">{{ $t('governance.proposalSubmitted') }} <router-link to="/reviews">{{ $t('governance.applications') }}</router-link></p>
    <form v-else @submit.prevent="submit">
      <label>{{ $t('governance.changeKind') }}<select v-model="kind">
        <option v-if="context.canPropose" value="metadata">{{ $t('governance.changeKinds.metadata') }}</option>
        <option v-if="context.canClaim" value="attribution">{{ $t('governance.changeKinds.attribution') }}</option>
        <option v-if="context.canPropose" value="access">{{ $t('governance.changeKinds.access') }}</option>
        <option v-if="context.canPropose" value="institutional_withdrawal">{{ $t('governance.changeKinds.institutional_withdrawal') }}</option>
      </select></label>
      <template v-if="kind === 'metadata'">
        <label>{{ $t('governance.fields.title') }}<input v-model="title" required maxlength="500"></label>
        <label>{{ $t('governance.fields.abstract') }}<textarea v-model="abstract" maxlength="100000" rows="5" /></label>
      </template>
      <template v-if="kind === 'attribution'">
        <label>{{ $t('governance.bylineAuthor') }}<select v-model="authorId" required><option v-for="author in context.authors" :key="author.id" :value="author.id">{{ author.name }}</option></select></label>
        <label><input v-model="unbind" type="checkbox">{{ $t('governance.removeOwnBinding') }}</label>
      </template>
      <label v-if="kind === 'access'"><input v-model="restricted" type="checkbox">{{ $t('governance.restrictFullText') }}</label>
      <label v-if="kind === 'institutional_withdrawal'"><input v-model="withdrawn" type="checkbox">{{ $t('governance.withdrawInstitution') }}</label>
      <label>{{ $t('governance.reason') }}<textarea v-model="notes" required maxlength="2000" rows="3" /></label>
      <button :disabled="busy">{{ $t('governance.submitProposal') }}</button>
    </form>
  </details>
</template>
<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { apiClient } from '@/api/client'
import { useAuth } from '@/composables/useAuth'
interface Context { ownPersonId: string | null; canPropose: boolean; canClaim: boolean; title: string; abstract: string; authors: Array<{ id: string; name: string }> }
const props = defineProps<{ subjectType: 'paper' | 'degree_thesis'; subjectId: string }>()
const { isLoggedIn } = useAuth()
const { t } = useI18n()
const context = ref<Context | null>(null)
const kind = ref('metadata')
const title = ref('')
const abstract = ref('')
const notes = ref('')
const authorId = ref('')
const unbind = ref(false)
const restricted = ref(true)
const withdrawn = ref(true)
const busy = ref(false)
const submitted = ref(false)
const error = ref('')
let controller: AbortController | undefined
let requestKey = crypto.randomUUID()
let requestBody = ''
watch(() => [props.subjectType, props.subjectId, isLoggedIn.value], async () => {
  controller?.abort(); const current = new AbortController(); controller = current; context.value = null; submitted.value = false
  if (!isLoggedIn.value) return
  try {
    const result = await apiClient.get<{ data: Context }>(`/v1/reviews/subjects/${props.subjectType}/${encodeURIComponent(props.subjectId)}`, { signal: current.signal })
    if (current.signal.aborted) return
    context.value = result.data.data; title.value = context.value.title; abstract.value = context.value.abstract; kind.value = context.value.canPropose ? 'metadata' : 'attribution'
  } catch { /* Disabled workflows and non-participants have no proposal entry. */ }
}, { immediate: true })
const submit = async (): Promise<void> => {
  if (busy.value || !context.value) return
  const change = kind.value === 'metadata' ? { kind: 'metadata', title: title.value, abstract: abstract.value || null } : kind.value === 'attribution' ? { kind: 'attribution', authorId: authorId.value, personId: context.value.ownPersonId, action: unbind.value ? 'unbind' : 'bind' } : kind.value === 'access' ? { kind: 'access', restricted: restricted.value } : { kind: 'institutional_withdrawal', withdrawn: withdrawn.value }
  const body = { subjectType: props.subjectType, subjectId: props.subjectId, change, notes: notes.value }
  const serialized = JSON.stringify(body)
  if (serialized !== requestBody) { requestKey = crypto.randomUUID(); requestBody = serialized }
  busy.value = true; error.value = ''
  try { await apiClient.post('/v1/reviews/changes', body, { signal: controller?.signal, headers: { 'Idempotency-Key': requestKey } }); submitted.value = true }
  catch (cause) { if (!controller?.signal.aborted) error.value = cause instanceof Error ? cause.message : t('governance.failed') }
  finally { busy.value = false }
}
onUnmounted(() => controller?.abort())
</script>
<style scoped>
.change-request { margin: 24px 0; padding: 16px; border: 1px solid var(--color-border-2, #ddd); border-radius: 8px; }
summary { cursor: pointer; } form { display: grid; gap: 14px; } label { display: grid; gap: 8px; }
input:not([type='checkbox']), textarea, select { width: 100%; box-sizing: border-box; padding: 8px; }
button { width: fit-content; padding: 8px 16px; }
</style>
