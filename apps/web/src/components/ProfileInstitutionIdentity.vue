<template>
  <section class="profile-identity" aria-labelledby="profile-identity-title">
    <div class="identity-heading">
      <h2 id="profile-identity-title">{{ $t('settings.institutionIdentityTitle') }}</h2>
      <span class="readonly-label">{{ $t('settings.readOnly') }}</span>
    </div>
    <dl class="identity-fields">
      <div class="identity-field">
        <dt>{{ $t('settings.institutionName') }}</dt>
        <dd>{{ institutionName || $t('settings.noInstitutionIdentity') }}</dd>
      </div>
      <div class="identity-field" data-field="role">
        <dt>{{ $t('settings.institutionRole') }}</dt>
        <dd><span class="role-label">{{ roleLabel }}</span></dd>
      </div>
      <div class="identity-field identifier-card identifier-card--primary" data-field="primary">
        <dt>{{ $t('settings.primaryEmployeeId') }}</dt>
        <dd v-if="primaryIdentifier">
          <span class="identifier-value">{{ primaryIdentifier.value }}</span>
          <span v-if="primaryIdentifier.kind !== 'unknown'" class="identifier-kind">
            {{ $t(`settings.identifierKinds.${primaryIdentifier.kind}`) }}
          </span>
        </dd>
        <dd v-else>{{ $t('settings.noEmployeeId') }}</dd>
      </div>
      <div class="identity-field identifier-card identifier-card--other" data-field="other">
        <dt class="identifier-list-heading">
          <span>{{ $t('settings.otherEmployeeIds') }}</span>
          <span class="identifier-count">{{ $t('settings.identifierCount', { count: otherIdentifiers.length }) }}</span>
        </dt>
        <dd>
          <ul v-if="otherIdentifiers.length" id="profile-other-identifier-list" class="identifier-list">
            <li v-for="identifier in visibleOtherIdentifiers" :key="identifier.id">
              <span class="identifier-value">{{ identifier.value }}</span>
              <span class="identifier-kind">{{ $t(`settings.identifierKinds.${identifier.kind}`) }}</span>
            </li>
          </ul>
          <span v-else class="identifier-empty">{{ $t('settings.noOtherEmployeeIds') }}</span>
          <a-button
            v-if="otherIdentifiers.length > IDENTIFIER_PREVIEW_LIMIT"
            class="identifier-toggle"
            type="text"
            size="small"
            :aria-expanded="showAllIdentifiers"
            aria-controls="profile-other-identifier-list"
            @click="showAllIdentifiers = !showAllIdentifiers"
          >
            {{ showAllIdentifiers ? $t('settings.collapseIdentifiers') : $t('settings.showAllIdentifiers', { count: otherIdentifiers.length }) }}
          </a-button>
        </dd>
      </div>
    </dl>
    <p class="identity-hint">{{ $t('settings.institutionIdentityHint') }}</p>
    <p class="identity-hint identity-hint--login">{{ $t('settings.linkedIdentifiersHint') }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { UserInstitutionIdentifier, UserInstitutionIdentity, UserInstitutionMembershipItem } from '@/api/users'

const props = defineProps<{
  identity: UserInstitutionIdentity | null
  memberships: UserInstitutionMembershipItem[]
}>()
const { t } = useI18n()
const membership = computed(() => props.identity
  ? props.memberships.find(item => item.id === props.identity?.institutionId)
  : props.memberships[0])
const institutionName = computed(() => props.identity?.institutionName ?? membership.value?.name)
const roleLabel = computed(() => {
  const role = membership.value?.role
  return role === 'owner' || role === 'admin' || role === 'member'
    ? t(`settings.institutionRoles.${role}`)
    : t('settings.noInstitutionRole')
})
const isEmployeeId = (value: string): boolean => Boolean(value.trim()) && !value.toLowerCase().startsWith('legacy-user:')
const identifiers = computed<UserInstitutionIdentifier[]>(() => {
  const identity = props.identity
  if (!identity) return []
  if (identity.identifiers !== undefined) return identity.identifiers.filter(item => isEmployeeId(item.value))
  // Older servers expose only the canonical value; never guess alias types.
  return isEmployeeId(identity.internalId)
    ? [{ id: identity.id, value: identity.internalId, isPrimary: true, kind: 'unknown' }]
    : []
})
const primaryIdentifier = computed(() => identifiers.value.find(item => item.isPrimary))
const otherIdentifiers = computed(() => identifiers.value.filter(item => !item.isPrimary))
const IDENTIFIER_PREVIEW_LIMIT = 3
const showAllIdentifiers = ref(false)
const visibleOtherIdentifiers = computed(() => showAllIdentifiers.value
  ? otherIdentifiers.value
  : otherIdentifiers.value.slice(0, IDENTIFIER_PREVIEW_LIMIT))

watch(() => props.identity?.id, (): void => {
  showAllIdentifiers.value = false
})
</script>

<style scoped>
.profile-identity {
  min-width: 0;
}

.identity-heading {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 20px;
}

h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--scholar-text-1);
}

.readonly-label {
  padding: 2px 7px;
  border-radius: 5px;
  background: var(--scholar-bg-sidebar);
  color: var(--scholar-text-desc);
  font-size: 12px;
  line-height: 1.5;
}

.identity-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px 16px;
  margin: 0;
}

.identity-field {
  min-width: 0;
}

.identifier-card {
  grid-column: 1 / -1;
  padding: 14px;
  border: 1px solid var(--scholar-border-medium);
  border-radius: var(--scholar-radius-sm);
  background: var(--scholar-bg-sidebar);
}

.identifier-card--primary {
  background: var(--scholar-primary-light);
  border-color: color-mix(in srgb, var(--scholar-primary) 18%, var(--scholar-bg-white));
}

dt {
  margin-bottom: 6px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--scholar-text-desc);
}

dd {
  margin: 0;
  color: var(--scholar-text-1);
  font-size: 14px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.role-label {
  color: var(--scholar-primary);
  font-weight: 500;
}

.identifier-value {
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  font-size: 15px;
}

.identifier-kind {
  margin-left: 8px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--scholar-bg-white);
  font-size: 12px;
  color: var(--scholar-text-desc);
}

.identifier-list-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px 12px;
  margin-bottom: 0;
}

.identifier-count {
  font-size: 12px;
  white-space: nowrap;
}

.identifier-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.identifier-list li {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--scholar-border-medium);
}

.identifier-list li:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}

.identifier-list .identifier-value {
  min-width: 0;
  max-width: 100%;
}

.identifier-list .identifier-kind {
  margin-left: 0;
}

.identifier-empty {
  display: block;
  margin-top: 10px;
  font-size: 13px;
  color: var(--scholar-text-desc);
}

.identifier-toggle {
  margin-top: 12px;
}

.identity-hint {
  margin: 16px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--scholar-text-desc);
}

.identity-hint--login {
  margin-top: 6px;
}

@media (max-width: 640px) {
  .identity-fields {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
