<template>
  <section class="review-flow" :aria-label="t('reviewProgress.title')">
    <p v-if="preview" class="preview-label">{{ t('reviewProgress.preview') }}</p>
    <div class="flow-toolbar">
      <div class="view-switch">
        <a-button :type="view === 'graph' ? 'primary' : 'secondary'" :aria-pressed="view === 'graph'" @click="view = 'graph'">{{ t('reviewProgress.graph') }}</a-button>
        <a-button :type="view === 'list' ? 'primary' : 'secondary'" :aria-pressed="view === 'list'" @click="view = 'list'">{{ t('reviewProgress.list') }}</a-button>
      </div>
      <div v-if="view === 'graph'" class="canvas-tools">
        <a-button :aria-label="t('reviewProgress.zoomOut')" @click="zoomOut()">−</a-button>
        <a-button :aria-label="t('reviewProgress.zoomIn')" @click="zoomIn()">+</a-button>
        <a-button @click="fitView({ padding: 0.15, maxZoom: 1 })">{{ t('reviewProgress.fit') }}</a-button>
      </div>
    </div>
    <p class="flow-hint">{{ t(preview ? 'reviewProgress.previewHint' : 'reviewProgress.graphHint') }}</p>
    <div v-if="view === 'graph'" ref="canvas" class="flow-canvas">
      <VueFlow :id="flowId" :nodes="diagram.nodes" :edges="diagram.edges" :nodes-draggable="false" :nodes-connectable="false" :edges-updatable="false" :elements-selectable="false" :zoom-on-scroll="false" :prevent-scrolling="false" :min-zoom="0.1" :max-zoom="1.5" fit-view-on-init>
        <template #node-review="{ data }">
          <Handle type="target" :position="Position.Left" class="flow-handle" />
          <component :is="data.selectable ? 'button' : 'div'" class="flow-node nodrag" :class="[tone(data.alert ? 'blocked' : data.status), { 'stage-node': data.stage }]" :title="`${data.label}\n${data.detail}`" @click="data.selectable && emit('select', data.id)">
            <span class="node-status">{{ data.alert || statusLabel(data.status) }}</span>
            <strong>{{ data.label }}</strong>
            <span class="node-detail">{{ data.detail }}</span>
          </component>
          <Handle type="source" :position="Position.Right" class="flow-handle" />
        </template>
      </VueFlow>
    </div>
    <ol v-else class="flow-list">
      <li v-for="stage in stages" :key="stage.id" class="list-stage" :class="tone(stage.status)">
        <h3>{{ stage.label }} <span>{{ statusLabel(stage.status) }}</span></h3>
        <p>{{ stage.detail }}</p>
        <ul v-if="stage.tasks.length">
          <li v-for="task in stage.tasks" :key="task.id">
            <component :is="task.selectable ? 'button' : 'div'" class="list-task" @click="task.selectable && emit('select', task.id)">
              <strong>{{ task.label }}</strong><span>{{ task.alert || statusLabel(task.status) }}</span><p>{{ task.detail }}</p>
            </component>
          </li>
        </ul>
      </li>
    </ol>
  </section>
</template>
<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { VueFlow, Handle, Position, useVueFlow } from '@vue-flow/core'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import { layoutReviewFlow, type ReviewFlowStage } from '@/utils/review-flow'
const props = defineProps<{ stages: ReviewFlowStage[]; preview?: boolean }>()
const emit = defineEmits<{ select: [id: string] }>()
const { t, te } = useI18n()
const flowId = `review-${useId()}`
const { fitView, zoomIn, zoomOut } = useVueFlow(flowId)
const view = ref<'graph' | 'list'>(typeof matchMedia === 'function' && matchMedia('(max-width: 760px)').matches ? 'list' : 'graph')
const canvas = ref<HTMLElement | null>(null)
const diagram = computed(() => layoutReviewFlow(props.stages))
const statusLabel = (value: string): string => te(`reviewProgress.states.${value}`) ? t(`reviewProgress.states.${value}`) : t('reviewProgress.states.unknown')
const tone = (status: string): string => status === 'approved' ? 'is-approved' : status === 'pending' ? 'is-pending' : ['changes_requested', 'failed', 'rejected', 'blocked'].includes(status) ? 'is-blocked' : 'is-muted'
let observer: ResizeObserver | undefined
let frame = 0
const fit = (): void => {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => { void fitView({ padding: 0.15, maxZoom: 1 }) })
}
watch([diagram, view], async () => { await nextTick(); if (view.value === 'graph') fit() })
watch(canvas, element => {
  observer?.disconnect()
  if (element && typeof ResizeObserver !== 'undefined') { observer = new ResizeObserver(fit); observer.observe(element) }
})
onUnmounted(() => { observer?.disconnect(); cancelAnimationFrame(frame) })
</script>
<style scoped>
.review-flow { min-width: 0; }
.flow-toolbar, .view-switch, .canvas-tools { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.flow-toolbar { justify-content: space-between; }
.flow-hint { color: var(--color-text-3); font-size: 13px; line-height: 1.6; }
.preview-label { color: var(--color-text-2); font-weight: 600; }
.flow-canvas { height: clamp(360px, 52vh, 600px); border: 1px solid var(--color-border-2); border-radius: 12px; background: var(--color-fill-1); }
.flow-node { box-sizing: border-box; width: 240px; height: 142px; border: 1px solid var(--color-border-3); border-left: 4px solid var(--color-text-4); border-radius: 10px; background: var(--color-bg-2); padding: 12px 16px; color: var(--color-text-1); text-align: left; display: flex; flex-direction: column; gap: 8px; font: inherit; }
/* Read-only Vue Flow wrappers disable pointer events; explicit task buttons remain interactive. */
button.flow-node, button.list-task { cursor: pointer; pointer-events: auto; }
.is-blocked .node-status { color: rgb(var(--danger-6)); }
button:focus-visible { outline: 3px solid rgb(var(--primary-6)); outline-offset: 3px; }
.flow-node strong, .node-detail { overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow-wrap: anywhere; line-height: 1.5; }
.node-status { font-size: 12px; color: var(--color-text-2); }
.node-detail { font-size: 12px; color: var(--color-text-3); }
.stage-node { background: var(--color-fill-2); }
.flow-handle { opacity: 0; pointer-events: none; }
.is-approved { border-left-color: rgb(var(--success-6)); }
.is-pending { border-left-color: rgb(var(--primary-6)); }
.is-blocked { border-left-color: rgb(var(--danger-6)); }
.flow-list { padding-left: 24px; }
.list-stage { padding: 12px 16px; margin: 16px 0; border-left: 3px solid var(--color-border-3); background: var(--color-fill-1); border-radius: 8px; }
.list-stage.is-pending { border-left-color: rgb(var(--primary-6)); }
.list-stage.is-approved { border-left-color: rgb(var(--success-6)); }
.list-stage h3 { margin: 0; font-size: 15px; }
.list-stage h3 span { font-size: 12px; font-weight: 400; margin-left: 8px; }
.list-stage ul { list-style: none; padding: 0; display: grid; gap: 8px; }
.list-task { box-sizing: border-box; display: flex; flex-wrap: wrap; gap: 6px 12px; width: 100%; text-align: left; color: inherit; font: inherit; padding: 12px; border: 1px solid var(--color-border-2); border-radius: 8px; background: var(--color-bg-2); overflow-wrap: anywhere; }
.list-task span { margin-left: auto; font-size: 12px; max-width: 100%; }
.list-task p { flex: 0 0 100%; margin: 0; font-size: 13px; }
</style>
