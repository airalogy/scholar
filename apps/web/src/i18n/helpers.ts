export const PAPER_STATUS_LABEL_KEYS = {
  draft: 'common.paperStatus.draft',
  pending_review: 'common.paperStatus.pendingReview',
  changes_requested: 'common.paperStatus.changesRequested',
  approved: 'common.paperStatus.approved',
  archived: 'common.paperStatus.archived',
} as const

export const PAPER_TYPE_LABEL_KEYS = {
  0: 'common.paperTypes.0',
  1: 'common.paperTypes.1',
  2: 'common.paperTypes.2',
  3: 'common.paperTypes.3',
  4: 'common.paperTypes.4',
  5: 'common.paperTypes.5',
} as const

export const LANGUAGE_LABEL_KEYS = {
  0: 'common.languages.0',
  1: 'common.languages.1',
  2: 'common.languages.2',
  3: 'common.languages.3',
  4: 'common.languages.4',
  5: 'common.languages.5',
} as const

export const INSTITUTION_ROLE_LABEL_KEYS = {
  owner: 'common.roles.institution.owner',
  admin: 'common.roles.institution.admin',
  member: 'common.roles.institution.member',
  reviewer: 'common.roles.institution.reviewer',
  platform_admin: 'common.roles.platformAdmin',
} as const

export const LAB_ROLE_LABEL_KEYS = {
  owner: 'common.roles.lab.owner',
  admin: 'common.roles.lab.admin',
  member: 'common.roles.lab.member',
} as const

export const PLATFORM_ROLE_LABEL_KEYS = {
  platform_admin: 'common.roles.platformAdmin',
  member: 'common.roles.member',
} as const

export const FEEDBACK_TYPE_LABEL_KEYS = {
  bug_report: 'feedback.types.bugReport',
  feature_request: 'feedback.types.featureRequest',
} as const

export const FEEDBACK_STATUS_LABEL_KEYS = {
  pending: 'feedback.status.pending',
  processed: 'feedback.status.processed',
} as const

export const PROVISION_STATUS_LABEL_KEYS = {
  pending_activation: 'common.provisionStatus.pendingActivation',
  claimed: 'common.provisionStatus.claimed',
  disabled: 'common.provisionStatus.disabled',
} as const
