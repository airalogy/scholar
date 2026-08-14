<template>
  <div class="admin-page">
    <div class="admin-container">
      <div class="admin-header">
        <div>
          <div class="admin-eyebrow">{{ $t('adminInstitutionMembers.eyebrow') }}</div>
          <h1 class="admin-title">{{ institution?.name || $t('adminInstitutionMembers.defaultTitle') }}</h1>
          <p class="admin-subtitle">
            {{ $t('adminInstitutionMembers.subtitle') }}
          </p>
        </div>
        <div class="header-actions">
          <router-link
            v-if="institution"
            :to="`/admin/institutions/${institution.slug}`"
            class="secondary-link"
          >
            {{ $t('adminInstitutionMembers.viewInstitutionContent') }}
          </router-link>
          <router-link to="/admin" class="back-link">{{ $t('adminInstitutionMembers.backToAdmin') }}</router-link>
        </div>
      </div>

      <div v-if="isLoading" class="admin-state">{{ $t('common.loading') }}</div>
      <div v-else-if="loadError" class="admin-state">{{ loadError }}</div>
      <template v-else-if="institution">
        <section class="admin-panel">
          <div class="panel-head">
            <div>
              <h2 class="panel-title">{{ $t('adminInstitutionMembers.homepageTitle') }}</h2>
              <p class="panel-subtitle">{{ $t('adminInstitutionMembers.homepageSubtitle') }}</p>
            </div>
            <span class="role-badge">{{ institutionRoleLabel }}</span>
          </div>

          <div class="panel-meta">
            <span>{{ $t('common.counts.members', { count: institution.memberCount }) }}</span>
            <span>{{ $t('common.counts.labs', { count: institution.labCount }) }}</span>
          </div>

          <a-form layout="vertical" :model="formState" class="content-form">
            <a-form-item field="summary" :label="$t('adminInstitutionMembers.summaryLabel')">
              <a-textarea
                v-model="formState.summary"
                :max-length="5000"
                :auto-size="{ minRows: 4, maxRows: 8 }"
                :disabled="!institution.access.can_edit_content"
                :placeholder="$t('adminInstitutionMembers.summaryPlaceholder')"
              />
            </a-form-item>
            <a-form-item field="website" :label="$t('common.website')">
              <a-input
                v-model="formState.website"
                :disabled="!institution.access.can_edit_content"
                placeholder="https://"
              />
            </a-form-item>
          </a-form>

          <div class="panel-actions">
            <a-button
              type="primary"
              :loading="isSavingContent"
              :disabled="!institution.access.can_edit_content"
              @click="saveInstitutionContent"
            >
              {{ $t('adminInstitutionMembers.saveHomepage') }}
            </a-button>
            <span v-if="!institution.access.can_edit_content" class="permission-note">
              {{ $t('adminInstitutionMembers.contentReadOnly') }}
            </span>
          </div>
        </section>

        <section class="admin-panel">
          <div class="panel-head">
            <div>
              <h2 class="panel-title">{{ $t('adminInstitutionMembers.provisionTitle') }}</h2>
              <p class="panel-subtitle">
                {{ $t('adminInstitutionMembers.provisionSubtitle') }}
              </p>
            </div>
          </div>

          <template v-if="institution.access.can_manage_members">
            <div class="provision-note">
              {{ $t('adminInstitutionMembers.provisionNote') }}
            </div>
            <div v-if="!canManageOwnerRole" class="permission-note permission-note--section">
              {{ $t('adminInstitutionMembers.ownerRoleRestriction') }}
            </div>

            <a-form layout="vertical" :model="provisionForm" class="provision-form">
              <div class="field-grid field-grid--triple">
                <a-form-item field="name" :label="$t('adminInstitutionMembers.memberNameLabel')">
                  <a-input
                    v-model="provisionForm.name"
                    :placeholder="$t('adminInstitutionMembers.memberNamePlaceholder')"
                  />
                </a-form-item>
                <a-form-item field="email" :label="$t('adminInstitutionMembers.institutionEmailLabel')">
                  <a-input
                    v-model="provisionForm.email"
                    placeholder="name@institution.edu.cn"
                  />
                </a-form-item>
                <a-form-item field="role" :label="$t('adminInstitutionMembers.institutionRoleLabel')">
                  <a-select v-model="provisionForm.role">
                    <a-option v-for="item in manageableRoleOptions" :key="item.value" :value="item.value">{{ item.label }}</a-option>
                  </a-select>
                </a-form-item>
              </div>

              <div class="field-grid field-grid--compact">
                <a-form-item field="canReviewContent" :label="$t('adminInstitutionMembers.reviewerPermissionLabel')">
                  <a-checkbox
                    :model-value="provisionForm.role === 'member' ? provisionForm.can_review_content : true"
                    :disabled="provisionForm.role !== 'member'"
                    @change="handleProvisionReviewPermissionChange"
                  >
                    {{ $t('adminInstitutionMembers.reviewerPermissionHint') }}
                  </a-checkbox>
                </a-form-item>
                <a-form-item field="canImportData" :label="$t('adminInstitutionMembers.importPermissionLabel')">
                  <a-checkbox
                    :model-value="provisionForm.role === 'member' ? provisionForm.can_import_data : true"
                    :disabled="provisionForm.role !== 'member'"
                    @change="handleProvisionImportPermissionChange"
                  >
                    {{ $t('adminInstitutionMembers.importPermissionHint') }}
                  </a-checkbox>
                </a-form-item>
              </div>

              <div class="field-grid field-grid--quad">
                <a-form-item field="externalId" :label="$t('adminInstitutionMembers.externalIdLabel')">
                  <a-input
                    v-model="provisionForm.externalId"
                    :placeholder="$t('upload.optional')"
                  />
                </a-form-item>
                <a-form-item field="college" :label="$t('common.college')">
                  <a-input
                    v-model="provisionForm.college"
                    :placeholder="$t('upload.optional')"
                  />
                </a-form-item>
                <a-form-item field="major" :label="$t('settings.major')">
                  <a-input
                    v-model="provisionForm.major"
                    :placeholder="$t('upload.optional')"
                  />
                </a-form-item>
                <a-form-item field="laboratory" :label="$t('settings.lab')">
                  <a-input
                    v-model="provisionForm.laboratory"
                    :placeholder="$t('upload.optional')"
                  />
                </a-form-item>
              </div>

              <div class="field-grid field-grid--compact">
                <a-form-item field="expiresInDays" :label="$t('adminInstitutionMembers.expiresInDaysLabel')">
                  <a-input-number
                    v-model="provisionForm.expiresInDays"
                    :min="1"
                    :max="365"
                    :step="1"
                    mode="button"
                  />
                </a-form-item>
              </div>
            </a-form>

            <div class="panel-actions">
              <a-button
                type="primary"
                :loading="isSavingProvision"
                :disabled="!canSubmitProvision"
                @click="saveProvision"
              >
                {{ $t('adminInstitutionMembers.saveProvision') }}
              </a-button>
              <span class="permission-note">
                {{ $t('adminInstitutionMembers.provisionDuplicateHint') }}
              </span>
            </div>

            <div v-if="isProvisionLoading" class="table-state">{{ $t('adminInstitutionMembers.provisionLoading') }}</div>
            <div v-else-if="provisions.length" class="provision-list">
              <article
                v-for="provision in provisions"
                :key="provision.id"
                class="provision-card"
              >
                <div class="provision-main">
                  <div class="provision-head">
                    <div class="search-name">{{ provision.name }}</div>
                    <span
                      class="status-badge"
                      :class="`status-badge--${provision.status}`"
                    >
                      {{ getProvisionStatusLabel(provision.status) }}
                    </span>
                  </div>
                  <div class="search-meta">{{ provision.email }}</div>
                  <div class="search-meta">
                    {{ formatProvisionMeta(provision) }}
                  </div>
                  <div v-if="provision.status === 'pending_activation' && provision.inviteToken" class="token-block">
                    <div class="token-label">{{ $t('adminInstitutionMembers.tokenLabel') }}</div>
                    <div class="token-value">{{ provision.inviteToken }}</div>
                  </div>
                  <div v-else-if="provision.status === 'claimed'" class="search-meta">
                    {{ $t('adminInstitutionMembers.claimedWithName', {
                      name: provision.claimedUserName || $t('adminInstitutionMembers.existingPlatformAccount'),
                    }) }}
                    <span v-if="provision.claimedAt"> · {{ formatDateTime(provision.claimedAt) }}</span>
                  </div>
                  <div v-if="provision.expiresAt" class="search-meta">
                    {{ $t('adminInstitutionMembers.expiresAt', { date: formatDateTime(provision.expiresAt) }) }}
                  </div>
                </div>

                <div class="provision-actions">
                  <a-button
                    v-if="provision.status === 'pending_activation' && provision.inviteToken"
                    type="outline"
                    size="small"
                    :loading="provisionActionId === provision.id && provisionActionKind === 'copy'"
                    @click="copyProvisionToken(provision.id, provision.inviteToken)"
                  >
                    {{ $t('adminInstitutionMembers.copyActivationToken') }}
                  </a-button>
                  <a-button
                    v-if="provision.status === 'pending_activation'"
                    status="danger"
                    type="outline"
                    size="small"
                    :disabled="!canManageMember(provision.role)"
                    :loading="provisionActionId === provision.id && provisionActionKind === 'disable'"
                    @click="disableProvision(provision.id)"
                  >
                    {{ $t('adminInstitutionMembers.disableProvision') }}
                  </a-button>
                </div>
              </article>
            </div>
            <div v-else class="table-state">{{ $t('adminInstitutionMembers.noProvisions') }}</div>
          </template>

          <div v-else class="table-state">
            {{ $t('adminInstitutionMembers.noProvisionPermission') }}
          </div>
        </section>

        <section class="admin-panel">
          <div class="panel-head">
            <div>
              <h2 class="panel-title">{{ $t('adminInstitutionMembers.joinRequestsTitle') }}</h2>
              <p class="panel-subtitle">{{ $t('adminInstitutionMembers.joinRequestsSubtitle') }}</p>
            </div>
          </div>

          <template v-if="institution.access.can_manage_members">
            <div v-if="isJoinRequestLoading" class="table-state">{{ $t('adminInstitutionMembers.joinRequestsLoading') }}</div>
            <div v-else-if="joinRequests.length" class="join-request-list">
              <article v-for="request in joinRequests" :key="request.id" class="join-request-item">
                <div class="join-request-main">
                  <div class="provision-head">
                    <div class="search-user">
                      <div class="avatar">
                        <img v-if="request.userAvatar" :src="request.userAvatar" :alt="request.userName" />
                        <span v-else>{{ request.userName.charAt(0) }}</span>
                      </div>
                      <div>
                        <div class="search-name">{{ request.userName }}</div>
                        <div class="search-meta">{{ request.userEmail }}</div>
                        <div class="search-meta">{{ formatJoinRequestMeta(request) }}</div>
                      </div>
                    </div>
                    <span
                      class="status-badge"
                      :class="`status-badge--${request.status}`"
                    >
                      {{ getJoinRequestStatusLabel(request.status) }}
                    </span>
                  </div>
                  <div class="search-meta">
                    {{ $t('adminInstitutionMembers.joinRequestCreatedAt', { date: formatDateTime(request.createdAt) }) }}
                  </div>
                  <div v-if="request.reason" class="request-note-block">
                    <div class="request-note-label">{{ $t('adminInstitutionMembers.joinRequestReasonLabel') }}</div>
                    <div class="search-meta search-meta--block">{{ request.reason }}</div>
                  </div>
                  <div v-if="request.reviewNotes" class="request-note-block">
                    <div class="request-note-label">{{ $t('adminInstitutionMembers.joinRequestReviewNotesLabel') }}</div>
                    <div class="search-meta search-meta--block">{{ request.reviewNotes }}</div>
                  </div>
                  <div v-if="request.reviewedByName" class="search-meta">
                    {{ $t('adminInstitutionMembers.joinRequestReviewedBy', {
                      name: request.reviewedByName,
                      date: formatDateTime(request.reviewedAt),
                    }) }}
                  </div>
                </div>

                <div v-if="request.status === 'pending'" class="join-request-review">
                  <a-textarea
                    v-model="joinRequestDecisionNotes[request.id]"
                    :max-length="2000"
                    :auto-size="{ minRows: 3, maxRows: 5 }"
                    :placeholder="$t('adminInstitutionMembers.joinRequestNotesPlaceholder')"
                  />
                  <div class="provision-actions join-request-review-actions">
                    <a-button
                      type="primary"
                      :loading="joinActionId === request.id && joinActionStatus === 'approved'"
                      @click="reviewJoinRequest(request.id, 'approved')"
                    >
                      {{ $t('adminInstitutionMembers.joinRequestApprove') }}
                    </a-button>
                    <a-button
                      status="danger"
                      type="outline"
                      :loading="joinActionId === request.id && joinActionStatus === 'rejected'"
                      @click="reviewJoinRequest(request.id, 'rejected')"
                    >
                      {{ $t('adminInstitutionMembers.joinRequestReject') }}
                    </a-button>
                  </div>
                </div>
              </article>
            </div>
            <div v-else class="table-state">{{ $t('adminInstitutionMembers.noJoinRequests') }}</div>
          </template>

          <div v-else class="table-state">
            {{ $t('adminInstitutionMembers.noJoinRequestPermission') }}
          </div>
        </section>

        <section class="admin-panel">
          <div class="panel-head">
            <div>
              <h2 class="panel-title">{{ $t('adminInstitutionMembers.memberPermissionsTitle') }}</h2>
              <p class="panel-subtitle">{{ $t('adminInstitutionMembers.memberPermissionsSubtitle') }}</p>
            </div>
          </div>

          <template v-if="institution.access.can_manage_members">
            <div class="member-toolbar">
              <a-input-search
                v-model="searchQuery"
                class="member-search"
                :placeholder="$t('adminInstitutionMembers.memberSearchPlaceholder')"
                allow-clear
                @search="searchDirectory"
                @press-enter="searchDirectory"
              />
              <a-select v-model="searchRole" class="role-select">
                <a-option v-for="item in manageableRoleOptions" :key="item.value" :value="item.value">{{ item.label }}</a-option>
              </a-select>
              <a-checkbox
                class="reviewer-toggle"
                :model-value="searchRole === 'member' ? searchCanReviewContent : true"
                :disabled="searchRole !== 'member'"
                @change="handleSearchReviewPermissionChange"
              >
                {{ $t('adminInstitutionMembers.reviewerPermissionLabel') }}
              </a-checkbox>
              <a-checkbox
                class="reviewer-toggle"
                :model-value="searchRole === 'member' ? searchCanImportData : true"
                :disabled="searchRole !== 'member'"
                @change="handleSearchImportPermissionChange"
              >
                {{ $t('adminInstitutionMembers.importPermissionLabel') }}
              </a-checkbox>
            </div>
            <div v-if="!canManageOwnerRole" class="permission-note permission-note--section">
              {{ $t('adminInstitutionMembers.ownerRoleRestriction') }}
            </div>

            <div v-if="searchResults.length" class="search-grid">
              <article v-for="user in searchResults" :key="user.id" class="search-card">
                <div class="search-user">
                  <div class="avatar">
                    <img v-if="user.avatar" :src="user.avatar" :alt="user.name" />
                    <span v-else>{{ user.name.charAt(0) }}</span>
                  </div>
                  <div>
                    <div class="search-name">{{ user.name }}</div>
                    <div class="search-meta">{{ user.email }}</div>
                    <div class="search-meta">
                      {{ [user.college, user.major, user.laboratory].filter(Boolean).join(' / ') || $t('common.noAdditionalInfo') }}
                    </div>
                  </div>
                </div>
                <a-button
                  type="outline"
                  :loading="actionUserId === user.id"
                  @click="upsertMember(user.id, searchRole, searchCanReviewContent, searchCanImportData)"
                >
                  {{ memberIdSet.has(user.id) ? $t('common.updateRole') : $t('common.addToInstitution') }}
                </a-button>
              </article>
            </div>
            <div v-else-if="isSearching" class="search-state">{{ $t('common.searching') }}</div>
            <div v-else class="search-state">{{ $t('adminInstitutionMembers.memberSearchHint') }}</div>

            <div v-if="isMembershipLoading" class="table-state">{{ $t('adminInstitutionMembers.memberListLoading') }}</div>
            <div v-else-if="memberships.length" class="member-list">
              <article v-for="member in memberships" :key="member.userId" class="member-card">
                <div class="search-user">
                  <div class="avatar">
                    <img v-if="member.avatar" :src="member.avatar" :alt="member.name" />
                    <span v-else>{{ member.name.charAt(0) }}</span>
                  </div>
                  <div>
                    <div class="search-name">{{ member.name }}</div>
                    <div class="search-meta">{{ member.email }}</div>
                    <div class="search-meta">
                      {{ [member.degree, member.major].filter(Boolean).join(' / ') || $t('common.noAdditionalInfo') }}
                    </div>
                    <div class="search-meta">
                      {{ $t('adminInstitutionMembers.paperStats', {
                        total: member.paperCount,
                        approved: member.approvedPaperCount,
                      }) }}
                    </div>
                  </div>
                </div>

                <div class="member-actions">
                  <a-checkbox
                    class="reviewer-toggle"
                    :model-value="member.role === 'member' ? member.canReviewContent : true"
                    :disabled="!canManageMember(member.role) || member.role !== 'member'"
                    @change="handleReviewPermissionChange(member, $event)"
                  >
                    {{ $t('adminInstitutionMembers.reviewerPermissionLabel') }}
                  </a-checkbox>
                  <a-checkbox
                    class="reviewer-toggle"
                    :model-value="member.role === 'member' ? member.canImportData : true"
                    :disabled="!canManageMember(member.role) || member.role !== 'member'"
                    @change="handleImportPermissionChange(member, $event)"
                  >
                    {{ $t('adminInstitutionMembers.importPermissionLabel') }}
                  </a-checkbox>
                  <a-select
                    :model-value="member.role"
                    size="small"
                    class="inline-role-select"
                    :disabled="!canManageMember(member.role)"
                    @change="handleRoleChange(member, $event)"
                  >
                    <a-option v-for="item in getManageableRoleOptions(member.role)" :key="item.value" :value="item.value">{{ item.label }}</a-option>
                  </a-select>
                  <a-button
                    status="danger"
                    type="outline"
                    size="small"
                    :disabled="!canManageMember(member.role)"
                    :loading="actionUserId === member.userId"
                    @click="removeMember(member.userId)"
                  >
                    {{ $t('common.remove') }}
                  </a-button>
                </div>
              </article>
            </div>
            <div v-else class="table-state">{{ $t('adminInstitutionMembers.noMembers') }}</div>
          </template>

          <div v-else class="table-state">
            {{ $t('adminInstitutionMembers.noMemberPermission') }}
          </div>
        </section>

        <section class="admin-panel">
          <div class="panel-head">
            <div>
              <h2 class="panel-title">{{ $t('adminInstitutionMembers.labsTitle') }}</h2>
              <p class="panel-subtitle">{{ $t('adminInstitutionMembers.labsSubtitle') }}</p>
            </div>
          </div>

          <div v-if="institution.labs.length" class="lab-grid">
            <article v-for="lab in institution.labs" :key="lab.id" class="lab-card">
              <div>
                <div class="lab-name">{{ lab.name }}</div>
                <div class="lab-meta">
                  {{ [lab.college, lab.location].filter(Boolean).join(' / ') || $t('common.notFilled') }}
                </div>
                <div class="lab-meta">{{ $t('common.counts.members', { count: lab.memberCount }) }}</div>
              </div>
              <router-link :to="`/admin/labs/${lab.slug}/settings`" class="secondary-link">
                {{ $t('adminInstitutionMembers.openLabSettings') }}
              </router-link>
            </article>
          </div>
          <div v-else class="table-state">{{ $t('adminInstitutionMembers.noLabs') }}</div>
        </section>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import { useI18n } from 'vue-i18n'
import {
  reviewInstitutionJoinRequest,
  listInstitutionJoinRequests,
  disableInstitutionProvision,
  getInstitution,
  listInstitutionMemberships,
  listInstitutionProvisions,
  removeInstitutionMembership,
  updateInstitution,
  upsertInstitutionMembership,
  upsertInstitutionProvision,
  type InstitutionDetailResponse,
  type InstitutionJoinRequestItem,
  type InstitutionJoinRequestStatus,
  type InstitutionMembershipItem,
  type InstitutionProvisionItem,
  type InstitutionProvisionStatus,
  type InstitutionRole,
} from '@/api/institutions'
import { searchUsers, type UserSearchItem } from '@/api/users'
import { INSTITUTION_ROLE_LABEL_KEYS, PLATFORM_ROLE_LABEL_KEYS, PROVISION_STATUS_LABEL_KEYS } from '@/i18n/helpers'

const route = useRoute()
const { t, locale } = useI18n()

const institution = ref<InstitutionDetailResponse | null>(null)
const memberships = ref<InstitutionMembershipItem[]>([])
const provisions = ref<InstitutionProvisionItem[]>([])
const joinRequests = ref<InstitutionJoinRequestItem[]>([])
const searchResults = ref<UserSearchItem[]>([])
const searchQuery = ref('')
const searchRole = ref<InstitutionRole>('member')
const searchCanReviewContent = ref(false)
const searchCanImportData = ref(false)
const isLoading = ref(false)
const isSavingContent = ref(false)
const isMembershipLoading = ref(false)
const isProvisionLoading = ref(false)
const isJoinRequestLoading = ref(false)
const isSavingProvision = ref(false)
const isSearching = ref(false)
const actionUserId = ref('')
const provisionActionId = ref('')
const provisionActionKind = ref<'copy' | 'disable' | ''>('')
const joinActionId = ref('')
const joinActionStatus = ref<'approved' | 'rejected' | ''>('')
const loadError = ref('')
const joinRequestDecisionNotes = reactive<Record<string, string>>({})

const formState = reactive({
  summary: '',
  website: '',
})

const provisionForm = reactive({
  email: '',
  name: '',
  role: 'member' as InstitutionRole,
  can_review_content: false,
  can_import_data: false,
  externalId: '',
  college: '',
  major: '',
  laboratory: '',
  expiresInDays: 30,
})

const memberIdSet = computed(() => new Set(memberships.value.map((member) => member.userId)))
const allRoleOptions = computed(() => {
  return [
    { value: 'member' as const, label: t('common.roles.institution.member') },
    { value: 'admin' as const, label: t('common.roles.institution.admin') },
    { value: 'owner' as const, label: t('common.roles.institution.owner') },
  ]
})
const canManageOwnerRole = computed(() => {
  const access = institution.value?.access
  if (!access) {
    return false
  }

  return access.platform_role === 'platform_admin' || access.institution_role === 'owner'
})
const manageableRoleOptions = computed(() => {
  if (canManageOwnerRole.value) {
    return allRoleOptions.value
  }

  return allRoleOptions.value.filter((item) => item.value !== 'owner')
})
const canSubmitProvision = computed(() => {
  return !isSavingProvision.value &&
    Boolean(provisionForm.email.trim()) &&
    Boolean(provisionForm.name.trim())
})

const institutionRoleLabel = computed(() => {
  const access = institution.value?.access
  if (!access) {
    return ''
  }

  if (access.platform_role === 'platform_admin') {
    return t(PLATFORM_ROLE_LABEL_KEYS.platform_admin)
  }
  if (access.institution_role === 'owner') {
    return t(INSTITUTION_ROLE_LABEL_KEYS.owner)
  }
  if (access.institution_role === 'admin') {
    return t(INSTITUTION_ROLE_LABEL_KEYS.admin)
  }
  if (access.can_review_content) {
    return t(INSTITUTION_ROLE_LABEL_KEYS.reviewer)
  }
  return t(INSTITUTION_ROLE_LABEL_KEYS.member)
})

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

const resetProvisionForm = (): void => {
  provisionForm.email = ''
  provisionForm.name = ''
  provisionForm.role = 'member'
  provisionForm.can_review_content = false
  provisionForm.can_import_data = false
  provisionForm.externalId = ''
  provisionForm.college = ''
  provisionForm.major = ''
  provisionForm.laboratory = ''
  provisionForm.expiresInDays = 30
}

const trimOrUndefined = (value: string): string | undefined => {
  const trimmed = value.trim()
  return trimmed || undefined
}

const formatDateTime = (value: string | null): string => {
  if (!value) {
    return t('adminInstitutionMembers.noTime')
  }

  return new Intl.DateTimeFormat(locale.value, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

const normalizeCheckboxValue = (value: unknown): boolean => {
  return value === true
}

const resolveRequestedReviewPermission = (
  role: InstitutionRole,
  canReviewContent: boolean,
): boolean => {
  return role === 'member' ? canReviewContent : false
}

const resolveRequestedImportPermission = (
  role: InstitutionRole,
  canImportData: boolean,
): boolean => {
  return role === 'member' ? canImportData : false
}

const getRoleLabel = (
  role: InstitutionRole,
  canReviewContent = false,
): string => {
  if (role === 'member' && canReviewContent) {
    return t(INSTITUTION_ROLE_LABEL_KEYS.reviewer)
  }

  return t(INSTITUTION_ROLE_LABEL_KEYS[role])
}

const canManageMember = (role: InstitutionRole): boolean => {
  return canManageOwnerRole.value || role !== 'owner'
}

const getManageableRoleOptions = (
  role: InstitutionRole,
): Array<{ value: InstitutionRole, label: string }> => {
  if (canManageMember(role)) {
    return manageableRoleOptions.value
  }

  return allRoleOptions.value.filter((item) => item.value === role)
}

const getProvisionStatusLabel = (status: InstitutionProvisionStatus): string => {
  return t(PROVISION_STATUS_LABEL_KEYS[status])
}

const getJoinRequestStatusLabel = (status: InstitutionJoinRequestStatus): string => {
  if (status === 'approved') {
    return t('adminInstitutionMembers.joinRequestStatusApproved')
  }

  if (status === 'rejected') {
    return t('adminInstitutionMembers.joinRequestStatusRejected')
  }

  return t('adminInstitutionMembers.joinRequestStatusPending')
}

const formatProvisionMeta = (provision: InstitutionProvisionItem): string => {
  const parts = [
    getRoleLabel(provision.role, provision.canReviewContent),
    provision.externalId,
    provision.college,
    provision.major,
    provision.laboratory,
  ].filter(Boolean)

  return parts.join(' / ') || t('common.noAdditionalInfo')
}

const formatJoinRequestMeta = (request: InstitutionJoinRequestItem): string => {
  const parts = [
    request.userDegree,
    request.userCollege,
    request.userMajor,
    request.userLaboratory,
  ].filter(Boolean)

  return parts.join(' / ') || t('common.noAdditionalInfo')
}

const syncFormState = (): void => {
  formState.summary = institution.value?.summary ?? ''
  formState.website = institution.value?.website ?? ''
}

const syncJoinRequestDecisionState = (items: InstitutionJoinRequestItem[]): void => {
  const activeIds = new Set(items.map((item) => item.id))

  for (const item of items) {
    if (joinRequestDecisionNotes[item.id] === undefined) {
      joinRequestDecisionNotes[item.id] = item.reviewNotes ?? ''
    } else if (item.status !== 'pending') {
      joinRequestDecisionNotes[item.id] = item.reviewNotes ?? ''
    }
  }

  for (const key of Object.keys(joinRequestDecisionNotes)) {
    if (!activeIds.has(key)) {
      delete joinRequestDecisionNotes[key]
    }
  }
}

const syncManageableRoleState = (): void => {
  const allowedRoles = new Set(manageableRoleOptions.value.map((item) => item.value))

  if (!allowedRoles.has(searchRole.value)) {
    searchRole.value = 'member'
  }

  if (!allowedRoles.has(provisionForm.role)) {
    provisionForm.role = 'member'
  }
}

const loadMemberships = async (slug: string): Promise<void> => {
  if (!institution.value?.access.can_manage_members) {
    memberships.value = []
    return
  }

  isMembershipLoading.value = true
  try {
    memberships.value = await listInstitutionMemberships(slug)
  } finally {
    isMembershipLoading.value = false
  }
}

const loadProvisions = async (slug: string): Promise<void> => {
  if (!institution.value?.access.can_manage_members) {
    provisions.value = []
    return
  }

  isProvisionLoading.value = true
  try {
    provisions.value = await listInstitutionProvisions(slug)
  } finally {
    isProvisionLoading.value = false
  }
}

const loadJoinRequests = async (slug: string): Promise<void> => {
  if (!institution.value?.access.can_manage_members) {
    joinRequests.value = []
    syncJoinRequestDecisionState([])
    return
  }

  isJoinRequestLoading.value = true
  try {
    joinRequests.value = await listInstitutionJoinRequests(slug)
    syncJoinRequestDecisionState(joinRequests.value)
  } finally {
    isJoinRequestLoading.value = false
  }
}

const refreshInstitutionDetail = async (slug: string): Promise<void> => {
  institution.value = await getInstitution(slug)
  syncFormState()
}

const load = async (slug: string): Promise<void> => {
  isLoading.value = true
  loadError.value = ''
  searchResults.value = []

  try {
    await refreshInstitutionDetail(slug)
    await Promise.all([
      loadMemberships(slug),
      loadProvisions(slug),
      loadJoinRequests(slug),
    ])
  } catch (error) {
    institution.value = null
    memberships.value = []
    provisions.value = []
    joinRequests.value = []
    syncJoinRequestDecisionState([])
    loadError.value = getErrorMessage(error, t('adminInstitutionMembers.loadFailed'))
  } finally {
    isLoading.value = false
  }
}

const saveInstitutionContent = async (): Promise<void> => {
  const slug = String(route.params.slug ?? '')
  if (!slug || !institution.value) {
    return
  }

  isSavingContent.value = true
  try {
    institution.value = await updateInstitution(slug, {
      summary: formState.summary.trim(),
      website: formState.website.trim(),
    })
    syncFormState()
    Message.success(t('adminInstitutionMembers.saveHomepageSuccess'))
  } catch (error) {
    Message.error(getErrorMessage(error, t('adminInstitutionMembers.saveHomepageFailed')))
  } finally {
    isSavingContent.value = false
  }
}

const saveProvision = async (): Promise<void> => {
  const slug = String(route.params.slug ?? '')
  if (!slug || !canSubmitProvision.value) {
    return
  }

  isSavingProvision.value = true
  try {
    provisions.value = await upsertInstitutionProvision(slug, {
      email: provisionForm.email.trim(),
      name: provisionForm.name.trim(),
      role: provisionForm.role,
      can_review_content: resolveRequestedReviewPermission(
        provisionForm.role,
        provisionForm.can_review_content,
      ),
      can_import_data: resolveRequestedImportPermission(
        provisionForm.role,
        provisionForm.can_import_data,
      ),
      externalId: trimOrUndefined(provisionForm.externalId),
      college: trimOrUndefined(provisionForm.college),
      major: trimOrUndefined(provisionForm.major),
      laboratory: trimOrUndefined(provisionForm.laboratory),
      expiresInDays: provisionForm.expiresInDays,
    })
    await loadMemberships(slug)
    resetProvisionForm()
    Message.success(t('adminInstitutionMembers.provisionSaved'))
  } catch (error) {
    Message.error(getErrorMessage(error, t('adminInstitutionMembers.provisionSaveFailed')))
  } finally {
    isSavingProvision.value = false
  }
}

const copyProvisionToken = async (provisionId: string, token: string): Promise<void> => {
  provisionActionId.value = provisionId
  provisionActionKind.value = 'copy'
  try {
    await navigator.clipboard.writeText(token)
    Message.success(t('adminInstitutionMembers.tokenCopied'))
  } catch (error) {
    Message.error(getErrorMessage(error, t('adminInstitutionMembers.tokenCopyFailed')))
  } finally {
    provisionActionId.value = ''
    provisionActionKind.value = ''
  }
}

const disableProvision = async (provisionId: string): Promise<void> => {
  const slug = String(route.params.slug ?? '')
  if (!slug) {
    return
  }

  provisionActionId.value = provisionId
  provisionActionKind.value = 'disable'
  try {
    provisions.value = await disableInstitutionProvision(slug, provisionId)
    Message.success(t('adminInstitutionMembers.provisionDisabled'))
  } catch (error) {
    Message.error(getErrorMessage(error, t('adminInstitutionMembers.provisionDisableFailed')))
  } finally {
    provisionActionId.value = ''
    provisionActionKind.value = ''
  }
}

const reviewJoinRequest = async (
  requestId: string,
  status: 'approved' | 'rejected',
): Promise<void> => {
  const slug = String(route.params.slug ?? '')
  if (!slug) {
    return
  }

  joinActionId.value = requestId
  joinActionStatus.value = status
  try {
    joinRequests.value = await reviewInstitutionJoinRequest(slug, requestId, {
      status,
      notes: joinRequestDecisionNotes[requestId]?.trim() || undefined,
    })
    syncJoinRequestDecisionState(joinRequests.value)
    await Promise.all([
      refreshInstitutionDetail(slug),
      loadMemberships(slug),
    ])
    Message.success(t('adminInstitutionMembers.joinRequestReviewSuccess'))
  } catch (error) {
    Message.error(getErrorMessage(error, t('adminInstitutionMembers.joinRequestReviewFailed')))
  } finally {
    joinActionId.value = ''
    joinActionStatus.value = ''
  }
}

const searchDirectory = async (): Promise<void> => {
  const keyword = searchQuery.value.trim()
  if (!keyword) {
    searchResults.value = []
    return
  }

  isSearching.value = true
  try {
    searchResults.value = await searchUsers(keyword)
  } catch (error) {
    Message.error(getErrorMessage(error, t('adminInstitutionMembers.searchUsersFailed')))
  } finally {
    isSearching.value = false
  }
}

const upsertMember = async (
  userId: string,
  role: InstitutionRole,
  canReviewContent: boolean,
  canImportData: boolean,
): Promise<void> => {
  const slug = String(route.params.slug ?? '')
  if (!slug) {
    return
  }

  actionUserId.value = userId
  try {
    memberships.value = await upsertInstitutionMembership(slug, {
      userId,
      role,
      can_review_content: resolveRequestedReviewPermission(role, canReviewContent),
      can_import_data: resolveRequestedImportPermission(role, canImportData),
    })
    Message.success(t('adminInstitutionMembers.memberUpdated'))
  } catch (error) {
    Message.error(getErrorMessage(error, t('adminInstitutionMembers.memberUpdateFailed')))
  } finally {
    actionUserId.value = ''
  }
}

const handleRoleChange = (
  member: InstitutionMembershipItem,
  value: unknown,
): void => {
  if (typeof value !== 'string') {
    return
  }

  void upsertMember(
    member.userId,
    value as InstitutionRole,
    member.role === 'member' ? member.canReviewContent : false,
    member.role === 'member' ? member.canImportData : false,
  )
}

const handleReviewPermissionChange = (
  member: InstitutionMembershipItem,
  value: unknown,
): void => {
  if (member.role !== 'member') {
    return
  }

  void upsertMember(
    member.userId,
    member.role,
    normalizeCheckboxValue(value),
    member.canImportData,
  )
}

const handleImportPermissionChange = (
  member: InstitutionMembershipItem,
  value: unknown,
): void => {
  if (member.role !== 'member') {
    return
  }

  void upsertMember(
    member.userId,
    member.role,
    member.canReviewContent,
    normalizeCheckboxValue(value),
  )
}

const handleSearchReviewPermissionChange = (value: unknown): void => {
  searchCanReviewContent.value = normalizeCheckboxValue(value)
}

const handleSearchImportPermissionChange = (value: unknown): void => {
  searchCanImportData.value = normalizeCheckboxValue(value)
}

const handleProvisionReviewPermissionChange = (value: unknown): void => {
  provisionForm.can_review_content = normalizeCheckboxValue(value)
}

const handleProvisionImportPermissionChange = (value: unknown): void => {
  provisionForm.can_import_data = normalizeCheckboxValue(value)
}

const removeMember = async (userId: string): Promise<void> => {
  const slug = String(route.params.slug ?? '')
  if (!slug) {
    return
  }

  actionUserId.value = userId
  try {
    memberships.value = await removeInstitutionMembership(slug, userId)
    Message.success(t('adminInstitutionMembers.memberRemoved'))
  } catch (error) {
    Message.error(getErrorMessage(error, t('adminInstitutionMembers.memberRemoveFailed')))
  } finally {
    actionUserId.value = ''
  }
}

watch(
  () => String(route.params.slug ?? ''),
  (slug) => {
    if (!slug) {
      institution.value = null
      memberships.value = []
      provisions.value = []
      joinRequests.value = []
      syncJoinRequestDecisionState([])
      return
    }
    void load(slug)
  },
  { immediate: true },
)

watch(manageableRoleOptions, () => {
  syncManageableRoleState()
}, { immediate: true })
</script>

<style lang="sass" scoped>
.admin-page
  min-height: calc(100vh - var(--scholar-navbar-height))
  padding: 28px 0 48px
  background: linear-gradient(180deg, #f6f8fb 0%, #ffffff 100%)

.admin-container
  width: 1120px
  max-width: 100%
  margin: 0 auto
  padding: 0 30px

.admin-header
  display: flex
  align-items: flex-start
  justify-content: space-between
  gap: 20px
  margin-bottom: 22px

.header-actions
  display: flex
  align-items: center
  gap: 12px
  flex-wrap: wrap
  justify-content: flex-end

.admin-eyebrow
  font-size: 12px
  letter-spacing: 0.22em
  text-transform: uppercase
  color: #7d8ca3

.admin-title
  margin: 10px 0 0
  font-size: 30px
  font-weight: 700
  color: #1f2937

.admin-subtitle
  margin: 10px 0 0
  font-size: 14px
  color: #667085

.back-link
  color: #0f62fe
  text-decoration: none
  font-weight: 600

.secondary-link
  display: inline-flex
  align-items: center
  justify-content: center
  min-height: 38px
  padding: 0 16px
  border-radius: 999px
  background: #eef4ff
  color: #0f2f57
  text-decoration: none
  font-weight: 600

.admin-panel
  padding: 24px
  border-radius: 22px
  border: 1px solid rgba(15, 47, 87, 0.08)
  background: #fff
  box-shadow: 0 14px 34px rgba(15, 47, 87, 0.06)

.admin-panel + .admin-panel
  margin-top: 20px

.panel-head
  display: flex
  align-items: flex-start
  justify-content: space-between
  gap: 16px

.panel-title
  margin: 0
  font-size: 20px
  color: #1f2937

.panel-subtitle
  margin: 8px 0 0
  font-size: 14px
  color: #667085

.role-badge
  padding: 6px 12px
  border-radius: 999px
  background: #eef4ff
  color: #0f62fe
  font-size: 12px
  font-weight: 600

.panel-meta
  display: flex
  flex-wrap: wrap
  gap: 10px 16px
  margin-top: 14px
  font-size: 13px
  color: #667085

.content-form
  margin-top: 18px

.field-grid
  display: grid
  gap: 14px

.field-grid--triple
  grid-template-columns: repeat(3, minmax(0, 1fr))

.field-grid--quad
  grid-template-columns: repeat(4, minmax(0, 1fr))

.field-grid--compact
  grid-template-columns: minmax(180px, 260px)

.panel-actions
  display: flex
  align-items: center
  gap: 14px
  flex-wrap: wrap

.permission-note
  font-size: 13px
  color: #98a2b3

.permission-note--section
  margin-top: 12px

.provision-note
  margin-top: 18px
  padding: 14px 16px
  border-radius: 16px
  background: #f3f7ff
  color: #355070
  font-size: 13px
  line-height: 1.6

.provision-form
  margin-top: 18px

.provision-list
  display: flex
  flex-direction: column
  gap: 12px
  margin-top: 18px

.provision-card
  display: flex
  align-items: flex-start
  justify-content: space-between
  gap: 18px
  padding: 18px
  border-radius: 18px
  background: #f8fafc

.provision-main
  min-width: 0
  flex: 1

.provision-head
  display: flex
  align-items: center
  gap: 10px
  flex-wrap: wrap

.provision-actions
  display: flex
  align-items: center
  gap: 10px
  flex-wrap: wrap

.status-badge
  padding: 4px 10px
  border-radius: 999px
  font-size: 12px
  font-weight: 700

.status-badge--pending_activation
  background: #fff3e8
  color: #b25d0f

.status-badge--claimed
  background: #e9f8ef
  color: #137333

.status-badge--disabled
  background: #f2f4f7
  color: #667085

.status-badge--pending
  background: #fff3e8
  color: #b25d0f

.status-badge--approved
  background: #e9f8ef
  color: #137333

.status-badge--rejected
  background: #fdecee
  color: #b42318

.token-block
  margin-top: 12px
  padding: 12px 14px
  border-radius: 14px
  background: #ffffff
  border: 1px dashed rgba(15, 98, 254, 0.26)

.token-label
  font-size: 12px
  color: #667085

.token-value
  margin-top: 6px
  word-break: break-all
  font-family: 'SFMono-Regular', 'Consolas', monospace
  font-size: 13px
  color: #0f2f57

.join-request-list
  display: flex
  flex-direction: column
  gap: 12px
  margin-top: 18px

.join-request-item
  display: flex
  align-items: flex-start
  justify-content: space-between
  gap: 18px
  padding: 18px
  border-radius: 18px
  background: #f8fafc

.join-request-main
  min-width: 0
  flex: 1

.join-request-review
  width: 320px
  max-width: 100%

.join-request-review-actions
  margin-top: 12px
  justify-content: flex-end

.request-note-block
  margin-top: 12px
  padding: 12px 14px
  border-radius: 14px
  background: #ffffff
  border: 1px solid rgba(15, 47, 87, 0.08)

.request-note-label
  font-size: 12px
  font-weight: 700
  color: #475467

.search-meta--block
  white-space: pre-wrap

.member-toolbar
  display: flex
  gap: 12px
  margin-top: 18px
  flex-wrap: wrap

.member-search
  flex: 1

.role-select
  width: 160px

.reviewer-toggle
  display: inline-flex
  align-items: center
  min-height: 34px
  color: #475467

.search-grid
  display: grid
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr))
  gap: 14px
  margin-top: 16px

.search-card, .member-card, .lab-card
  display: flex
  align-items: center
  justify-content: space-between
  gap: 16px
  padding: 16px 18px
  border-radius: 18px
  background: #f8fafc

.search-user
  display: flex
  align-items: center
  gap: 12px
  min-width: 0

.avatar
  width: 44px
  height: 44px
  border-radius: 50%
  background: #dce8f8
  color: #0f2f57
  display: flex
  align-items: center
  justify-content: center
  overflow: hidden
  font-weight: 700
  flex-shrink: 0

.avatar img
  width: 100%
  height: 100%
  object-fit: cover

.search-name
  font-size: 15px
  font-weight: 700
  color: #1f2937

.search-meta
  margin-top: 4px
  font-size: 13px
  color: #667085
  line-height: 1.5

.member-list
  display: flex
  flex-direction: column
  gap: 12px
  margin-top: 18px

.member-actions
  display: flex
  align-items: center
  gap: 10px

.inline-role-select
  width: 140px

.lab-grid
  display: grid
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr))
  gap: 14px
  margin-top: 16px

.lab-name
  font-size: 16px
  font-weight: 700
  color: #1f2937

.lab-meta
  margin-top: 6px
  font-size: 13px
  color: #667085

.secondary-link
  color: #0f62fe
  text-decoration: none
  font-size: 14px
  font-weight: 600

.search-state, .table-state, .admin-state
  display: flex
  align-items: center
  justify-content: center
  min-height: 120px
  color: #667085
  text-align: center

.admin-state
  min-height: 280px

@media (max-width: 1024px)
  .field-grid--quad
    grid-template-columns: repeat(2, minmax(0, 1fr))

@media (max-width: 768px)
  .admin-container
    padding: 0 18px

  .admin-header, .panel-head, .member-toolbar, .search-card, .member-card, .lab-card, .provision-card, .join-request-item
    flex-direction: column
    align-items: stretch

  .field-grid--triple, .field-grid--quad, .field-grid--compact
    grid-template-columns: 1fr

  .role-select, .inline-role-select
    width: 100%

  .member-actions
    flex-direction: column
    align-items: stretch

  .join-request-review
    width: 100%

  .join-request-review-actions
    justify-content: stretch

  .join-request-review-actions :deep(.arco-btn)
    width: 100%
</style>
