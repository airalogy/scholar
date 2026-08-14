<template>
  <div class="ai-chat" :class="{ 'has-messages': hasMessages }">
    <div class="ai-chat-hero" v-if="!hasMessages">
      <h1 class="hero-title">{{ $t('aiChat.heroTitle') }}</h1>
      <p class="hero-subtitle">{{ $t('aiChat.heroSubtitle') }}</p>
    </div>

    <div class="panel-wrapper">
      <AiChatPanel ref="panelRef" :empty-state="!hasMessages">
        <template #toolbar>
          <div class="chat-actions">
            <Dropdown
              class="history-dropdown-wrapper"
              trigger="click"
              popup-class-name="history-dropdown-popup"
              :popup-visible="showHistoryDropdown"
              @popup-visible-change="handleHistoryVisibleChange"
            >
              <button class="footer-btn" type="button">
                <img src="@/assets/icons/history.svg?url" alt="" class="footer-btn-icon" />
                <span>{{ $t('common.history') }}</span>
                <IconDown class="dropdown-chevron" :class="{ 'dropdown-chevron--open': showHistoryDropdown }" />
              </button>

              <template #content>
                <div class="history-dropdown-content">
                  <div v-if="isLoadingHistory" class="history-dropdown-state">{{ $t('common.loading') }}</div>
                  <div v-else-if="!chatList.length" class="history-dropdown-state">{{ $t('aiChat.noHistory') }}</div>
                  <template v-else>
                    <Doption
                      v-for="item in chatList"
                      :key="item.id"
                      :value="item.id"
                      class="history-option"
                      :class="{ 'history-option--active': activeChatId === item.id }"
                      @click="handleLoadChat(item.id)"
                    >
                      <div class="history-option-row">
                        <div class="history-option-main">
                          <div class="history-option-title">{{ item.title }}</div>
                          <div class="history-option-date">{{ formatDate(item.updatedAt) }}</div>
                        </div>
                        <Popconfirm
                          :content="$t('aiChat.deleteHistoryConfirm')"
                          :ok-text="$t('common.delete')"
                          :cancel-text="$t('common.cancel')"
                          :ok-button-props="{ status: 'danger' }"
                          @ok="deleteHistoryItem(item.id)"
                        >
                          <button class="history-option-delete" type="button" @click.stop>
                            <IconClose />
                          </button>
                        </Popconfirm>
                      </div>
                    </Doption>
                  </template>
                </div>
              </template>
            </Dropdown>
            <div class="action-divider" />
            <button class="footer-btn" @click="panelRef?.startNewChat()">
              <img src="@/assets/icons/new-chat.svg?url" alt="" class="footer-btn-icon" />
              <span>{{ $t('common.newChat') }}</span>
            </button>
          </div>
        </template>
      </AiChatPanel>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Message as ArcoMessage, Popconfirm, Dropdown, Doption } from '@arco-design/web-vue'
import { IconClose, IconDown } from '@arco-design/web-vue/es/icon'
import { useI18n } from 'vue-i18n'
import { listChats, deleteChat, type ChatListItem } from '@/api/chat'
import AiChatPanel from '@/components/AiChatPanel.vue'

const panelRef = ref<InstanceType<typeof AiChatPanel> | null>(null)

const hasMessages = computed(() => panelRef.value?.isEmpty === false)
const activeChatId = computed(() => panelRef.value?.currentChatId)

// 历史记录下拉
const showHistoryDropdown = ref(false)
const chatList = ref<ChatListItem[]>([])
const isLoadingHistory = ref(false)
const { t, locale } = useI18n()

function formatDate(iso: string) {
  return new Intl.DateTimeFormat(locale.value, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso))
}

async function loadHistoryList() {
  isLoadingHistory.value = true
  try {
    const res = await listChats(50, 0)
    chatList.value = res.items
  } finally {
    isLoadingHistory.value = false
  }
}

async function handleHistoryVisibleChange(visible: boolean) {
  showHistoryDropdown.value = visible
  if (visible) {
    await loadHistoryList()
  }
}

async function handleLoadChat(id: string) {
  showHistoryDropdown.value = false
  await panelRef.value?.loadChat(id)
}

async function deleteHistoryItem(id: string) {
  try {
    await deleteChat(id)
    chatList.value = chatList.value.filter(c => c.id !== id)
    if (activeChatId.value === id) panelRef.value?.startNewChat()
    ArcoMessage.success(t('aiChat.deleteHistorySuccess'))
  } catch {
    ArcoMessage.error(t('aiChat.deleteHistoryFailed'))
  }
}
</script>

<style lang="sass" scoped>
.ai-chat
  display: flex
  flex-direction: column
  align-items: center
  justify-content: flex-start
  padding-top: 10px
  height: calc(100vh - var(--scholar-navbar-height))
  overflow: hidden
  min-height: 600px

.ai-chat.has-messages
  padding-top: 10px

.ai-chat:not(.has-messages)
  padding-top: 20vh

.ai-chat-hero
  text-align: center
  margin-bottom: clamp(24px, 4vh, 48px)

.hero-title
  font-size: 40px
  font-weight: 700
  color: var(--scholar-text-1)
  margin: 0 0 14px
  letter-spacing: -0.97px

.hero-subtitle
  font-size: 18px
  color: var(--scholar-text-desc)
  margin: 0
  letter-spacing: -0.44px

/* panel 容器：限宽、占满剩余高度 */
.panel-wrapper
  width: 884px
  max-width: 100%
  flex: 1
  overflow: hidden
  display: flex
  flex-direction: column
  position: relative

.ai-chat:not(.has-messages) .panel-wrapper
  flex: 0 1 auto
  justify-content: flex-start

.ai-chat.has-messages .panel-wrapper
  flex: 1
  justify-content: flex-start

/* 历史记录下拉 */
.history-dropdown-content
  min-width: 200px

.history-dropdown-state
  padding: 24px 20px
  text-align: center
  font-size: 14px
  color: var(--scholar-text-3)

.history-option-row
  display: grid
  grid-template-columns: minmax(0, 1fr) auto
  align-items: start
  column-gap: 8px
  width: 100%

.history-option-main
  flex: 1
  min-width: 0
  line-height: 22px

.history-option-title
  font-size: 13px
  color: var(--scholar-text-1)
  overflow: hidden
  text-overflow: ellipsis
  white-space: nowrap
  font-weight: 500

.history-option-date
  font-size: 11px
  color: var(--scholar-text-3)
  margin-top: 2px

.history-option-delete
  width: 20px
  height: 20px
  border: none
  background: none
  cursor: pointer
  color: var(--scholar-text-3)
  border-radius: 4px
  display: flex
  align-items: center
  justify-content: center
  flex-shrink: 0
  margin-left: 0
  margin-top: 2px
  opacity: 1
  transition: all 0.15s
  position: absolute
  right: 8px
  top: 50%
  transform: translateY(-50%)

  :deep(.arco-icon)
    font-size: 14px

.history-option-delete:hover
  background: #fee2e2
  color: #ef4444

/* 工具栏按钮 */
.chat-actions
  display: flex
  align-items: center
  gap: 12px

.history-dropdown-wrapper
  display: inline-flex

.footer-btn
  display: flex
  align-items: center
  gap: 6px
  background: transparent
  border: none
  padding: 4px 8px
  border-radius: 8px
  cursor: pointer
  font-size: 14px
  color: var(--scholar-text-3)
  font-family: inherit
  line-height: 20px
  letter-spacing: -0.15px
  transition: all 0.2s ease

.footer-btn:hover
  color: var(--scholar-primary)
  background: rgba(0, 73, 143, 0.05)

.footer-btn-icon
  width: 16px
  height: 16px
  transition: all 0.2s ease

.footer-btn:hover .footer-btn-icon
  filter: brightness(0) saturate(100%) invert(15%) sepia(91%) saturate(1958%) hue-rotate(200deg) brightness(95%) contrast(101%)

.action-divider
  width: 1px
  height: 16px
  background: var(--scholar-divider)

.dropdown-chevron
  margin-left: 2px
  color: var(--scholar-text-3)
  transition: transform 0.2s
  flex-shrink: 0

.dropdown-chevron--open
  transform: rotate(180deg)

.footer-btn:hover .dropdown-chevron
  color: var(--scholar-primary)
</style>
