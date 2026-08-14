<template>
  <div class="admin-page">
    <header class="admin-header">
      <div>
        <h1>{{ $t('degreeTheses.adminTitle') }}</h1>
        <span>{{ $t('degreeTheses.adminSubtitle') }}</span>
      </div>
      <router-link to="/admin" class="secondary-btn">{{ $t('degreeTheses.backToAdmin') }}</router-link>
    </header>

    <section class="institution-bar">
      <label>
        <span>{{ $t('degreeTheses.institutionLabel') }}</span>
        <select v-model="selectedInstitutionId" @change="onInstitutionChange">
          <option v-for="institution in institutions" :key="institution.id" :value="institution.id">
            {{ institution.name }}
          </option>
        </select>
      </label>
    </section>

    <div class="admin-grid">
      <section class="panel queue-panel">
        <div class="panel-heading">
          <div>
            <h2>{{ $t('degreeTheses.reviewQueue') }}</h2>
            <p>{{ $t('degreeTheses.reviewQueueHint') }}</p>
          </div>
          <button class="text-btn" type="button" @click="loadQueue">{{ $t('common.refresh') }}</button>
        </div>
        <input v-model="searchQuery" class="search-input" :placeholder="$t('degreeTheses.reviewSearch')" @keyup.enter="runQueueSearch" />
        <div v-if="queueLoading" class="panel-state">{{ $t('common.loading') }}</div>
        <div v-else-if="!queue.length" class="panel-state">{{ $t('degreeTheses.reviewQueueEmpty') }}</div>
        <template v-else>
          <button
            v-for="thesis in queue"
            :key="thesis.id"
            class="queue-item"
            :class="{ 'queue-item--active': selectedThesis?.id === thesis.id }"
            type="button"
            @click="selectThesis(thesis)"
          >
            <strong>{{ thesis.current_version?.title }}</strong>
            <small>{{ thesis.record_code }}</small>
            <span>{{ thesis.current_version?.author_name }} · {{ thesis.current_version?.training_unit }}</span>
            <small>{{ $t('degreeTheses.currentStep', { step: thesis.current_step || 1 }) }}</small>
          </button>
        </template>
        <nav v-if="queueTotal > queuePageSize" class="queue-pagination" :aria-label="$t('degreeTheses.paginationLabel')">
          <button class="text-btn" type="button" :disabled="queueOffset === 0 || queueLoading" @click="changeQueuePage(-1)">
            {{ $t('degreeTheses.previousPage') }}
          </button>
          <span>{{ queuePage }} / {{ queuePageCount }}</span>
          <button class="text-btn" type="button" :disabled="queueOffset + queuePageSize >= queueTotal || queueLoading" @click="changeQueuePage(1)">
            {{ $t('degreeTheses.nextPage') }}
          </button>
        </nav>
      </section>

      <section class="panel review-panel">
        <template v-if="selectedThesis?.current_version">
          <div class="panel-heading">
            <div>
              <h2>{{ selectedThesis.current_version.title }}</h2>
              <p>{{ selectedThesis.current_version.author_name }} · {{ selectedThesis.current_version.degree_category }}</p>
            </div>
            <router-link :to="`/theses/${selectedThesis.record_code}`" class="text-btn">{{ $t('degreeTheses.viewDetail') }}</router-link>
          </div>
          <dl class="review-metadata">
            <div><dt>{{ $t('degreeTheses.trainingUnitLabel') }}</dt><dd>{{ selectedThesis.current_version.training_unit }}</dd></div>
            <div><dt>{{ $t('degreeTheses.majorLabel') }}</dt><dd>{{ selectedThesis.current_version.major }}</dd></div>
            <div><dt>{{ $t('degreeTheses.awardYearLabel') }}</dt><dd>{{ selectedThesis.current_version.award_year }}</dd></div>
            <div><dt>{{ $t('degreeTheses.versionLabel') }}</dt><dd>v{{ selectedThesis.current_version.version_number }}</dd></div>
          </dl>
          <p class="review-abstract">{{ selectedThesis.current_version.abstract || $t('common.noAbstract') }}</p>
          <ol class="mini-steps">
            <li v-for="step in selectedThesis.review_steps" :key="step.id" :class="`mini-step--${step.status}`">
              <span>{{ step.order }}</span><strong>{{ step.name }}</strong><small>{{ $t(`degreeTheses.stepStatus.${step.status}`) }}</small>
            </li>
          </ol>
          <label class="notes-field">
            <span>{{ $t('degreeTheses.reviewNote') }}</span>
            <textarea v-model="reviewNotes" rows="4" :placeholder="$t('degreeTheses.reviewNotesPlaceholder')" />
          </label>
          <div class="review-actions">
            <button class="danger-btn" type="button" :disabled="reviewing" @click="review('request_changes')">
              {{ $t('degreeTheses.requestChanges') }}
            </button>
            <button class="primary-btn" type="button" :disabled="reviewing" @click="review('approve')">
              {{ $t('degreeTheses.approveStep') }}
            </button>
          </div>
        </template>
        <div v-else class="panel-state panel-state--large">{{ $t('degreeTheses.selectReviewItem') }}</div>
      </section>
    </div>

    <section v-if="canConfigureWorkflow" class="panel workflow-panel">
      <div class="panel-heading">
        <div>
          <h2>{{ $t('degreeTheses.workflowTitle') }}</h2>
          <p>{{ $t('degreeTheses.workflowSubtitle') }}</p>
        </div>
        <select v-model="workflowContentType" @change="loadWorkflow">
          <option value="degree_thesis">{{ $t('degreeTheses.contentTypeThesis') }}</option>
          <option value="paper">{{ $t('degreeTheses.contentTypePaper') }}</option>
        </select>
      </div>
      <label class="workflow-name">
        <span>{{ $t('degreeTheses.workflowName') }}</span>
        <input v-model="workflowName" maxlength="100" />
      </label>
      <div class="workflow-steps">
        <div v-for="(step, index) in workflowSteps" :key="index" class="workflow-step">
          <span class="step-number">{{ index + 1 }}</span>
          <input v-model="step.name" :placeholder="$t('degreeTheses.workflowStepName')" maxlength="100" />
          <select v-model="step.roleGroup">
            <option value="admins">{{ $t('degreeTheses.reviewerAdmins') }}</option>
            <option value="reviewers">{{ $t('degreeTheses.reviewerExplicit') }}</option>
            <option value="all">{{ $t('degreeTheses.reviewerAll') }}</option>
          </select>
          <button v-if="workflowSteps.length > 1" type="button" class="remove-btn" @click="removeStep(index)">×</button>
        </div>
      </div>
      <div class="workflow-actions">
        <button v-if="workflowSteps.length < 3" class="secondary-btn" type="button" @click="addStep">
          {{ $t('degreeTheses.addReviewStep') }}
        </button>
        <button class="primary-btn" type="button" :disabled="workflowSaving" @click="saveWorkflow">
          {{ workflowSaving ? $t('degreeTheses.saving') : $t('degreeTheses.saveWorkflow') }}
        </button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import { useI18n } from 'vue-i18n'
import { getMyProfile } from '@/api/users'
import {
  getReviewWorkflow,
  listInstitutions,
  saveReviewWorkflow as saveInstitutionReviewWorkflow,
  type ReviewWorkflowContentType,
} from '@/api/institutions'
import {
  listDegreeThesisReviewQueue,
  reviewDegreeThesis,
  type DegreeThesis,
} from '@/api/theses'

type RoleGroup = 'admins' | 'reviewers' | 'all'
interface EditableStep { name: string; roleGroup: RoleGroup }
interface InstitutionOption {
  id: string
  name: string
  slug: string
  role: string
  canConfigureWorkflow: boolean
}

const { t } = useI18n()
const institutions = ref<InstitutionOption[]>([])
const selectedInstitutionId = ref('')
const queue = ref<DegreeThesis[]>([])
const queueTotal = ref(0)
const queueOffset = ref(0)
const queuePageSize = 50
const selectedThesis = ref<DegreeThesis | null>(null)
const queueLoading = ref(false)
const searchQuery = ref('')
const reviewNotes = ref('')
const reviewing = ref(false)
const workflowContentType = ref<ReviewWorkflowContentType>('degree_thesis')
const workflowName = ref('')
const workflowSteps = ref<EditableStep[]>([{ name: '', roleGroup: 'admins' }])
const workflowSaving = ref(false)

const selectedInstitution = (): InstitutionOption | undefined => {
  return institutions.value.find((institution) => institution.id === selectedInstitutionId.value)
}

const canConfigureWorkflow = computed(() => {
  return selectedInstitution()?.canConfigureWorkflow === true
})
const queuePage = computed(() => Math.floor(queueOffset.value / queuePageSize) + 1)
const queuePageCount = computed(() => Math.max(1, Math.ceil(queueTotal.value / queuePageSize)))

const rolesForGroup = (group: RoleGroup): string[] => {
  if (group === 'reviewers') return ['reviewer']
  if (group === 'all') return ['owner', 'admin', 'reviewer']
  return ['owner', 'admin']
}

const groupForRoles = (roles: string[]): RoleGroup => {
  if (roles.includes('reviewer') && (roles.includes('owner') || roles.includes('admin'))) return 'all'
  if (roles.includes('reviewer')) return 'reviewers'
  return 'admins'
}

const loadQueue = async (): Promise<void> => {
  queueLoading.value = true
  try {
    const result = await listDegreeThesisReviewQueue({
      institution_id: selectedInstitutionId.value || undefined,
      q: searchQuery.value.trim() || undefined,
      limit: queuePageSize,
      offset: queueOffset.value,
    })
    queue.value = result.items
    queueTotal.value = result.total
    if (selectedThesis.value) {
      selectedThesis.value = queue.value.find((item) => item.id === selectedThesis.value?.id) ?? null
    }
  } catch {
    Message.error(t('degreeTheses.loadFailed'))
  } finally {
    queueLoading.value = false
  }
}

const runQueueSearch = (): void => {
  queueOffset.value = 0
  selectedThesis.value = null
  reviewNotes.value = ''
  void loadQueue()
}

const changeQueuePage = (direction: -1 | 1): void => {
  const nextOffset = queueOffset.value + direction * queuePageSize
  if (nextOffset < 0 || nextOffset >= queueTotal.value) return
  queueOffset.value = nextOffset
  selectedThesis.value = null
  reviewNotes.value = ''
  void loadQueue()
}

const selectThesis = (thesis: DegreeThesis): void => {
  selectedThesis.value = thesis
  reviewNotes.value = ''
}

const loadWorkflow = async (): Promise<void> => {
  const institution = selectedInstitution()
  if (!institution?.canConfigureWorkflow) return
  try {
    const workflow = await getReviewWorkflow(institution.slug, workflowContentType.value)
    workflowName.value = workflow?.name || t('degreeTheses.defaultWorkflowName')
    workflowSteps.value = workflow?.steps.length
      ? workflow.steps.map((step) => ({
          name: step.name,
          roleGroup: groupForRoles(step.reviewer_roles),
        }))
      : [{ name: t('degreeTheses.defaultReviewStep'), roleGroup: 'admins' }]
  } catch {
    Message.error(t('degreeTheses.workflowLoadFailed'))
  }
}

const onInstitutionChange = async (): Promise<void> => {
  queueOffset.value = 0
  selectedThesis.value = null
  reviewNotes.value = ''
  await Promise.all([loadQueue(), loadWorkflow()])
}

const review = async (decision: 'approve' | 'request_changes'): Promise<void> => {
  if (!selectedThesis.value) return
  if (decision === 'request_changes' && !reviewNotes.value.trim()) {
    Message.warning(t('degreeTheses.reviewNotesRequired'))
    return
  }
  reviewing.value = true
  try {
    await reviewDegreeThesis(selectedThesis.value.id, decision, reviewNotes.value.trim() || undefined)
    Message.success(t('degreeTheses.reviewSuccess'))
    reviewNotes.value = ''
    selectedThesis.value = null
    queueOffset.value = 0
    await loadQueue()
  } catch {
    Message.error(t('degreeTheses.reviewFailed'))
  } finally {
    reviewing.value = false
  }
}

const addStep = (): void => {
  if (workflowSteps.value.length < 3) {
    workflowSteps.value.push({ name: '', roleGroup: 'admins' })
  }
}

const removeStep = (index: number): void => {
  workflowSteps.value.splice(index, 1)
}

const saveWorkflow = async (): Promise<void> => {
  const institution = selectedInstitution()
  if (!institution || workflowSteps.value.some((step) => !step.name.trim())) {
    Message.warning(t('degreeTheses.workflowRequired'))
    return
  }
  workflowSaving.value = true
  try {
    await saveInstitutionReviewWorkflow(institution.slug, workflowContentType.value, {
      name: workflowName.value.trim() || t('degreeTheses.defaultWorkflowName'),
      steps: workflowSteps.value.map((step) => ({
        name: step.name.trim(),
        reviewer_roles: rolesForGroup(step.roleGroup),
      })),
    })
    Message.success(t('degreeTheses.workflowSaved'))
  } catch {
    Message.error(t('degreeTheses.workflowSaveFailed'))
  } finally {
    workflowSaving.value = false
  }
}

onMounted(async () => {
  try {
    const profile = await getMyProfile()
    if (profile.platform_role === 'platform_admin') {
      institutions.value = (await listInstitutions()).map((institution) => ({
        id: institution.id,
        name: institution.name,
        slug: institution.slug,
        role: institution.role,
        canConfigureWorkflow: true,
      }))
    } else {
      const manageableIds = new Set(
        profile.manageable_institutions
          .filter((institution) => institution.role === 'owner' || institution.role === 'admin')
          .map((institution) => institution.id),
      )
      institutions.value = profile.institution_memberships
        .filter((membership) => manageableIds.has(membership.id) || membership.can_review_content)
        .map((membership) => ({
          id: membership.id,
          name: membership.name,
          slug: membership.slug,
          role: membership.role,
          canConfigureWorkflow: manageableIds.has(membership.id),
        }))
      for (const institution of profile.manageable_institutions) {
        if (!institutions.value.some((item) => item.id === institution.id)) {
          institutions.value.push({
            ...institution,
            canConfigureWorkflow:
              institution.role === 'owner' || institution.role === 'admin',
          })
        }
      }
    }
    selectedInstitutionId.value = institutions.value[0]?.id ?? ''
    await Promise.all([loadQueue(), loadWorkflow()])
  } catch {
    Message.error(t('degreeTheses.loadFailed'))
  }
})
</script>

<style scoped>
.admin-page { max-width: 1240px; margin: 0 auto; padding: 40px 34px 80px; }
.admin-header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-end; margin-bottom: 24px; }
.admin-header h1 { margin: 0 0 8px; font-size: 32px; }
.admin-header span { color: var(--scholar-text-secondary); }
.institution-bar, .panel { border: 1px solid var(--scholar-border-light); border-radius: 12px; background: #fff; }
.institution-bar { padding: 16px 20px; margin-bottom: 18px; }
.institution-bar label { display: flex; gap: 12px; align-items: center; }
select, input, textarea { border: 1px solid var(--scholar-border-input); border-radius: 8px; padding: 9px 11px; background: #fff; font: inherit; }
.admin-grid { display: grid; grid-template-columns: 390px minmax(0, 1fr); gap: 18px; }
.panel { padding: 22px; }
.panel-heading { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; margin-bottom: 16px; }
.panel-heading h2 { margin: 0 0 5px; font-size: 18px; }
.panel-heading p { margin: 0; color: var(--scholar-text-secondary); font-size: 13px; }
.search-input { width: 100%; box-sizing: border-box; margin-bottom: 12px; }
.queue-item { width: 100%; display: grid; gap: 5px; padding: 14px; text-align: left; border: 0; border-top: 1px solid var(--scholar-border-light); background: transparent; cursor: pointer; }
.queue-item--active { background: var(--scholar-primary-light); }
.queue-item span, .queue-item small { color: var(--scholar-text-secondary); }
.queue-item small { color: var(--scholar-primary); }
.queue-pagination { display: flex; justify-content: center; align-items: center; gap: 10px; padding-top: 12px; color: var(--scholar-text-secondary); font-size: 13px; }
.queue-pagination .text-btn:disabled { opacity: .45; cursor: not-allowed; }
.panel-state { padding: 28px 8px; text-align: center; color: var(--scholar-text-secondary); }
.panel-state--large { padding: 100px 20px; }
.review-metadata { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.review-metadata dt { color: var(--scholar-text-secondary); font-size: 12px; }
.review-metadata dd { margin: 4px 0 0; }
.review-abstract { max-height: 150px; overflow: auto; line-height: 1.7; color: var(--scholar-text-secondary); }
.mini-steps { list-style: none; padding: 0; display: flex; gap: 8px; flex-wrap: wrap; }
.mini-steps li { display: flex; gap: 7px; align-items: center; padding: 7px 9px; border-radius: 8px; background: #f2f4f7; font-size: 12px; }
.mini-step--pending { background: #fffaeb !important; }
.mini-step--approved { background: #ecfdf3 !important; }
.notes-field, .workflow-name { display: grid; gap: 7px; margin-top: 18px; }
.notes-field textarea, .workflow-name input { width: 100%; box-sizing: border-box; }
.review-actions, .workflow-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 14px; }
.primary-btn, .secondary-btn, .danger-btn, .text-btn { border-radius: 8px; padding: 9px 15px; text-decoration: none; font-weight: 600; cursor: pointer; }
.primary-btn { border: 1px solid var(--scholar-primary); color: #fff; background: var(--scholar-primary); }
.secondary-btn { border: 1px solid var(--scholar-border-input); color: var(--scholar-text-primary); background: #fff; }
.danger-btn { border: 1px solid #f97066; color: #b42318; background: #fff4f2; }
.text-btn { border: 0; color: var(--scholar-primary); background: transparent; padding: 4px; }
.workflow-panel { margin-top: 18px; }
.workflow-steps { display: grid; gap: 10px; margin-top: 16px; }
.workflow-step { display: grid; grid-template-columns: 34px minmax(220px, 1fr) 220px 36px; gap: 10px; align-items: center; }
.step-number { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; background: var(--scholar-primary-light); color: var(--scholar-primary); }
.remove-btn { border: 0; background: transparent; color: #b42318; font-size: 22px; cursor: pointer; }
@media (max-width: 900px) { .admin-grid { grid-template-columns: 1fr; } .workflow-step { grid-template-columns: 34px 1fr; } .workflow-step select { grid-column: 2; } }
@media (max-width: 650px) { .admin-page { padding: 28px 16px 60px; } .admin-header { align-items: flex-start; flex-direction: column; } }
</style>
