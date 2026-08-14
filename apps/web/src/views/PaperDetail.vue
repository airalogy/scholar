<template>
  <div class="paper-detail-page">
    <div v-if="isLoading" class="detail-loading">{{ $t('common.loading') }}</div>

    <template v-else-if="paper">
      <div class="paper-detail-main" :class="{ 'paper-detail-main--reading': showPdfViewer }" :style="{ marginRight: sidebarCollapsed ? '0' : sidebarWidth + 'px' }">
        <div class="paper-detail-main-scroll" :class="{ 'paper-detail-main-scroll--reading': showPdfViewer }">
          <!-- 阅读模式：PDF 全宽 -->
          <div v-if="showPdfViewer && paperPreviewUrl" class="reading-mode">
            <button
              class="reading-mode-close"
              type="button"
              :aria-label="$t('paperDetail.closeReadingMode')"
              @click="showPdfViewer = false"
            >
              <IconClose />
            </button>
            <PdfViewer :file-url="paperPreviewUrl" />
          </div>

          <!-- 普通模式：论文详情 -->
          <div v-else class="paper-detail-content">
            <!-- 顶部操作栏 -->
            <div class="detail-topbar">
              <button class="back-btn" type="button" @click="$router.back()">
                <img src="@/assets/icons/back-left.svg?url" alt="" class="back-icon" />
                <span>{{ $t('common.back') }}</span>
              </button>
              <a-popconfirm
                v-if="bookmarked"
                :content="$t('paperDetail.removeBookmarkConfirm')"
                :ok-text="$t('paperDetail.removeBookmarkOk')"
                :cancel-text="$t('paperDetail.removeBookmarkCancel')"
                @ok="toggleBookmark"
              >
                <button
                  class="bookmark-btn bookmark-btn--active"
                  type="button"
                  :aria-label="$t('paperDetail.removeBookmarkAria')"
                >
                  <IconBookmark />
                </button>
              </a-popconfirm>
              <button
                v-else
                class="bookmark-btn"
                type="button"
                :aria-label="$t('paperDetail.addBookmarkAria')"
                @click="toggleBookmark"
              >
                <IconBookmark />
              </button>
            </div>

            <!-- 论文标题区 -->
            <div class="detail-header">
              <h1 class="detail-title">{{ paper.title }}</h1>
              <div v-if="paper.authors?.length" class="detail-authors">
                <span v-for="(author, idx) in paper.authors" :key="author.id" class="detail-author">
                  {{ author.name }}<span v-if="idx < paper.authors.length - 1" class="detail-author-sep">,&nbsp;</span>
                </span>
              </div>
              <div v-if="paper.journal_name || hasPublishYear(paper.publish_year)" class="detail-meta">
                <span v-if="paper.journal_name" class="detail-meta-journal">{{ paper.journal_name }}</span>
                <span v-if="paper.journal_name && hasPublishYear(paper.publish_year)" class="detail-meta-sep">|</span>
                <span v-if="hasPublishYear(paper.publish_year)" class="detail-meta-year">{{ paper.publish_year }}</span>
              </div>
              <div class="detail-review-row">
                <span class="detail-review-badge" :class="`detail-review-badge--${paper.reviewStatus}`">
                  {{ getReviewStatusLabel(paper.reviewStatus) }}
                </span>
                <span v-if="paper.uploadUserName" class="detail-review-extra">
                  {{ $t('common.upload.uploadedBy', { name: paper.uploadUserName }) }}
                </span>
                <span v-if="paper.reviewedAt" class="detail-review-extra">
                  {{ $t('common.review.reviewedTime', { date: formatDate(paper.reviewedAt) }) }}
                </span>
              </div>
              <div v-if="paper.reviewNotes" class="detail-review-note">
                {{ $t('common.review.notes', { notes: paper.reviewNotes }) }}
              </div>
            </div>

            <!-- 论文摘要正文 -->
            <div class="detail-body">
              <section v-if="paper.abstract" class="detail-section">
                <h2 class="section-heading">{{ $t('paperDetail.abstractTitle') }}</h2>
                <p class="section-paragraph">{{ paper.abstract }}</p>
              </section>
              <div v-else class="detail-no-content">{{ $t('common.noAbstract') }}</div>
            </div>

            <!-- 基本信息卡片 -->
            <div class="detail-info-card">
              <div v-if="paper.keywords?.length" class="info-card-row">
                <span class="info-card-label">{{ $t('paperDetail.keywordsLabel') }}</span>
                <div class="info-card-keywords">
                  <span v-for="kw in paper.keywords" :key="kw" class="info-keyword-tag">{{ kw }}</span>
                </div>
              </div>

              <div v-if="paper.doi" class="info-card-row">
                <span class="info-card-label">DOI </span>
                <span class="info-card-value info-card-doi">{{ paper.doi }}</span>
              </div>

              <div class="info-card-row info-card-row--inline">
                <div v-if="paper.paper_type != null" class="info-card-item">
                  <span class="info-card-label">{{ $t('paperDetail.paperTypeLabel') }}</span>
                  <span class="info-card-value">{{ getPaperTypeLabel(paper.paper_type) }}</span>
                </div>
                <div v-if="paper.language != null" class="info-card-item">
                  <span class="info-card-label">{{ $t('paperDetail.languageLabel') }}</span>
                  <span class="info-card-value">{{ getLanguageLabel(paper.language) }}</span>
                </div>
                <div v-if="paper.citation_count != null" class="info-card-item">
                  <span class="info-card-label">{{ $t('paperDetail.citationCountLabel') }}</span>
                  <span class="info-card-value">{{ paper.citation_count }}</span>
                </div>
                <div v-if="paper.pages" class="info-card-item">
                  <span class="info-card-label">{{ $t('paperDetail.pagesLabel') }}</span>
                  <span class="info-card-value">{{ paper.pages }}</span>
                </div>
              </div>

              <div v-if="paper.publish_date" class="info-card-row">
                <span class="info-card-label">{{ $t('paperDetail.publishDateLabel') }}</span>
                <span class="info-card-value">{{ formatDate(paper.publish_date) }}</span>
              </div>

              <div class="info-card-row info-card-actions">
                <a v-if="paperDownloadUrl" :href="paperDownloadUrl" target="_blank" rel="noopener" class="download-btn">
                  <IconDownload />
                  <span>{{ $t('common.downloadPaper') }}</span>
                </a>
                <button v-else class="download-btn download-btn--disabled" disabled type="button">
                  <IconDownload />
                  <span>{{ $t('common.noFile') }}</span>
                </button>
              </div>
            </div>

            <!-- 阅读全文按钮 -->
            <div class="detail-read-section">
              <button
                class="read-fulltext-btn"
                :class="{ 'read-fulltext-btn--disabled': !paperPreviewUrl }"
                :disabled="!paperPreviewUrl"
                type="button"
                @click="showPdfViewer = true"
              >
                <IconFile />
                <span>{{ $t('common.readFullText') }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <template v-if="features.aiChat">
        <!-- 拖拽分隔条 + 折叠按钮 -->
        <div
          class="resize-handle"
          :style="{ right: sidebarCollapsed ? '0' : sidebarWidth + 'px' }"
          @mousedown="sidebarCollapsed ? undefined : onResizeStart($event)"
        >
          <button
            class="resize-toggle-btn"
            type="button"
            :aria-label="sidebarCollapsed ? $t('paperDetail.expandAiSidebar') : $t('paperDetail.collapseAiSidebar')"
            @mousedown.stop
            @click.stop="sidebarCollapsed = !sidebarCollapsed"
          >
            <IconLeft v-if="sidebarCollapsed" />
            <IconRight v-else />
          </button>
        </div>

        <!-- 右侧 AI 对话面板 -->
        <aside
          class="detail-sidebar"
          :class="{ 'detail-sidebar--collapsed': sidebarCollapsed }"
          :style="sidebarCollapsed ? {} : { width: sidebarWidth + 'px' }"
        >
          <div class="sidebar-header">
            <IconMessage />
            <span class="sidebar-header-title">{{ $t('paperDetail.aiSidebarTitle') }}</span>
          </div>
          <div class="sidebar-ai">
            <AiChatPanel :compact="true" :paper-context="paperContext" />
          </div>
        </aside>

        <!-- 收起时右下角展开浮钮 -->
        <button
          v-if="sidebarCollapsed"
          class="sidebar-expand-fab"
          type="button"
          :aria-label="$t('paperDetail.expandAiChat')"
          @click="sidebarCollapsed = false"
        >
          <IconMessage />
          <span>{{ $t('paperDetail.aiSidebarTitle') }}</span>
        </button>
      </template>
    </template>

    <div v-else class="detail-loading">{{ $t('paperDetail.notFound') }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import { useI18n } from 'vue-i18n'
import {
  IconBookmark,
  IconClose,
  IconDownload,
  IconFile,
  IconLeft,
  IconMessage,
  IconRight,
} from '@arco-design/web-vue/es/icon'
import { getPaper, type PaperResponse, type PaperReviewStatus } from '@/api/papers'
import { getBookmarkStatus, addBookmark, removeBookmark } from '@/api/bookmarks'
import AiChatPanel from '@/components/AiChatPanel.vue'
import PdfViewer from '@/components/PdfViewer.vue'
import { usePublicConfig } from '@/composables/usePublicConfig'
import { LANGUAGE_LABEL_KEYS, PAPER_STATUS_LABEL_KEYS, PAPER_TYPE_LABEL_KEYS } from '@/i18n/helpers'
import { hasPublishYear } from '@/utils/papers'
import { resolveSafeHttpUrl } from '@/utils/url'

const route = useRoute()
const { t, locale } = useI18n()
const { features } = usePublicConfig()

const isLoading = ref(true)
const paper = ref<PaperResponse | null>(null)

const bookmarked = ref(false)
const showPdfViewer = ref(false)
const sidebarCollapsed = ref(false)

const paperPreviewUrl = computed(() => {
  return resolveSafeHttpUrl(paper.value?.preview_url ?? paper.value?.file_url)
})

const paperDownloadUrl = computed(() => {
  return resolveSafeHttpUrl(paper.value?.download_url ?? paper.value?.file_url)
})

const paperContext = computed(() => {
  if (!paper.value) return undefined
  const p = paper.value
  const parts: string[] = [`你是一个论文阅读助手，以下是用户正在阅读的论文信息，请基于此内容回答用户的问题。`]
  parts.push(`论文ID：${p.id}`)
  parts.push(`标题：${p.title}`)
  if (p.authors?.length) parts.push(`作者：${p.authors.map(a => a.name).join('、')}`)
  if (p.journal_name) parts.push(`期刊/来源：${p.journal_name}`)
  if (hasPublishYear(p.publish_year)) parts.push(`发表年份：${p.publish_year}`)
  if (p.keywords?.length) parts.push(`关键词：${p.keywords.join('、')}`)
  if (p.abstract) parts.push(`摘要：${p.abstract}`)
  return parts.join('\n')
})

const formatDate = (value: string): string => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10)
  }

  return new Intl.DateTimeFormat(locale.value, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

const getReviewStatusLabel = (status: PaperReviewStatus): string => {
  return t(PAPER_STATUS_LABEL_KEYS[status])
}

const getPaperTypeLabel = (value: number): string => {
  const key = PAPER_TYPE_LABEL_KEYS[value as keyof typeof PAPER_TYPE_LABEL_KEYS] ?? 'common.paperTypes.other'
  return t(key)
}

const getLanguageLabel = (value: number): string => {
  const key = LANGUAGE_LABEL_KEYS[value as keyof typeof LANGUAGE_LABEL_KEYS] ?? 'common.languages.other'
  return t(key)
}

onMounted(async () => {
  try {
    const id = route.params.id as string
    const [p, status] = await Promise.all([
      getPaper(id),
      getBookmarkStatus(id).catch(() => ({ bookmarked: false })),
    ])
    paper.value = p
    bookmarked.value = status.bookmarked
  } finally {
    isLoading.value = false
  }
})

async function toggleBookmark() {
  if (!paper.value) return
  const current = bookmarked.value
  bookmarked.value = !current
  try {
    if (current) {
      await removeBookmark(paper.value.id)
      Message.success(t('paperDetail.bookmarkRemoved'))
    } else {
      await addBookmark(paper.value.id)
      Message.success(t('paperDetail.bookmarkAdded'))
    }
  } catch {
    bookmarked.value = current
    Message.error(t('paperDetail.bookmarkActionFailed'))
  }
}

// 拖拽侧边栏
const SIDEBAR_MIN = 300
const SIDEBAR_MAX = 600
const SIDEBAR_DEFAULT = 390
const sidebarWidth = ref(SIDEBAR_DEFAULT)
let resizing = false

const onResizeStart = (e: MouseEvent) => {
  e.preventDefault()
  resizing = true
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', onResizeEnd)
}

const onResizeMove = (e: MouseEvent) => {
  if (!resizing) return
  const newWidth = window.innerWidth - e.clientX
  sidebarWidth.value = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, newWidth))
}

const onResizeEnd = () => {
  resizing = false
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeEnd)
}

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeEnd)
})
</script>

<style lang="sass" scoped>
.paper-detail-page
  display: flex
  min-height: calc(100vh - var(--scholar-navbar-height))
  background: #fff
  position: relative

.detail-loading
  flex: 1
  display: flex
  align-items: center
  justify-content: center
  font-size: 14px
  color: var(--scholar-text-3)
  padding: 80px

.detail-no-content
  font-size: 14px
  color: var(--scholar-text-3)
  padding: 20px 0

.paper-detail-main
  flex: 1
  padding-left: 30px
  overflow: hidden
  min-width: 0

  &--reading
    padding-left: 0

.paper-detail-main-scroll
  width: 100%
  height: calc(100vh - var(--scholar-navbar-height))
  overflow-y: auto
  padding: 20px 40px 60px 0

  &--reading
    padding: 0
    overflow: hidden

.paper-detail-content
  max-width: 770px
  margin: 0 auto

// 顶部操作栏
.detail-topbar
  display: flex
  align-items: center
  justify-content: space-between
  margin-bottom: 20px

.back-btn
  display: inline-flex
  align-items: center
  gap: 6px
  height: 38px
  padding: 0 17px
  border: 1px solid rgba(0, 73, 143, 0.3)
  border-radius: 999px
  background: transparent
  color: #00498f
  font-family: 'PingFang SC', sans-serif
  font-size: 14px
  font-weight: 500
  cursor: pointer
  letter-spacing: -0.1504px
  line-height: 20px
  transition: background 0.2s ease

.back-btn:hover
  background: rgba(0, 73, 143, 0.04)

.back-icon
  width: 16px
  height: 16px

.bookmark-btn
  width: 38px
  height: 38px
  border: none
  background: transparent
  cursor: pointer
  display: flex
  align-items: center
  justify-content: center
  border-radius: 9.5px
  transition: background 0.2s ease

.bookmark-btn--active,
.bookmark-btn:hover
  background: #fff7ed

.bookmark-btn :deep(.arco-icon)
  font-size: 16px
  color: #f18b1c

// 论文标题区
.detail-header
  padding-bottom: 16px
  border-bottom: 1px solid #f3f4f6

.detail-title
  font-family: 'Inter', sans-serif
  font-size: 30px
  font-weight: 700
  line-height: 37.5px
  color: #0f172b
  letter-spacing: 0.3955px
  margin: 0 0 12px
  max-width: 700px

.detail-authors
  display: flex
  flex-wrap: wrap
  gap: 0
  margin-bottom: 10px
  font-family: 'Inter', sans-serif
  font-size: 15px
  font-weight: 400
  color: #45556c
  line-height: 22px

.detail-author-sep
  color: #45556c

.detail-meta
  display: flex
  align-items: center
  gap: 8px
  flex-wrap: wrap
  line-height: 24px

.detail-meta-sep
  color: #cad5e2
  font-size: 16px
  font-weight: 400
  letter-spacing: -0.3125px

.detail-meta-journal
  font-family: 'Inter', sans-serif
  font-size: 16px
  font-weight: 400
  color: #45556c
  letter-spacing: -0.3125px

.detail-meta-year
  font-family: 'Inter', sans-serif
  font-size: 16px
  font-weight: 400
  color: #45556c
  letter-spacing: -0.3125px

.detail-review-row
  display: flex
  align-items: center
  gap: 10px
  flex-wrap: wrap
  margin-top: 16px

.detail-review-badge
  display: inline-flex
  align-items: center
  height: 28px
  padding: 0 12px
  border-radius: 999px
  font-size: 12px
  font-weight: 600

.detail-review-badge--pending_review
  background: #fff7e8
  color: #d48806

.detail-review-badge--changes_requested
  background: #e8f4ff
  color: #0050b3

.detail-review-badge--approved
  background: #f0f9eb
  color: #389e0d

.detail-review-badge--draft, .detail-review-badge--archived
  background: #fff1f0
  color: #cf1322

.detail-review-extra
  font-size: 13px
  color: var(--scholar-text-3)

.detail-review-note
  margin-top: 12px
  font-size: 13px
  line-height: 1.7
  color: #8a2d1d
  background: #fff7f5
  border-radius: 12px
  padding: 12px 14px

// 论文正文
.detail-body
  margin-top: 32px

.detail-section
  margin-bottom: 24px

.section-heading
  font-family: 'Inter', sans-serif
  font-size: 20px
  font-weight: 700
  line-height: 28px
  color: #0f172b
  letter-spacing: -0.4492px
  margin: 0 0 12px
  text-align: justify

.section-paragraph
  font-family: 'Inter', sans-serif
  font-size: 16px
  font-weight: 400
  line-height: 24px
  color: #1d293d
  letter-spacing: -0.3125px
  text-align: justify
  margin: 0 0 12px

// 基本信息卡片
.detail-info-card
  margin-top: 32px
  padding: 20px 24px
  background: #f9fafb
  border: 1px solid #e5e7eb
  border-radius: 10px

.info-card-row
  margin-bottom: 16px
  &:last-child
    margin-bottom: 0

.info-card-row--inline
  display: flex
  gap: 32px
  flex-wrap: wrap

.info-card-item
  display: flex
  flex-direction: column
  gap: 4px

.info-card-label
  font-family: 'PingFang SC', sans-serif
  font-size: 13px
  font-weight: 500
  color: #6b7280
  margin-bottom: 4px

.info-card-value
  font-family: 'PingFang SC', sans-serif
  font-size: 14px
  color: #1d293d

.info-card-doi
  word-break: break-all
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace
  font-size: 13px

.info-card-keywords
  display: flex
  flex-wrap: wrap
  gap: 8px

.info-keyword-tag
  height: 27px
  line-height: 27px
  padding: 0 10px
  border: 1px solid #e5e7eb
  border-radius: 999px
  background: #fff
  font-family: 'PingFang SC', sans-serif
  font-size: 12px
  color: #666

.info-card-actions
  display: flex
  justify-content: flex-start
  padding-top: 4px

// 下载按钮
.download-btn
  height: 36px
  padding: 0 20px
  border: none
  border-radius: 8px
  background: #00498f
  box-shadow: 0px 1px 3px 0px #bedbff
  color: #fff
  font-family: 'PingFang SC', sans-serif
  font-size: 13px
  font-weight: 500
  cursor: pointer
  display: inline-flex
  align-items: center
  justify-content: center
  gap: 6px
  text-decoration: none
  transition: background 0.2s ease

.download-btn:hover
  background: #005ba8

.download-btn :deep(.arco-icon)
  font-size: 16px

.download-btn--disabled
  opacity: 0.4
  cursor: not-allowed

.download-btn--disabled:hover
  background: #00498f

// 阅读全文
.detail-read-section
  margin-top: 24px

.read-fulltext-btn
  width: 100%
  height: 48px
  border: 2px solid #00498f
  border-radius: 10px
  background: rgba(0, 73, 143, 0.04)
  color: #00498f
  font-family: 'PingFang SC', sans-serif
  font-size: 16px
  font-weight: 600
  cursor: pointer
  display: flex
  align-items: center
  justify-content: center
  gap: 8px
  transition: all 0.2s ease

  :deep(.arco-icon)
    font-size: 20px

  &:hover
    background: rgba(0, 73, 143, 0.08)

  &--disabled
    border-color: #d1d5db
    color: #9ca3af
    background: #f9fafb
    cursor: not-allowed

    &:hover
      background: #f9fafb

.detail-pdf-wrapper
  margin-top: 20px

// 阅读模式
.reading-mode
  position: relative
  height: calc(100vh - var(--scholar-navbar-height))
  display: flex
  flex-direction: column

  :deep(.pdf-viewer)
    flex: 1
    border: none
    border-radius: 0
    display: flex
    flex-direction: column
    overflow: hidden

  :deep(.pdf-pages)
    max-height: none
    flex: 1

.reading-mode-close
  position: absolute
  top: 10px
  right: 16px
  z-index: 10
  width: 36px
  height: 36px
  border: none
  border-radius: 50%
  background: rgba(0, 0, 0, 0.5)
  color: #fff
  cursor: pointer
  display: flex
  align-items: center
  justify-content: center
  transition: background 0.2s ease

  &:hover
    background: rgba(0, 0, 0, 0.7)

// 拖拽分隔条
.resize-handle
  position: fixed
  top: var(--scholar-navbar-height)
  bottom: 0
  width: 16px
  margin-left: -8px
  cursor: col-resize
  z-index: 15
  display: flex
  align-items: center
  justify-content: center

.resize-handle::after
  content: ''
  position: absolute
  top: 0
  bottom: 0
  left: 7px
  width: 2px
  background: transparent
  transition: background 0.15s ease

.resize-handle:hover::after
  background: #d1d5db

.resize-toggle-btn
  position: relative
  z-index: 1
  width: 20px
  height: 32px
  border: 1px solid #e5e7eb
  border-radius: 999px
  background: #fff
  color: #6b7280
  cursor: pointer
  display: flex
  align-items: center
  justify-content: center
  box-shadow: 0 1px 4px rgba(0,0,0,0.10)
  transition: background 0.15s, color 0.15s, border-color 0.15s
  padding: 0

  &:hover
    background: #f0f6ff
    color: #00498f
    border-color: #b3d0f5

.detail-sidebar
  border-left: 1px solid #e5e7eb
  background: #fcfdfd
  position: fixed
  right: 0
  top: var(--scholar-navbar-height)
  bottom: 0
  overflow: hidden
  display: flex
  flex-direction: column
  transition: width 0.25s ease

.detail-sidebar--collapsed
  width: 0 !important
  border-left: none

.sidebar-header
  height: 48px
  min-width: 0
  display: flex
  align-items: center
  gap: 8px
  padding: 0 16px 0 20px
  border-bottom: 1px solid #e5e7eb
  background: #fff
  flex-shrink: 0
  white-space: nowrap

  :deep(.arco-icon)
    font-size: 18px
    color: #00498f

.sidebar-header-title
  font-family: 'PingFang SC', sans-serif
  font-size: 15px
  font-weight: 600
  color: #0f172b
  flex: 1

.sidebar-expand-fab
  position: fixed
  right: 20px
  bottom: 28px
  z-index: 20
  height: 36px
  padding: 0 14px
  border: 1px solid #e5e7eb
  border-radius: 999px
  background: #fff
  color: #00498f
  font-family: 'PingFang SC', sans-serif
  font-size: 13px
  font-weight: 500
  cursor: pointer
  display: flex
  align-items: center
  gap: 6px
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08)
  transition: box-shadow 0.15s, background 0.15s

  :deep(.arco-icon)
    font-size: 16px

  &:hover
    background: #f0f6ff
    box-shadow: 0 4px 12px rgba(0, 73, 143, 0.15)

// AI 对话
.sidebar-ai
  flex: 1
  display: flex
  flex-direction: column
  overflow: hidden
</style>
