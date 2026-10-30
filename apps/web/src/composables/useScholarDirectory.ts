import { computed, onScopeDispose, ref, watch, type Ref, type ComputedRef } from 'vue'
import { useRoute, useRouter, type LocationQuery, type LocationQueryRaw } from 'vue-router'
import { getScholarDirectory, type ScholarDirectoryData } from '@/api/scholars'

export interface DirectoryState {
  q: string
  unit: string
  subject: string
  letter: string
  sort: 'relevance' | 'name'
  page: number
}

export const parseDirectoryQuery = (query: LocationQuery): DirectoryState => {
  const value = (key: string): string => (typeof query[key] === 'string' ? query[key] : '')
  const page = Number(value('page'))
  const subject = value('subject')
  const letter = value('letter').toUpperCase()
  return {
    q: value('q').trim().slice(0, 200),
    unit: value('unit').slice(0, 512),
    subject: /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu.test(subject)
      ? subject
      : '',
    letter: /^[A-Z#]$/u.test(letter) ? letter : '',
    sort: value('sort') === 'name' ? 'name' : 'relevance',
    page: Number.isSafeInteger(page) && page >= 1 && page <= 100000 ? page : 1,
  }
}

export const directoryQuery = (state: DirectoryState): LocationQueryRaw => ({
  q: state.q || undefined,
  unit: state.unit || undefined,
  subject: state.subject || undefined,
  letter: state.letter || undefined,
  sort: state.sort === 'name' ? 'name' : undefined,
  page: state.page > 1 ? String(state.page) : undefined,
})

interface ScholarDirectoryController {
  state: ComputedRef<DirectoryState>
  query: Ref<string>
  data: Ref<ScholarDirectoryData | null>
  loading: Ref<boolean>
  failed: Ref<boolean>
  composing: Ref<boolean>
  hasFilters: ComputedRef<boolean>
  pageCount: ComputedRef<number>
  pages: ComputedRef<number[]>
  compositionEnd: () => void
  refresh: () => Promise<void>
  update: (patch: Partial<DirectoryState>, replace?: boolean) => Promise<void>
  search: () => Promise<void>
  reset: () => Promise<void>
}

export const useScholarDirectory = (institutionSlug: Ref<string>): ScholarDirectoryController => {
  const route = useRoute()
  const router = useRouter()
  const state = computed(() => parseDirectoryQuery(route.query))
  const query = ref(state.value.q)
  const data = ref<ScholarDirectoryData | null>(null)
  const loading = ref(false)
  const failed = ref(false)
  const composing = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | undefined
  let requestId = 0
  let disposed = false

  const cancelSearch = (): void => {
    if (timer) clearTimeout(timer)
    timer = undefined
  }
  const refresh = async (): Promise<void> => {
    controller?.abort()
    controller = new AbortController()
    const signal = controller.signal
    const id = ++requestId
    loading.value = true
    failed.value = false
    const current = state.value
    try {
      const result = await getScholarDirectory(
        {
          q: current.q || undefined,
          unit: current.unit || undefined,
          subject_id: current.subject || undefined,
          letter: current.letter || undefined,
          sort: current.sort,
          page: current.page,
          limit: 24,
          institution_slug: institutionSlug.value,
        },
        signal,
      )
      if (disposed || signal.aborted || id !== requestId) return
      data.value = result
      // A stale bookmark can point past the last page after directory changes.
      if (result.page !== current.page) {
        await router.replace({ query: directoryQuery({ ...current, page: result.page }) })
      }
    } catch {
      if (disposed || signal.aborted || id !== requestId) return
      data.value = null
      failed.value = true
    } finally {
      if (!disposed && id === requestId) loading.value = false
    }
  }
  const update = async (patch: Partial<DirectoryState>, replace = false): Promise<void> => {
    cancelSearch()
    const next = { ...state.value, q: query.value.trim().slice(0, 200), page: 1, ...patch }
    query.value = next.q
    if (JSON.stringify(next) === JSON.stringify(state.value)) return
    await router[replace ? 'replace' : 'push']({ query: directoryQuery(next) })
  }
  const search = async (): Promise<void> => {
    if (composing.value) return
    await update({ q: query.value.trim().slice(0, 200) }, true)
  }
  const reset = async (): Promise<void> => {
    await update({ q: '', unit: '', subject: '', letter: '', page: 1 })
  }
  watch(query, () => {
    cancelSearch()
    if (!composing.value && query.value.trim() !== state.value.q) {
      timer = setTimeout(() => {
        void search()
      }, 300)
    }
  })
  const compositionEnd = (): void => {
    composing.value = false
    cancelSearch()
    timer = setTimeout(() => {
      void search()
    }, 300)
  }
  watch(
    [state, institutionSlug],
    (_current, previous) => {
      cancelSearch()
      query.value = state.value.q
      if (previous && previous[1] !== institutionSlug.value) data.value = null
      void refresh()
    },
    { immediate: true },
  )
  onScopeDispose(() => {
    disposed = true
    cancelSearch()
    controller?.abort()
  })
  const hasFilters = computed(() =>
    Boolean(state.value.q || state.value.unit || state.value.subject || state.value.letter),
  )
  const pageCount = computed(() => Math.max(1, Math.ceil((data.value?.total ?? 0) / 24)))
  const pages = computed(() => {
    const current = data.value?.page ?? state.value.page
    return [...new Set([1, current - 1, current, current + 1, pageCount.value])]
      .filter((page) => page >= 1 && page <= pageCount.value)
      .sort((a, b) => a - b)
  })
  return {
    state,
    query,
    data,
    loading,
    failed,
    composing,
    compositionEnd,
    hasFilters,
    pageCount,
    pages,
    refresh,
    update,
    search,
    reset,
  }
}
