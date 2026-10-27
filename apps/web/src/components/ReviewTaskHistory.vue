<template>
  <p v-if="error" role="alert">{{ error }}</p>
  <p v-if="loading" role="status">{{ $t('common.loading') }}</p>
  <ReviewHistory :events="events" />
  <a-button v-if="nextOffset !== null || error" :loading="loading" @click="load(nextOffset ?? 0)">{{ $t('reviewProgress.moreHistory') }}</a-button>
</template>
<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import { loadProgressHistory, type ProgressEvent } from '@/api/review-progress'
import ReviewHistory from './ReviewHistory.vue'
const props = defineProps<{ caseId: string; taskId: string; roundNumber: number }>()
const events = ref<ProgressEvent[]>([])
const nextOffset = ref<number | null>(null)
const loading = ref(false)
const error = ref('')
let controller: AbortController | null = null
const load = async (offset = 0): Promise<void> => {
  controller?.abort()
  const current = new AbortController()
  controller = current
  loading.value = true
  error.value = ''
  if (!offset) events.value = []
  try {
    const result = await loadProgressHistory(props.caseId, props.roundNumber, offset, current.signal, props.taskId)
    if (current.signal.aborted) return
    events.value = [...new Map([...events.value, ...result.items].map(item => [item.id, item])).values()]
    nextOffset.value = result.nextOffset
  } catch (cause) { if (!current.signal.aborted) error.value = cause instanceof Error ? cause.message : String(cause) }
  finally { if (current === controller) loading.value = false }
}
watch(() => [props.caseId, props.taskId, props.roundNumber], () => { nextOffset.value = null; void load() }, { immediate: true })
onUnmounted(() => controller?.abort())
</script>
