<template>
  <div class="feedback-widget" :class="{ 'feedback-widget--scholars': isScholarsRoute }">
    <transition name="feedback-panel">
      <section v-if="isOpen" class="feedback-panel">
        <div class="feedback-panel-head">
          <h2 class="feedback-panel-title">{{ $t('feedback.panelTitle') }}</h2>
          <button class="feedback-close-btn" type="button" :aria-label="$t('feedback.close')" @click="closePanel">
            <IconClose />
          </button>
        </div>

        <a-form :model="formState" layout="vertical" class="feedback-form">
          <a-form-item field="title" :label="$t('feedback.titleLabel')">
            <a-input
              v-model="formState.title"
              :max-length="200"
              :placeholder="$t('feedback.titlePlaceholder')"
              allow-clear
            />
          </a-form-item>

          <a-form-item field="type" :label="$t('feedback.typeLabel')">
            <a-select v-model="formState.type">
              <a-option value="bug_report">{{ $t('feedback.types.bugReport') }}</a-option>
              <a-option value="feature_request">{{ $t('feedback.types.featureRequest') }}</a-option>
            </a-select>
          </a-form-item>

          <a-form-item v-if="!isLoggedIn" field="email" :label="$t('feedback.emailLabel')">
            <a-input
              v-model="formState.email"
              :max-length="100"
              :placeholder="$t('feedback.emailPlaceholder')"
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

          <a-button
            type="primary"
            long
            :loading="isSubmitting"
            @click="handleSubmit"
          >
            <template #icon>
              <IconSend />
            </template>
            {{ isSubmitting ? $t('feedback.submitting') : $t('feedback.submit') }}
          </a-button>
        </a-form>
      </section>
    </transition>

    <button
      class="feedback-float-btn"
      type="button"
      :aria-label="$t('feedback.open')"
      @click="togglePanel"
    >
      <IconMessage />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import { IconClose, IconMessage, IconSend } from '@arco-design/web-vue/es/icon'
import { useI18n } from 'vue-i18n'
import { submitFeedback, type FeedbackType } from '@/api/feedback'
import { useAuth } from '@/composables/useAuth'

interface FeedbackFormState {
  title: string
  type: FeedbackType
  email: string
  content: string
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const { t } = useI18n()
const route = useRoute()
const { isLoggedIn } = useAuth()
const isOpen = ref(false)
const isSubmitting = ref(false)
const formState = reactive<FeedbackFormState>({
  title: '',
  type: 'bug_report',
  email: '',
  content: '',
})
const isScholarsRoute = computed(() => route.name === 'Scholars')

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { message?: unknown } } }).response
    if (typeof response?.data?.message === 'string') {
      return response.data.message
    }
  }

  return fallback
}

const resetForm = (): void => {
  formState.title = ''
  formState.type = 'bug_report'
  formState.email = ''
  formState.content = ''
}

const togglePanel = (): void => {
  isOpen.value = !isOpen.value
}

const closePanel = (): void => {
  isOpen.value = false
}

const handleSubmit = async (): Promise<void> => {
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
    await submitFeedback({
      title,
      type: formState.type,
      content,
      email: isLoggedIn.value ? undefined : email,
    })
    Message.success(t('feedback.submitSuccess'))
    resetForm()
    closePanel()
  } catch (error) {
    Message.error(getErrorMessage(error, t('feedback.submitFailed')))
  } finally {
    isSubmitting.value = false
  }
}

watch(isLoggedIn, (loggedIn) => {
  if (loggedIn) {
    formState.email = ''
  }
})
</script>

<style lang="sass" scoped>
.feedback-widget
  position: fixed
  right: 24px
  bottom: 24px
  z-index: 130
  display: flex
  flex-direction: column
  align-items: flex-end
  gap: 12px

.feedback-widget--scholars
  bottom: 96px

.feedback-panel
  width: 360px
  max-width: calc(100vw - 32px)
  padding: 18px
  border: 1px solid rgba(15, 47, 87, 0.12)
  border-radius: 8px
  background: #fff
  box-shadow: 0 20px 48px rgba(15, 47, 87, 0.18)

.feedback-panel-head
  display: flex
  align-items: center
  justify-content: space-between
  gap: 12px
  margin-bottom: 14px

.feedback-panel-title
  margin: 0
  font-size: 17px
  font-weight: 700
  color: #1f2937

.feedback-close-btn,
.feedback-float-btn
  display: inline-flex
  align-items: center
  justify-content: center
  border: none
  cursor: pointer

.feedback-close-btn
  width: 30px
  height: 30px
  border-radius: 50%
  background: #f3f6fb
  color: #4a5565

.feedback-float-btn
  width: 48px
  height: 48px
  border-radius: 50%
  background: var(--scholar-primary)
  color: #fff
  box-shadow: 0 12px 30px rgba(0, 73, 143, 0.28)
  font-size: 20px

.feedback-form
  :deep(.arco-form-item)
    margin-bottom: 14px

.feedback-panel-enter-active,
.feedback-panel-leave-active
  transition: opacity 0.16s ease, transform 0.16s ease

.feedback-panel-enter-from,
.feedback-panel-leave-to
  opacity: 0
  transform: translateY(8px)

@media (max-width: 768px)
  .feedback-widget
    right: 16px
    bottom: 16px

  .feedback-widget--scholars
    bottom: 88px

  .feedback-panel
    width: calc(100vw - 32px)
</style>
