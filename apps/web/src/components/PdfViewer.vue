<template>
  <div class="pdf-viewer">
    <div v-if="isLoading" class="pdf-status">
      <a-spin />
      <span>{{ $t('pdfViewer.loading') }}</span>
    </div>
    <div v-else-if="loadError" class="pdf-status pdf-status--error">
      <span>{{ loadError }}</span>
      <button type="button" class="pdf-retry" @click="loadPdf">{{ $t('pdfViewer.retry') }}</button>
    </div>
    <template v-else>
      <div class="pdf-toolbar">
        <div class="pdf-tool-group">
          <button type="button" class="pdf-tool-btn" :aria-label="t('pdfViewer.previousPage')" :disabled="currentPage <= 1" @click="goPage(currentPage - 1)">
            <IconLeft />
          </button>
          <span class="pdf-page-info">{{ currentPage }} / {{ totalPages }}</span>
          <button type="button" class="pdf-tool-btn" :aria-label="t('pdfViewer.nextPage')" :disabled="currentPage >= totalPages" @click="goPage(currentPage + 1)">
            <IconRight />
          </button>
        </div>
        <span class="pdf-toolbar-sep" />
        <div class="pdf-tool-group">
          <button type="button" class="pdf-tool-btn" :aria-label="t('pdfViewer.zoomOut')" :disabled="zoom <= 50" @click="changeZoom(-20)">
            <IconMinus />
          </button>
          <span class="pdf-scale-info">{{ zoom }}%</span>
          <button type="button" class="pdf-tool-btn" :aria-label="t('pdfViewer.zoomIn')" :disabled="zoom >= 300" @click="changeZoom(20)">
            <IconPlus />
          </button>
        </div>
      </div>
      <div class="pdf-search" role="search" :aria-label="t('pdfViewer.searchPage')">
        <label class="pdf-search-field">
          <span>{{ t('pdfViewer.searchPage') }}</span>
          <input
            v-model="searchQuery"
            type="search"
            maxlength="200"
            :placeholder="t('pdfViewer.searchPlaceholder')"
            @keydown.enter.prevent="moveMatch($event.shiftKey ? -1 : 1)"
            @keydown.esc.prevent="searchQuery = ''"
          >
        </label>
        <div class="pdf-search-actions">
          <button type="button" class="pdf-tool-btn" :aria-label="t('pdfViewer.previousMatch')" :disabled="!matches.length" @click="moveMatch(-1)"><IconLeft /></button>
          <span class="pdf-match-count" role="status" aria-live="polite">{{ searchStatus }}</span>
          <button type="button" class="pdf-tool-btn" :aria-label="t('pdfViewer.nextMatch')" :disabled="!matches.length" @click="moveMatch(1)"><IconRight /></button>
          <button type="button" class="pdf-clear" :disabled="!searchQuery" @click="searchQuery = ''">{{ t('pdfViewer.clearSearch') }}</button>
        </div>
        <p class="pdf-search-hint">{{ t('pdfViewer.searchHint') }}</p>
      </div>
      <div ref="pagesRef" class="pdf-pages" tabindex="0" :aria-label="t('pdfViewer.documentPages')" @scroll.passive="updateCurrentPage">
        <div
          v-for="p in totalPages"
          :key="p"
          :data-page="p"
          class="pdf-page-wrapper"
          :style="pageStyle(p)"
        >
          <canvas :ref="(el) => setCanvasRef(p, el as HTMLCanvasElement | null)" />
          <div :ref="(el) => setTextLayerRef(p, el as HTMLDivElement | null)" class="textLayer" />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import * as pdfjsLib from 'pdfjs-dist'
import { TextLayer } from 'pdfjs-dist'
import type { PDFDocumentProxy, PDFDocumentLoadingTask, RenderTask } from 'pdfjs-dist'
import type { TextContent, TextItem } from 'pdfjs-dist/types/src/display/api'
import { IconLeft, IconMinus, IconPlus, IconRight } from '@arco-design/web-vue/es/icon'
import { useI18n } from 'vue-i18n'
import { FILE_REQUEST_TIMEOUT_MS, loadPdfSource } from '@/api/files'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href

const props = defineProps<{ fileUrl: string; fileId?: string | null }>()
const { t } = useI18n()

const pdfDoc = shallowRef<PDFDocumentProxy | null>(null)
const totalPages = ref(0)
const currentPage = ref(1)
const isLoading = ref(true)
const loadError = ref<string | null>(null)
const pagesRef = ref<HTMLElement | null>(null)
interface PageSize { width: number; height: number }
interface Match { start: number; end: number }
const pageSizes = ref(new Map<number, PageSize>())
const searchQuery = ref('')
const matches = shallowRef<Match[]>([])
const selectedMatch = ref(0)
const readyPages = ref(new Set<number>())
const pageText = new Map<number, TextContent>()
let highlightedPage: number | null = null

// zoom: 100% = fit to container width
const zoom = ref(100)
// baseScale: the scale needed to fit the page to container width
const baseScale = ref(1)
// intrinsic page width at scale=1
let intrinsicPageWidth = 0

// effective scale = baseScale * (zoom / 100)
const effectiveScale = (): number => baseScale.value * (zoom.value / 100)
const pageStyle = (page: number): Record<string, string> => {
  const size = pageSizes.value.get(page) ?? pageSizes.value.get(1) ?? { width: 600, height: 800 }
  return { width: `${size.width * effectiveScale()}px`, height: `${size.height * effectiveScale()}px` }
}

const canvasRefs = new Map<number, HTMLCanvasElement>()
const textLayerRefs = new Map<number, HTMLDivElement>()
const renderedPages = new Set<number>()
const textLayers = new Map<number, TextLayer>()

let observer: IntersectionObserver | null = null
let scaleTimer: ReturnType<typeof setTimeout> | null = null
let loadTimer: ReturnType<typeof setTimeout> | null = null
let resizeObserver: ResizeObserver | null = null
let loadingTask: PDFDocumentLoadingTask | null = null
let controller: AbortController | null = null
let loadVersion = 0
let renderVersion = 0
let disposed = false
const renderTasks = new Map<number, RenderTask>()

const searchStatus = computed((): string => {
  if (!searchQuery.value.trim()) return t('pdfViewer.searchIdle')
  if (!readyPages.value.has(currentPage.value)) return t('pdfViewer.searchLoading')
  const content = pageText.get(currentPage.value)
  if (!content?.items.some(item => 'str' in item && item.str.trim())) return t('pdfViewer.noText')
  if (!matches.value.length) return t('pdfViewer.noMatches')
  return t('pdfViewer.matchCount', { current: selectedMatch.value + 1, total: matches.value.length })
})

const clearHighlights = (): void => {
  if (highlightedPage === null) return
  const content = pageText.get(highlightedPage)
  const layer = textLayers.get(highlightedPage)
  if (content && layer) content.items.forEach((item, i) => {
    const div = layer.textDivs[i]
    if (div && 'str' in item) div.textContent = item.str
  })
  highlightedPage = null
}

const selectMatch = (index: number, scroll: boolean): void => {
  const layer = textLayers.get(currentPage.value)
  const match = matches.value[index]
  if (!layer || !match) return
  selectedMatch.value = index
  textLayerRefs.get(currentPage.value)?.querySelectorAll('.highlight.selected').forEach(el => el.classList.remove('selected'))
  let target: HTMLElement | undefined
  textLayerRefs.get(currentPage.value)?.querySelectorAll<HTMLElement>(`[data-match="${index}"]`).forEach(el => {
    el.classList.add('selected')
    target ??= el
  })
  if (scroll) target?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

const refreshSearch = (): void => {
  clearHighlights()
  matches.value = []
  selectedMatch.value = 0
  const query = searchQuery.value.trim()
  const page = currentPage.value
  const content = pageText.get(page)
  const layer = textLayers.get(page)
  if (!query || !readyPages.value.has(page) || !content || !layer) return
  const items = content.items as TextItem[]
  // Search the same normalized strings PDF.js uses for its selectable text layer.
  // Add line separators for Latin text, but not between CJK characters.
  const starts: number[] = []
  let text = ''
  items.forEach(item => {
    starts.push(text.length)
    text += item.str
    // PDF.js can put the line break in a separate empty text item.
    if (item.hasEOL && text && !/[\s\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]$/u.test(text.slice(-2))) text += ' '
  })
  // Escape metacharacters: user input is literal text, never a regular expression.
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu')
  matches.value = Array.from(text.matchAll(pattern), match => ({ start: match.index, end: match.index + match[0].length }))
  let matchIndex = 0
  items.forEach((item, i) => {
    const div = layer.textDivs[i]
    if (!div) return
    const start = starts[i]!
    const end = start + item.str.length
    while (matchIndex < matches.value.length && matches.value[matchIndex]!.end <= start) matchIndex++
    const nodes: Node[] = []
    let offset = 0
    for (let j = matchIndex; j < matches.value.length && matches.value[j]!.start < end; j++) {
      const match = matches.value[j]!
      const from = Math.max(start, match.start) - start
      const to = Math.min(end, match.end) - start
      nodes.push(document.createTextNode(item.str.slice(offset, from)))
      const mark = document.createElement('span')
      mark.className = 'highlight appended'
      mark.dataset.match = String(j)
      mark.textContent = item.str.slice(from, to)
      nodes.push(mark)
      offset = to
    }
    nodes.push(document.createTextNode(item.str.slice(offset)))
    div.replaceChildren(...nodes)
  })
  highlightedPage = page
  selectMatch(0, false)
}

const moveMatch = (direction: number): void => {
  const count = matches.value.length
  if (count) selectMatch((selectedMatch.value + direction + count) % count, true)
}

watch([searchQuery, currentPage, () => readyPages.value.has(currentPage.value)], refreshSearch, { flush: 'post' })

const resetDocument = (): void => {
  renderVersion += 1
  controller?.abort()
  observer?.disconnect()
  resizeObserver?.disconnect()
  if (scaleTimer) clearTimeout(scaleTimer)
  if (loadTimer) clearTimeout(loadTimer)
  renderTasks.forEach((task) => task.cancel())
  renderTasks.clear()
  textLayers.forEach((layer) => layer.cancel())
  textLayers.clear()
  renderedPages.clear()
  readyPages.value = new Set()
  pageText.clear()
  pageSizes.value.clear()
  highlightedPage = null
  matches.value = []
  searchQuery.value = ''
  if (loadingTask) void loadingTask.destroy().catch(() => undefined)
  loadingTask = null
  pdfDoc.value = null
  intrinsicPageWidth = 0
}

const setCanvasRef = (page: number, el: HTMLCanvasElement | null): void => {
  if (el) canvasRefs.set(page, el)
  else canvasRefs.delete(page)
}

const setTextLayerRef = (page: number, el: HTMLDivElement | null): void => {
  if (el) textLayerRefs.set(page, el)
  else textLayerRefs.delete(page)
}

const computeBaseScale = (): void => {
  if (!intrinsicPageWidth || !pagesRef.value) return
  const containerWidth = pagesRef.value.clientWidth - 32 // 16px padding each side
  if (containerWidth <= 0) return
  baseScale.value = containerWidth / intrinsicPageWidth
}

const loadPdf = async (): Promise<void> => {
  const version = ++loadVersion
  resetDocument()
  const currentController = new AbortController()
  controller = currentController
  isLoading.value = true
  loadError.value = null
  totalPages.value = 0
  currentPage.value = 1
  zoom.value = 100
  const timeout = setTimeout(() => {
    if (version !== loadVersion || disposed) return
    currentController.abort()
    if (loadingTask) void loadingTask.destroy().catch(() => undefined)
    loadError.value = t('pdfViewer.loadFailed')
    isLoading.value = false
  }, FILE_REQUEST_TIMEOUT_MS)
  loadTimer = timeout
  try {
    const source = await loadPdfSource(props.fileUrl, props.fileId, currentController.signal)
    if (version !== loadVersion || disposed || currentController.signal.aborted) return
    loadingTask = pdfjsLib.getDocument(source)
    const doc = await loadingTask.promise
    if (version !== loadVersion || disposed || currentController.signal.aborted) return
    pdfDoc.value = doc
    totalPages.value = doc.numPages

    // Get intrinsic page size (scale=1)
    const firstPage = await doc.getPage(1)
    if (version !== loadVersion || disposed || currentController.signal.aborted) return
    const baseVp = firstPage.getViewport({ scale: 1 })
    intrinsicPageWidth = baseVp.width
    pageSizes.value.set(1, { width: baseVp.width, height: baseVp.height })

    isLoading.value = false
    await nextTick()
    if (version !== loadVersion || disposed) return

    // Compute fit-to-width scale
    computeBaseScale()
    await nextTick()
    if (version !== loadVersion || disposed) return
    void renderPage(1)
    setupObserver()
    setupResizeObserver()
  } catch {
    if (version !== loadVersion || disposed) return
    // Library/network errors can include signed URLs. Never render their raw messages.
    loadError.value = t('pdfViewer.loadFailed')
    isLoading.value = false
  } finally {
    clearTimeout(timeout)
  }
}

const renderPage = async (pageNum: number): Promise<void> => {
  const doc = pdfDoc.value
  const version = loadVersion
  const rendering = renderVersion
  const canvas = canvasRefs.get(pageNum)
  const textLayerDiv = textLayerRefs.get(pageNum)
  if (!doc || !canvas || !textLayerDiv || renderedPages.has(pageNum)) return

  renderedPages.add(pageNum)

  try {
    const page = await doc.getPage(pageNum)
    if (disposed || version !== loadVersion || rendering !== renderVersion || doc !== pdfDoc.value) return
    const scale = effectiveScale()
    const viewport = page.getViewport({ scale })
    textLayerDiv.style.setProperty('--total-scale-factor', String(viewport.scale * viewport.userUnit))
    const size = page.getViewport({ scale: 1 })
    pageSizes.value.set(pageNum, { width: size.width, height: size.height })
    const outputScale = window.devicePixelRatio || 1

    canvas.width = Math.floor(viewport.width * outputScale)
    canvas.height = Math.floor(viewport.height * outputScale)
    canvas.style.width = Math.floor(viewport.width) + 'px'
    canvas.style.height = Math.floor(viewport.height) + 'px'

    const ctx = canvas.getContext('2d')!
    const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined
    const renderTask = page.render({
      canvas: null,
      canvasContext: ctx,
      viewport,
      transform,
    })
    renderTasks.set(pageNum, renderTask)
    await renderTask.promise
    if (disposed || version !== loadVersion || rendering !== renderVersion || renderTasks.get(pageNum) !== renderTask) return
    renderTasks.delete(pageNum)

    // Render text layer for text selection
    const prevTextLayer = textLayers.get(pageNum)
    if (prevTextLayer) prevTextLayer.cancel()
    textLayerDiv.replaceChildren()

    const rawContent = pageText.get(pageNum) ?? await page.getTextContent()
    if (disposed || version !== loadVersion || rendering !== renderVersion || doc !== pdfDoc.value) return
    const textContent = { ...rawContent, items: rawContent.items.filter((item): item is TextItem => 'str' in item) }
    const textLayer = new TextLayer({
      textContentSource: textContent,
      container: textLayerDiv,
      viewport,
    })
    textLayers.set(pageNum, textLayer)
    await textLayer.render()
    if (disposed || version !== loadVersion || rendering !== renderVersion || textLayers.get(pageNum) !== textLayer) return
    pageText.set(pageNum, textContent)
    readyPages.value = new Set([...readyPages.value, pageNum])
  } catch (error: unknown) {
    if (disposed || version !== loadVersion || rendering !== renderVersion) return
    if (error instanceof Error && error.name === 'RenderingCancelledException') return
    renderedPages.delete(pageNum)
    loadError.value = t('pdfViewer.loadFailed')
  }
}

const setupObserver = (): void => {
  observer?.disconnect()
  const container = pagesRef.value
  if (!container) return

  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const p = Number((entry.target as HTMLElement).dataset.page)
        if (!p) continue
        if (entry.isIntersecting) {
          void renderPage(p)
          if (p > 1) void renderPage(p - 1)
          if (p < totalPages.value) void renderPage(p + 1)
        }
      }
    },
    { root: container, rootMargin: '200px 0px', threshold: 0.1 },
  )

  container.querySelectorAll('.pdf-page-wrapper').forEach((el) => {
    observer!.observe(el)
  })
}

const setupResizeObserver = (): void => {
  const container = pagesRef.value
  if (!container) return
  let previousWidth = container.clientWidth
  resizeObserver = new ResizeObserver(() => {
    const width = container.clientWidth
    // Rendering changes the container height. Only width changes affect fit-to-width.
    if (width === previousWidth) return
    previousWidth = width
    scheduleRerender()
  })
  resizeObserver.observe(container)
}

const updateCurrentPage = (): void => {
  const container = pagesRef.value
  if (!container) return
  const top = container.getBoundingClientRect().top + 32
  let nearest = currentPage.value
  let distance = Infinity
  container.querySelectorAll<HTMLElement>('[data-page]').forEach(el => {
    const rect = el.getBoundingClientRect()
    const gap = rect.top <= top && rect.bottom > top ? 0 : Math.abs(rect.top - top)
    if (gap < distance) { distance = gap; nearest = Number(el.dataset.page) }
  })
  currentPage.value = nearest
}

const goPage = (page: number): void => {
  if (page < 1 || page > totalPages.value) return
  currentPage.value = page
  void renderPage(page)
  const el = pagesRef.value?.querySelector(`[data-page="${page}"]`)
  el?.scrollIntoView({ block: 'start', inline: 'nearest' })
}

const changeZoom = (delta: number): void => {
  zoom.value = Math.max(50, Math.min(300, zoom.value + delta))
}

const rerender = async (): Promise<void> => {
  if (!pdfDoc.value || !intrinsicPageWidth) return
  const version = loadVersion
  const rendering = ++renderVersion
  const page = currentPage.value
  computeBaseScale()

  clearHighlights()
  readyPages.value = new Set()
  renderedPages.clear()
  renderTasks.forEach((task) => task.cancel())
  renderTasks.clear()
  textLayers.forEach((tl) => tl.cancel())
  textLayers.clear()
  await nextTick()
  if (disposed || version !== loadVersion || rendering !== renderVersion) return
  goPage(page)
  setupObserver()
}

const scheduleRerender = (): void => {
  if (scaleTimer) clearTimeout(scaleTimer)
  scaleTimer = setTimeout(() => { void rerender().catch(() => undefined) }, 200)
}

watch(zoom, scheduleRerender)
watch(() => [props.fileUrl, props.fileId], () => { void loadPdf() }, { immediate: true })

onBeforeUnmount(() => {
  disposed = true
  loadVersion += 1
  resetDocument()
})
</script>

<style lang="sass" scoped>
.pdf-viewer
  border: 1px solid #e5e7eb
  border-radius: 10px
  overflow: hidden
  background: #f0f1f3

.pdf-status
  display: flex
  align-items: center
  justify-content: center
  gap: 10px
  padding: 48px 20px
  font-size: 14px
  color: #666

.pdf-status--error
  color: #e53e3e
  flex-wrap: wrap
  text-align: center
  overflow-wrap: anywhere

.pdf-retry
  border: 1px solid currentColor
  border-radius: 6px
  padding: 6px 12px
  color: inherit
  background: transparent
  cursor: pointer

.pdf-toolbar
  display: flex
  align-items: center
  justify-content: center
  gap: 8px
  padding: 8px 16px
  background: #fff
  border-bottom: 1px solid #e5e7eb
  position: sticky
  top: 0
  z-index: 5
  flex-wrap: wrap

.pdf-search
  display: flex
  flex-wrap: wrap
  align-items: center
  gap: 8px 16px
  padding: 12px 16px
  background: #fff
  border-bottom: 1px solid #e5e7eb

.pdf-search-field
  display: flex
  align-items: center
  gap: 8px
  flex: 1 1 240px
  min-width: 0
  font-size: 13px
  color: #4a5565

  span
    flex-shrink: 0

  input
    width: 100%
    min-width: 0
    padding: 8px 10px
    border: 1px solid #cbd5e1
    border-radius: 6px
    font: inherit

.pdf-search-actions
  display: flex
  align-items: center
  gap: 4px
  flex-wrap: wrap

.pdf-match-count
  font-size: 12px
  color: #4a5565
  font-variant-numeric: tabular-nums

.pdf-clear
  border: none
  background: transparent
  color: #475569
  cursor: pointer
  padding: 8px

  &:disabled
    opacity: 0.4
    cursor: default

.pdf-search-hint
  flex-basis: 100%
  margin: 0
  font-size: 12px
  line-height: 1.5
  color: #64748b

.pdf-viewer :is(button, input, .pdf-pages):focus-visible
  outline: 2px solid #2563eb
  outline-offset: 2px

.pdf-tool-btn
  width: 36px
  height: 36px
  border: none
  border-radius: 6px
  background: transparent
  color: #4a5565
  cursor: pointer
  display: flex
  align-items: center
  justify-content: center
  transition: background 0.15s

  &:hover:not(:disabled)
    background: #f3f4f6

  &:disabled
    opacity: 0.3
    cursor: not-allowed

.pdf-page-info,
.pdf-scale-info
  font-size: 13px
  color: #4a5565
  font-variant-numeric: tabular-nums
  min-width: 56px
  text-align: center

.pdf-toolbar-sep
  width: 1px
  height: 20px
  background: #e5e7eb

.pdf-tool-group
  display: flex
  align-items: center
  gap: 4px

.pdf-pages
  max-height: 80vh
  overflow-y: auto
  padding: 16px
  display: flex
  flex-direction: column
  align-items: flex-start

.pdf-page-wrapper
  flex-shrink: 0
  // Auto margins center small pages without clipping the left edge when zoomed.
  margin-left: auto
  margin-right: auto
  margin-bottom: 12px
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1)
  background: #fff
  line-height: 0
  position: relative

  canvas
    display: block
</style>

<style lang="sass">
// textLayer styles (non-scoped for pdfjs-generated DOM)
.pdf-page-wrapper .textLayer
  position: absolute
  text-align: initial
  inset: 0
  overflow: clip
  opacity: 1
  line-height: 1
  -webkit-text-size-adjust: none
  -moz-text-size-adjust: none
  text-size-adjust: none
  forced-color-adjust: none
  transform-origin: 0 0
  caret-color: CanvasText
  z-index: 1
  --min-font-size: 1
  --text-scale-factor: calc(var(--total-scale-factor) * var(--min-font-size))
  --min-font-size-inv: calc(1 / var(--min-font-size))

.pdf-page-wrapper .textLayer > :not(.markedContent),
.pdf-page-wrapper .textLayer .markedContent span:not(.markedContent)
  z-index: 1
  --font-height: 0
  font-size: calc(var(--text-scale-factor) * var(--font-height))
  --scale-x: 1
  --rotate: 0deg
  transform: rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv))

.pdf-page-wrapper .textLayer .markedContent
  display: contents

.pdf-page-wrapper .textLayer :is(span, br)
  color: transparent
  position: absolute
  white-space: pre
  cursor: text
  transform-origin: 0% 0%

.pdf-page-wrapper .textLayer span[role="img"]
  user-select: none
  cursor: default

.pdf-page-wrapper .textLayer ::selection
  background: rgba(0, 100, 200, 0.3)

.pdf-page-wrapper .textLayer .highlight.appended
  position: static
  background: rgba(250, 204, 21, 0.45)
  border-radius: 2px

  &.selected
    background: rgba(249, 115, 22, 0.55)
    outline: 1px solid #c2410c
</style>
