<template>
  <details class="directory-filters" :open="filtersExpanded" @toggle="syncExpanded">
    <summary>{{ t('scholars.filters') }} <span aria-hidden="true">⌄</span></summary>
    <div class="filters-body">
      <section
        v-for="group in groups"
        :key="group.key"
        class="filter-section"
        :aria-labelledby="`filter-${group.key}`"
      >
        <h2 :id="`filter-${group.key}`">{{ group.label }}</h2>
        <input
          v-if="group.all.length > 8"
          v-model="queries[group.key]"
          type="search"
          class="filter-search"
          :aria-label="t('scholars.searchFilter', { label: group.label })"
          :placeholder="t('scholars.searchFilter', { label: group.label })"
        />
        <nav v-if="group.path.length" class="filter-breadcrumb" :aria-label="group.label">
          <button type="button" @click="select(group.key, '')">{{ t('common.all') }}</button>
          <template v-for="node in group.path" :key="node.id">
            <span aria-hidden="true">/</span
            ><button
              type="button"
              :aria-current="node.id === group.selected ? 'location' : undefined"
              @click="select(group.key, node.id)"
            >
              {{ node.label }}
            </button>
          </template>
        </nav>
        <div class="filter-options">
          <button
            type="button"
            class="filter-option"
            :class="{ selected: !group.selected }"
            :aria-pressed="!group.selected"
            @click="select(group.key, '')"
          >
            {{ t('scholars.allInFilter', { label: group.label }) }}
          </button>
          <button
            v-for="option in group.visible"
            :key="option.id"
            type="button"
            class="filter-option"
            :class="{ selected: group.selected === option.id }"
            :aria-pressed="group.selected === option.id"
            @click="select(group.key, option.id)"
          >
            <span
              >{{ option.label
              }}<small v-if="queries[group.key] && option.parentLabel">{{
                option.parentLabel
              }}</small></span
            >
            <span class="option-count">{{ option.count }}</span>
          </button>
        </div>
        <p v-if="!group.visible.length && queries[group.key]" class="filter-empty">
          {{ t('scholars.noFilterMatch') }}
        </p>
        <button
          v-if="group.options.length > 8"
          type="button"
          class="expand-options"
          :aria-expanded="expanded[group.key]"
          @click="expanded[group.key] = !expanded[group.key]"
        >
          {{
            expanded[group.key]
              ? t('scholars.showLess')
              : t('scholars.showAll', { count: group.options.length })
          }}
        </button>
      </section>
      <p v-if="!groups.length" class="filter-empty">{{ t('scholars.noFilters') }}</p>
      <p class="filter-help">{{ t('scholars.filterHelp') }}</p>
    </div>
  </details>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ScholarDirectoryUnit, ScholarSubjectFacet } from '@/api/scholars'

type GroupKey = 'unit' | 'subject'
interface Option {
  id: string
  parentId: string | null
  label: string
  count: number
  parentLabel?: string
}
const normalizeOptions = (options: Option[]): Option[] => {
  const byId = new Map(options.map((option) => [option.id, { ...option }]))
  for (const option of byId.values()) {
    const path: string[] = []
    let current: Option | undefined = option
    while (current && !path.includes(current.id)) {
      path.push(current.id)
      current = current.parentId ? byId.get(current.parentId) : undefined
    }
    if (current)
      for (const id of path.slice(path.indexOf(current.id))) byId.get(id)!.parentId = null
  }
  return [...byId.values()]
}
const props = defineProps<{
  units: ScholarDirectoryUnit[]
  subjects: ScholarSubjectFacet[]
  unit: string
  subject: string
}>()
const emit = defineEmits<{ select: [key: GroupKey, value: string] }>()
const { t, locale } = useI18n()
const filtersExpanded = ref(true)
let compactViewport: MediaQueryList | undefined
const applyViewport = (): void => {
  filtersExpanded.value = !compactViewport?.matches
}
const syncExpanded = (event: Event): void => {
  filtersExpanded.value = (event.target as HTMLDetailsElement).open
}
onMounted(() => {
  if (typeof window.matchMedia !== 'function') return
  compactViewport = window.matchMedia('(max-width: 760px)')
  applyViewport()
  compactViewport.addEventListener('change', applyViewport)
})
onBeforeUnmount(() => compactViewport?.removeEventListener('change', applyViewport))
const queries = reactive({ unit: '', subject: '' })
const expanded = reactive({ unit: false, subject: false })
watch(
  () => [props.unit, props.subject],
  () => {
    queries.unit = queries.subject = ''
    expanded.unit = expanded.subject = false
  },
)
const select = (key: GroupKey, value: string): void => {
  emit('select', key, value)
}
const unitLabel = computed(() => {
  const roots = props.units.filter((unit) => !unit.parentId && unit.id !== 'unassigned')
  if (roots.length && roots.every((unit) => unit.kind === 'college'))
    return t('scholars.collegeFilter')
  if (roots.length && roots.every((unit) => unit.kind === 'department'))
    return t('scholars.departmentFilter')
  return t('scholars.unitFilter')
})
const groups = computed(() => {
  const definitions: Array<{ key: GroupKey; label: string; all: Option[]; selected: string }> = [
    {
      key: 'unit',
      label: unitLabel.value,
      selected: props.unit,
      all: props.units.map((unit) => ({
        ...unit,
        label: unit.id === 'unassigned' ? t('scholars.unassigned') : unit.name,
      })),
    },
    {
      key: 'subject',
      label: t('scholars.subjectFilter'),
      selected: props.subject,
      all: props.subjects.map((subject) => ({
        ...subject,
        label: locale.value.startsWith('en') ? subject.nameEn || subject.nameZh : subject.nameZh,
      })),
    },
  ]
  return definitions
    .map((group) => ({ ...group, all: normalizeOptions(group.all) }))
    .filter((group) => group.all.length)
    .map((group) => {
      const byId = new Map(group.all.map((option) => [option.id, option]))
      const path: Option[] = []
      let current = byId.get(group.selected)
      const seen = new Set<string>()
      while (current && !seen.has(current.id)) {
        seen.add(current.id)
        path.unshift(current)
        current = current.parentId ? byId.get(current.parentId) : undefined
      }
      const children = group.all.filter((option) => option.parentId === group.selected)
      const selected = byId.get(group.selected)
      const query = queries[group.key].trim().toLocaleLowerCase()
      const options = query
        ? group.all
            .filter((option) => option.label.toLocaleLowerCase().includes(query))
            .map((option) => ({ ...option, parentLabel: byId.get(option.parentId ?? '')?.label }))
        : group.selected && children.length
          ? children
          : group.all.filter((option) =>
              selected?.parentId
                ? option.parentId === selected.parentId
                : !option.parentId || !byId.has(option.parentId),
            )
      return {
        ...group,
        path,
        options,
        visible: expanded[group.key] ? options : options.slice(0, 8),
      }
    })
})
</script>

<style scoped>
.directory-filters {
  border: 1px solid var(--scholar-border-light);
  border-radius: 16px;
  background: var(--scholar-bg-white);
  overflow: hidden;
}
summary {
  padding: 20px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  font-size: 15px;
  font-weight: 600;
  color: var(--scholar-text-1);
  list-style: none;
}
summary::-webkit-details-marker {
  display: none;
}
details:not([open]) summary span {
  transform: rotate(-90deg);
}
.filters-body {
  padding: 0 16px 18px;
}
.filter-section {
  padding: 18px 0;
  border-top: 1px solid var(--scholar-border-light);
}
h2 {
  margin: 0 4px 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--scholar-text-2);
}
.filter-search {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid var(--scholar-border-input);
  border-radius: 8px;
  padding: 9px 10px;
  background: transparent;
  font: inherit;
  font-size: 13px;
  color: var(--scholar-text-1);
  margin-bottom: 10px;
}
.filter-breadcrumb {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin: 4px 4px 12px;
  color: var(--scholar-text-desc);
}
.filter-breadcrumb button {
  padding: 4px 0;
  border: 0;
  background: transparent;
  color: var(--scholar-primary);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.filter-options {
  display: grid;
  gap: 4px;
}
.filter-option {
  width: 100%;
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  text-align: left;
  border: 0;
  border-radius: 8px;
  padding: 10px;
  min-height: 40px;
  background: transparent;
  color: var(--scholar-text-2);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  overflow-wrap: anywhere;
}
.filter-option:hover,
.filter-option.selected {
  background: var(--scholar-primary-light);
  color: var(--scholar-primary);
}
.filter-option.selected {
  font-weight: 600;
}
.filter-option small {
  display: block;
  margin-top: 3px;
  font-size: 11px;
  font-weight: 400;
}
.option-count {
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  flex-shrink: 0;
}
.expand-options {
  padding: 10px;
  border: 0;
  background: transparent;
  color: var(--scholar-primary);
  font-size: 12px;
  cursor: pointer;
}
.filter-help,
.filter-empty {
  font-size: 12px;
  line-height: 1.7;
  color: var(--scholar-text-desc);
  margin: 10px 4px 0;
}
button:focus-visible,
summary:focus-visible,
input:focus-visible {
  outline: 2px solid var(--scholar-primary);
  outline-offset: 2px;
}
@media (max-width: 760px) {
  summary {
    min-height: 24px;
    padding: 14px 18px;
  }
  .filter-options {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
