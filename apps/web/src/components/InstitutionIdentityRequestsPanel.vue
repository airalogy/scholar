<template>
  <section class="identity-review-panel">
    <header><h2>{{ $t('identity.queueTitle') }}</h2><a-button :disabled="saving" :loading="loading" @click="loadList">{{ $t('common.refresh') }}</a-button></header>
    <label for="identity-request-filter">{{ $t('identity.filterStatus') }}</label>
    <select id="identity-request-filter" v-model="filter" :disabled="saving" @change="resetList">
      <option value="">{{ $t('common.all') }}</option>
      <option v-for="status in statuses" :key="status" :value="status">{{ $t(`identity.status.${status}`) }}</option>
    </select>
    <p v-if="errorKey" role="alert">{{ $t(errorKey) }}</p>
    <p v-if="!loading && !items.length">{{ $t('identity.noRequests') }}</p>
    <ul class="identity-request-list">
      <li v-for="item in items" :key="item.id">
        <button type="button" :aria-pressed="detail?.request.id === item.id" :disabled="saving" @click="selectRequest(item.id)">
          <span><strong>{{ item.name }}</strong> · {{ item.internalId }}</span>
          <small>{{ $t(`identity.status.${item.status}`) }} · {{ new Date(item.createdAt).toLocaleString(locale) }}</small>
        </button>
      </li>
    </ul>
    <a-pagination v-if="total > 20" :total="total" :current="page" :page-size="20" simple :disabled="saving" @change="changePage" />
    <div v-if="detail" class="identity-review-detail">
      <h3>{{ $t('identity.reviewTitle') }} · {{ detail.request.internalId }}</h3>
      <dl>
        <dt>{{ $t('identity.ssoName') }}</dt><dd>{{ detail.request.name }}</dd>
        <dt>{{ $t('identity.ssoEmail') }}</dt><dd>{{ detail.request.email }}</dd>
        <dt>{{ $t('identity.previousId') }}</dt><dd>{{ detail.request.previousInternalId }}</dd>
        <dt>{{ $t('identity.explanation') }}</dt><dd>{{ detail.request.explanation }}</dd>
      </dl>
      <template v-if="isOpen">
        <h4>{{ $t('identity.chooseVerifiedPerson') }}</h4>
        <p>{{ $t('identity.adminHint') }}</p>
        <IdentityPersonPicker :slug="slug" :selected-id="target?.id" :disabled="saving" require-account @select="target = $event" />
        <p v-if="target" class="selected-person">{{ $t('identity.selectedTarget') }}：{{ target.name }} · {{ target.internalId }}</p>
        <label for="identity-review-notes">{{ $t('identity.verificationNotes') }}</label>
        <a-textarea v-model="notes" :textarea-attrs="{ id: 'identity-review-notes' }" :max-length="2000" :disabled="saving" :auto-size="{ minRows: 2, maxRows: 6 }" />
        <a-checkbox v-model="confirmed" :disabled="saving">{{ $t('identity.adminConfirmed') }}</a-checkbox>
        <label for="identity-applicant-message">{{ $t('identity.applicantMessage') }}</label>
        <a-textarea v-model="message" :textarea-attrs="{ id: 'identity-applicant-message' }" :max-length="1000" :disabled="saving" :auto-size="{ minRows: 2, maxRows: 5 }" />
        <div class="review-actions">
          <a-popconfirm :content="$t('identity.approveConfirm')" @ok="decide('approve')">
            <a-button type="primary" :disabled="!canApprove" :loading="saving">{{ $t('identity.approve') }}</a-button>
          </a-popconfirm>
          <a-button :disabled="!canRespond" @click="decide('request_information')">{{ $t('identity.requestInformation') }}</a-button>
          <a-popconfirm :content="$t('identity.rejectConfirm')" @ok="decide('reject')">
            <a-button status="danger" :disabled="!canRespond">{{ $t('identity.reject') }}</a-button>
          </a-popconfirm>
        </div>
      </template>
      <IdentityAuditLog :events="detail.events" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { decideIdentityRequest, getIdentityRequest, identityErrorKey, listIdentityRequests, type AdminIdentityRequest, type IdentityPerson, type IdentityRequestDetail, type IdentityStatus } from '@/api/identity'
import IdentityAuditLog from './IdentityAuditLog.vue'
import IdentityPersonPicker from './IdentityPersonPicker.vue'
const props = defineProps<{ slug: string }>()
const { locale } = useI18n()
const statuses: IdentityStatus[] = ['pending', 'needs_information', 'approved', 'rejected']
const filter = ref<IdentityStatus | ''>('pending')
const items = ref<AdminIdentityRequest[]>([])
const total = ref(0)
const page = ref(1)
const detail = ref<IdentityRequestDetail | null>(null)
const target = ref<IdentityPerson | null>(null)
const notes = ref('')
const message = ref('')
const confirmed = ref(false)
const errorKey = ref('')
const loading = ref(false)
const saving = ref(false)
let controller = new AbortController()
let detailController: AbortController | undefined
let listController: AbortController | undefined
const isOpen = computed(() => detail.value && ['pending', 'needs_information'].includes(detail.value.request.status))
const canApprove = computed(() => isOpen.value && !saving.value && Boolean(notes.value.trim()) && confirmed.value && Boolean(target.value?.userId))
const canRespond = computed(() => isOpen.value && !saving.value && Boolean(notes.value.trim()) && Boolean(message.value.trim()))

const loadList = async (): Promise<void> => {
  listController?.abort()
  const request = new AbortController()
  listController = request
  loading.value = true
  try {
    const result = await listIdentityRequests(props.slug, filter.value || undefined, (page.value - 1) * 20, request.signal)
    if (request.signal.aborted) return
    items.value = result.items; total.value = result.total
  } catch (error) { if (!request.signal.aborted) errorKey.value = identityErrorKey(error) } finally { if (!request.signal.aborted) loading.value = false }
}
const selectRequest = async (id: string): Promise<void> => {
  if (saving.value) return
  detailController?.abort()
  const request = new AbortController()
  detailController = request
  detail.value = null; target.value = null; notes.value = ''; message.value = ''; confirmed.value = false; errorKey.value = ''
  try {
    const result = await getIdentityRequest(props.slug, id, request.signal)
    if (!request.signal.aborted) detail.value = result
  } catch (error) { if (!request.signal.aborted) errorKey.value = identityErrorKey(error) }
}
const decide = async (action: 'approve' | 'reject' | 'request_information'): Promise<void> => {
  if (!detail.value || (action === 'approve' ? !canApprove.value : !canRespond.value)) return
  const id = detail.value.request.id
  const request = controller
  saving.value = true; errorKey.value = ''
  try {
    await decideIdentityRequest(props.slug, id, { action, personId: action === 'approve' ? target.value?.id : undefined, notes: notes.value.trim(), applicantMessage: message.value.trim() || undefined }, request.signal)
    if (request.signal.aborted) return
    detail.value = await getIdentityRequest(props.slug, id, request.signal)
    target.value = null; notes.value = ''; message.value = ''; confirmed.value = false
    await loadList()
  } catch (error) { if (!request.signal.aborted) errorKey.value = identityErrorKey(error) } finally { if (!request.signal.aborted) saving.value = false }
}
const resetList = (): void => { page.value = 1; void loadList() }
const changePage = (value: number): void => { if (!saving.value) { page.value = value; void loadList() } }
watch(() => props.slug, () => { controller.abort(); controller = new AbortController(); detailController?.abort(); detail.value = null; saving.value = false; resetList() }, { immediate: true })
onUnmounted(() => { controller.abort(); detailController?.abort(); listController?.abort() })
</script>

<style scoped>
.identity-review-panel { padding: 24px; margin-bottom: 24px; border: 1px solid var(--color-border-2); border-radius: 12px; background: var(--color-bg-2); }
.identity-review-panel header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.identity-review-panel h2 { margin: 0; font-size: 18px; }
.identity-review-panel select { margin-left: 12px; min-height: 36px; border: 1px solid var(--color-border-2); padding: 4px 12px; border-radius: 6px; background: var(--color-bg-2); color: var(--color-text-1); }
.identity-request-list { list-style: none; padding: 0; display: grid; gap: 8px; }
.identity-request-list button { display: grid; gap: 8px; padding: 12px; width: 100%; text-align: left; border: 1px solid var(--color-border-2); border-radius: 8px; background: var(--color-bg-2); color: var(--color-text-1); cursor: pointer; overflow-wrap: anywhere; }
.identity-request-list button[aria-pressed="true"] { border-color: rgb(var(--primary-6)); }
.identity-request-list small { color: var(--color-text-3); }
.identity-review-detail { display: grid; gap: 12px; border-top: 1px solid var(--color-border-2); padding-top: 20px; margin-top: 20px; }
.identity-review-detail h3, .identity-review-detail h4 { margin: 0; }
.identity-review-detail dd { margin: 4px 0 16px; white-space: pre-wrap; overflow-wrap: anywhere; }
.identity-review-detail p { line-height: 1.6; }
.selected-person { padding: 12px; background: var(--color-primary-light-1); overflow-wrap: anywhere; }
.review-actions { display: flex; gap: 12px; flex-wrap: wrap; }
@media (max-width: 640px) { .identity-review-panel { padding: 16px; } }
</style>
