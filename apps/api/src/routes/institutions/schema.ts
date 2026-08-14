import { Type, type Static } from 'typebox'

export const PlatformRoleSchema = Type.Union([
  Type.Literal('member'),
  Type.Literal('platform_admin'),
])

export const InstitutionRoleSchema = Type.Union([
  Type.Literal('owner'),
  Type.Literal('admin'),
  Type.Literal('member'),
])

export const InstitutionListRoleSchema = Type.Union([
  InstitutionRoleSchema,
  Type.Literal('reviewer'),
  PlatformRoleSchema,
])

export const InstitutionProvisionStatusSchema = Type.Union([
  Type.Literal('pending_activation'),
  Type.Literal('claimed'),
  Type.Literal('disabled'),
])

export const InstitutionJoinRequestStatusSchema = Type.Union([
  Type.Literal('pending'),
  Type.Literal('approved'),
  Type.Literal('rejected'),
])

export const InstitutionParamsSchema = Type.Object({
  slug: Type.String({ minLength: 1 }),
})

export type InstitutionParams = Static<typeof InstitutionParamsSchema>

export const InstitutionMemberParamsSchema = Type.Object({
  slug: Type.String({ minLength: 1 }),
  userId: Type.String({ format: 'uuid' }),
})

export type InstitutionMemberParams = Static<typeof InstitutionMemberParamsSchema>

export const InstitutionProvisionParamsSchema = Type.Object({
  slug: Type.String({ minLength: 1 }),
  provisionId: Type.String({ format: 'uuid' }),
})

export type InstitutionProvisionParams = Static<typeof InstitutionProvisionParamsSchema>

export const InstitutionApiCredentialParamsSchema = Type.Object({
  slug: Type.String({ minLength: 1 }),
  credentialId: Type.String({ format: 'uuid' }),
})

export type InstitutionApiCredentialParams = Static<typeof InstitutionApiCredentialParamsSchema>

export const InstitutionJoinRequestParamsSchema = Type.Object({
  slug: Type.String({ minLength: 1 }),
  requestId: Type.String({ format: 'uuid' }),
})

export type InstitutionJoinRequestParams = Static<typeof InstitutionJoinRequestParamsSchema>

export const InstitutionPaperBindingParamsSchema = Type.Object({
  slug: Type.String({ minLength: 1 }),
  bindingId: Type.String({ format: 'uuid' }),
})

export type InstitutionPaperBindingParams = Static<typeof InstitutionPaperBindingParamsSchema>

export const InstitutionAccessSchema = Type.Object({
  platform_role: PlatformRoleSchema,
  institution_role: Type.Union([InstitutionRoleSchema, Type.Null()]),
  can_edit_content: Type.Boolean(),
  can_manage_members: Type.Boolean(),
  can_review_content: Type.Boolean(),
  can_import_data: Type.Boolean(),
})

export const InstitutionLabSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  name: Type.String(),
  slug: Type.String(),
  college: Type.Union([Type.String(), Type.Null()]),
  location: Type.Union([Type.String(), Type.Null()]),
  memberCount: Type.Integer(),
})

export const InstitutionMembershipSchema = Type.Object({
  userId: Type.String({ format: 'uuid' }),
  name: Type.String(),
  email: Type.String(),
  avatar: Type.Union([Type.String(), Type.Null()]),
  degree: Type.Union([Type.String(), Type.Null()]),
  major: Type.Union([Type.String(), Type.Null()]),
  role: InstitutionRoleSchema,
  canReviewContent: Type.Boolean(),
  canImportData: Type.Boolean(),
  paperCount: Type.Integer(),
  approvedPaperCount: Type.Integer(),
})

export const InstitutionPaperBoundMemberSchema = Type.Object({
  bindingId: Type.String({ format: 'uuid' }),
  paperId: Type.String({ format: 'uuid' }),
  userId: Type.String({ format: 'uuid' }),
  name: Type.String(),
  avatar: Type.Union([Type.String(), Type.Null()]),
  authorId: Type.String({ format: 'uuid' }),
  authorName: Type.String(),
})

export const InstitutionProvisionSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  email: Type.String(),
  name: Type.String(),
  role: InstitutionRoleSchema,
  canReviewContent: Type.Boolean(),
  canImportData: Type.Boolean(),
  externalId: Type.Union([Type.String(), Type.Null()]),
  college: Type.Union([Type.String(), Type.Null()]),
  major: Type.Union([Type.String(), Type.Null()]),
  laboratory: Type.Union([Type.String(), Type.Null()]),
  status: InstitutionProvisionStatusSchema,
  inviteToken: Type.Union([Type.String(), Type.Null()]),
  claimedUserId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  claimedUserName: Type.Union([Type.String(), Type.Null()]),
  claimedAt: Type.Union([Type.String(), Type.Null()]),
  expiresAt: Type.Union([Type.String(), Type.Null()]),
  createdAt: Type.String(),
  updatedAt: Type.String(),
})

export const InstitutionJoinRequestSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  userId: Type.String({ format: 'uuid' }),
  userName: Type.String(),
  userEmail: Type.String(),
  userAvatar: Type.Union([Type.String(), Type.Null()]),
  userDegree: Type.Union([Type.String(), Type.Null()]),
  userMajor: Type.Union([Type.String(), Type.Null()]),
  userCollege: Type.Union([Type.String(), Type.Null()]),
  userLaboratory: Type.Union([Type.String(), Type.Null()]),
  status: InstitutionJoinRequestStatusSchema,
  reason: Type.Union([Type.String(), Type.Null()]),
  reviewNotes: Type.Union([Type.String(), Type.Null()]),
  reviewedBy: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  reviewedByName: Type.Union([Type.String(), Type.Null()]),
  reviewedAt: Type.Union([Type.String(), Type.Null()]),
  createdAt: Type.String(),
  updatedAt: Type.String(),
})

export const InstitutionOrgNodeSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  key: Type.String(),
  name: Type.String(),
  code: Type.Union([Type.String(), Type.Null()]),
  nodeType: Type.String(),
  isActive: Type.Boolean(),
  metadata: Type.Union([Type.Unknown(), Type.Null()]),
  createdAt: Type.String(),
  updatedAt: Type.String(),
})

export const InstitutionOrgEdgeSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  fromNodeId: Type.String({ format: 'uuid' }),
  fromNodeKey: Type.String(),
  toNodeId: Type.String({ format: 'uuid' }),
  toNodeKey: Type.String(),
  edgeType: Type.String(),
  isPrimary: Type.Boolean(),
  metadata: Type.Union([Type.Unknown(), Type.Null()]),
  createdAt: Type.String(),
  updatedAt: Type.String(),
})

export const InstitutionOrgPersonSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  key: Type.String(),
  name: Type.String(),
  email: Type.Union([Type.String(), Type.Null()]),
  externalId: Type.Union([Type.String(), Type.Null()]),
  userId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  provisionId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  provisionStatus: Type.Union([InstitutionProvisionStatusSchema, Type.Null()]),
  isProvisioningEnabled: Type.Boolean(),
  isActive: Type.Boolean(),
  metadata: Type.Union([Type.Unknown(), Type.Null()]),
  createdAt: Type.String(),
  updatedAt: Type.String(),
})

export const InstitutionOrgPositionSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  key: Type.String(),
  nodeId: Type.String({ format: 'uuid' }),
  nodeKey: Type.String(),
  name: Type.String(),
  code: Type.Union([Type.String(), Type.Null()]),
  canReviewContent: Type.Boolean(),
  isActive: Type.Boolean(),
  metadata: Type.Union([Type.Unknown(), Type.Null()]),
  createdAt: Type.String(),
  updatedAt: Type.String(),
})

export const InstitutionOrgAppointmentSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  key: Type.String(),
  personId: Type.String({ format: 'uuid' }),
  personKey: Type.String(),
  positionId: Type.String({ format: 'uuid' }),
  positionKey: Type.String(),
  title: Type.Union([Type.String(), Type.Null()]),
  status: Type.String(),
  isPrimary: Type.Boolean(),
  startsAt: Type.Union([Type.String(), Type.Null()]),
  endsAt: Type.Union([Type.String(), Type.Null()]),
  metadata: Type.Union([Type.Unknown(), Type.Null()]),
  createdAt: Type.String(),
  updatedAt: Type.String(),
})

export const InstitutionReviewWorkflowBindingTypeSchema = Type.Union([
  Type.Literal('institution_default'),
  Type.Literal('node_default'),
])

export const InstitutionReviewWorkflowResolverTypeSchema = Type.Union([
  Type.Literal('position'),
  Type.Literal('institution_role'),
  Type.Literal('user'),
])

export const InstitutionReviewWorkflowStepSchema = Type.Object({
  order: Type.Integer(),
  name: Type.String(),
  resolverType: InstitutionReviewWorkflowResolverTypeSchema,
  resolverConfig: Type.Unknown(),
})

export const InstitutionReviewWorkflowBindingSchema = Type.Object({
  type: InstitutionReviewWorkflowBindingTypeSchema,
  contentType: Type.Union([Type.Literal('paper'), Type.Literal('degree_thesis')]),
  nodeId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  nodeKey: Type.Union([Type.String(), Type.Null()]),
  priority: Type.Integer(),
  isActive: Type.Boolean(),
})

export const InstitutionReviewWorkflowSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  key: Type.String(),
  name: Type.String(),
  description: Type.Union([Type.String(), Type.Null()]),
  isActive: Type.Boolean(),
  metadata: Type.Union([Type.Unknown(), Type.Null()]),
  createdAt: Type.String(),
  updatedAt: Type.String(),
  bindings: Type.Array(InstitutionReviewWorkflowBindingSchema),
  steps: Type.Array(InstitutionReviewWorkflowStepSchema),
})

export const InstitutionListItemSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  name: Type.String(),
  slug: Type.String(),
  summary: Type.Union([Type.String(), Type.Null()]),
  website: Type.Union([Type.String(), Type.Null()]),
  role: InstitutionListRoleSchema,
  labCount: Type.Integer(),
  memberCount: Type.Integer(),
})

export const InstitutionCatalogItemSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  name: Type.String(),
  slug: Type.String(),
  summary: Type.Union([Type.String(), Type.Null()]),
  website: Type.Union([Type.String(), Type.Null()]),
  labCount: Type.Integer(),
  collegeCount: Type.Integer(),
})

export const InstitutionDetailResponseSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  name: Type.String(),
  slug: Type.String(),
  summary: Type.Union([Type.String(), Type.Null()]),
  website: Type.Union([Type.String(), Type.Null()]),
  labCount: Type.Integer(),
  memberCount: Type.Integer(),
  access: InstitutionAccessSchema,
  labs: Type.Array(InstitutionLabSchema),
})

export const InstitutionMembershipListResponseSchema = Type.Object({
  items: Type.Array(InstitutionMembershipSchema),
})

export const InstitutionListResponseSchema = Type.Object({
  items: Type.Array(InstitutionListItemSchema),
})

export const InstitutionCatalogResponseSchema = Type.Object({
  items: Type.Array(InstitutionCatalogItemSchema),
})

export const InstitutionProvisionListResponseSchema = Type.Object({
  items: Type.Array(InstitutionProvisionSchema),
})

export const InstitutionJoinRequestListResponseSchema = Type.Object({
  items: Type.Array(InstitutionJoinRequestSchema),
})

export const InstitutionPaperBoundMemberListResponseSchema = Type.Object({
  items: Type.Array(InstitutionPaperBoundMemberSchema),
})

export const MyInstitutionJoinRequestResponseSchema = Type.Object({
  item: Type.Union([InstitutionJoinRequestSchema, Type.Null()]),
})

export const InstitutionOrgStructureResponseSchema = Type.Object({
  institutionId: Type.String({ format: 'uuid' }),
  nodes: Type.Array(InstitutionOrgNodeSchema),
  edges: Type.Array(InstitutionOrgEdgeSchema),
  people: Type.Array(InstitutionOrgPersonSchema),
  positions: Type.Array(InstitutionOrgPositionSchema),
  appointments: Type.Array(InstitutionOrgAppointmentSchema),
  workflows: Type.Array(InstitutionReviewWorkflowSchema),
})

export const InstitutionApiCredentialScopeSchema = Type.Union([
  Type.Literal('papers:import'),
  Type.Literal('scholars:import'),
  Type.Literal('imports:read'),
])

export const InstitutionApiCredentialStatusSchema = Type.Union([
  Type.Literal('active'),
  Type.Literal('expired'),
  Type.Literal('revoked'),
])

export const InstitutionApiCredentialSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  name: Type.String(),
  clientId: Type.String(),
  scopes: Type.Array(InstitutionApiCredentialScopeSchema),
  status: InstitutionApiCredentialStatusSchema,
  expiresAt: Type.String(),
  revokedAt: Type.Union([Type.String(), Type.Null()]),
  lastUsedAt: Type.Union([Type.String(), Type.Null()]),
  lastUsedIp: Type.Union([Type.String(), Type.Null()]),
  createdAt: Type.String(),
  updatedAt: Type.String(),
})

export const InstitutionApiCredentialListResponseSchema = Type.Object({
  code: Type.Literal(0),
  data: Type.Object({
    items: Type.Array(InstitutionApiCredentialSchema),
  }),
})

export const CreateInstitutionApiCredentialBodySchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 100 }),
  scopes: Type.Array(InstitutionApiCredentialScopeSchema, {
    minItems: 1,
    maxItems: 3,
  }),
  expiresInDays: Type.Optional(Type.Integer({ minimum: 1, maximum: 365, default: 90 })),
})

export type CreateInstitutionApiCredentialBody = Static<
  typeof CreateInstitutionApiCredentialBodySchema
>

export const RotateInstitutionApiCredentialBodySchema = Type.Object({
  expiresInDays: Type.Optional(Type.Integer({ minimum: 1, maximum: 365 })),
})

export type RotateInstitutionApiCredentialBody = Static<
  typeof RotateInstitutionApiCredentialBodySchema
>

export const InstitutionApiCredentialSecretResponseSchema = Type.Object({
  code: Type.Literal(0),
  data: Type.Object({
    credential: InstitutionApiCredentialSchema,
    clientSecret: Type.String(),
  }),
})

export const UpdateInstitutionBodySchema = Type.Partial(
  Type.Object({
    summary: Type.String({ maxLength: 5000 }),
    website: Type.Union([Type.String({ maxLength: 255, pattern: '^https?://' }), Type.Literal('')]),
  }),
)

export type UpdateInstitutionBody = Static<typeof UpdateInstitutionBodySchema>

export const UpsertInstitutionMembershipBodySchema = Type.Object({
  userId: Type.String({ format: 'uuid' }),
  role: InstitutionRoleSchema,
  can_review_content: Type.Optional(Type.Boolean({ default: false })),
  can_import_data: Type.Optional(Type.Boolean({ default: false })),
})

export type UpsertInstitutionMembershipBody = Static<typeof UpsertInstitutionMembershipBodySchema>

export const UpsertInstitutionProvisionBodySchema = Type.Object({
  email: Type.String({ format: 'email' }),
  name: Type.String({ minLength: 1, maxLength: 100 }),
  role: InstitutionRoleSchema,
  can_review_content: Type.Optional(Type.Boolean({ default: false })),
  can_import_data: Type.Optional(Type.Boolean({ default: false })),
  externalId: Type.Optional(Type.String({ maxLength: 64 })),
  college: Type.Optional(Type.String({ maxLength: 100 })),
  major: Type.Optional(Type.String({ maxLength: 100 })),
  laboratory: Type.Optional(Type.String({ maxLength: 200 })),
  expiresInDays: Type.Optional(Type.Integer({ minimum: 1, maximum: 365, default: 30 })),
})

export type UpsertInstitutionProvisionBody = Static<typeof UpsertInstitutionProvisionBodySchema>

export const InstitutionOrgNodeInputSchema = Type.Object({
  key: Type.String({ minLength: 1, maxLength: 100 }),
  name: Type.String({ minLength: 1, maxLength: 200 }),
  code: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  nodeType: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
  isActive: Type.Optional(Type.Boolean({ default: true })),
  metadata: Type.Optional(Type.Unknown()),
})

export const InstitutionOrgEdgeInputSchema = Type.Object({
  fromNodeKey: Type.String({ minLength: 1, maxLength: 100 }),
  toNodeKey: Type.String({ minLength: 1, maxLength: 100 }),
  edgeType: Type.Optional(Type.String({ minLength: 1, maxLength: 64, default: 'hierarchy' })),
  isPrimary: Type.Optional(Type.Boolean({ default: false })),
  metadata: Type.Optional(Type.Unknown()),
})

export const InstitutionOrgPersonInputSchema = Type.Object({
  key: Type.String({ minLength: 1, maxLength: 100 }),
  name: Type.String({ minLength: 1, maxLength: 100 }),
  email: Type.Optional(Type.String({ format: 'email' })),
  externalId: Type.Optional(Type.String({ maxLength: 64 })),
  userId: Type.Optional(Type.String({ format: 'uuid' })),
  createProvision: Type.Optional(Type.Boolean({ default: false })),
  isActive: Type.Optional(Type.Boolean({ default: true })),
  metadata: Type.Optional(Type.Unknown()),
})

export const InstitutionOrgPositionInputSchema = Type.Object({
  key: Type.String({ minLength: 1, maxLength: 100 }),
  nodeKey: Type.String({ minLength: 1, maxLength: 100 }),
  name: Type.String({ minLength: 1, maxLength: 100 }),
  code: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
  canReviewContent: Type.Optional(Type.Boolean({ default: false })),
  isActive: Type.Optional(Type.Boolean({ default: true })),
  metadata: Type.Optional(Type.Unknown()),
})

export const InstitutionOrgAppointmentInputSchema = Type.Object({
  key: Type.String({ minLength: 1, maxLength: 100 }),
  personKey: Type.String({ minLength: 1, maxLength: 100 }),
  positionKey: Type.String({ minLength: 1, maxLength: 100 }),
  title: Type.Optional(Type.String({ maxLength: 100 })),
  status: Type.Optional(Type.String({ minLength: 1, maxLength: 32, default: 'active' })),
  isPrimary: Type.Optional(Type.Boolean({ default: false })),
  startsAt: Type.Optional(Type.String({ format: 'date-time' })),
  endsAt: Type.Optional(Type.String({ format: 'date-time' })),
  metadata: Type.Optional(Type.Unknown()),
})

export const InstitutionReviewWorkflowBindingInputSchema = Type.Object({
  type: InstitutionReviewWorkflowBindingTypeSchema,
  contentType: Type.Optional(
    Type.Union([Type.Literal('paper'), Type.Literal('degree_thesis')], { default: 'paper' }),
  ),
  nodeKey: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  priority: Type.Optional(Type.Integer({ default: 0 })),
  isActive: Type.Optional(Type.Boolean({ default: true })),
})

export const InstitutionReviewWorkflowStepInputSchema = Type.Object({
  order: Type.Integer({ minimum: 1, maximum: 3 }),
  name: Type.String({ minLength: 1, maxLength: 100 }),
  resolverType: InstitutionReviewWorkflowResolverTypeSchema,
  resolverConfig: Type.Unknown(),
})

export const InstitutionReviewWorkflowInputSchema = Type.Object({
  key: Type.String({ minLength: 1, maxLength: 100 }),
  name: Type.String({ minLength: 1, maxLength: 100 }),
  description: Type.Optional(Type.String({ maxLength: 5000 })),
  isActive: Type.Optional(Type.Boolean({ default: true })),
  metadata: Type.Optional(Type.Unknown()),
  bindings: Type.Array(InstitutionReviewWorkflowBindingInputSchema),
  steps: Type.Array(InstitutionReviewWorkflowStepInputSchema, { minItems: 1, maxItems: 3 }),
})

export const UpsertInstitutionOrgStructureBodySchema = Type.Object({
  replaceMissing: Type.Optional(Type.Boolean({ default: true })),
  nodes: Type.Array(InstitutionOrgNodeInputSchema),
  edges: Type.Array(InstitutionOrgEdgeInputSchema),
  people: Type.Array(InstitutionOrgPersonInputSchema),
  positions: Type.Array(InstitutionOrgPositionInputSchema),
  appointments: Type.Array(InstitutionOrgAppointmentInputSchema),
  workflows: Type.Array(InstitutionReviewWorkflowInputSchema),
})

export type UpsertInstitutionOrgStructureBody = Static<
  typeof UpsertInstitutionOrgStructureBodySchema
>

export const BindInstitutionPaperAuthorBodySchema = Type.Object({
  paperId: Type.String({ format: 'uuid' }),
  authorId: Type.String({ format: 'uuid' }),
  userId: Type.String({ format: 'uuid' }),
})

export type BindInstitutionPaperAuthorBody = Static<typeof BindInstitutionPaperAuthorBodySchema>

export const CreateInstitutionJoinRequestBodySchema = Type.Object({
  reason: Type.Optional(Type.String({ maxLength: 1000 })),
})

export type CreateInstitutionJoinRequestBody = Static<typeof CreateInstitutionJoinRequestBodySchema>

export const ReviewInstitutionJoinRequestBodySchema = Type.Object({
  status: Type.Union([Type.Literal('approved'), Type.Literal('rejected')]),
  notes: Type.Optional(Type.String({ maxLength: 2000 })),
})

export type ReviewInstitutionJoinRequestBody = Static<typeof ReviewInstitutionJoinRequestBodySchema>
