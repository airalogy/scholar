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
          <template v-if="institution">
            <div class="role-context">
              <span class="role-badge">{{ $t('adminInstitutionMembers.yourRole', { role: institutionRoleLabel }) }}</span>
              <button
                type="button"
                class="role-guide-toggle"
                aria-controls="institution-role-guide"
                :aria-expanded="roleGuideOpen"
                @click="roleGuideOpen = !roleGuideOpen"
              >{{ $t('adminInstitutionMembers.roleGuide.title') }}</button>
            </div>
            <div v-show="roleGuideOpen" id="institution-role-guide" class="role-guide">
              <dl>
                <template v-for="role in roleGuideEntries" :key="role.label">
                  <dt>{{ $t(role.label) }}</dt>
                  <dd>{{ $t(role.description) }}</dd>
                </template>
              </dl>
              <p>{{ $t('adminInstitutionMembers.roleGuide.reviewNote') }}</p>
              <a :href="roleGuideUrl">{{ $t('adminInstitutionMembers.roleGuide.handbook') }}</a>
            </div>
          </template>
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
              <h2 class="panel-title">{{ $t('adminInstitutionMembers.memberPermissionsTitle') }}</h2>
              <p class="panel-subtitle">{{ $t('adminInstitutionMembers.memberPermissionsSubtitle') }}</p>
            </div>
          </div>

          <template v-if="institution.access.can_manage_members">
            <p v-if="!canManageOwnerRole" class="permission-note">{{ $t('adminInstitutionMembers.ownerRoleRestriction') }}</p>
            <div class="roster-toolbar">
              <label class="roster-search">
                <span>{{ $t('adminInstitutionMembers.findMember') }}</span>
                <input v-model.trim="rosterQuery" type="search" :placeholder="$t('adminInstitutionMembers.rosterPlaceholder')" />
              </label>
              <div class="roster-filters" role="group" :aria-label="$t('adminInstitutionMembers.institutionRoleLabel')">
                <button type="button" :aria-pressed="!managersOnly" @click="managersOnly = false">{{ $t('adminInstitutionMembers.allMembers') }}</button>
                <button type="button" :aria-pressed="managersOnly" @click="managersOnly = true">{{ $t('adminInstitutionMembers.managers') }}</button>
              </div>
            </div>
            <div v-if="isMembershipLoading" class="table-state">{{ $t('adminInstitutionMembers.memberListLoading') }}</div>
            <div v-else-if="visibleMembers.length" class="member-list">
              <article v-for="member in visibleMembers" :key="member.userId" class="member-card">
                <div class="search-user">
                  <div class="avatar">
                    <img v-if="member.avatar" :src="member.avatar" :alt="member.name" />
                    <span v-else>{{ member.name.charAt(0) }}</span>
                  </div>
                  <div>
                    <div class="member-identity"><strong>{{ member.name }}</strong><span class="role-badge">{{ getRoleLabel(member.role) }}</span></div>
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
                  <a-button
                    v-if="canManageOwnerRole && member.role === 'member'"
                    type="primary"
                    size="small"
                    class="appoint-admin"
                    @click="handleRoleChange(member, 'admin')"
                  >
                    {{ $t('adminInstitutionMembers.appoint') }}
                  </a-button>
                  <details v-if="canManageMember(member.role)" class="row-disclosure">
                    <summary>{{ $t('adminInstitutionMembers.memberOptions') }}</summary>
                    <div class="row-options">
                      <a-checkbox
                        class="reviewer-toggle"
                        :model-value="member.role === 'member' ? member.canReviewContent : true"
                        :disabled="member.role !== 'member'"
                        @change="handleReviewPermissionChange(member, $event)"
                      >
                        {{ $t('adminInstitutionMembers.reviewerPermissionLabel') }}
                      </a-checkbox>
                      <a-checkbox
                        class="reviewer-toggle"
                        :model-value="member.role === 'member' ? member.canImportData : true"
                        :disabled="member.role !== 'member'"
                        @change="handleImportPermissionChange(member, $event)"
                      >
                        {{ $t('adminInstitutionMembers.importPermissionLabel') }}
                      </a-checkbox>
                      <a-select
                        v-if="canManageOwnerRole"
                        :aria-label="$t('adminInstitutionMembers.institutionRoleLabel')"
                        :model-value="member.role"
                        size="small"
                        class="inline-role-select"
                        @change="handleRoleChange(member, $event)"
                      >
                        <a-option v-for="item in manageableRoleOptions" :key="item.value" :value="item.value">{{ item.label }}</a-option>
                      </a-select>
                      <a-button
                        status="danger"
                        type="outline"
                        size="small"
                        :loading="actionUserId === member.userId"
                        @click="requestChange(member, null)"
                      >
                        {{ $t('common.remove') }}
                      </a-button>
                    </div>
                  </details>
                </div>
              </article>
            </div>
            <div v-else class="table-state" role="status">
              {{ memberships.length ? $t('adminInstitutionMembers.noMatches') : $t('adminInstitutionMembers.noMembers') }}
            </div>
            <details class="directory-disclosure">
              <summary>{{ $t('adminInstitutionMembers.addFromDirectory') }}</summary>
              <div class="member-toolbar">
                <a-input-search
                  v-model="searchQuery"
                  class="member-search"
                  search-button
                  :button-text="$t('common.search')"
                  :placeholder="$t('adminInstitutionMembers.memberSearchPlaceholder')"
                  allow-clear
                  @search="searchDirectory"
                  @press-enter="searchDirectory"
                />
                <a-input
                  v-model="searchInternalId"
                  class="internal-id-input"
                  :placeholder="$t('adminInstitutionMembers.internalIdPlaceholder')"
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
                    :disabled="!canUpdateDirectoryUser(user.id)"
                    @click="requestChange(user, searchRole, searchCanReviewContent, searchCanImportData, searchInternalId)"
                  >
                    {{ memberIdSet.has(user.id) ? $t('common.updateRole') : $t('common.addToInstitution') }}
                  </a-button>
                </article>
              </div>
              <div v-else-if="isSearching" class="search-state">{{ $t('common.searching') }}</div>
              <div v-else class="search-state">{{ $t('adminInstitutionMembers.memberSearchHint') }}</div>
            </details>
          </template>

          <div v-else class="table-state">
            {{ $t('adminInstitutionMembers.noMemberPermission') }}
          </div>
        </section>

        <router-link v-if="canManageOwnerRole" :to="`/admin/institutions/${institution.slug}/governance`">{{ $t('governance.title') }}</router-link>
        <InstitutionIdentityRequestsPanel v-if="canManageOwnerRole" :slug="institution.slug" />
        <InstitutionIdentifiersPanel v-if="canManageOwnerRole" :slug="institution.slug" />
        <AdministratorGovernancePanel v-if="canManageOwnerRole" :key="institution.slug" :slug="institution.slug" :memberships="memberships" @completed="load(institution.slug)" />
        <section class="admin-panel">
          <div class="panel-head">
            <div>
              <h2 class="panel-title">{{ $t('adminInstitutionMembers.homepageTitle') }}</h2>
              <p class="panel-subtitle">{{ $t('adminInstitutionMembers.homepageSubtitle') }}</p>
            </div>
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
            <label for="permission-reason">{{ $t('administrators.reason') }}</label>
            <a-textarea id="permission-reason" v-model="permissionReason" :max-length="1000" />
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
                <a-form-item field="internalId" :label="$t('adminInstitutionMembers.internalIdLabel')">
                  <a-input
                    v-model="provisionForm.internalId"
                    :placeholder="$t('adminInstitutionMembers.internalIdPlaceholder')"
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
        <a-modal
          :visible="Boolean(pendingChange)"
          :title="$t('adminInstitutionMembers.confirmChange')"
          :mask-closable="false"
          :closable="!actionUserId"
          :esc-to-close="!actionUserId"
          :footer="false"
          width="min(480px, 94vw)"
          @cancel="cancelChange"
        >
          <form v-if="pendingChange" class="change-form" @submit.prevent="confirmChange">
            <strong>{{ pendingChange.name }} · {{ institution.name }}</strong>
            <p>{{ $t('adminInstitutionMembers.roleTransition', {
              from: pendingChange.from ? getRoleLabel(pendingChange.from) : $t('adminInstitutionMembers.notMember'),
              to: pendingChange.to ? getRoleLabel(pendingChange.to) : $t('adminInstitutionMembers.notMember'),
            }) }}</p>
            <p v-if="pendingChange.internalId">{{ $t('adminInstitutionMembers.internalIdLabel') }}: {{ pendingChange.internalId }}</p>
            <p v-if="pendingChange.to === 'admin' && pendingChange.from !== 'admin'">{{ $t('adminInstitutionMembers.appointmentNote') }}</p>
            <p v-if="pendingChange.to === 'member'">
              {{ $t('adminInstitutionMembers.reviewerPermissionLabel') }}: {{ pendingChange.review ? $t('common.yes') : $t('common.no') }} ·
              {{ $t('adminInstitutionMembers.importPermissionLabel') }}: {{ pendingChange.importData ? $t('common.yes') : $t('common.no') }}
            </p>
            <label for="member-change-reason">{{ $t('administrators.reason') }}</label>
            <textarea id="member-change-reason" v-model="changeReason" rows="3" maxlength="1000" :disabled="Boolean(actionUserId)" />
            <p v-if="changeError" role="alert">{{ changeError }}</p>
            <div class="panel-actions">
              <a-button :disabled="Boolean(actionUserId)" @click="cancelChange">{{ $t('common.cancel') }}</a-button>
              <a-button type="primary" html-type="submit" :loading="Boolean(actionUserId)" :disabled="changeReason.trim().length < 3">{{ $t('common.confirm') }}</a-button>
            </div>
          </form>
        </a-modal>
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
  disableInstitutionProvision,
  getInstitution,
  listInstitutionMemberships,
  listInstitutionProvisions,
  removeInstitutionMembership,
  updateInstitution,
  upsertInstitutionMembership,
  upsertInstitutionProvision,
  type InstitutionDetailResponse,
  type InstitutionMembershipItem,
  type InstitutionProvisionItem,
  type InstitutionProvisionStatus,
  type InstitutionRole,
} from '@/api/institutions'
import { searchUsers, type UserSearchItem } from '@/api/users'
import { INSTITUTION_ROLE_LABEL_KEYS, PLATFORM_ROLE_LABEL_KEYS, PROVISION_STATUS_LABEL_KEYS } from '@/i18n/helpers'
import InstitutionIdentityRequestsPanel from '@/components/InstitutionIdentityRequestsPanel.vue'
import InstitutionIdentifiersPanel from '@/components/InstitutionIdentifiersPanel.vue'
import AdministratorGovernancePanel from '@/components/AdministratorGovernancePanel.vue'

const route = useRoute()
const { t, locale } = useI18n()
const roleGuideOpen = ref(false)
const roleGuideEntries = [
  { label: PLATFORM_ROLE_LABEL_KEYS.platform_admin, description: 'adminInstitutionMembers.roleGuide.platform' },
  { label: INSTITUTION_ROLE_LABEL_KEYS.owner, description: 'adminInstitutionMembers.roleGuide.owner' },
  { label: INSTITUTION_ROLE_LABEL_KEYS.admin, description: 'adminInstitutionMembers.roleGuide.admin' },
] as const
const roleGuideUrl = computed<string>(() => `/docs/${locale.value.startsWith('en') ? 'en' : 'zh'}/administration/administrator-governance`)

const institution = ref<InstitutionDetailResponse | null>(null)
const memberships = ref<InstitutionMembershipItem[]>([])
const provisions = ref<InstitutionProvisionItem[]>([])
const searchResults = ref<UserSearchItem[]>([])
const searchQuery = ref('')
const searchInternalId = ref('')
const searchRole = ref<InstitutionRole>('member')
const searchCanReviewContent = ref(false)
const searchCanImportData = ref(false)
const isLoading = ref(false)
const isSavingContent = ref(false)
const isMembershipLoading = ref(false)
const isProvisionLoading = ref(false)
const isSavingProvision = ref(false)
const isSearching = ref(false)
const actionUserId = ref('')
const provisionActionId = ref('')
const provisionActionKind = ref<'copy' | 'disable' | ''>('')
const loadError = ref('')
const permissionReason = ref('')
const requirePermissionReason = (): boolean => {
  if (permissionReason.value.trim().length >= 3) return true
  Message.error(t('administrators.reasonRequired'))
  return false
}

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
  internalId: '',
  college: '',
  major: '',
  laboratory: '',
  expiresInDays: 30,
})

const rosterQuery = ref('')
const managersOnly = ref(false)
const visibleMembers = computed(() => {
  const query = rosterQuery.value.toLocaleLowerCase()
  return memberships.value.filter(member =>
    (!managersOnly.value || member.role === 'admin' || member.role === 'owner') &&
    [member.name, member.email, member.internalId].some(value => value?.toLocaleLowerCase().includes(query)),
  )
})

interface MemberChange {
  slug: string
  userId: string
  name: string
  from: InstitutionRole | null
  to: InstitutionRole | null
  review: boolean
  importData: boolean
  internalId?: string
}

const pendingChange = ref<MemberChange | null>(null)
const changeReason = ref('')
const changeError = ref('')

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

  return allRoleOptions.value.filter((item) => item.value === 'member')
})
const canSubmitProvision = computed(() => {
  return !isSavingProvision.value &&
    Boolean(provisionForm.email.trim()) &&
    Boolean(provisionForm.name.trim()) &&
    Boolean(provisionForm.internalId.trim())
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
  provisionForm.internalId = ''
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
  return canManageOwnerRole.value || role === 'member'
}

const canUpdateDirectoryUser = (userId: string): boolean => {
  const member = memberships.value.find(item => item.userId === userId)
  return member ? canManageMember(member.role) : Boolean(searchInternalId.value.trim())
}

const getProvisionStatusLabel = (status: InstitutionProvisionStatus): string => {
  return t(PROVISION_STATUS_LABEL_KEYS[status])
}

const formatProvisionMeta = (provision: InstitutionProvisionItem): string => {
  const parts = [
    getRoleLabel(provision.role, provision.canReviewContent),
    provision.internalId,
    provision.college,
    provision.major,
    provision.laboratory,
  ].filter(Boolean)

  return parts.join(' / ') || t('common.noAdditionalInfo')
}

const syncFormState = (): void => {
  formState.summary = institution.value?.summary ?? ''
  formState.website = institution.value?.website ?? ''
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
    const items = await listInstitutionMemberships(slug)
    if (route.params.slug === slug) memberships.value = items
  } finally {
    if (route.params.slug === slug) isMembershipLoading.value = false
  }
}

const loadProvisions = async (slug: string): Promise<void> => {
  if (!institution.value?.access.can_manage_members) {
    provisions.value = []
    return
  }

  isProvisionLoading.value = true
  try {
    const items = await listInstitutionProvisions(slug)
    if (route.params.slug === slug) provisions.value = items
  } finally {
    if (route.params.slug === slug) isProvisionLoading.value = false
  }
}

const refreshInstitutionDetail = async (slug: string): Promise<void> => {
  const detail = await getInstitution(slug)
  if (route.params.slug !== slug) return
  institution.value = detail
  syncFormState()
}

const load = async (slug: string): Promise<void> => {
  isLoading.value = true
  loadError.value = ''
  searchResults.value = []
  searchInternalId.value = ''

  try {
    await refreshInstitutionDetail(slug)
    if (route.params.slug !== slug) return
    await Promise.all([loadMemberships(slug), loadProvisions(slug)])
  } catch (error) {
    if (route.params.slug !== slug) return
    institution.value = null
    memberships.value = []
    provisions.value = []
    loadError.value = getErrorMessage(error, t('adminInstitutionMembers.loadFailed'))
  } finally {
    if (route.params.slug === slug) isLoading.value = false
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
  if (!requirePermissionReason()) return
  const slug = String(route.params.slug ?? '')
  if (!slug || !canSubmitProvision.value) {
    return
  }

  isSavingProvision.value = true
  try {
    provisions.value = await upsertInstitutionProvision(slug, {
      reason: permissionReason.value.trim(),
      email: provisionForm.email.trim(),
      name: provisionForm.name.trim(),
      internalId: provisionForm.internalId.trim(),
      role: provisionForm.role,
      can_review_content: resolveRequestedReviewPermission(
        provisionForm.role,
        provisionForm.can_review_content,
      ),
      can_import_data: resolveRequestedImportPermission(
        provisionForm.role,
        provisionForm.can_import_data,
      ),
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
  if (!requirePermissionReason()) return
  const slug = String(route.params.slug ?? '')
  if (!slug) {
    return
  }

  provisionActionId.value = provisionId
  provisionActionKind.value = 'disable'
  try {
    provisions.value = await disableInstitutionProvision(slug, provisionId, permissionReason.value.trim())
    Message.success(t('adminInstitutionMembers.provisionDisabled'))
  } catch (error) {
    Message.error(getErrorMessage(error, t('adminInstitutionMembers.provisionDisableFailed')))
  } finally {
    provisionActionId.value = ''
    provisionActionKind.value = ''
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

const requestChange = (
  person: InstitutionMembershipItem | UserSearchItem,
  to: InstitutionRole | null,
  review = false,
  importData = false,
  internalId?: string,
): void => {
  if (!institution.value?.access.can_manage_members || institution.value.slug !== route.params.slug || actionUserId.value || pendingChange.value) return
  const userId = 'userId' in person ? person.userId : person.id
  const current = memberships.value.find(member => member.userId === userId)
  if (current && !canManageMember(current.role)) return
  if (to && !manageableRoleOptions.value.some(option => option.value === to)) return
  if (!current && (!to || !internalId?.trim())) return
  pendingChange.value = {
    slug: institution.value.slug, userId, name: person.name, from: current?.role ?? null,
    to, review, importData, internalId: internalId?.trim(),
  }
  changeReason.value = ''
  changeError.value = ''
}

const cancelChange = (): void => {
  if (actionUserId.value) return
  pendingChange.value = null
  changeReason.value = ''
  changeError.value = ''
}

const confirmChange = async (): Promise<void> => {
  const change = pendingChange.value
  const reason = changeReason.value.trim()
  if (!change || actionUserId.value || reason.length < 3 || reason.length > 1000 ||
    change.slug !== route.params.slug || !institution.value?.access.can_manage_members) return

  actionUserId.value = change.userId
  changeError.value = ''
  try {
    const result = change.to
      ? await upsertInstitutionMembership(change.slug, {
        userId: change.userId, role: change.to, reason,
        ...(change.internalId ? { internalId: change.internalId } : {}),
        can_review_content: resolveRequestedReviewPermission(change.to, change.review),
        can_import_data: resolveRequestedImportPermission(change.to, change.importData),
      })
      : await removeInstitutionMembership(change.slug, change.userId, reason)
    if (pendingChange.value !== change) return
    memberships.value = result
    if (change.internalId) searchInternalId.value = ''
    Message.success(t(change.to ? 'adminInstitutionMembers.memberUpdated' : 'adminInstitutionMembers.memberRemoved'))
    pendingChange.value = null
    changeReason.value = ''
  } catch (error) {
    if (pendingChange.value === change) {
      changeError.value = getErrorMessage(error, t(change.to ? 'adminInstitutionMembers.memberUpdateFailed' : 'adminInstitutionMembers.memberRemoveFailed'))
    }
  } finally {
    actionUserId.value = ''
  }
}

const handleRoleChange = (member: InstitutionMembershipItem, value: unknown): void => {
  if (value === member.role || (value !== 'owner' && value !== 'admin' && value !== 'member')) return
  requestChange(member, value, member.role === 'member' && member.canReviewContent, member.role === 'member' && member.canImportData)
}

const handleReviewPermissionChange = (member: InstitutionMembershipItem, value: unknown): void => {
  if (member.role === 'member') requestChange(member, member.role, normalizeCheckboxValue(value), member.canImportData)
}

const handleImportPermissionChange = (member: InstitutionMembershipItem, value: unknown): void => {
  if (member.role === 'member') requestChange(member, member.role, member.canReviewContent, normalizeCheckboxValue(value))
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

watch(
  () => String(route.params.slug ?? ''),
  (slug) => {
    pendingChange.value = null
    changeReason.value = ''
    changeError.value = ''
    rosterQuery.value = ''
    managersOnly.value = false
    permissionReason.value = ''
    searchQuery.value = ''
    if (!slug) {
      institution.value = null
      memberships.value = []
      provisions.value = []
      searchInternalId.value = ''
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

.role-context
  display: flex
  align-items: center
  flex-wrap: wrap
  gap: 4px 12px
  margin-top: 10px

.role-guide-toggle
  min-height: 32px
  padding: 0 4px
  border: 0
  background: transparent
  font: inherit
  cursor: pointer

.role-guide-toggle, .role-guide a
  color: #1355b6
  text-decoration: underline
  text-underline-offset: 3px
  &:focus-visible
    outline: 2px solid currentColor
    outline-offset: 2px

.role-guide
  max-width: 62ch
  margin-top: 6px
  padding: 12px 16px
  border-left: 3px solid #b5cced
  background: #f5f8fc
  color: #344054
  font-size: 14px
  line-height: 1.6
  dl, dd
    margin: 0
  dt
    font-weight: 600
  dt:not(:first-child)
    margin-top: 6px
  p
    margin: 10px 0 4px

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

.row-options, .roster-toolbar, .roster-filters, .member-identity
  display: flex
  align-items: center
  flex-wrap: wrap
  gap: 10px

.roster-toolbar
  align-items: flex-end
  margin-top: 16px

.roster-search, .change-form
  display: grid
  gap: 8px

.roster-search
  flex: 1 1 240px
  font-weight: 600

.roster-search input, .change-form textarea
  box-sizing: border-box
  width: 100%
  padding: 9px 12px
  border: 1px solid #b4c0cf
  border-radius: 6px
  background: #fff
  font: inherit

.roster-filters button
  border: 1px solid #bbc8d8
  border-radius: 6px
  background: #fff
  color: #324561
  padding: 8px 12px
  cursor: pointer

.roster-filters button[aria-pressed="true"]
  border-color: #1858ae
  color: #174c93
  background: #eaf2ff
  font-weight: 700

.directory-disclosure
  margin-top: 20px
  border-top: 1px solid #dce4ee
  padding-top: 14px

.row-options
  padding-top: 8px

.directory-disclosure summary, .row-disclosure summary
  cursor: pointer
  font-weight: 600
  color: #174c93

.change-form p
  margin: 0 0 6px

.change-form [role="alert"]
  color: #a42620

.member-toolbar
  display: flex
  gap: 12px
  margin-top: 18px
  flex-wrap: wrap

.member-search
  flex: 1

.internal-id-input
  width: 220px

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
  flex-wrap: wrap
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

  .admin-header, .panel-head, .member-toolbar, .search-card, .member-card, .lab-card, .provision-card
    flex-direction: column
    align-items: stretch

  .field-grid--triple, .field-grid--quad, .field-grid--compact
    grid-template-columns: 1fr

  .role-select, .inline-role-select, .internal-id-input
    width: 100%

  .member-actions
    flex-direction: column
    align-items: stretch

</style>
