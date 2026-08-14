<template>
  <!-- Collapsed: floating button -->
  <button v-if="!open" class="rag-fab" type="button" @click="open = true">
    <span class="rag-fab-icon">✦</span>
    <span class="rag-fab-label">{{ $t('ragChat.fabLabel') }}</span>
  </button>

  <!-- Expanded: draggable chat dialog -->
  <div
    v-else
    class="rag-dialog"
    :style="{ left: pos.x + 'px', top: pos.y + 'px' }"
  >
    <!-- Header / drag handle -->
    <div
      class="rag-dialog-header"
      @mousedown="startDrag"
    >
      <span class="rag-dialog-title">{{ $t('ragChat.dialogTitle') }}</span>
      <button class="rag-dialog-close" type="button" @click="open = false">✕</button>
    </div>

    <!-- Messages -->
    <div ref="messagesEl" class="rag-messages">
      <!-- Welcome -->
      <div v-if="messages.length === 0" class="rag-welcome">
        <div class="rag-welcome-icon">🔬</div>
        <div class="rag-welcome-title">{{ $t('ragChat.welcomeTitle') }}</div>
        <div class="rag-welcome-chips">
          <button
            v-for="s in suggestions"
            :key="s"
            class="rag-chip"
            type="button"
            @click="sendText(s)"
          >{{ s }}</button>
        </div>
      </div>

      <!-- Message list -->
      <template v-else>
        <div
          v-for="(msg, idx) in messages"
          :key="idx"
          class="rag-msg"
          :class="msg.role === 'user' ? 'rag-msg--user' : 'rag-msg--ai'"
        >
          <div v-if="msg.role === 'assistant'" class="rag-avatar rag-avatar--ai">✦</div>
          <div class="rag-bubble" :class="msg.role === 'user' ? 'rag-bubble--user' : 'rag-bubble--ai'">
            <div class="rag-content" v-html="renderSafeMarkdown(msg.content)" />
            <span v-if="msg.streaming" class="rag-cursor" />
          </div>
          <div v-if="msg.role === 'user'" class="rag-avatar rag-avatar--user">{{ $t('ragChat.userShort') }}</div>
        </div>

        <div v-if="showFollowUps" class="rag-followup">
          <div class="rag-followup-label">{{ $t('ragChat.followupLabel') }}</div>
          <button
            v-for="s in followUpList"
            :key="s"
            class="rag-chip"
            type="button"
            @click="sendText(s)"
          >{{ s }}</button>
        </div>
      </template>
    </div>

    <!-- Input -->
    <div class="rag-input-area">
      <textarea
        v-model="inputText"
        class="rag-textarea"
        :placeholder="$t('ragChat.inputPlaceholder')"
        rows="2"
        :disabled="streaming"
        @keydown.enter.exact.prevent="sendMessage"
      />
      <div class="rag-input-footer">
        <span class="rag-hint">{{ $t('ragChat.enterToSend') }}</span>
        <button
          class="rag-send"
          type="button"
          :disabled="!inputText.trim() || streaming"
          @click="sendMessage"
        >
          <span v-if="streaming">{{ $t('ragChat.streaming') }}</span>
          <span v-else>{{ $t('ragChat.send') }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { sendChatStream } from '@/api/chat'
import { renderSafeMarkdown } from '@/utils/markdown'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

const { t, tm } = useI18n()

const open = ref(false)
const pos = ref({ x: window.innerWidth - 420, y: window.innerHeight - 560 })

// ─── Drag ───────────────────────────────────────────────────────────────────
let dragging = false
let dragOffset = { x: 0, y: 0 }

function startDrag(e: MouseEvent) {
  dragging = true
  dragOffset = { x: e.clientX - pos.value.x, y: e.clientY - pos.value.y }
  window.addEventListener('mousemove', onDrag)
  window.addEventListener('mouseup', stopDrag)
}
function onDrag(e: MouseEvent) {
  if (!dragging) return
  pos.value = {
    x: Math.max(0, Math.min(window.innerWidth - 380, e.clientX - dragOffset.x)),
    y: Math.max(0, Math.min(window.innerHeight - 500, e.clientY - dragOffset.y)),
  }
}
function stopDrag() {
  dragging = false
  window.removeEventListener('mousemove', onDrag)
  window.removeEventListener('mouseup', stopDrag)
}
onUnmounted(stopDrag)

// ─── Chat ────────────────────────────────────────────────────────────────────
const messages = ref<ChatMessage[]>([])
const inputText = ref('')
const streaming = ref(false)
const chatId = ref<string>()
const messagesEl = ref<HTMLElement | null>(null)
const sentTexts = ref<Set<string>>(new Set())

const suggestions = computed(() => tm('ragChat.suggestions') as string[])
const followUpPool = computed(() => (tm('ragChat.suggestions') as string[]).slice(4))

const showFollowUps = computed(() => {
  if (messages.value.length === 0) return false
  const last = messages.value[messages.value.length - 1]
  return last.role === 'assistant' && !last.streaming
})

const followUpList = computed(() =>
  followUpPool.value.filter((s) => !sentTexts.value.has(s)).slice(0, 3)
)

async function scrollToBottom() {
  await nextTick()
  if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight
}

function sendText(text: string) {
  inputText.value = text
  sendMessage()
}

async function sendMessage() {
  const text = inputText.value.trim()
  if (!text || streaming.value) return

  sentTexts.value.add(text)
  inputText.value = ''
  messages.value.push({ role: 'user', content: text })
  await scrollToBottom()

  const aiMsg: ChatMessage = { role: 'assistant', content: '', streaming: true }
  messages.value.push(aiMsg)
  streaming.value = true

  try {
    await sendChatStream(
      [{ role: 'user', content: text }],
      chatId.value,
      {
        onId: (id) => {
          chatId.value = id
        },
        onChunk: (content) => {
          aiMsg.content += content
          void scrollToBottom()
        },
        onError: (error) => {
          aiMsg.content = t('ragChat.connectFailed', { error: error.message })
        },
      },
      'scholar_recommendation',
    )
  } catch (e) {
    aiMsg.content = t('ragChat.connectFailed', { error: String(e) })
  } finally {
    aiMsg.streaming = false
    streaming.value = false
    await scrollToBottom()
  }
}
</script>

<style lang="sass" scoped>
// ─── FAB button ───────────────────────────────────────────────────────────────
.rag-fab
  position: fixed
  bottom: 32px
  right: 32px
  z-index: 1000
  display: flex
  align-items: center
  gap: 8px
  height: 48px
  padding: 0 20px
  border-radius: 24px
  border: none
  background: var(--scholar-primary)
  color: #fff
  font-size: 15px
  font-weight: 500
  cursor: pointer
  box-shadow: 0 4px 16px rgba(0, 73, 143, 0.35)
  transition: all 0.2s

.rag-fab:hover
  background: var(--scholar-primary-hover)
  box-shadow: 0 6px 20px rgba(0, 73, 143, 0.45)
  transform: translateY(-1px)

.rag-fab-icon
  font-size: 16px

// ─── Dialog ──────────────────────────────────────────────────────────────────
.rag-dialog
  position: fixed
  z-index: 1000
  width: 380px
  height: 520px
  background: #fff
  border-radius: 16px
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.18)
  display: flex
  flex-direction: column
  overflow: hidden

.rag-dialog-header
  display: flex
  align-items: center
  justify-content: space-between
  padding: 14px 16px
  background: var(--scholar-primary)
  color: #fff
  cursor: grab
  user-select: none
  flex-shrink: 0

.rag-dialog-header:active
  cursor: grabbing

.rag-dialog-title
  font-size: 14px
  font-weight: 600

.rag-dialog-close
  width: 24px
  height: 24px
  border-radius: 50%
  border: none
  background: rgba(255,255,255,0.2)
  color: #fff
  font-size: 12px
  cursor: pointer
  display: flex
  align-items: center
  justify-content: center

.rag-dialog-close:hover
  background: rgba(255,255,255,0.35)

// ─── Messages ─────────────────────────────────────────────────────────────────
.rag-messages
  flex: 1
  overflow-y: auto
  padding: 14px
  display: flex
  flex-direction: column
  gap: 12px

.rag-welcome
  display: flex
  flex-direction: column
  align-items: center
  gap: 10px
  margin-top: 16px
  text-align: center

.rag-welcome-icon
  font-size: 32px

.rag-welcome-title
  font-size: 14px
  font-weight: 600
  color: var(--scholar-text-1)

.rag-welcome-chips
  display: flex
  flex-direction: column
  gap: 6px
  width: 100%
  margin-top: 4px

.rag-chip
  background: #f0f4f8
  border: 1px solid var(--scholar-border-light)
  border-radius: 8px
  padding: 8px 12px
  font-size: 12px
  color: var(--scholar-text-1)
  cursor: pointer
  text-align: left
  line-height: 1.4
  transition: all 0.15s

.rag-chip:hover
  background: var(--scholar-primary-light)
  border-color: var(--scholar-primary)
  color: var(--scholar-primary)

.rag-msg
  display: flex
  align-items: flex-start
  gap: 8px

.rag-msg--user
  flex-direction: row-reverse

.rag-avatar
  width: 26px
  height: 26px
  border-radius: 50%
  display: flex
  align-items: center
  justify-content: center
  font-size: 11px
  font-weight: 600
  flex-shrink: 0

.rag-avatar--ai
  background: var(--scholar-primary)
  color: #fff

.rag-avatar--user
  background: #e8eaed
  color: #62748e

.rag-bubble
  max-width: calc(100% - 70px)
  padding: 8px 12px
  border-radius: 12px
  font-size: 13px
  line-height: 1.6
  word-break: break-word

.rag-bubble--user
  background: var(--scholar-primary)
  color: #fff
  border-bottom-right-radius: 3px

.rag-bubble--ai
  background: #f0f4f8
  color: var(--scholar-text-1)
  border-bottom-left-radius: 3px

.rag-content
  white-space: pre-wrap

.rag-cursor
  display: inline-block
  width: 2px
  height: 12px
  background: var(--scholar-primary)
  margin-left: 2px
  vertical-align: middle
  animation: blink 1s step-end infinite

@keyframes blink
  0%, 100%
    opacity: 1
  50%
    opacity: 0

.rag-followup
  padding: 4px 0 4px 34px
  display: flex
  flex-direction: column
  gap: 6px

.rag-followup-label
  font-size: 11px
  color: var(--scholar-text-2)
  margin-bottom: 2px

// ─── Input ────────────────────────────────────────────────────────────────────
.rag-input-area
  border-top: 1px solid var(--scholar-border-light)
  padding: 10px 14px
  flex-shrink: 0

.rag-textarea
  width: 100%
  border: 1px solid var(--scholar-border-input)
  border-radius: 10px
  padding: 8px 12px
  font-size: 13px
  line-height: 1.5
  color: var(--scholar-text-1)
  resize: none
  box-sizing: border-box
  font-family: inherit
  outline: none

.rag-textarea:focus
  border-color: var(--scholar-primary)

.rag-textarea:disabled
  background: #f5f7fa
  cursor: not-allowed

.rag-input-footer
  display: flex
  align-items: center
  justify-content: space-between
  margin-top: 6px

.rag-hint
  font-size: 11px
  color: var(--scholar-text-2)

.rag-send
  height: 30px
  padding: 0 16px
  border-radius: 7px
  border: none
  background: var(--scholar-primary)
  color: #fff
  font-size: 13px
  cursor: pointer

.rag-send:hover:not(:disabled)
  background: var(--scholar-primary-hover)

.rag-send:disabled
  background: #b0b8c4
  cursor: not-allowed
</style>
