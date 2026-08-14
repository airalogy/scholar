<template>
  <div class="admin-page">
    <div class="admin-container">
      <div class="admin-header">
        <div>
          <div class="admin-eyebrow">{{ $t('adminInstitutionContent.eyebrow') }}</div>
          <h1 class="admin-title">{{ institution?.name || $t('adminInstitutionContent.defaultTitle') }}</h1>
          <p class="admin-subtitle">{{ $t('adminInstitutionContent.subtitle') }}</p>
        </div>
        <div class="admin-header-actions">
          <router-link to="/admin" class="back-link">{{ $t('adminInstitutionContent.backToAdmin') }}</router-link>
          <router-link
            v-if="institution?.access.can_manage_members"
            :to="`/admin/institutions/${institution.slug}/members`"
            class="secondary-link"
          >
            {{ $t('adminInstitutionContent.memberPermissions') }}
          </router-link>
          <router-link
            v-if="institution?.access.can_review_content"
            to="/admin/papers"
            class="secondary-link"
          >
            {{ $t('adminInstitutionContent.reviewQueue') }}
          </router-link>
        </div>
      </div>

      <div v-if="isBootLoading" class="admin-state">{{ $t('common.loading') }}</div>
      <div v-else-if="loadError" class="admin-state">{{ loadError }}</div>
      <template v-else-if="institution">
        <div
          v-if="!institution.access.can_review_content && !institution.access.can_import_data"
          class="admin-state"
        >
          {{ $t('adminInstitutionContent.noAccess') }}
        </div>
        <template v-else>
          <section class="stats-grid">
            <article class="stat-card">
              <div class="stat-label">{{ $t('adminInstitutionContent.roleLabel') }}</div>
              <div class="stat-value">{{ institutionRoleLabel }}</div>
            </article>
            <article class="stat-card">
              <div class="stat-label">{{ $t('adminInstitutionContent.totalPapers') }}</div>
              <div class="stat-value">{{ paperTotal }}</div>
            </article>
            <article class="stat-card">
              <div class="stat-label">{{ $t('adminInstitutionContent.totalUploads') }}</div>
              <div class="stat-value">{{ uploadTotal }}</div>
            </article>
            <article class="stat-card">
              <div class="stat-label">{{ $t('adminInstitutionContent.memberCount') }}</div>
              <div class="stat-value">{{ institution.memberCount }}</div>
            </article>
          </section>

          <section class="admin-panel admin-panel--overview">
            <div class="panel-head">
              <div>
                <h2 class="panel-title">{{ $t('adminInstitutionContent.summaryTitle') }}</h2>
                <p class="panel-subtitle">{{ $t('adminInstitutionContent.summarySubtitle') }}</p>
              </div>
              <a
                v-if="resolveSafeHttpUrl(institution.website)"
                :href="resolveSafeHttpUrl(institution.website)"
                target="_blank"
                rel="noopener"
                class="text-link"
              >
                {{ $t('adminInstitutionContent.institutionHomepage') }}
              </a>
            </div>
            <p class="summary-text">
              {{ institution.summary || $t('adminInstitutionContent.summaryFallback') }}
            </p>
            <div class="overview-meta">
              <span>{{ $t('common.counts.labs', { count: institution.labCount }) }}</span>
              <span>{{ $t('common.counts.members', { count: institution.memberCount }) }}</span>
            </div>
          </section>

          <InstitutionImportPanel
            v-if="institution.access.can_import_data"
            :institution="institution"
            @papers-imported="refreshPaperContent"
          />

          <InstitutionCredentialsPanel
            v-if="canManageCredentials"
            :institution="institution"
          />

          <section v-if="institution.access.can_review_content" class="admin-panel">
            <div class="panel-head">
              <div>
                <h2 class="panel-title">{{ $t('adminInstitutionContent.paperLibraryTitle') }}</h2>
                <p class="panel-subtitle">{{ $t('adminInstitutionContent.paperLibrarySubtitle') }}</p>
              </div>
              <router-link :to="`/institutions/${institution.slug}/papers`" class="text-link">
                {{ $t('adminInstitutionContent.viewPublicPapers') }}
              </router-link>
            </div>

            <div class="toolbar">
              <div class="search-box">
                <a-input
                  v-model="paperQuery"
                  :placeholder="$t('adminInstitutionContent.searchPapersPlaceholder')"
                  allow-clear
                  @press-enter="onPaperSearch"
                />
                <button class="search-btn" type="button" @click="onPaperSearch">{{ $t('common.search') }}</button>
              </div>
              <div class="status-pills">
                <button
                  class="status-pill"
                  :class="{ 'status-pill--active': paperStatus === '' }"
                  type="button"
                  @click="setPaperStatus('')"
                >
                  {{ $t('common.all') }} {{ paperTotal }}
                </button>
                <button
                  v-for="status in filterOptions"
                  :key="`paper-${status}`"
                  class="status-pill"
                  :class="[`status-pill--${status}`, { 'status-pill--active': paperStatus === status }]"
                  type="button"
                  @click="setPaperStatus(status)"
                >
                  {{ getReviewStatusLabel(status) }} {{ paperStatusTotals[status] }}
                </button>
              </div>
            </div>

            <div v-if="isPaperLoading" class="admin-state">{{ $t('common.loading') }}</div>
            <div v-else-if="!papers.length" class="admin-state">{{ $t('adminInstitutionContent.emptyPapers') }}</div>
            <div v-else class="content-list">
              <article v-for="paper in papers" :key="paper.claimId || paper.id" class="content-card">
                <div class="content-card-head">
                  <div class="content-main">
                    <router-link :to="`/papers/${paper.id}`" class="content-title">
                      {{ paper.title }}
                    </router-link>
                    <div class="content-meta">
                      <span>{{ $t('adminInstitutionContent.uploadedBy', { name: paper.uploadUserName || $t('common.unknownUser') }) }}</span>
                      <span>{{ $t('adminInstitutionContent.uploadedAt', { date: formatDateTime(paper.createdAt) }) }}</span>
                      <span>{{ $t('adminInstitutionContent.currentStatus', { status: getReviewStatusLabel(paper.reviewStatus) }) }}</span>
                    </div>
                    <div v-if="paper.authors.length" class="content-authors">
                      {{ paper.authors.map((author) => author.name).join('、') }}
                    </div>
                  </div>
                  <span class="review-badge" :class="`review-badge--${paper.reviewStatus}`">
                    {{ getReviewStatusLabel(paper.reviewStatus) }}
                  </span>
                </div>
                <div v-if="paper.abstract" class="content-abstract">{{ paper.abstract }}</div>
                <div class="content-footer">
                  <div class="content-tags">
                    <span v-if="paper.labName" class="content-tag">{{ paper.labName }}</span>
                    <span v-for="keyword in paper.keywords.slice(0, 4)" :key="keyword" class="content-tag">
                      {{ keyword }}
                    </span>
                  </div>
                  <div v-if="paper.boundMembers.length" class="bound-members">
                    <span
                      v-for="binding in paper.boundMembers"
                      :key="binding.bindingId"
                      class="bound-member-chip"
                    >
                      {{ $t('adminInstitutionContent.boundMemberChip', {
                        author: binding.authorName,
                        name: binding.name,
                      }) }}
                    </span>
                  </div>
                  <div v-else-if="canManagePaperBindings" class="binding-empty-hint">
                    {{ $t('adminInstitutionContent.noBoundMembers') }}
                  </div>
                  <div v-if="canManagePaperBindings" class="content-actions">
                    <a-button type="outline" size="small" @click="openBindingModal(paper)">
                      {{ $t('adminInstitutionContent.manageAuthorBindings') }}
                    </a-button>
                  </div>
                  <div v-if="paper.reviewNotes" class="review-note">
                    {{ $t('common.review.notes', { notes: paper.reviewNotes }) }}
                  </div>
                </div>
              </article>
            </div>

            <div v-if="paperTotal > pageSize" class="pagination-wrap">
              <a-pagination
                :total="paperTotal"
                :current="paperPage"
                :page-size="pageSize"
                :show-total="true"
                @change="onPaperPageChange"
              />
            </div>
          </section>

          <section v-if="institution.access.can_review_content" class="admin-panel">
            <div class="panel-head">
              <div>
                <h2 class="panel-title">{{ $t('adminInstitutionContent.uploadRecordsTitle') }}</h2>
                <p class="panel-subtitle">{{ $t('adminInstitutionContent.uploadRecordsSubtitle') }}</p>
              </div>
            </div>

            <div class="toolbar">
              <div class="search-box">
                <a-input
                  v-model="uploadQuery"
                  :placeholder="$t('adminInstitutionContent.searchUploadsPlaceholder')"
                  allow-clear
                  @press-enter="onUploadSearch"
                />
                <button class="search-btn" type="button" @click="onUploadSearch">{{ $t('common.search') }}</button>
              </div>
              <div class="status-pills">
                <button
                  class="status-pill"
                  :class="{ 'status-pill--active': uploadStatus === '' }"
                  type="button"
                  @click="setUploadStatus('')"
                >
                  {{ $t('common.all') }} {{ uploadTotal }}
                </button>
                <button
                  v-for="status in filterOptions"
                  :key="`upload-${status}`"
                  class="status-pill"
                  :class="[`status-pill--${status}`, { 'status-pill--active': uploadStatus === status }]"
                  type="button"
                  @click="setUploadStatus(status)"
                >
                  {{ getReviewStatusLabel(status) }} {{ uploadStatusTotals[status] }}
                </button>
              </div>
            </div>

            <div v-if="isUploadLoading" class="admin-state">{{ $t('common.loading') }}</div>
            <div v-else-if="!uploads.length" class="admin-state">{{ $t('adminInstitutionContent.emptyUploads') }}</div>
            <div v-else class="content-list">
              <article
                v-for="upload in uploads"
                :key="upload.submissionId || `${upload.id}-${upload.createdAt}`"
                class="content-card content-card--upload"
              >
                <div class="content-card-head">
                  <div class="content-main">
                    <router-link :to="`/papers/${upload.id}`" class="content-title">
                      {{ upload.title }}
                    </router-link>
                    <div class="content-meta">
                      <span>{{ $t('adminInstitutionContent.uploadedBy', { name: upload.uploadUserName || $t('common.unknownUser') }) }}</span>
                      <span>{{ $t('adminInstitutionContent.uploadedAt', { date: formatDateTime(upload.createdAt) }) }}</span>
                      <span v-if="upload.labName">{{ $t('adminInstitutionContent.relatedLab', { name: upload.labName }) }}</span>
                    </div>
                  </div>
                  <span class="review-badge" :class="`review-badge--${upload.reviewStatus}`">
                    {{ getReviewStatusLabel(upload.reviewStatus) }}
                  </span>
                </div>
                <div class="content-meta content-meta--secondary">
                  <span v-if="upload.journal_name">{{ upload.journal_name }}</span>
                  <span v-if="hasPublishYear(upload.publish_year)">{{ upload.publish_year }}</span>
                  <span v-if="resolveSafeHttpUrl(upload.preview_url || upload.file_url)">
                    <a :href="resolveSafeHttpUrl(upload.preview_url || upload.file_url)" target="_blank" rel="noopener" class="text-link">
                      {{ $t('common.readFullText') }}
                    </a>
                  </span>
                </div>
                <div v-if="upload.reviewNotes" class="review-note">
                  {{ $t('common.review.notes', { notes: upload.reviewNotes }) }}
                </div>
              </article>
            </div>

            <div v-if="uploadTotal > pageSize" class="pagination-wrap">
              <a-pagination
                :total="uploadTotal"
                :current="uploadPage"
                :page-size="pageSize"
                :show-total="true"
                @change="onUploadPageChange"
              />
            </div>
          </section>
        </template>
      </template>
    </div>

    <a-modal
      :visible="bindingModalVisible"
      :footer="false"
      :title="$t('adminInstitutionContent.bindingModalTitle')"
      width="760px"
      @cancel="closeBindingModal"
    >
      <div v-if="selectedBindingPaper" class="binding-modal-body">
        <div class="binding-modal-paper-title">{{ selectedBindingPaper.title }}</div>
        <div class="binding-modal-desc">
          {{ $t('adminInstitutionContent.bindingModalDesc') }}
        </div>

        <div v-if="isMembershipLoading && !institutionMembers.length" class="admin-state">
          {{ $t('common.loading') }}
        </div>
        <div v-else-if="!institutionMembers.length" class="admin-state">
          {{ $t('adminInstitutionContent.noMembersAvailableForBinding') }}
        </div>
        <div v-else class="binding-list">
          <article
            v-for="author in selectedBindingPaper.authors"
            :key="author.id"
            class="binding-item"
          >
            <div class="binding-item-main">
              <div class="binding-item-title">
                {{ $t('adminInstitutionContent.authorLabel', { order: author.order, name: author.name }) }}
              </div>
              <div v-if="getAuthorBinding(author.id)" class="binding-item-current">
                {{ $t('adminInstitutionContent.currentBinding', {
                  name: getAuthorBinding(author.id)?.name,
                }) }}
              </div>
              <div v-else class="binding-item-current binding-item-current--empty">
                {{ $t('adminInstitutionContent.noBindingForAuthor') }}
              </div>
            </div>
            <div class="binding-item-actions">
              <a-select
                :model-value="bindingSelections[author.id] ?? ''"
                allow-search
                class="binding-select"
                :placeholder="$t('adminInstitutionContent.bindingSelectPlaceholder')"
                @change="handleBindingSelection(author.id, $event)"
              >
                <a-option
                  v-for="member in getSelectableMembers(author.id)"
                  :key="member.userId"
                  :value="member.userId"
                >
                  {{ member.name }} · {{ $t('adminInstitutionContent.memberOptionPaperStats', {
                    total: member.paperCount,
                    approved: member.approvedPaperCount,
                  }) }}
                </a-option>
              </a-select>
              <a-button
                type="primary"
                :loading="bindingActionAuthorId === author.id && bindingActionKind === 'save'"
                :disabled="!canSaveAuthorBinding(author.id)"
                @click="saveAuthorBinding(author.id)"
              >
                {{ getAuthorBinding(author.id)
                  ? $t('adminInstitutionContent.replaceBindingAction')
                  : $t('adminInstitutionContent.bindAuthorAction') }}
              </a-button>
              <a-button
                v-if="getAuthorBinding(author.id)"
                status="danger"
                type="outline"
                :loading="bindingActionAuthorId === author.id && bindingActionKind === 'remove'"
                @click="removeAuthorBinding(author.id)"
              >
                {{ $t('common.remove') }}
              </a-button>
            </div>
          </article>
        </div>
      </div>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Message } from '@arco-design/web-vue'
import InstitutionCredentialsPanel from '@/components/InstitutionCredentialsPanel.vue'
import InstitutionImportPanel from '@/components/InstitutionImportPanel.vue'
import {
  bindInstitutionPaperAuthor,
  getInstitution,
  listInstitutionMemberships,
  removeInstitutionPaperAuthorBinding,
  type InstitutionDetailResponse,
  type InstitutionMembershipItem,
  type InstitutionPaperBoundMember,
} from '@/api/institutions'
import {
  listInstitutionUploads,
  listPapers,
  type PaperResponse,
  type PaperReviewStatus,
  type PaperStatusTotals,
} from '@/api/papers'
import { INSTITUTION_ROLE_LABEL_KEYS, PLATFORM_ROLE_LABEL_KEYS, PAPER_STATUS_LABEL_KEYS } from '@/i18n/helpers'
import { hasPublishYear } from '@/utils/papers'
import { resolveSafeHttpUrl } from '@/utils/url'

const route = useRoute()
const { t, locale } = useI18n()

const pageSize = 10
const filterOptions: PaperReviewStatus[] = [
  'draft',
  'pending_review',
  'changes_requested',
  'approved',
  'archived',
]

const institution = ref<InstitutionDetailResponse | null>(null)
const isBootLoading = ref(false)
const isPaperLoading = ref(false)
const isUploadLoading = ref(false)
const isMembershipLoading = ref(false)
const loadError = ref('')

const institutionMembers = ref<InstitutionMembershipItem[]>([])
const bindingModalVisible = ref(false)
const selectedBindingPaper = ref<PaperResponse | null>(null)
const bindingSelections = ref<Record<string, string>>({})
const bindingActionAuthorId = ref('')
const bindingActionKind = ref<'save' | 'remove' | ''>('')

const papers = ref<PaperResponse[]>([])
const paperTotal = ref(0)
const paperPage = ref(1)
const paperQuery = ref('')
const paperStatus = ref<PaperReviewStatus | ''>('')
const paperStatusTotals = ref<PaperStatusTotals>({
  draft: 0,
  pending_review: 0,
  changes_requested: 0,
  approved: 0,
  archived: 0,
})

const uploads = ref<PaperResponse[]>([])
const uploadTotal = ref(0)
const uploadPage = ref(1)
const uploadQuery = ref('')
const uploadStatus = ref<PaperReviewStatus | ''>('')
const uploadStatusTotals = ref<PaperStatusTotals>({
  draft: 0,
  pending_review: 0,
  changes_requested: 0,
  approved: 0,
  archived: 0,
})

const createEmptyStatusTotals = (): PaperStatusTotals => ({
  draft: 0,
  pending_review: 0,
  changes_requested: 0,
  approved: 0,
  archived: 0,
})

const canManagePaperBindings = computed(() => {
  return institution.value?.access.can_manage_members === true
})

const canManageCredentials = computed(() => {
  const access = institution.value?.access
  return access?.platform_role === 'platform_admin' || access?.institution_role === 'owner'
})

const institutionRoleLabel = computed(() => {
  const access = institution.value?.access
  if (!access) {
    return ''
  }

  if (access.platform_role === 'platform_admin') {
    return t(PLATFORM_ROLE_LABEL_KEYS.platform_admin)
  }

  if (access.institution_role) {
    return t(INSTITUTION_ROLE_LABEL_KEYS[access.institution_role])
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

const formatDateTime = (value: string): string => {
  return new Intl.DateTimeFormat(locale.value, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

const getReviewStatusLabel = (status: PaperReviewStatus): string => {
  return t(PAPER_STATUS_LABEL_KEYS[status])
}

const loadInstitution = async (slug: string): Promise<void> => {
  institution.value = await getInstitution(slug)
}

const loadInstitutionMembers = async (slug: string): Promise<void> => {
  if (!institution.value?.access.can_manage_members) {
    isMembershipLoading.value = false
    institutionMembers.value = []
    return
  }

  isMembershipLoading.value = true
  try {
    institutionMembers.value = await listInstitutionMemberships(slug)
  } catch (error) {
    Message.error(getErrorMessage(error, t('adminInstitutionContent.loadFailed')))
  } finally {
    isMembershipLoading.value = false
  }
}

const syncPaperBindings = (
  paperId: string,
  bindings: InstitutionPaperBoundMember[],
): void => {
  papers.value = papers.value.map((item) => {
    if (item.id !== paperId) {
      return item
    }

    return {
      ...item,
      boundMembers: bindings,
    }
  })

  uploads.value = uploads.value.map((item) => {
    if (item.id !== paperId) {
      return item
    }

    return {
      ...item,
      boundMembers: bindings,
    }
  })

  if (selectedBindingPaper.value?.id === paperId) {
    selectedBindingPaper.value = {
      ...selectedBindingPaper.value,
      boundMembers: bindings,
    }
  }

  bindingSelections.value = bindings.reduce<Record<string, string>>((result, binding) => {
    result[binding.authorId] = binding.userId
    return result
  }, {})
}

const openBindingModal = (paper: PaperResponse): void => {
  selectedBindingPaper.value = {
    ...paper,
    boundMembers: [...paper.boundMembers],
  }
  bindingSelections.value = paper.boundMembers.reduce<Record<string, string>>((result, binding) => {
    result[binding.authorId] = binding.userId
    return result
  }, {})
  bindingActionAuthorId.value = ''
  bindingActionKind.value = ''
  bindingModalVisible.value = true
}

const closeBindingModal = (): void => {
  bindingModalVisible.value = false
  selectedBindingPaper.value = null
  bindingSelections.value = {}
  bindingActionAuthorId.value = ''
  bindingActionKind.value = ''
}

const getAuthorBinding = (authorId: string): InstitutionPaperBoundMember | null => {
  if (!selectedBindingPaper.value) {
    return null
  }

  return selectedBindingPaper.value.boundMembers.find((binding) => binding.authorId === authorId) ?? null
}

const getSelectableMembers = (authorId: string): InstitutionMembershipItem[] => {
  const currentBinding = getAuthorBinding(authorId)
  const occupiedUserIds = new Set(
    (selectedBindingPaper.value?.boundMembers ?? [])
      .filter((binding) => binding.authorId !== authorId)
      .map((binding) => binding.userId),
  )

  return institutionMembers.value.filter((member) => {
    return currentBinding?.userId === member.userId || !occupiedUserIds.has(member.userId)
  })
}

const handleBindingSelection = (
  authorId: string,
  value: unknown,
): void => {
  if (typeof value !== 'string') {
    return
  }

  bindingSelections.value = {
    ...bindingSelections.value,
    [authorId]: value,
  }
}

const canSaveAuthorBinding = (authorId: string): boolean => {
  const selectedUserId = bindingSelections.value[authorId] ?? ''
  if (!selectedUserId) {
    return false
  }

  return getAuthorBinding(authorId)?.userId !== selectedUserId
}

const saveAuthorBinding = async (authorId: string): Promise<void> => {
  const slug = String(route.params.slug ?? '')
  const paper = selectedBindingPaper.value
  const userId = bindingSelections.value[authorId] ?? ''
  if (!slug || !paper || !userId) {
    return
  }

  bindingActionAuthorId.value = authorId
  bindingActionKind.value = 'save'
  try {
    const bindings = await bindInstitutionPaperAuthor(slug, {
      paperId: paper.id,
      authorId,
      userId,
    })
    syncPaperBindings(paper.id, bindings)
    await loadInstitutionMembers(slug)
    Message.success(t('adminInstitutionContent.bindingSaveSuccess'))
  } catch (error) {
    Message.error(getErrorMessage(error, t('adminInstitutionContent.bindingSaveFailed')))
  } finally {
    bindingActionAuthorId.value = ''
    bindingActionKind.value = ''
  }
}

const removeAuthorBinding = async (authorId: string): Promise<void> => {
  const slug = String(route.params.slug ?? '')
  const paper = selectedBindingPaper.value
  const binding = getAuthorBinding(authorId)
  if (!slug || !paper || !binding) {
    return
  }

  bindingActionAuthorId.value = authorId
  bindingActionKind.value = 'remove'
  try {
    const bindings = await removeInstitutionPaperAuthorBinding(slug, binding.bindingId)
    syncPaperBindings(paper.id, bindings)
    await loadInstitutionMembers(slug)
    Message.success(t('adminInstitutionContent.bindingRemoveSuccess'))
  } catch (error) {
    Message.error(getErrorMessage(error, t('adminInstitutionContent.bindingRemoveFailed')))
  } finally {
    bindingActionAuthorId.value = ''
    bindingActionKind.value = ''
  }
}

const loadPapers = async (): Promise<void> => {
  if (!institution.value?.access.can_review_content) {
    papers.value = []
    paperTotal.value = 0
    paperStatusTotals.value = createEmptyStatusTotals()
    return
  }

  isPaperLoading.value = true
  try {
    const response = await listPapers({
      scope: 'institution',
      institution_id: institution.value.id,
      q: paperQuery.value.trim() || undefined,
      review_status: paperStatus.value || undefined,
      limit: pageSize,
      offset: (paperPage.value - 1) * pageSize,
    })
    papers.value = response.items
    paperTotal.value = response.total
    paperStatusTotals.value = response.statusTotals
  } catch (error) {
    Message.error(getErrorMessage(error, t('adminInstitutionContent.loadFailed')))
  } finally {
    isPaperLoading.value = false
  }
}

const loadUploads = async (): Promise<void> => {
  if (!institution.value?.access.can_review_content) {
    uploads.value = []
    uploadTotal.value = 0
    uploadStatusTotals.value = createEmptyStatusTotals()
    return
  }

  isUploadLoading.value = true
  try {
    const response = await listInstitutionUploads({
      institution_id: institution.value.id,
      q: uploadQuery.value.trim() || undefined,
      review_status: uploadStatus.value || undefined,
      limit: pageSize,
      offset: (uploadPage.value - 1) * pageSize,
    })
    uploads.value = response.items
    uploadTotal.value = response.total
    uploadStatusTotals.value = response.statusTotals
  } catch (error) {
    Message.error(getErrorMessage(error, t('adminInstitutionContent.loadFailed')))
  } finally {
    isUploadLoading.value = false
  }
}

const load = async (slug: string): Promise<void> => {
  isBootLoading.value = true
  loadError.value = ''
  papers.value = []
  uploads.value = []
  institutionMembers.value = []

  try {
    await loadInstitution(slug)
    await Promise.all([
      loadPapers(),
      loadUploads(),
      loadInstitutionMembers(slug),
    ])
  } catch (error) {
    institution.value = null
    loadError.value = getErrorMessage(error, t('adminInstitutionContent.loadFailed'))
  } finally {
    isBootLoading.value = false
  }
}

const refreshPaperContent = async (): Promise<void> => {
  try {
    await Promise.all([loadPapers(), loadUploads()])
  } catch (error) {
    Message.error(getErrorMessage(error, t('adminInstitutionContent.importRefreshFailed')))
  }
}

const onPaperSearch = (): void => {
  paperPage.value = 1
  void loadPapers()
}

const onUploadSearch = (): void => {
  uploadPage.value = 1
  void loadUploads()
}

const setPaperStatus = (status: PaperReviewStatus | ''): void => {
  paperStatus.value = status
  paperPage.value = 1
  void loadPapers()
}

const setUploadStatus = (status: PaperReviewStatus | ''): void => {
  uploadStatus.value = status
  uploadPage.value = 1
  void loadUploads()
}

const onPaperPageChange = (next: number): void => {
  paperPage.value = next
  void loadPapers()
}

const onUploadPageChange = (next: number): void => {
  uploadPage.value = next
  void loadUploads()
}

watch(
  () => String(route.params.slug ?? ''),
  (slug) => {
    closeBindingModal()

    if (!slug) {
      institution.value = null
      papers.value = []
      uploads.value = []
      institutionMembers.value = []
      paperTotal.value = 0
      uploadTotal.value = 0
      paperStatusTotals.value = createEmptyStatusTotals()
      uploadStatusTotals.value = createEmptyStatusTotals()
      return
    }

    paperPage.value = 1
    uploadPage.value = 1
    paperQuery.value = ''
    uploadQuery.value = ''
    paperStatus.value = ''
    uploadStatus.value = ''
    void load(slug)
  },
  { immediate: true },
)
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

.admin-header-actions
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

.back-link, .secondary-link, .text-link
  text-decoration: none
  font-weight: 600

.back-link, .text-link
  color: #0f62fe

.secondary-link
  display: inline-flex
  align-items: center
  justify-content: center
  min-height: 38px
  padding: 0 16px
  border-radius: 999px
  background: #eef4ff
  color: #0f2f57

.stats-grid
  display: grid
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr))
  gap: 16px
  margin-bottom: 20px

.stat-card
  padding: 20px 22px
  border-radius: 20px
  border: 1px solid rgba(15, 47, 87, 0.08)
  background: #fff
  box-shadow: 0 14px 34px rgba(15, 47, 87, 0.06)

.stat-label
  font-size: 13px
  color: #667085

.stat-value
  margin-top: 10px
  font-size: 28px
  font-weight: 700
  color: #1f2937

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

.summary-text
  margin: 16px 0 0
  color: #355070
  line-height: 1.7

.overview-meta
  display: flex
  flex-wrap: wrap
  gap: 10px 16px
  margin-top: 14px
  font-size: 13px
  color: #667085

.toolbar
  margin-top: 18px

.search-box
  display: flex
  gap: 12px

.search-btn
  min-width: 84px
  border: 0
  border-radius: 12px
  background: #0f2f57
  color: #fff
  font-weight: 600
  cursor: pointer

.status-pills
  display: flex
  flex-wrap: wrap
  gap: 10px
  margin-top: 14px

.status-pill
  border: 0
  border-radius: 999px
  padding: 8px 14px
  background: #f3f6fb
  color: #486078
  font-size: 13px
  font-weight: 600
  cursor: pointer

.status-pill--active
  box-shadow: inset 0 0 0 2px rgba(15, 98, 254, 0.18)

.status-pill--pending_review
  background: #fff7e8
  color: #b25d0f

.status-pill--changes_requested
  background: #e9f3ff
  color: #0f62fe

.status-pill--approved
  background: #e9f8ef
  color: #137333

.status-pill--draft, .status-pill--archived
  background: #fff1f0
  color: #cf1322

.content-list
  display: flex
  flex-direction: column
  gap: 14px
  margin-top: 18px

.content-card
  padding: 18px
  border-radius: 18px
  background: #f8fafc

.content-card-head
  display: flex
  align-items: flex-start
  justify-content: space-between
  gap: 16px

.content-main
  min-width: 0
  flex: 1

.content-title
  font-size: 18px
  font-weight: 700
  line-height: 1.5
  color: #1f2937
  text-decoration: none

.content-meta
  display: flex
  flex-wrap: wrap
  gap: 8px 14px
  margin-top: 8px
  font-size: 13px
  color: #667085

.content-meta--secondary
  margin-top: 12px

.content-authors
  margin-top: 8px
  font-size: 13px
  color: #355070

.content-abstract
  margin-top: 14px
  color: #355070
  line-height: 1.7

.content-footer
  margin-top: 14px

.content-tags
  display: flex
  flex-wrap: wrap
  gap: 8px

.content-tag
  display: inline-flex
  align-items: center
  height: 28px
  padding: 0 10px
  border-radius: 999px
  background: #fff
  color: #486078
  font-size: 12px
  font-weight: 600

.bound-members
  display: flex
  flex-wrap: wrap
  gap: 8px
  margin-top: 12px

.bound-member-chip
  display: inline-flex
  align-items: center
  min-height: 30px
  padding: 0 12px
  border-radius: 999px
  background: #edf4ff
  color: #0f4c81
  font-size: 12px
  font-weight: 600

.binding-empty-hint
  margin-top: 12px
  font-size: 13px
  color: #667085

.content-actions
  display: flex
  justify-content: flex-end
  margin-top: 12px

.binding-modal-body
  display: flex
  flex-direction: column
  gap: 14px

.binding-modal-paper-title
  font-size: 16px
  font-weight: 700
  color: #1f2937

.binding-modal-desc
  font-size: 13px
  line-height: 1.6
  color: #667085

.binding-list
  display: flex
  flex-direction: column
  gap: 12px

.binding-item
  display: flex
  align-items: center
  justify-content: space-between
  gap: 14px
  padding: 14px 16px
  border-radius: 16px
  background: #f8fafc

.binding-item-main
  min-width: 0
  flex: 1

.binding-item-title
  font-size: 14px
  font-weight: 700
  color: #1f2937

.binding-item-current
  margin-top: 6px
  font-size: 13px
  color: #355070

.binding-item-current--empty
  color: #98a2b3

.binding-item-actions
  display: flex
  align-items: center
  gap: 10px

.binding-select
  width: 290px

.review-badge
  padding: 6px 12px
  border-radius: 999px
  font-size: 12px
  font-weight: 700

.review-badge--pending_review
  background: #fff7e8
  color: #b25d0f

.review-badge--changes_requested
  background: #e9f3ff
  color: #0f62fe

.review-badge--approved
  background: #e9f8ef
  color: #137333

.review-badge--draft, .review-badge--archived
  background: #fff1f0
  color: #cf1322

.review-note
  margin-top: 12px
  font-size: 13px
  color: #b42318
  line-height: 1.6

.admin-state
  display: flex
  align-items: center
  justify-content: center
  min-height: 180px
  border-radius: 20px
  background: #fff
  color: #667085
  text-align: center
  padding: 24px
  border: 1px solid rgba(15, 47, 87, 0.08)
  box-shadow: 0 14px 34px rgba(15, 47, 87, 0.06)

.pagination-wrap
  display: flex
  justify-content: flex-end
  margin-top: 20px

@media (max-width: 768px)
  .admin-container
    padding: 0 18px

  .admin-header, .panel-head, .content-card-head
    flex-direction: column

  .admin-header-actions
    width: 100%
    justify-content: flex-start

  .search-box
    flex-direction: column

  .search-btn
    min-height: 42px

  .binding-item, .binding-item-actions
    flex-direction: column
    align-items: stretch

  .binding-select
    width: 100%
</style>
