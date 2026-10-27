// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref, type App } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import i18n from '@/i18n'
import * as api from '@/api/review-progress'
import ReviewProgressPanel from '@/components/ReviewProgressPanel.vue'

vi.mock('@/api/review-progress', () => ({ loadProgress: vi.fn(), loadProgressHistory: vi.fn(), loadProgressTasks: vi.fn() }))
vi.mock('@/components/ReviewFlow.vue', () => ({ default: { props: ['stages'], emits: ['select'], template: '<div><div v-for="stage in stages" :key="stage.id"><h3>{{stage.label}}</h3><button v-for="task in stage.tasks" :key="task.id" :data-task="task.id" @click="$emit(\'select\', task.id)">{{task.label}} {{task.detail}}</button></div></div>' } }))
let app: App | undefined
const caseId = ref('case-one')
const settle = async (): Promise<void> => { for (let i = 0; i < 25; i++) { await Promise.resolve(); await nextTick() } }
const task: api.ProgressTask = { id: 'task-one', kind: 'role', role: 'library_final', status: 'pending', personName: null, assignedPersonName: 'Assigned at submission', completedByName: null, nodeName: null, hasPerson: false, hasAssignee: true, hasCompletedBy: false, hasNode: false, dueAt: '2026-01-01T00:00:00.000Z', completedAt: null, overdue: true, exception: null, canAct: false, candidateNames: [], candidateCount: null }
const progress: api.ReviewProgress = { caseId: 'case-one', title: 'Frozen paper', contentType: 'paper', status: 'pending_review', currentRound: 2, viewer: 'applicant', rounds: [{ number: 2, status: 'pending_review', createdAt: null }, { number: 1, status: 'superseded', createdAt: null }], nextRoundOffset: null, round: { number: 2, versionId: 'frozen-version', status: 'pending_review', executionStatus: 'awaiting_approval', createdAt: null, completedAt: null, workflowName: 'Fixed workflow', ruleName: 'Doctoral route', ruleRevision: 3, stages: [{ id: 'stage', name: 'Library review', order: 1, status: 'pending', legacy: false, taskCount: 1, approvedCount: 0, tasks: [task], nextTaskOffset: null }] } }
const mount = async (): Promise<void> => {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] })
  await router.push('/')
  const root = document.createElement('div'); document.body.append(root)
  app = createApp(defineComponent({ setup: () => () => h(ReviewProgressPanel, { caseId: caseId.value }) }))
  app.component('AButton', { template: '<button><slot /></button>' })
  app.component('ADrawer', { props: ['visible'], template: '<aside v-if="visible"><slot /></aside>' })
  app.component('ATimeline', { template: '<ol><slot /></ol>' })
  app.component('ATimelineItem', { template: '<li><slot /></li>' })
  app.use(i18n).use(router).mount(root); await settle()
}
beforeEach(() => {
  vi.clearAllMocks(); caseId.value = 'case-one'; i18n.global.locale.value = 'en-US'
  vi.mocked(api.loadProgress).mockResolvedValue(structuredClone(progress))
  vi.mocked(api.loadProgressHistory).mockResolvedValue({ items: [{ id: 'event', action: 'task_reassigned', actorName: null, assigneeName: 'Assigned at submission', taskId: 'task-one', roundNumber: 2, stageName: 'Library review', notes: 'Verified request', createdAt: '2026-01-01T00:00:00.000Z' }], nextOffset: null })
})
afterEach(() => { app?.unmount(); app = undefined; document.body.replaceChildren() })
it('shows immutable version and pending execution separately, opens overdue task details without an approve link', async () => {
  await mount()
  expect(document.body.textContent).toContain('frozen-version')
  expect(document.body.textContent).toContain('Awaiting approval; not applied')
  document.querySelector<HTMLButtonElement>('[data-task="task-one"]')!.click(); await settle()
  const details = document.querySelector('aside')!
  expect(details.textContent).toContain('Assigned at submission')
  expect(details.textContent).toContain('Overdue')
  expect(details.textContent).toContain('Name not recorded')
  expect(details.textContent).toContain('Verified request')
  expect(details.querySelector('a')).toBeNull()
  expect(api.loadProgressHistory).toHaveBeenLastCalledWith('case-one', 2, 0, expect.any(AbortSignal), 'task-one')
})
it('selects historical rounds from the API and cancels the old load', async () => {
  await mount()
  const previous = vi.mocked(api.loadProgress).mock.calls[0]![2]!
  vi.mocked(api.loadProgress).mockResolvedValue({ ...structuredClone(progress), round: { ...structuredClone(progress.round!), number: 1, status: 'superseded', workflowName: 'Old workflow', stages: [] } })
  const select = document.querySelector('select')!; select.value = '1'; select.dispatchEvent(new Event('change')); await settle()
  expect(previous.aborted).toBe(true)
  expect(api.loadProgress).toHaveBeenLastCalledWith('case-one', 1, expect.any(AbortSignal))
  expect(document.body.textContent).toContain('Historical round')
  expect(document.body.textContent).toContain('Old workflow')
  expect(document.querySelector('aside')).toBeNull()
})
it('discards late data from another case and aborts all reads when unmounted', async () => {
  let resolveOld!: (value: api.ReviewProgress) => void
  vi.mocked(api.loadProgress).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
  await mount()
  const oldSignal = vi.mocked(api.loadProgress).mock.calls[0]![2]!
  caseId.value = 'case-two'; await settle()
  resolveOld({ ...structuredClone(progress), title: 'DO NOT DISPLAY' }); await settle()
  expect(oldSignal.aborted).toBe(true)
  expect(document.body.textContent).not.toContain('DO NOT DISPLAY')
  const calls = vi.mocked(api.loadProgress).mock.calls
  const signal = calls[calls.length - 1]![2]!
  app!.unmount(); app = undefined
  expect(signal.aborted).toBe(true)
})
it('paginates tasks and shows access failures without retaining previous case data', async () => {
  const paginated = structuredClone(progress); paginated.round!.stages[0]!.nextTaskOffset = 50
  vi.mocked(api.loadProgress).mockResolvedValue(paginated)
  vi.mocked(api.loadProgressTasks).mockResolvedValue({ items: [{ ...task, id: 'task-two' }], nextOffset: null })
  await mount()
  const more = [...document.querySelectorAll('button')].find(button => button.textContent?.includes('Load more tasks'))!; more.click(); await settle()
  expect(api.loadProgressTasks).toHaveBeenCalledWith('case-one', 'stage', 50, expect.any(AbortSignal))
  expect(document.querySelector('[data-task="task-two"]')).not.toBeNull()
  vi.mocked(api.loadProgress).mockRejectedValue(new Error('Review progress not found'))
  caseId.value = 'denied'; await settle()
  expect(document.querySelector('[role="alert"]')!.textContent).toContain('not found')
  expect(document.body.textContent).not.toContain('Frozen paper')
})
