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
        <button class="pdf-tool-btn" :disabled="currentPage <= 1" @click="goPage(currentPage - 1)">
          <IconLeft />
        </button>
        <span class="pdf-page-info">{{ currentPage }} / {{ totalPages }}</span>
        <button class="pdf-tool-btn" :disabled="currentPage >= totalPages" @click="goPage(currentPage + 1)">
          <IconRight />
        </button>
        <span class="pdf-toolbar-sep" />
        <button class="pdf-tool-btn" :disabled="zoom <= 50" @click="changeZoom(-20)">
          <IconMinus />
        </button>
        <span class="pdf-scale-info">{{ zoom }}%</span>
        <button class="pdf-tool-btn" :disabled="zoom >= 300" @click="changeZoom(20)">
          <IconPlus />
        </button>
      </div>
      <div ref="pagesRef" class="pdf-pages">
        <div
          v-for="p in totalPages"
          :key="p"
          :data-page="p"
          class="pdf-page-wrapper"
          :style="{ width: pageWidth + 'px', height: pageHeight + 'px' }"
        >
          <canvas :ref="(el) => setCanvasRef(p, el as HTMLCanvasElement | null)" />
          <div :ref="(el) => setTextLayerRef(p, el as HTMLDivElement | null)" class="textLayer" />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import * as pdfjsLib from 'pdfjs-dist'
import { TextLayer } from 'pdfjs-dist'
import type { PDFDocumentProxy, PDFDocumentLoadingTask, RenderTask } from 'pdfjs-dist'
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
const pageWidth = ref(600)
const pageHeight = ref(800)

// zoom: 100% = fit to container width
const zoom = ref(100)
// baseScale: the scale needed to fit the page to container width
let baseScale = 1
// intrinsic page width at scale=1
let intrinsicPageWidth = 0

// effective scale = baseScale * (zoom / 100)
function effectiveScale() {
  return baseScale * (zoom.value / 100)
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
  if (loadingTask) void loadingTask.destroy().catch(() => undefined)
  loadingTask = null
  pdfDoc.value = null
  intrinsicPageWidth = 0
}

function setCanvasRef(page: number, el: HTMLCanvasElement | null) {
  if (el) canvasRefs.set(page, el)
  else canvasRefs.delete(page)
}

function setTextLayerRef(page: number, el: HTMLDivElement | null) {
  if (el) textLayerRefs.set(page, el)
  else textLayerRefs.delete(page)
}

function computeBaseScale() {
  if (!intrinsicPageWidth || !pagesRef.value) return
  const containerWidth = pagesRef.value.clientWidth - 32 // 16px padding each side
  if (containerWidth <= 0) return
  baseScale = containerWidth / intrinsicPageWidth
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
    const intrinsicRatio = baseVp.height / baseVp.width

    isLoading.value = false
    await nextTick()
    if (version !== loadVersion || disposed) return

    // Compute fit-to-width scale
    computeBaseScale()
    const s = effectiveScale()
    pageWidth.value = intrinsicPageWidth * s
    pageHeight.value = intrinsicPageWidth * s * intrinsicRatio

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

watch(() => [props.fileUrl, props.fileId], () => { void loadPdf() }, { immediate: true })

async function renderPage(pageNum: number) {
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
    textLayerDiv.innerHTML = ''

    const textContent = await page.getTextContent()
    if (disposed || version !== loadVersion || rendering !== renderVersion || doc !== pdfDoc.value) return
    const textLayer = new TextLayer({
      textContentSource: textContent,
      container: textLayerDiv,
      viewport,
    })
    textLayers.set(pageNum, textLayer)
    await textLayer.render()
  } catch (error: unknown) {
    if (disposed || version !== loadVersion || rendering !== renderVersion) return
    if (error instanceof Error && error.name === 'RenderingCancelledException') return
    renderedPages.delete(pageNum)
    loadError.value = t('pdfViewer.loadFailed')
  }
}

function setupObserver() {
  observer?.disconnect()
  const container = pagesRef.value
  if (!container) return

  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const p = Number((entry.target as HTMLElement).dataset.page)
        if (!p) continue
        if (entry.isIntersecting) {
          currentPage.value = p
          renderPage(p)
          if (p > 1) renderPage(p - 1)
          if (p < totalPages.value) renderPage(p + 1)
        }
      }
    },
    { root: container, rootMargin: '200px 0px', threshold: 0.1 },
  )

  container.querySelectorAll('.pdf-page-wrapper').forEach((el) => {
    observer!.observe(el)
  })
}

function setupResizeObserver() {
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

function goPage(page: number) {
  const el = pagesRef.value?.querySelector(`[data-page="${page}"]`)
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function changeZoom(delta: number) {
  zoom.value = Math.max(50, Math.min(300, zoom.value + delta))
}

async function rerender() {
  if (!pdfDoc.value || !intrinsicPageWidth) return
  const version = loadVersion
  const rendering = ++renderVersion
  const doc = pdfDoc.value
  computeBaseScale()
  const s = effectiveScale()
  const firstPage = await doc.getPage(1)
  if (disposed || version !== loadVersion || rendering !== renderVersion || doc !== pdfDoc.value) return
  const vp = firstPage.getViewport({ scale: s })
  pageWidth.value = vp.width
  pageHeight.value = vp.height

  renderedPages.clear()
  renderTasks.forEach((task) => task.cancel())
  renderTasks.clear()
  textLayers.forEach((tl) => tl.cancel())
  textLayers.clear()
  await nextTick()
  if (disposed || version !== loadVersion || rendering !== renderVersion) return
  setupObserver()
}

function scheduleRerender(): void {
  if (scaleTimer) clearTimeout(scaleTimer)
  scaleTimer = setTimeout(() => { void rerender().catch(() => undefined) }, 200)
}

watch(zoom, scheduleRerender)

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

.pdf-tool-btn
  width: 28px
  height: 28px
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
  margin: 0 4px

.pdf-pages
  max-height: 80vh
  overflow-y: auto
  padding: 16px
  display: flex
  flex-direction: column
  align-items: center

.pdf-page-wrapper
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
</style>
