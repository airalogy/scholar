<template>
  <div class="chat-panel" :class="{ 'chat-panel--compact': compact, 'chat-panel--empty': emptyState }">
    <!-- 消息区域 -->
    <div class="panel-messages" ref="messagesRef">
      <!-- 论文引用卡片 -->
      <router-link v-if="paperRef" class="paper-ref-card" :to="paperRef.id ? `/papers/${paperRef.id}` : '#'">
        <div class="paper-ref-icon">
          <IconFile />
        </div>
        <div class="paper-ref-body">
          <div class="paper-ref-label">{{ $t('aiChatPanel.referenceLabel') }}</div>
          <div class="paper-ref-title">{{ paperRef.title }}</div>
          <div v-if="paperRef.authors || paperRef.journal" class="paper-ref-meta">
            <span v-if="paperRef.authors">{{ paperRef.authors }}</span>
            <span v-if="paperRef.authors && paperRef.journal" class="paper-ref-sep">·</span>
            <span v-if="paperRef.journal">{{ paperRef.journal }}</span>
            <span v-if="paperRef.year" class="paper-ref-sep">·</span>
            <span v-if="paperRef.year">{{ paperRef.year }}</span>
          </div>
        </div>
      </router-link>

      <template v-for="message in messages" :key="message.id">
        <!-- 用户消息 -->
        <div v-if="message.type === 'user'" class="user-message">
          <div class="user-bubble">{{ message.content }}</div>
        </div>

        <!-- AI 消息 -->
        <div v-else class="ai-message">
          <!-- 等待首个 chunk 时的 loading 点动画 -->
          <div v-if="streamingMsgId === message.id && !message.content" class="ai-loading">
            <span class="loading-dot"></span>
            <span class="loading-dot"></span>
            <span class="loading-dot"></span>
          </div>

          <div
            v-else
            class="ai-text"
            v-html="renderSafeMarkdown(message.displayed, streamingMsgId === message.id || message.displayed.length < message.content.length)"
          ></div>

          <!-- 操作按钮 -->
          <div class="message-actions" v-if="!isLoading">
            <a-tooltip :content="$t('common.regenerate')" position="top" :mini="true">
              <button class="msg-action-btn" @click="handleRegenerate(message.id)">
                <img src="@/assets/icons/refresh.svg?url" alt="" class="msg-action-icon" />
              </button>
            </a-tooltip>
            <a-tooltip :content="$t('common.copy')" position="top" :mini="true">
              <button class="msg-action-btn" @click="handleCopy(message.content)">
                <img src="@/assets/icons/copy.svg?url" alt="" class="msg-action-icon" />
              </button>
            </a-tooltip>
          </div>
        </div>
      </template>
    </div>

    <!-- 输入区域 -->
    <div class="panel-input">
      <div class="panel-input-box">
        <textarea
          v-model="question"
          class="panel-textarea"
          :placeholder="resolvedPlaceholder"
          @keydown.enter.prevent="handleSend"
        />
        <div class="panel-input-actions">
          <div class="panel-input-footer">
            <!-- 自定义工具栏（历史记录、新对话等） -->
            <slot name="toolbar" />
          </div>
          <button
            class="send-btn"
            :class="btnState"
            :disabled="btnState === 'disabled'"
            @mouseenter="isHovered = true"
            @mouseleave="isHovered = false"
            @click="btnState === 'loading' ? handleStop() : handleSend()"
          >
            <img
              v-if="btnState === 'loading'"
              src="@/assets/icons/stop-btn.svg?url"
              alt=""
              class="send-icon"
            />
            <img
              v-else
              src="@/assets/icons/send-btn.svg?url"
              alt=""
              class="send-icon"
            />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onUnmounted } from 'vue'
import { Message as ArcoMessage } from '@arco-design/web-vue'
import { IconFile } from '@arco-design/web-vue/es/icon'
import { useI18n } from 'vue-i18n'
import { sendChatStream, getChat, type ChatMessage as ApiChatMessage } from '@/api/chat'
import { renderSafeMarkdown } from '@/utils/markdown'

interface ChatMsg {
  id: string
  type: 'user' | 'ai'
  content: string    // SSE 接收到的原始文本
  displayed: string  // 打字机逐渐显示的文本
}

interface PaperRef {
  id?: string
  title: string
  authors?: string
  journal?: string
  year?: string
}

const props = withDefaults(defineProps<{
  compact?: boolean
  emptyState?: boolean
  placeholder?: string
  paperContext?: string
}>(), {
  compact: false,
  emptyState: false,
  placeholder: '',
})

const { t } = useI18n()

/** 从 system message 文本中解析论文引用信息 */
function parsePaperRef(text: string): PaperRef | null {
  const titleMatch = text.match(/标题：(.+)/)
  if (!titleMatch) return null
  const ref: PaperRef = { title: titleMatch[1] }
  const idMatch = text.match(/论文ID：(.+)/)
  if (idMatch) ref.id = idMatch[1]
  const authorsMatch = text.match(/作者：(.+)/)
  if (authorsMatch) ref.authors = authorsMatch[1]
  const journalMatch = text.match(/期刊\/来源：(.+)/)
  if (journalMatch) ref.journal = journalMatch[1]
  const yearMatch = text.match(/发表年份：(\d+)/)
  if (yearMatch) ref.year = yearMatch[1]
  return ref
}

const paperRef = ref<PaperRef | null>(null)

// 从 prop 初始化
watch(() => props.paperContext, (ctx) => {
  paperRef.value = ctx ? parsePaperRef(ctx) : null
}, { immediate: true })

const question = ref('')
const isLoading = ref(false)
const isHovered = ref(false)
const messages = ref<ChatMsg[]>([])
const currentChatId = ref<string | undefined>(undefined)
const streamingMsgId = ref<string | null>(null)
const messagesRef = ref<HTMLElement | null>(null)

let abortFlag = false
let streamAbortController: AbortController | null = null
let currentAiMsg: ChatMsg | null = null
const charQueue: string[] = []
let rafId: number | null = null

function flushQueue() {
  if (!currentAiMsg || charQueue.length === 0) {
    rafId = null
    return
  }
  const batchSize = charQueue.length > 100 ? 10 : 3
  currentAiMsg.displayed += charQueue.splice(0, batchSize).join('')
  scrollToBottom()
  rafId = requestAnimationFrame(flushQueue)
}

function scrollToBottom() {
  if (messagesRef.value) {
    messagesRef.value.scrollTop = messagesRef.value.scrollHeight
  }
}

const btnState = computed(() => {
  if (isLoading.value) return 'loading'
  if (!question.value.trim()) return 'disabled'
  if (isHovered.value) return 'hovered'
  return 'active'
})

const isEmpty = computed(() => messages.value.length === 0)
const resolvedPlaceholder = computed(() => props.placeholder || t('aiChatPanel.placeholder'))

const handleSend = async () => {
  if (isLoading.value) return
  const userContent = question.value.trim()
  if (!userContent) return

  question.value = ''
  abortFlag = false

  messages.value.push({
    id: Date.now().toString(),
    type: 'user',
    content: userContent,
    displayed: userContent,
  })

  const aiMsgData: ChatMsg = {
    id: (Date.now() + 1).toString(),
    type: 'ai',
    content: '',
    displayed: '',
  }
  messages.value.push(aiMsgData)
  currentAiMsg = messages.value[messages.value.length - 1]
  isLoading.value = true
  streamingMsgId.value = aiMsgData.id

  await nextTick()
  scrollToBottom()

  const apiMessages: ApiChatMessage[] = [{ role: 'user', content: userContent }]

  if (props.paperContext && !currentChatId.value) {
    apiMessages.unshift({ role: 'system', content: props.paperContext })
  }

  streamAbortController?.abort()
  const controller = new AbortController()
  streamAbortController = controller

  await sendChatStream(apiMessages, currentChatId.value, {
    onId: (id) => { currentChatId.value = id },
    onChunk: (content) => {
      if (abortFlag) return
      currentAiMsg!.content += content
      charQueue.push(...content)
      if (rafId === null) rafId = requestAnimationFrame(flushQueue)
    },
    onDone: () => {
      isLoading.value = false
      streamingMsgId.value = null
    },
    onError: () => {
      charQueue.length = 0
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null }
      if (currentAiMsg && !currentAiMsg.content) {
        currentAiMsg.content = t('aiChatPanel.requestFailed')
        currentAiMsg.displayed = currentAiMsg.content
      }
      currentAiMsg = null
      isLoading.value = false
      streamingMsgId.value = null
    },
  }, 'general', controller.signal)

  if (streamAbortController === controller) {
    streamAbortController = null
  }
}

const handleStop = () => {
  abortFlag = true
  streamAbortController?.abort()
  streamAbortController = null
  charQueue.length = 0
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null }
  if (currentAiMsg) { currentAiMsg.displayed = currentAiMsg.content }
  currentAiMsg = null
  isLoading.value = false
  streamingMsgId.value = null
}

const handleCopy = async (content: string) => {
  try {
    await navigator.clipboard.writeText(content)
    ArcoMessage.success(t('aiChatPanel.copySuccess'))
  } catch {
    ArcoMessage.error(t('aiChatPanel.copyFailed'))
  }
}

const handleRegenerate = (messageId: string) => {
  const idx = messages.value.findIndex(m => m.id === messageId)
  if (idx <= 0) return
  const prevMsg = messages.value[idx - 1]
  if (prevMsg?.type !== 'user') return
  question.value = prevMsg.content
  messages.value = messages.value.slice(0, idx - 1)
  handleSend()
}

function startNewChat() {
  if (isLoading.value) {
    handleStop()
  }
  messages.value = []
  currentChatId.value = undefined
  question.value = ''
  // 恢复从 prop 解析的引用
  paperRef.value = props.paperContext ? parsePaperRef(props.paperContext) : null
}

async function loadChat(id: string) {
  const detail = await getChat(id)
  currentChatId.value = detail.id
  // 从历史 system message 中解析论文引用
  const sysMsg = detail.messages.find((m) => m.role === 'system')
  paperRef.value = sysMsg ? parsePaperRef(sysMsg.content) : null
  messages.value = detail.messages
    .filter((m) => m.role !== 'system')
    .map((m, i) => ({
    id: `history-${i}`,
    type: m.role === 'user' ? 'user' : ('ai' as const),
    content: m.content,
    displayed: m.content,
  }))
  await nextTick()
  scrollToBottom()
}

onUnmounted(() => {
  streamAbortController?.abort()
  streamAbortController = null
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null }
})

defineExpose({ loadChat, startNewChat, isEmpty, currentChatId })
</script>

<style lang="sass" scoped>
.chat-panel
  display: flex
  flex-direction: column
  height: 100%

.chat-panel--empty
  height: auto

/* 消息区域 */
.panel-messages
  flex: 1
  overflow-y: auto
  display: flex
  flex-direction: column
  gap: 24px
  padding-bottom: 8px

/* 初始态隐藏消息区域，避免占位 */
.chat-panel--empty .panel-messages
  display: none

.chat-panel--compact .panel-messages
  gap: 16px
  padding: 16px 16px 8px

/* 用户消息 */
.user-message
  display: flex
  justify-content: flex-end

.user-bubble
  background: var(--scholar-primary)
  color: white
  padding: 10px 16px
  border-radius: 14px
  font-size: 14px
  line-height: 22px
  max-width: 70%

.chat-panel--compact .user-bubble
  background: #eef3fa
  color: #333
  border-radius: 16px 16px 4px 16px
  font-size: 14px

/* AI 消息 */
.ai-message
  display: flex
  flex-direction: column

/* loading 点动画 */
.ai-loading
  display: flex
  align-items: center
  gap: 5px
  height: 36px
  padding: 4px 0

.loading-dot
  width: 7px
  height: 7px
  border-radius: 50%
  background: var(--scholar-text-3)
  animation: loadingBounce 1.4s ease-in-out infinite

.loading-dot:nth-child(1)
  animation-delay: 0s

.loading-dot:nth-child(2)
  animation-delay: 0.2s

.loading-dot:nth-child(3)
  animation-delay: 0.4s

@keyframes loadingBounce
  0%, 80%, 100%
    transform: translateY(0)
    opacity: 0.4
  40%
    transform: translateY(-6px)
    opacity: 1

/* 打字机光标 */
@keyframes cursorBlink
  0%, 100%
    opacity: 1
  50%
    opacity: 0

/* Markdown 内容 */
.ai-text
  font-size: 16px
  line-height: 1.75
  color: var(--scholar-text-1)

  :deep(p)
    margin: 0 0 10px
    &:last-child
      margin-bottom: 0

  :deep(h1), :deep(h2), :deep(h3), :deep(h4)
    font-weight: 600
    margin: 16px 0 6px
    color: var(--scholar-text-1)
    &:first-child
      margin-top: 0

  :deep(h1)
    font-size: 20px
  :deep(h2)
    font-size: 18px
  :deep(h3)
    font-size: 16px

  :deep(ul), :deep(ol)
    margin: 4px 0 10px
    padding-left: 20px

  :deep(li)
    margin-bottom: 4px

  :deep(code)
    font-family: 'SFMono-Regular', Consolas, monospace
    font-size: 13px
    background: #f0f4f8
    padding: 1px 5px
    border-radius: 4px
    color: #d63384

  :deep(pre)
    background: #1e2433
    border-radius: 8px
    padding: 14px 16px
    overflow-x: auto
    margin: 8px 0 12px
    code
      background: none
      color: #e2e8f0
      padding: 0
      font-size: 13px

  :deep(blockquote)
    border-left: 3px solid var(--scholar-primary)
    margin: 8px 0
    padding: 4px 12px
    color: var(--scholar-text-2)

  :deep(a)
    color: var(--scholar-primary)
    text-decoration: none
    &:hover
      text-decoration: underline

  :deep(strong)
    font-weight: 600

  :deep(.typing-cursor)
    display: inline-block
    width: 2px
    height: 1em
    background: var(--scholar-text-2)
    margin-left: 1px
    vertical-align: text-bottom
    animation: cursorBlink 0.8s ease-in-out infinite

.chat-panel--compact .ai-text
  font-size: 14px
  line-height: 1.6

  :deep(h1)
    font-size: 16px
  :deep(h2)
    font-size: 15px
  :deep(h3)
    font-size: 14px

/* 操作按钮 */
.message-actions
  display: flex
  gap: 8px
  margin-top: 10px

.msg-action-btn
  display: flex
  align-items: center
  justify-content: center
  width: 24px
  height: 24px
  background: none
  border: none
  border-radius: 4px
  cursor: pointer
  padding: 0
  transition: background 0.2s ease

.msg-action-btn:hover
  background: var(--scholar-bg-sidebar)

.msg-action-icon
  width: 20px
  height: 20px

/* 输入区域 */
.panel-input
  flex-shrink: 0
  padding: 16px 0 12px

/* 初始态去掉顶部间距 */
.chat-panel--empty .panel-input
  padding: 0

.chat-panel--compact .panel-input
  padding: 0
  border-top: 1px solid #e5e7eb
  background: #fff

.panel-input-box
  border: 1px solid var(--scholar-border-input)
  border-radius: var(--scholar-radius-input)
  background: #fff
  overflow: hidden
  box-shadow: 0px 14px 30px -6px rgba(0, 0, 0, 0.06)
  transform: translateZ(0)

.chat-panel--compact .panel-input-box
  border: 1px solid #d3d8e0
  border-radius: 16px
  box-shadow: none
  margin: 12px 16px 16px

.panel-textarea
  width: 100%
  border: none
  outline: none
  resize: none
  padding: 20px 20px 0
  font-size: 16px
  color: var(--scholar-text-1)
  font-family: inherit
  line-height: 1.6
  height: 94px
  background: transparent

.chat-panel--compact .panel-textarea
  height: auto
  min-height: 50px
  max-height: 80px
  padding: 10px 40px 10px 10px
  font-size: 14px
  color: #333

.panel-textarea::placeholder
  color: var(--scholar-text-4)

.chat-panel--compact .panel-textarea::placeholder
  color: #c9d0d9

.panel-input-actions
  display: flex
  align-items: center
  padding: 4px 12px 4px 20px

.panel-input-footer
  display: flex
  align-items: center
  flex: 1

.chat-panel--compact .panel-input-footer
  display: none

/* 全页模式：footer + 发送按钮横排 */
.send-btn
  display: flex
  align-items: center
  justify-content: center
  width: 36px
  height: 36px
  border-radius: 50%
  border: none
  background: none
  cursor: pointer
  padding: 0
  transition: all 0.2s ease

.send-btn.disabled
  cursor: not-allowed

.send-btn.disabled .send-icon
  opacity: 0.2

.send-btn.active:hover
  background: rgba(0, 73, 143, 0.05)

.send-btn.loading:hover
  background: rgba(241, 139, 28, 0.05)

.send-icon
  width: 36px
  height: 36px

/* compact 模式：发送按钮绝对定位在 textarea 右下角 */
.chat-panel--compact .panel-input-box
  position: relative

.chat-panel--compact .send-btn
  position: absolute
  right: 8px
  bottom: 8px
  width: 24px
  height: 24px

.chat-panel--compact .send-icon
  width: 24px
  height: 24px

/* 论文引用卡片 */
.paper-ref-card
  display: flex
  align-items: flex-start
  gap: 10px
  background: #f0f5ff
  border: 1px solid #ccdaf5
  border-radius: 10px
  padding: 10px 12px
  flex-shrink: 0
  text-decoration: none
  color: inherit
  transition: background 0.15s ease

.paper-ref-card:hover
  background: #e6eefb

.paper-ref-icon
  flex-shrink: 0
  width: 28px
  height: 28px
  background: #deeaff
  border-radius: 6px
  display: flex
  align-items: center
  justify-content: center
  color: #3b6fcf
  margin-top: 1px

.paper-ref-body
  min-width: 0

.paper-ref-label
  font-size: 11px
  color: #3b6fcf
  font-weight: 500
  margin-bottom: 3px

.paper-ref-title
  font-size: 13px
  font-weight: 600
  color: #1a2a45
  line-height: 1.4
  overflow: hidden
  display: -webkit-box
  -webkit-line-clamp: 2
  -webkit-box-orient: vertical

.paper-ref-meta
  display: flex
  align-items: center
  flex-wrap: wrap
  gap: 4px
  margin-top: 4px
  font-size: 11px
  color: #6b7a99

.paper-ref-sep
  color: #b0bbcc
</style>
