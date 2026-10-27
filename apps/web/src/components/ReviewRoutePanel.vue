<template>
  <section class="route-panel">
    <h2>{{ t('routing.title') }}</h2>
    <p>{{ t('routing.notice') }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <form class="settings" @submit.prevent="save">
      <h3>{{ t('routing.edit') }}</h3>
      <label
        >{{ t('routing.key')
        }}<input
          v-model="form.key"
          required
          pattern="[a-z0-9][a-z0-9_-]{0,63}"
          :disabled="form.expectedRevision > 0"
      /></label>
      <label>{{ t('routing.name') }}<input v-model="form.name" required maxlength="100" /></label>
      <label
        >{{ t('routing.contentType')
        }}<select v-model="form.contentType">
          <option value="paper">{{ t('governance.paper') }}</option>
          <option value="degree_thesis">{{ t('governance.thesis') }}</option>
        </select></label
      >
      <label
        >{{ t('routing.priority')
        }}<input v-model.number="form.priority" type="number" min="0" max="10000" required
      /></label>
      <label
        >{{ t('routing.identities')
        }}<select v-model="form.identityCodes" multiple>
          <option v-for="code in identityCodes" :key="code" :value="code">
            {{ t(`personnel.codes.${code}`) }}
          </option>
        </select></label
      >
      <label
        >{{ t('routing.units')
        }}<select v-model="form.nodeIds" multiple>
          <option v-for="node in nodes" :key="node.id" :value="node.id">{{ node.name }}</option>
        </select></label
      >
      <label
        >{{ t('routing.requestKinds')
        }}<select v-model="form.requestKinds" multiple required>
          <option v-for="kind in requestKinds" :key="kind" :value="kind">
            {{ t(`routing.kinds.${kind}`) }}
          </option>
        </select></label
      >
      <fieldset v-for="(item, index) in stages" :key="item.key">
        <legend>{{ t('routing.stage') }} {{ index + 1 }}</legend>
        <label
          >{{ t('routing.stageName') }}<input v-model="item.stage.name" required maxlength="100"
        /></label>
        <label v-for="choice in choices" :key="choice"
          ><input
            type="checkbox"
            :checked="hasGroup(item.stage, choice)"
            @change="toggleGroup(item.stage, choice)"
          />{{
            choice === 'authors' ||
            choice === 'departments' ||
            choice === 'supervisors' ||
            choice === 'responsible'
              ? t(`routing.groups.${choice}`)
              : t(`governance.roles.${choice}`)
          }}</label
        >
        <label
          >{{ t('routing.deadline')
          }}<input
            v-model.number="item.stage.deadlineHours"
            type="number"
            required
            min="1"
            max="8760"
        /></label>
        <button type="button" :disabled="stages.length === 1" @click="stages.splice(index, 1)">
          {{ t('routing.remove') }}
        </button>
      </fieldset>
      <button type="button" :disabled="stages.length >= 10" @click="addStage">
        {{ t('routing.addStage') }}
      </button>
      <label><input v-model="form.enabled" type="checkbox" />{{ t('routing.enabled') }}</label>
      <label
        >{{ t('governance.reason') }}<textarea v-model="form.notes" required maxlength="2000" />
      </label>
      <div class="actions">
        <button :disabled="busy || !form.notes.trim()">{{ t('routing.publish') }}</button
        ><button type="button" :disabled="busy" @click="reset">{{ t('routing.newRule') }}</button>
      </div>
    </form>
    <h3>{{ t('routing.published') }}</h3>
    <label
      ><input v-model="showHistory" type="checkbox" @change="loadRules(0)" />{{
        t('routing.showHistory')
      }}</label
    >
    <article v-for="rule in rules.items" :key="rule.id" class="record">
      <strong>{{ rule.name }} · v{{ rule.revision }}</strong>
      <p>
        {{ t('routing.priority') }}: {{ rule.priority }} ·
        {{
          rule.supersededAt
            ? t('personnel.historical')
            : rule.enabled
              ? t('routing.enabled')
              : t('routing.disabled')
        }}
      </p>
      <button v-if="!rule.supersededAt" :disabled="busy" @click="edit(rule)">
        {{ t('routing.edit') }}
      </button>
    </article>
    <nav>
      <button v-if="offset" :disabled="busy" @click="loadRules(Math.max(0, offset - 100))">
        {{ t('governance.previousPage') }}</button
      ><button
        v-if="rules.nextOffset !== null"
        :disabled="busy"
        @click="loadRules(rules.nextOffset)"
      >
        {{ t('governance.more') }}
      </button>
    </nav>
    <section class="simulation">
      <h3>{{ t('routing.simulate') }}</h3>
      <p>{{ t('routing.simulationNotice') }}</p>
      <IdentityPersonPicker
        :slug="slug"
        :disabled="busy"
        allow-inactive
        @select="addParticipant($event)"
      />
      <ul>
        <li v-for="person in selectedPeople" :key="person.id">
          {{ person.name }}
          <button
            :disabled="busy"
            @click="selectedPeople = selectedPeople.filter((item) => item.id !== person.id)"
          >
            {{ t('routing.remove') }}
          </button>
        </li>
      </ul>
      <form class="settings" @submit.prevent="simulate">
        <label
          >{{ t('routing.contentType')
          }}<select v-model="sample.contentType">
            <option value="paper">{{ t('governance.paper') }}</option>
            <option value="degree_thesis">{{ t('governance.thesis') }}</option>
          </select></label
        >
        <label
          >{{ t('routing.requestKinds')
          }}<select v-model="sample.requestKind">
            <option v-for="kind in requestKinds" :key="kind" :value="kind">
              {{ t(`routing.kinds.${kind}`) }}
            </option>
          </select></label
        >
        <label
          >{{ t('routing.units')
          }}<select v-model="sample.nodeIds" multiple>
            <option v-for="node in nodes" :key="node.id" :value="node.id">{{ node.name }}</option>
          </select></label
        >
        <button :disabled="busy">{{ t('routing.simulate') }}</button>
      </form>
      <article v-if="simulation" aria-live="polite">
        <h4>{{ simulation.workflowName ?? t('routing.noWorkflow') }}</h4>
        <p v-if="simulation.routing?.error" role="alert">{{ simulation.routing.error }}</p>
        <p>
          {{ t('routing.match') }}:
          {{
            simulation.routing?.selected
              ? `${simulation.routing.selected.name} · v${simulation.routing.selected.revision}`
              : t('routing.default')
          }}
        </p>
        <ReviewFlow :stages="simulationStages" preview />
        <div v-for="(stage, index) in simulation.stages" :key="index"><p v-for="problem in stage.problems" :key="problem" role="alert">{{ stage.name }}: {{ problem }}</p></div>
      </article>
    </section>
  </section>
</template>
<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import IdentityPersonPicker from './IdentityPersonPicker.vue'
import ReviewFlow from './ReviewFlow.vue'
import type { ReviewFlowStage } from '@/utils/review-flow'
import {
  governanceBase,
  governancePost,
  loadReviewAdmin,
  type ReviewStage,
  type ReviewGroup,
} from '@/api/governance'
import {
  identityCodes,
  requestKinds,
  personnelGet,
  type ReviewRoute,
  type Page,
  type Simulation,
} from '@/api/personnel-governance'
const props = defineProps<{ slug: string }>()
const { t } = useI18n()
const controller = new AbortController()
const busy = ref(false)
const error = ref('')
const nodes = ref<Array<{ id: string; name: string }>>([])
const rules = ref<Page<ReviewRoute>>({ items: [], nextOffset: null })
const offset = ref(0)
const showHistory = ref(false)
const defaults = (): {
  key: string
  name: string
  contentType: 'paper' | 'degree_thesis'
  priority: number
  identityCodes: string[]
  nodeIds: string[]
  requestKinds: string[]
  enabled: boolean
  expectedRevision: number
  notes: string
} => ({
  key: '',
  name: '',
  contentType: 'paper',
  priority: 100,
  identityCodes: [],
  nodeIds: [],
  requestKinds: ['submission'],
  enabled: true,
  expectedRevision: 0,
  notes: '',
})
const form = reactive(defaults())
const stages = ref<Array<{ key: string; stage: ReviewStage }>>([])
const choices = [
  'library_intake',
  'authors',
  'departments',
  'supervisors',
  'responsible',
  'library_final',
] as const
type Choice = (typeof choices)[number]
const group = (choice: Choice): ReviewGroup =>
  ['library_intake', 'library_final'].includes(choice)
    ? { kind: 'role', role: choice }
    : { kind: choice as Exclude<ReviewGroup['kind'], 'role'> }
const hasGroup = (stage: ReviewStage, choice: Choice): boolean =>
  stage.groups.some(
    (item) => item.kind === choice || (item.kind === 'role' && item.role === choice),
  )
const toggleGroup = (stage: ReviewStage, choice: Choice): void => {
  stage.groups = hasGroup(stage, choice)
    ? stage.groups.filter(
        (item) => !(item.kind === choice || (item.kind === 'role' && item.role === choice)),
      )
    : [...stage.groups, group(choice)]
}
const addStage = (): void => {
  stages.value.push({
    key: crypto.randomUUID(),
    stage: {
      name: t('governance.roles.library_final'),
      groups: [{ kind: 'role', role: 'library_final' }],
      deadlineHours: 168,
    },
  })
}
const reset = (): void => {
  Object.assign(form, defaults())
  stages.value = []
  addStage()
}
const perform = async (fn: () => Promise<void>): Promise<void> => {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await fn()
  } catch (cause) {
    if (!controller.signal.aborted)
      error.value = cause instanceof Error ? cause.message : t('governance.failed')
  } finally {
    busy.value = false
  }
}
const refresh = async (): Promise<void> => {
  rules.value = await personnelGet(props.slug, 'review-governance/routes', controller.signal, {
    offset: offset.value,
    history: showHistory.value,
  })
}
const loadRules = async (next: number): Promise<void> =>
  perform(async () => {
    offset.value = next
    await refresh()
  })
const edit = (rule: ReviewRoute): void => {
  Object.assign(form, {
    key: rule.key,
    name: rule.name,
    contentType: rule.contentType,
    priority: rule.priority,
    identityCodes: [...rule.identityCodes],
    nodeIds: [...rule.nodeIds],
    requestKinds: [...rule.requestKinds],
    enabled: rule.enabled,
    expectedRevision: rule.revision,
    notes: '',
  })
  stages.value = rule.workflow.steps.map((item) => ({
    key: crypto.randomUUID(),
    stage: {
      ...item.resolverConfig,
      groups: item.resolverConfig.groups.map((group) => ({ ...group })),
      ccPersonIds: [...(item.resolverConfig.ccPersonIds ?? [])],
    },
  }))
}
const save = async (): Promise<void> =>
  perform(async () => {
    await governancePost(
      `${governanceBase(props.slug)}/review-governance/routes`,
      { ...form, steps: stages.value.map((item) => item.stage) },
      controller.signal,
    )
    offset.value = 0
    await refresh()
    reset()
  })
const selectedPeople = ref<Array<{ id: string; name: string }>>([])
const sample = reactive({
  contentType: 'paper',
  requestKind: 'submission',
  nodeIds: [] as string[],
})
const simulation = ref<Simulation | null>(null)
const simulationStages = computed<ReviewFlowStage[]>(() => (simulation.value?.stages ?? []).map((stage, index) => ({
  id: `simulation-${index}`, label: stage.name, status: 'queued', detail: stage.problems.join(' · '),
  tasks: [{ id: `candidates-${index}`, label: t('reviewProgress.candidates'), status: 'queued', detail: stage.reviewers.map(person => `${person.name} · ${person.role}`).join(', ') || t('reviewProgress.noCandidates') }],
})))
const addParticipant = (person: { id: string; name: string }): void => {
  if (!selectedPeople.value.some((item) => item.id === person.id))
    selectedPeople.value.push({ id: person.id, name: person.name })
}
const simulate = async (): Promise<void> =>
  perform(async () => {
    simulation.value = null
    simulation.value = await governancePost<Simulation>(
      `${governanceBase(props.slug)}/review-governance/simulate`,
      { ...sample, personIds: selectedPeople.value.map((person) => person.id) },
      controller.signal,
    )
  })
onMounted(async () => {
  reset()
  await perform(async () => {
    nodes.value = (await loadReviewAdmin(props.slug, controller.signal)).nodes
    await refresh()
  })
})
onUnmounted(() => controller.abort())
</script>
<style scoped>
.route-panel {
  display: grid;
  gap: 16px;
}
.settings {
  display: grid;
  gap: 16px;
  max-width: 780px;
}
label {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
input:not([type='checkbox']),
select,
textarea {
  min-width: 200px;
  max-width: 100%;
  padding: 10px;
  font: inherit;
}
button {
  padding: 10px 16px;
  font: inherit;
}
fieldset,
.record,
.simulation {
  border: 1px solid var(--color-border-2);
  padding: 18px;
  border-radius: 8px;
}
fieldset {
  display: grid;
  gap: 12px;
}
.actions,
nav {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
</style>
