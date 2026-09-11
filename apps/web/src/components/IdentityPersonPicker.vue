<template>
  <div class="identity-person-picker">
    <form class="person-search" @submit.prevent="search(0)">
      <a-input
        v-model="query"
        :input-attrs="{ 'aria-label': $t('identity.searchPeople') }"
        :placeholder="$t('identity.searchPeople')"
        :max-length="100"
        :disabled="disabled"
      />
      <a-button html-type="submit" :loading="loading" :disabled="disabled">{{
        $t('common.search')
      }}</a-button>
    </form>
    <p v-if="errorKey" role="alert">{{ $t(errorKey) }}</p>
    <ul class="person-results">
      <li v-for="person in people" :key="person.id">
        <button
          type="button"
          :disabled="disabled || !person.is_active || (requireAccount && !person.userId)"
          :aria-pressed="selectedId === person.id"
          @click="$emit('select', person)"
        >
          <strong>{{ person.name }}</strong>
          <span>{{ $t('identity.primaryId') }}：{{ person.internalId }}</span>
          <small
            >{{ person.email || $t('common.notFilled') }} ·
            {{ person.userId ? $t('identity.linkedAccount') : $t('identity.noAccount') }}</small
          >
        </button>
      </li>
    </ul>
    <p v-if="!loading && !people.length">{{ $t('identity.noPeople') }}</p>
    <a-pagination
      v-if="total > 20"
      :total="total"
      :current="page"
      :page-size="20"
      :disabled="disabled"
      simple
      @change="changePage"
    />
  </div>
</template>

<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import { identityErrorKey, listIdentityPeople, type IdentityPerson } from '@/api/identity'
const props = defineProps<{
  slug: string
  selectedId?: string
  requireAccount?: boolean
  disabled?: boolean
}>()
defineEmits<{ select: [person: IdentityPerson] }>()
const query = ref('')
const people = ref<IdentityPerson[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const errorKey = ref('')
let controller: AbortController | undefined
const search = async (offset = 0): Promise<void> => {
  controller?.abort()
  const request = new AbortController()
  controller = request
  loading.value = true
  errorKey.value = ''
  try {
    const result = await listIdentityPeople(props.slug, query.value, offset, request.signal)
    if (request.signal.aborted) return
    people.value = result.items
    total.value = result.total
    page.value = offset / 20 + 1
  } catch (error) {
    if (!request.signal.aborted) errorKey.value = identityErrorKey(error)
  } finally {
    if (!request.signal.aborted) loading.value = false
  }
}
const changePage = (value: number): void => {
  void search((value - 1) * 20)
}
watch(
  () => props.slug,
  () => {
    query.value = ''
    void search()
  },
  { immediate: true },
)
onUnmounted(() => controller?.abort())
</script>

<style scoped>
.person-search {
  display: flex;
  gap: 8px;
}
.person-results {
  display: grid;
  gap: 8px;
  padding: 0;
  list-style: none;
}
.person-results button {
  display: grid;
  gap: 4px;
  width: 100%;
  padding: 12px;
  border: 1px solid var(--color-border-2);
  border-radius: 8px;
  background: var(--color-bg-2);
  color: var(--color-text-1);
  text-align: left;
  cursor: pointer;
  overflow-wrap: anywhere;
}
.person-results button[aria-pressed='true'] {
  border-color: rgb(var(--primary-6));
  background: var(--color-primary-light-1);
}
.person-results button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.person-results small {
  color: var(--color-text-3);
}
</style>
