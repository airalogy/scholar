<template>
  <section class="admin-panel">
    <div class="panel-head">
      <div>
        <h2 class="panel-title">{{ $t('adminInstitutionContent.credentialsTitle') }}</h2>
        <p class="panel-subtitle">{{ $t('adminInstitutionContent.credentialsSubtitle') }}</p>
      </div>
    </div>

    <div v-if="revealedSecret" class="secret-panel">
      <div class="secret-warning">{{ $t('adminInstitutionContent.secretOneTimeWarning') }}</div>
      <div class="secret-row">
        <span class="secret-label">client_id</span>
        <code>{{ revealedSecret.clientId }}</code>
        <a-button type="text" size="small" @click="copyText(revealedSecret.clientId)">
          {{ $t('common.copy') }}
        </a-button>
      </div>
      <div class="secret-row">
        <span class="secret-label">client_secret</span>
        <code>{{ revealedSecret.clientSecret }}</code>
        <a-button type="text" size="small" @click="copyText(revealedSecret.clientSecret)">
          {{ $t('common.copy') }}
        </a-button>
      </div>
      <a-button size="small" @click="revealedSecret = null">
        {{ $t('adminInstitutionContent.secretSaved') }}
      </a-button>
    </div>

    <a-form layout="vertical" :model="form" class="credential-form">
      <div class="credential-form-grid">
        <a-form-item field="name" :label="$t('adminInstitutionContent.credentialNameLabel')">
          <a-input
            v-model="form.name"
            :placeholder="$t('adminInstitutionContent.credentialNamePlaceholder')"
            :max-length="100"
          />
        </a-form-item>
        <a-form-item field="expiresInDays" :label="$t('adminInstitutionContent.credentialExpiryLabel')">
          <a-input-number
            v-model="form.expiresInDays"
            :min="1"
            :max="365"
            :step="1"
            mode="button"
          />
        </a-form-item>
      </div>
      <a-form-item field="scopes" :label="$t('adminInstitutionContent.credentialScopesLabel')">
        <a-checkbox-group v-model="form.scopes" class="scope-list">
          <a-checkbox v-for="scope in scopes" :key="scope" :value="scope">
            <code>{{ scope }}</code>
            <span>{{ getScopeDescription(scope) }}</span>
          </a-checkbox>
        </a-checkbox-group>
      </a-form-item>
    </a-form>

    <div class="credential-actions">
      <a-button
        type="primary"
        :loading="isCreating"
        :disabled="!form.name.trim() || form.scopes.length === 0"
        @click="createCredential"
      >
        {{ $t('adminInstitutionContent.createCredential') }}
      </a-button>
      <span class="credential-hint">{{ $t('adminInstitutionContent.credentialLimitHint') }}</span>
    </div>

    <div v-if="isLoading" class="credential-state">{{ $t('common.loading') }}</div>
    <div v-else-if="credentials.length" class="credential-list">
      <article v-for="credential in credentials" :key="credential.id" class="credential-card">
        <div class="credential-main">
          <div class="credential-title-row">
            <strong>{{ credential.name }}</strong>
            <span class="status-badge" :class="`status-badge--${credential.status}`">
              {{ getStatusLabel(credential.status) }}
            </span>
          </div>
          <div class="credential-id">
            <code>{{ credential.clientId }}</code>
            <a-button type="text" size="mini" @click="copyText(credential.clientId)">
              {{ $t('common.copy') }}
            </a-button>
          </div>
          <div class="credential-meta">{{ credential.scopes.join(' · ') }}</div>
          <div class="credential-meta">
            {{ $t('adminInstitutionContent.credentialExpiresAt', {
              date: formatDateTime(credential.expiresAt),
            }) }}
          </div>
          <div class="credential-meta">
            {{ credential.lastUsedAt
              ? $t('adminInstitutionContent.credentialLastUsed', {
                date: formatDateTime(credential.lastUsedAt),
                ip: credential.lastUsedIp || '-',
              })
              : $t('adminInstitutionContent.credentialNeverUsed') }}
          </div>
        </div>
        <div class="credential-card-actions">
          <a-popconfirm
            v-if="credential.status !== 'revoked'"
            :content="$t('adminInstitutionContent.rotateCredentialConfirm')"
            @ok="rotateCredential(credential.id)"
          >
            <a-button
              type="outline"
              size="small"
              :loading="actionId === credential.id && actionKind === 'rotate'"
            >
              {{ $t('adminInstitutionContent.rotateCredential') }}
            </a-button>
          </a-popconfirm>
          <a-popconfirm
            v-if="credential.status !== 'revoked'"
            :content="$t('adminInstitutionContent.revokeCredentialConfirm')"
            @ok="revokeCredential(credential.id)"
          >
            <a-button
              status="danger"
              type="outline"
              size="small"
              :loading="actionId === credential.id && actionKind === 'revoke'"
            >
              {{ $t('adminInstitutionContent.revokeCredential') }}
            </a-button>
          </a-popconfirm>
        </div>
      </article>
    </div>
    <div v-else class="credential-state">{{ $t('adminInstitutionContent.noCredentials') }}</div>
  </section>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { Message } from '@arco-design/web-vue'
import { useI18n } from 'vue-i18n'
import {
  createInstitutionApiCredential,
  listInstitutionApiCredentials,
  revokeInstitutionApiCredential,
  rotateInstitutionApiCredential,
  type InstitutionApiCredential,
  type InstitutionApiCredentialScope,
  type InstitutionDetailResponse,
} from '@/api/institutions'

const props = defineProps<{
  institution: InstitutionDetailResponse
}>()

const { t, locale } = useI18n()
const scopes: InstitutionApiCredentialScope[] = [
  'papers:import',
  'scholars:import',
  'imports:read',
]

const form = reactive({
  name: '',
  expiresInDays: 90,
  scopes: [...scopes] as InstitutionApiCredentialScope[],
})
const credentials = ref<InstitutionApiCredential[]>([])
const isLoading = ref(false)
const isCreating = ref(false)
const actionId = ref('')
const actionKind = ref<'rotate' | 'revoke' | ''>('')
const revealedSecret = ref<{
  clientId: string
  clientSecret: string
} | null>(null)

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as {
      response?: { data?: { message?: string } }
    }).response
    if (response?.data?.message) {
      return response.data.message
    }
  }
  return error instanceof Error ? error.message : fallback
}

const loadCredentials = async (): Promise<void> => {
  isLoading.value = true
  try {
    credentials.value = await listInstitutionApiCredentials(props.institution.slug)
  } catch (error) {
    Message.error(getErrorMessage(error, t('adminInstitutionContent.credentialsLoadFailed')))
  } finally {
    isLoading.value = false
  }
}

const createCredential = async (): Promise<void> => {
  if (!form.name.trim() || form.scopes.length === 0) {
    return
  }

  isCreating.value = true
  try {
    const result = await createInstitutionApiCredential(props.institution.slug, {
      name: form.name.trim(),
      scopes: form.scopes,
      expiresInDays: form.expiresInDays,
    })
    revealedSecret.value = {
      clientId: result.credential.clientId,
      clientSecret: result.clientSecret,
    }
    form.name = ''
    credentials.value = await listInstitutionApiCredentials(props.institution.slug)
    Message.success(t('adminInstitutionContent.credentialCreated'))
  } catch (error) {
    Message.error(getErrorMessage(error, t('adminInstitutionContent.credentialCreateFailed')))
  } finally {
    isCreating.value = false
  }
}

const rotateCredential = async (credentialId: string): Promise<void> => {
  actionId.value = credentialId
  actionKind.value = 'rotate'
  try {
    const result = await rotateInstitutionApiCredential(
      props.institution.slug,
      credentialId,
      form.expiresInDays,
    )
    revealedSecret.value = {
      clientId: result.credential.clientId,
      clientSecret: result.clientSecret,
    }
    credentials.value = await listInstitutionApiCredentials(props.institution.slug)
    Message.success(t('adminInstitutionContent.credentialRotated'))
  } catch (error) {
    Message.error(getErrorMessage(error, t('adminInstitutionContent.credentialRotateFailed')))
  } finally {
    actionId.value = ''
    actionKind.value = ''
  }
}

const revokeCredential = async (credentialId: string): Promise<void> => {
  actionId.value = credentialId
  actionKind.value = 'revoke'
  try {
    credentials.value = await revokeInstitutionApiCredential(
      props.institution.slug,
      credentialId,
    )
    if (revealedSecret.value?.clientId === credentials.value.find(
      (credential) => credential.id === credentialId,
    )?.clientId) {
      revealedSecret.value = null
    }
    Message.success(t('adminInstitutionContent.credentialRevoked'))
  } catch (error) {
    Message.error(getErrorMessage(error, t('adminInstitutionContent.credentialRevokeFailed')))
  } finally {
    actionId.value = ''
    actionKind.value = ''
  }
}

const copyText = async (value: string): Promise<void> => {
  try {
    await navigator.clipboard.writeText(value)
    Message.success(t('adminInstitutionContent.copied'))
  } catch (error) {
    Message.error(getErrorMessage(error, t('adminInstitutionContent.copyFailed')))
  }
}

const formatDateTime = (value: string): string => {
  return new Intl.DateTimeFormat(locale.value, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

const getStatusLabel = (status: InstitutionApiCredential['status']): string => {
  return t(`adminInstitutionContent.credentialStatuses.${status}`)
}

const getScopeDescription = (scope: InstitutionApiCredentialScope): string => {
  const key = {
    'papers:import': 'papersImport',
    'scholars:import': 'scholarsImport',
    'imports:read': 'importsRead',
  }[scope]
  return t(`adminInstitutionContent.credentialScopeDescriptions.${key}`)
}

watch(
  () => props.institution.slug,
  () => {
    credentials.value = []
    revealedSecret.value = null
    void loadCredentials()
  },
  { immediate: true },
)
</script>

<style lang="sass" scoped>
.panel-title
  margin: 0
  font-size: 20px
  color: #1f2937

.panel-subtitle
  margin: 8px 0 0
  font-size: 14px
  color: #667085

.secret-panel
  margin-top: 18px
  padding: 16px
  border-radius: 14px
  border: 1px solid rgba(178, 93, 15, 0.2)
  background: #fff8eb

.secret-warning
  margin-bottom: 10px
  color: #8a4b10
  font-weight: 700

.secret-row
  display: grid
  grid-template-columns: 100px minmax(0, 1fr) auto
  align-items: center
  gap: 10px
  margin-bottom: 10px

.secret-label
  color: #667085

.secret-row code
  overflow-wrap: anywhere

.credential-form
  margin-top: 18px

.credential-form-grid
  display: grid
  grid-template-columns: minmax(0, 2fr) minmax(180px, 1fr)
  gap: 16px

.scope-list
  display: flex
  flex-wrap: wrap
  gap: 14px

.scope-list :deep(.arco-checkbox)
  display: flex
  align-items: center
  gap: 6px

.credential-actions, .credential-title-row, .credential-id, .credential-card-actions
  display: flex
  align-items: center
  gap: 10px

.credential-hint, .credential-meta, .credential-state
  color: #667085
  font-size: 13px

.credential-list
  display: flex
  flex-direction: column
  gap: 10px
  margin-top: 18px

.credential-card
  display: flex
  justify-content: space-between
  gap: 16px
  padding: 16px
  border: 1px solid rgba(15, 47, 87, 0.08)
  border-radius: 14px
  background: #f8fafc

.credential-main
  min-width: 0

.credential-title-row
  flex-wrap: wrap

.credential-id
  margin-top: 8px

.credential-id code
  overflow-wrap: anywhere

.credential-meta
  margin-top: 6px

.credential-state
  padding: 20px 0

.status-badge
  padding: 4px 9px
  border-radius: 999px
  font-size: 12px
  font-weight: 700

.status-badge--active
  background: #edf7ee
  color: #137333

.status-badge--expired
  background: #fff8eb
  color: #8a4b10

.status-badge--revoked
  background: #fff1f0
  color: #b42318

@media (max-width: 768px)
  .credential-form-grid
    grid-template-columns: 1fr

  .credential-card
    flex-direction: column

  .secret-row
    grid-template-columns: 1fr
</style>
