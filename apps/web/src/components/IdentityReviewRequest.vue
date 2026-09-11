<template>
  <div class="identity-request" aria-live="polite">
    <p v-if="loading">{{ $t('common.loading') }}</p>
    <p v-if="errorKey" class="request-error" role="alert">{{ $t(errorKey) }}</p>
    <template v-if="!expired && data">
      <p class="verified-id">{{ $t('identity.currentId') }}：{{ data.internalId }}</p>
      <div v-if="data.request" class="request-status">
        <strong>{{ $t(`identity.status.${data.request.status}`) }}</strong>
        <p v-if="data.request.applicantMessage" class="applicant-message">
          {{ data.request.applicantMessage }}
        </p>
        <p v-if="data.request.status === 'pending'">{{ $t('identity.pendingHint') }}</p>
        <p v-if="data.request.status === 'approved'">{{ $t('identity.approvedHint') }}</p>
      </div>
      <a-button v-if="canOpen && !showForm" type="primary" @click="showForm = true">{{
        $t('identity.apply')
      }}</a-button>
      <form v-if="showForm && canOpen" class="identity-request-form" @submit.prevent="submit">
        <label for="identity-previous-id">{{ $t('identity.previousId') }}</label>
        <a-input
          v-model="previousId"
          :input-attrs="{ id: 'identity-previous-id', autocomplete: 'off' }"
          :max-length="100"
          :disabled="saving"
        />
        <label for="identity-explanation">{{ $t('identity.explanation') }}</label>
        <a-textarea
          v-model="explanation"
          :textarea-attrs="{ id: 'identity-explanation' }"
          :max-length="2000"
          :disabled="saving"
          :auto-size="{ minRows: 3, maxRows: 8 }"
          :placeholder="$t('identity.explanationPlaceholder')"
        />
        <a-checkbox v-model="confirmed" :disabled="saving">{{
          $t('identity.ownAccount')
        }}</a-checkbox>
        <p class="privacy-note">{{ $t('identity.noSensitiveDocuments') }}</p>
        <a-button html-type="submit" type="primary" :disabled="!canSubmit" :loading="saving">{{
          $t('identity.submit')
        }}</a-button>
      </form>
      <a-button v-if="data.request?.status === 'pending'" :loading="loading" @click="refresh">{{
        $t('common.refresh')
      }}</a-button>
    </template>
    <a-button
      v-if="expired || data?.request?.status === 'approved'"
      type="primary"
      @click="$emit('reauthenticate')"
      >{{ $t('identity.signInAgain') }}</a-button
    >
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ApiError } from '@/api/client'
import {
  getApplicantIdentityStatus,
  identityErrorKey,
  submitApplicantIdentityRequest,
  type ApplicantIdentityData,
} from '@/api/identity'

const props = defineProps<{ proofToken: string; expiresAt: string }>()
defineEmits<{ reauthenticate: [] }>()
const data = ref<ApplicantIdentityData | null>(null)
const loading = ref(false)
const saving = ref(false)
const expired = ref(false)
const errorKey = ref('')
const showForm = ref(false)
const previousId = ref('')
const explanation = ref('')
const confirmed = ref(false)
const controller = new AbortController()
let poll: ReturnType<typeof setTimeout> | undefined
let expiry: ReturnType<typeof setTimeout> | undefined
const canOpen = computed(
  () =>
    !data.value?.request || ['needs_information', 'rejected'].includes(data.value.request.status),
)
const canSubmit = computed(
  () =>
    !saving.value &&
    !expired.value &&
    confirmed.value &&
    Boolean(previousId.value.trim()) &&
    Boolean(explanation.value.trim()),
)

const handleError = (error: unknown): void => {
  if (controller.signal.aborted) return
  errorKey.value = identityErrorKey(error)
  if (error instanceof ApiError && error.response.status === 401) expired.value = true
}
const refresh = async (): Promise<void> => {
  if (loading.value || saving.value || expired.value) return
  clearTimeout(poll)
  loading.value = true
  try {
    const result = await getApplicantIdentityStatus(props.proofToken, controller.signal)
    if (controller.signal.aborted || expired.value) return
    data.value = result
    errorKey.value = ''
    if (data.value.request?.status === 'needs_information' && !showForm.value) {
      previousId.value = data.value.request.previousInternalId
      explanation.value = data.value.request.explanation
      showForm.value = true
    }
  } catch (error) {
    handleError(error)
  } finally {
    loading.value = false
    if (!controller.signal.aborted && !expired.value && data.value?.request?.status === 'pending')
      poll = setTimeout(() => {
        void refresh()
      }, 10000)
  }
}
const submit = async (): Promise<void> => {
  if (!canSubmit.value) return
  saving.value = true
  clearTimeout(poll)
  try {
    const result = await submitApplicantIdentityRequest(
      {
        proofToken: props.proofToken,
        previousInternalId: previousId.value.trim(),
        explanation: explanation.value.trim(),
        confirmsOwnAccount: true,
      },
      controller.signal,
    )
    if (controller.signal.aborted || expired.value) return
    data.value = result
    showForm.value = false
    confirmed.value = false
    errorKey.value = ''
    poll = setTimeout(() => {
      void refresh()
    }, 10000)
  } catch (error) {
    handleError(error)
  } finally {
    saving.value = false
  }
}
onMounted(() => {
  const remaining = Date.parse(props.expiresAt) - Date.now()
  if (!Number.isFinite(remaining) || remaining <= 0) {
    expired.value = true
    errorKey.value = 'identity.expired'
    return
  }
  expiry = setTimeout(() => {
    expired.value = true
    errorKey.value = 'identity.expired'
    clearTimeout(poll)
  }, remaining)
  void refresh()
})
onUnmounted(() => {
  controller.abort()
  clearTimeout(poll)
  clearTimeout(expiry)
})
</script>

<style scoped>
.identity-request {
  display: grid;
  gap: 16px;
  margin-top: 24px;
  text-align: left;
}
.identity-request-form {
  display: grid;
  gap: 12px;
}
.identity-request-form label {
  font-weight: 600;
}
.request-status {
  padding: 16px;
  border-radius: 8px;
  background: var(--color-fill-1);
}
.verified-id,
.applicant-message {
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.privacy-note {
  color: var(--color-text-3);
  font-size: 13px;
  line-height: 1.6;
}
.request-error {
  color: var(--color-danger-light-4, #b42318);
}
</style>
