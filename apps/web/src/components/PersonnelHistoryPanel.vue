<template>
  <section class="personnel-panel">
    <h2>{{ t('personnel.title') }}</h2>
    <p>{{ t('personnel.sourceNotice') }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <IdentityPersonPicker
      :slug="slug"
      :selected-id="personId"
      allow-inactive
      :disabled="busy"
      @select="selectPerson($event.id)"
    />
    <article v-if="history">
      <h3>{{ history.person.name }}</h3>
      <dl>
        <dt>{{ t('personnel.source') }}</dt>
        <dd>{{ history.person.source?.name ?? t('personnel.manual') }}</dd>
        <dt>{{ t('personnel.sourceValue') }}</dt>
        <dd>{{ history.person.sourceName ?? '—' }}</dd>
        <dt>{{ t('personnel.effectiveValue') }}</dt>
        <dd>{{ history.person.name }}</dd>
        <dt>{{ t('personnel.status') }}</dt>
        <dd>
          {{ history.person.lifecycleStatus
          }}{{ history.person.manuallySuspended ? ` · ${t('personnel.suspended')}` : '' }}
        </dd>
      </dl>
      <h4>{{ t('personnel.identities') }}</h4>
      <ul>
        <li v-for="item in history.identities" :key="item.id">
          {{ t(`personnel.codes.${item.code}`) }} · {{ item.status }} · {{ interval(item) }} · v{{
            item.revision
          }}{{ item.supersededAt ? ` · ${t('personnel.historical')}` : '' }}
        </li>
      </ul>
      <h4>{{ t('personnel.relationships') }}</h4>
      <ul>
        <li v-for="item in history.relationships" :key="item.id">
          {{ t(`governance.roles.${item.kind}`) }}: {{ item.relatedPerson.name }} ·
          {{ interval(item) }} · {{ item.status
          }}{{ item.supersededAt ? ` · ${t('personnel.historical')}` : '' }}
        </li>
      </ul>
      <h4>{{ t('personnel.appointments') }}</h4>
      <ul>
        <li v-for="item in history.appointments" :key="item.id">
          {{ item.position.name }} · {{ item.status }} · {{ interval(item)
          }}{{ item.supersededAt ? ` · ${t('personnel.historical')}` : '' }}
        </li>
      </ul>
      <button
        v-if="history.nextOffset !== null"
        :disabled="busy"
        @click="loadPerson(history.nextOffset)"
      >
        {{ t('governance.more') }}
      </button>
      <form v-if="history.person.source" class="correction-form" @submit.prevent="request">
        <h3>{{ t('personnel.requestCorrection') }}</h3>
        <p>{{ t('personnel.correctionNotice') }}</p>
        <label
          >{{ t('personnel.field')
          }}<select v-model="form.field">
            <option value="name">{{ t('personnel.name') }}</option>
            <option value="admission">{{ t('personnel.admission') }}</option>
          </select></label
        >
        <label v-if="form.field === 'name'"
          >{{ t('personnel.newValue') }}<input v-model="form.value" required maxlength="100"
        /></label>
        <label
          >{{ t('personnel.expiry')
          }}<input v-model="form.expiresAt" type="datetime-local" required
        /></label>
        <label
          >{{ t('personnel.reason') }}<textarea v-model="form.reason" required maxlength="2000" />
        </label>
        <button :disabled="busy || !form.reason.trim()">
          {{ t('personnel.requestCorrection') }}
        </button>
      </form>
    </article>
    <h3>{{ t('personnel.corrections') }}</h3>
    <p v-if="!corrections.items.length">{{ t('personnel.empty') }}</p>
    <article v-for="item in corrections.items" :key="item.id" class="record">
      <strong>{{ item.person?.name }} · {{ t(`personnel.${item.field}`) }}</strong>
      <p>{{ item.sourceValue }} → {{ item.value }} · {{ t(`personnel.states.${item.status}`) }}</p>
      <p>{{ item.reason }}</p>
      <p>{{ t('personnel.expiry') }}: {{ date(item.expiresAt) }}</p>
      <template v-if="['requested', 'active'].includes(item.status)">
        <label
          >{{ t('personnel.decisionReason')
          }}<input v-model="decisionNotes[item.id]" maxlength="2000"
        /></label>
        <button
          v-if="item.status === 'requested'"
          :disabled="busy || !decisionNotes[item.id]?.trim()"
          @click="decide(item.id, 'approve')"
        >
          {{ t('personnel.approve') }}
        </button>
        <button
          :disabled="busy || !decisionNotes[item.id]?.trim()"
          @click="decide(item.id, item.status === 'active' ? 'revoke' : 'reject')"
        >
          {{ item.status === 'active' ? t('personnel.revoke') : t('personnel.reject') }}
        </button>
      </template>
    </article>
    <nav>
      <button
        v-if="correctionOffset"
        :disabled="busy"
        @click="loadCorrections(Math.max(0, correctionOffset - 100))"
      >
        {{ t('governance.previousPage') }}</button
      ><button
        v-if="corrections.nextOffset !== null"
        :disabled="busy"
        @click="loadCorrections(corrections.nextOffset)"
      >
        {{ t('governance.more') }}
      </button>
    </nav>
    <h3>{{ t('personnel.organizationHistory') }}</h3>
    <p>{{ t('personnel.historyNotice') }}</p>
    <ul>
      <li v-for="item in organization.items" :key="item.id">
        {{ item.parent.name }} → {{ item.child.name }} · {{ date(item.recordedAt) }} —
        {{ item.endedAt ? date(item.endedAt) : t('personnel.current') }}
      </li>
    </ul>
    <button
      v-if="organization.nextOffset !== null"
      :disabled="busy"
      @click="loadOrganization(organization.nextOffset)"
    >
      {{ t('governance.more') }}
    </button>
  </section>
</template>
<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import IdentityPersonPicker from './IdentityPersonPicker.vue'
import { governanceBase, governancePost } from '@/api/governance'
import {
  personnelGet,
  type Correction,
  type PersonHistory,
  type Page,
  type OrgHistory,
} from '@/api/personnel-governance'
const props = defineProps<{ slug: string }>()
const { t } = useI18n()
const controller = new AbortController()
const busy = ref(false)
const error = ref('')
const personId = ref('')
const history = ref<PersonHistory | null>(null)
const corrections = ref<Page<Correction>>({ items: [], nextOffset: null })
const organization = ref<Page<OrgHistory>>({ items: [], nextOffset: null })
const correctionOffset = ref(0)
const decisionNotes = reactive<Record<string, string>>({})
const form = reactive({ field: 'name', value: '', expiresAt: '', reason: '' })
const date = (value: string): string => new Date(value).toLocaleString()
const interval = (value: { startsAt: string | null; endsAt: string | null }): string =>
  `${value.startsAt ? date(value.startsAt) : t('personnel.unknown')} — ${value.endsAt ? date(value.endsAt) : t('personnel.noEnd')}`
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
const refreshCorrections = async (): Promise<void> => {
  corrections.value = await personnelGet(props.slug, 'directory/corrections', controller.signal, {
    offset: correctionOffset.value,
  })
}
const loadCorrections = async (offset: number): Promise<void> =>
  perform(async () => {
    correctionOffset.value = offset
    await refreshCorrections()
  })
const refreshPerson = async (offset = 0): Promise<void> => {
  const next = await personnelGet<PersonHistory>(
    props.slug,
    `directory/people/${encodeURIComponent(personId.value)}/history`,
    controller.signal,
    { offset },
  )
  if (offset && history.value) {
    next.identities = [...history.value.identities, ...next.identities]
    next.relationships = [...history.value.relationships, ...next.relationships]
    next.appointments = [...history.value.appointments, ...next.appointments]
  }
  history.value = next
}
const loadPerson = async (offset: number): Promise<void> => perform(() => refreshPerson(offset))
const selectPerson = async (id: string): Promise<void> =>
  perform(async () => {
    personId.value = id
    await refreshPerson()
    form.value = history.value?.person.name ?? ''
  })
const request = async (): Promise<void> =>
  perform(async () => {
    await governancePost(
      `${governanceBase(props.slug)}/directory/corrections`,
      {
        personId: personId.value,
        ...form,
        value: form.field === 'admission' ? 'allow' : form.value,
        expiresAt: new Date(form.expiresAt).toISOString(),
      },
      controller.signal,
    )
    form.reason = ''
    await refreshCorrections()
  })
const decide = async (id: string, decision: string): Promise<void> =>
  perform(async () => {
    if (!decisionNotes[id]?.trim()) return
    await governancePost(
      `${governanceBase(props.slug)}/directory/corrections/${id}/decision`,
      { decision, notes: decisionNotes[id] },
      controller.signal,
    )
    await refreshCorrections()
    if (personId.value) await refreshPerson()
  })
const loadOrganization = async (offset: number): Promise<void> =>
  perform(async () => {
    const next = await personnelGet<Page<OrgHistory>>(
      props.slug,
      'directory/organization-history',
      controller.signal,
      { offset },
    )
    organization.value = {
      ...next,
      items: offset ? [...organization.value.items, ...next.items] : next.items,
    }
  })
onMounted(async () => {
  await loadCorrections(0)
  await loadOrganization(0)
})
onUnmounted(() => controller.abort())
</script>
<style scoped>
.personnel-panel {
  display: grid;
  gap: 16px;
}
.correction-form {
  display: grid;
  gap: 14px;
  max-width: 720px;
}
label {
  display: grid;
  gap: 6px;
}
input,
select,
textarea,
button {
  padding: 10px;
  font: inherit;
}
.record {
  padding: 18px;
  border: 1px solid var(--color-border-2);
  border-radius: 8px;
  overflow-wrap: anywhere;
}
dl {
  display: grid;
  grid-template-columns: minmax(90px, 1fr) 3fr;
  gap: 10px;
}
dd {
  margin: 0;
}
li {
  margin-block: 10px;
}
nav {
  display: flex;
  gap: 12px;
}
</style>
