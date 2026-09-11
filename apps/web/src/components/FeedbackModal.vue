<template>
  <a-modal
    v-model:visible="visible"
    :footer="false"
    :closable="false"
    :hide-title="true"
    :mask-closable="false"
    :on-before-cancel="canClose"
    :unmount-on-close="true"
    :width="480"
    :modal-style="{ maxWidth: 'calc(100vw - 32px)' }"
    @open="focusTitle"
    @close="restoreFocus"
  >
    <section
      ref="dialogContent"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      class="feedback-dialog"
      @keydown.tab="handleTab"
    >
      <div class="feedback-header">
        <h2 :id="titleId" class="feedback-title">{{ $t('feedback.panelTitle') }}</h2>
        <button
          class="feedback-close"
          type="button"
          :aria-label="$t('feedback.close')"
          :disabled="isSubmitting"
          @click="visible = false"
        >
          <IconClose aria-hidden="true" />
        </button>
      </div>

      <a-form :model="formState" :disabled="isSubmitting" layout="vertical" class="feedback-form">
        <a-form-item field="title" :label="$t('feedback.titleLabel')">
          <a-input v-model="formState.title" :max-length="200" :placeholder="$t('feedback.titlePlaceholder')" allow-clear />
        </a-form-item>

        <a-form-item field="type" :label="$t('feedback.typeLabel')">
          <a-select v-model="formState.type" :popup-container="dialogContent">
            <a-option value="bug_report">{{ $t('feedback.types.bugReport') }}</a-option>
            <a-option value="feature_request">{{ $t('feedback.types.featureRequest') }}</a-option>
          </a-select>
        </a-form-item>

        <a-form-item v-if="!isLoggedIn" field="email" :label="$t('feedback.emailLabel')">
          <a-input
            v-model="formState.email"
            :max-length="100"
            :placeholder="$t('feedback.emailPlaceholder')"
            autocomplete="email"
            allow-clear
          />
        </a-form-item>

        <a-form-item field="content" :label="$t('feedback.contentLabel')">
          <a-textarea
            v-model="formState.content"
            :max-length="5000"
            :auto-size="{ minRows: 4, maxRows: 8 }"
            :placeholder="$t('feedback.contentPlaceholder')"
            allow-clear
          />
        </a-form-item>

        <a-button type="primary" long :loading="isSubmitting" :disabled="isSubmitting" @click="handleSubmit">
          {{ isSubmitting ? $t('feedback.submitting') : $t('feedback.submit') }}
        </a-button>
      </a-form>
    </section>
  </a-modal>
</template>

<script setup lang="ts">
import { reactive, ref, useId, watch } from 'vue'
import { Message } from '@arco-design/web-vue'
import { IconClose } from '@arco-design/web-vue/es/icon'
import { useI18n } from 'vue-i18n'
import { submitFeedback, type FeedbackType } from '@/api/feedback'
import { useAuth } from '@/composables/useAuth'

interface FeedbackFormState {
  title: string
  type: FeedbackType
  email: string
  content: string
}

const props = defineProps<{ returnFocusTo?: HTMLElement | null }>()
const visible = defineModel<boolean>('visible', { default: false })
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const { t } = useI18n()
const { isLoggedIn } = useAuth()
const titleId = useId()
const dialogContent = ref<HTMLElement>()
const isSubmitting = ref(false)
const formState = reactive<FeedbackFormState>({ title: '', type: 'bug_report', email: '', content: '' })

const canClose = (): boolean => !isSubmitting.value
const focusTitle = (): void => {
  dialogContent.value?.querySelector('input')?.focus()
}
const restoreFocus = (): void => {
  if (props.returnFocusTo?.isConnected) props.returnFocusTo.focus()
}
const handleTab = (event: KeyboardEvent): void => {
  const elements = dialogContent.value?.querySelectorAll<HTMLElement>(
    'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
  )
  const focusable = [...(elements ?? [])].filter((element) => (
    element.tabIndex >= 0 && !element.closest('[aria-hidden="true"], [hidden]')
  ))
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && event.target === first) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && event.target === last) {
    event.preventDefault()
    first?.focus()
  }
}

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { message?: unknown } } }).response
    if (typeof response?.data?.message === 'string') return response.data.message
  }
  return fallback
}

const handleSubmit = async (): Promise<void> => {
  if (isSubmitting.value) return
  const title = formState.title.trim()
  const content = formState.content.trim()
  const email = formState.email.trim()
  if (!title) {
    Message.warning(t('feedback.titleRequired'))
    return
  }
  if (!content) {
    Message.warning(t('feedback.contentRequired'))
    return
  }
  if (!isLoggedIn.value && !email) {
    Message.warning(t('feedback.emailRequired'))
    return
  }
  if (email && !EMAIL_PATTERN.test(email)) {
    Message.warning(t('feedback.emailInvalid'))
    return
  }

  isSubmitting.value = true
  try {
    await submitFeedback({ title, type: formState.type, content, email: isLoggedIn.value ? undefined : email })
    Message.success(t('feedback.submitSuccess'))
    Object.assign(formState, { title: '', type: 'bug_report', email: '', content: '' })
    visible.value = false
  } catch (error) {
    Message.error(getErrorMessage(error, t('feedback.submitFailed')))
  } finally {
    isSubmitting.value = false
  }
}

watch(isLoggedIn, (loggedIn) => {
  if (loggedIn) formState.email = ''
})
</script>

<style lang="sass" scoped>
.feedback-dialog
  max-height: calc(100dvh - 120px)
  overflow-y: auto

.feedback-header
  display: flex
  align-items: center
  justify-content: space-between
  gap: 12px
  margin-bottom: 20px

.feedback-title
  margin: 0
  font-size: 18px
  font-weight: 600
  color: var(--scholar-text-1)

.feedback-close
  display: inline-flex
  align-items: center
  justify-content: center
  width: 36px
  height: 36px
  flex-shrink: 0
  border: none
  border-radius: var(--scholar-radius-md)
  background: none
  color: var(--scholar-text-2)
  cursor: pointer

.feedback-close:hover:not(:disabled)
  background: var(--scholar-primary-light)

.feedback-close:focus-visible
  outline: 2px solid var(--scholar-primary)
  outline-offset: -2px

.feedback-form
  :deep(.arco-form-item)
    margin-bottom: 16px
</style>
