import { onUnmounted, ref, watch, type Ref } from 'vue'
import { loadProgress, loadProgressHistory, loadProgressTasks, type ReviewProgress, type ProgressEvent, type ProgressStage } from '@/api/review-progress'

interface ReviewProgressState {
  data: Ref<ReviewProgress | null>; history: Ref<ProgressEvent[]>; nextHistory: Ref<number | null>
  loading: Ref<boolean>; paging: Ref<boolean>; error: Ref<string>
  load: (roundNumber?: number) => Promise<void>
  moreHistory: () => Promise<void>; moreRounds: () => Promise<void>; moreTasks: (stage: ProgressStage) => Promise<void>
}
export const useReviewProgress = (caseId: Ref<string>): ReviewProgressState => {
  const data = ref<ReviewProgress | null>(null)
  const history = ref<ProgressEvent[]>([])
  const nextHistory = ref<number | null>(null)
  const loading = ref(false)
  const paging = ref(false)
  const error = ref('')
  let controller: AbortController | null = null
  const load = async (roundNumber?: number): Promise<void> => {
    controller?.abort()
    const current = new AbortController()
    controller = current
    loading.value = true
    paging.value = false
    error.value = ''
    data.value = null
    history.value = []
    try {
      const result = await loadProgress(caseId.value, roundNumber, current.signal)
      if (current.signal.aborted) return
      const events = await loadProgressHistory(caseId.value, result.round?.number, 0, current.signal)
      if (current.signal.aborted) return
      data.value = result
      history.value = events.items
      nextHistory.value = events.nextOffset
    } catch (cause) { if (!current.signal.aborted) error.value = cause instanceof Error ? cause.message : String(cause) }
    finally { if (controller === current) loading.value = false }
  }
  const page = async (action: (signal: AbortSignal) => Promise<void>): Promise<void> => {
    if (paging.value || loading.value || !controller) return
    const current = controller
    paging.value = true
    error.value = ''
    try { await action(current.signal) }
    catch (cause) { if (!current.signal.aborted) error.value = cause instanceof Error ? cause.message : String(cause) }
    finally { if (controller === current) paging.value = false }
  }
  const moreHistory = (): Promise<void> => page(async signal => {
    if (nextHistory.value === null) return
    const result = await loadProgressHistory(caseId.value, data.value?.round?.number, nextHistory.value, signal)
    if (signal.aborted) return
    history.value = [...new Map([...history.value, ...result.items].map(item => [item.id, item])).values()]
    nextHistory.value = result.nextOffset
  })
  const moreRounds = (): Promise<void> => page(async signal => {
    if (!data.value || data.value.nextRoundOffset === null) return
    const result = await loadProgress(caseId.value, data.value.round?.number, signal, data.value.nextRoundOffset)
    if (signal.aborted || !data.value) return
    data.value.rounds = [...new Map([...data.value.rounds, ...result.rounds].map(item => [item.number, item])).values()]
    data.value.nextRoundOffset = result.nextRoundOffset
  })
  const moreTasks = (stage: ProgressStage): Promise<void> => page(async signal => {
    if (stage.nextTaskOffset === null) return
    const result = await loadProgressTasks(caseId.value, stage.id, stage.nextTaskOffset, signal)
    if (signal.aborted) return
    stage.tasks = [...new Map([...stage.tasks, ...result.items].map(item => [item.id, item])).values()]
    stage.nextTaskOffset = result.nextOffset
  })
  watch(caseId, () => { void load() }, { immediate: true })
  onUnmounted(() => controller?.abort())
  return { data, history, nextHistory, loading, paging, error, load, moreHistory, moreRounds, moreTasks }
}
