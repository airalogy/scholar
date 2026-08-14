import { Type, type Static } from 'typebox'

export const ImportKindSchema = Type.Union([Type.Literal('papers'), Type.Literal('scholars')])

export const ImportStatusSchema = Type.Union([
  Type.Literal('processing'),
  Type.Literal('pending_review'),
  Type.Literal('completed'),
  Type.Literal('completed_with_errors'),
  Type.Literal('rejected'),
  Type.Literal('failed'),
])

export const ImportItemActionSchema = Type.Union([
  Type.Literal('created'),
  Type.Literal('updated'),
  Type.Literal('unchanged'),
  Type.Literal('pending'),
  Type.Literal('error'),
])

export const ImportItemStatusSchema = Type.Union([
  Type.Literal('completed'),
  Type.Literal('pending'),
  Type.Literal('rejected'),
  Type.Literal('error'),
])

export const InstitutionParamsSchema = Type.Object({
  slug: Type.String({ minLength: 1, maxLength: 200 }),
})

export const ImportParamsSchema = Type.Object({
  slug: Type.String({ minLength: 1, maxLength: 200 }),
  importId: Type.String({ format: 'uuid' }),
})

export const IdempotencyHeadersSchema = Type.Object({
  'idempotency-key': Type.String({ minLength: 8, maxLength: 128 }),
})

export const ImportListQuerySchema = Type.Object({
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
  offset: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
  kind: Type.Optional(ImportKindSchema),
})

export const PaperImportItemSchema = Type.Object({
  title: Type.String({ minLength: 1, maxLength: 500 }),
  doi: Type.String({ minLength: 1, maxLength: 200 }),
  publish_year: Type.Optional(Type.Integer({ minimum: 1000, maximum: 9999 })),
  paper_type: Type.Optional(Type.Integer()),
  language: Type.Optional(Type.Integer()),
  abstract: Type.Optional(Type.String()),
  journal_name: Type.Optional(Type.String({ maxLength: 100 })),
  publish_date: Type.Optional(Type.String({ format: 'date' })),
  citation_count: Type.Optional(Type.Integer({ minimum: 0 })),
  pages: Type.Optional(Type.String({ maxLength: 50 })),
  link: Type.Optional(Type.String({ maxLength: 255 })),
  keywords: Type.Optional(Type.Array(Type.String({ maxLength: 100 }), { maxItems: 100 })),
})

export type PaperImportItem = Static<typeof PaperImportItemSchema>

export const ResearchDirectionInputSchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 200 }),
  description: Type.Optional(Type.String()),
})

export const EducationInputSchema = Type.Object({
  school: Type.String({ maxLength: 200 }),
  degree: Type.String({ maxLength: 100 }),
  period: Type.String({ maxLength: 100 }),
})

export const AchievementItemInputSchema = Type.Object({
  title: Type.String({ minLength: 1, maxLength: 300 }),
  description: Type.Optional(Type.String()),
})

export const AchievementYearInputSchema = Type.Object({
  year: Type.String({ minLength: 1, maxLength: 32 }),
  items: Type.Array(AchievementItemInputSchema),
})

export const AchievementGroupInputSchema = Type.Object({
  phase: Type.String({ minLength: 1, maxLength: 64 }),
  label: Type.String({ minLength: 1, maxLength: 100 }),
  years: Type.Array(AchievementYearInputSchema),
})

export const ScholarResearchPeriodInputSchema = Type.Object({
  period_start_year: Type.Integer(),
  period_end_year: Type.Integer(),
  paper_count: Type.Integer({ minimum: 0 }),
  papers_with_abstract: Type.Integer({ minimum: 0 }),
  papers_without_abstract: Type.Integer({ minimum: 0 }),
  focus_summary: Type.String({ minLength: 1 }),
  focus_tags: Type.Optional(Type.Array(Type.String())),
  source_papers: Type.Optional(
    Type.Array(
      Type.Object({
        year: Type.Integer(),
        title: Type.String({ minLength: 1 }),
        doi: Type.String(),
        has_abstract: Type.Boolean(),
        source_status: Type.String(),
      }),
    ),
  ),
})

export const ScholarImportItemSchema = Type.Object({
  external_id: Type.String({ minLength: 1, maxLength: 100 }),
  name: Type.String({ minLength: 1, maxLength: 100 }),
  avatar: Type.Optional(Type.String()),
  college: Type.Optional(Type.Array(Type.String({ maxLength: 100 }), { maxItems: 20 })),
  title: Type.Optional(Type.String({ maxLength: 50 })),
  lab: Type.Optional(Type.String({ maxLength: 200 })),
  office: Type.Optional(Type.String({ maxLength: 100 })),
  email: Type.Optional(Type.String({ format: 'email', maxLength: 100 })),
  phone: Type.Optional(Type.String({ maxLength: 20 })),
  bio: Type.Optional(Type.String()),
  join_year: Type.Optional(Type.Integer()),
  research_directions: Type.Optional(Type.Array(ResearchDirectionInputSchema)),
  education: Type.Optional(Type.Array(EducationInputSchema)),
  achievements: Type.Optional(Type.Array(AchievementGroupInputSchema)),
  research_timeline: Type.Optional(Type.Array(ScholarResearchPeriodInputSchema)),
  letter_index: Type.Optional(Type.String({ minLength: 1, maxLength: 1 })),
  subject_codes: Type.Optional(Type.Array(Type.String({ maxLength: 100 }), { maxItems: 100 })),
  paper_dois: Type.Optional(
    Type.Array(Type.String({ minLength: 1, maxLength: 200 }), {
      maxItems: 1000,
    }),
  ),
})

export type ScholarImportItem = Static<typeof ScholarImportItemSchema>

export const PaperImportBodySchema = Type.Object({
  items: Type.Array(PaperImportItemSchema, { minItems: 1, maxItems: 500 }),
})

export type PaperImportBody = Static<typeof PaperImportBodySchema>

export const ScholarImportBodySchema = Type.Object({
  items: Type.Array(ScholarImportItemSchema, { minItems: 1, maxItems: 500 }),
})

export type ScholarImportBody = Static<typeof ScholarImportBodySchema>

export const ImportSummarySchema = Type.Object({
  total: Type.Integer(),
  created: Type.Integer(),
  updated: Type.Integer(),
  unchanged: Type.Integer(),
  pending: Type.Integer(),
  errors: Type.Integer(),
})

export const ImportResultItemSchema = Type.Object({
  index: Type.Integer(),
  key: Type.Union([Type.String(), Type.Null()]),
  targetId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  action: ImportItemActionSchema,
  status: ImportItemStatusSchema,
  message: Type.Union([Type.String(), Type.Null()]),
})

export const ImportRecordSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  institutionId: Type.String({ format: 'uuid' }),
  kind: ImportKindSchema,
  status: ImportStatusSchema,
  actorType: Type.Union([Type.Literal('user'), Type.Literal('integration')]),
  summary: ImportSummarySchema,
  reviewedBy: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  reviewNotes: Type.Union([Type.String(), Type.Null()]),
  reviewedAt: Type.Union([Type.String(), Type.Null()]),
  createdAt: Type.String(),
  updatedAt: Type.String(),
  items: Type.Array(ImportResultItemSchema),
})

export const ImportResponseSchema = Type.Object({
  code: Type.Literal(0),
  data: ImportRecordSchema,
})

export const ImportListResponseSchema = Type.Object({
  code: Type.Literal(0),
  data: Type.Object({
    items: Type.Array(Type.Omit(ImportRecordSchema, ['items'])),
    total: Type.Integer(),
  }),
})

export const ReviewImportBodySchema = Type.Object({
  status: Type.Union([Type.Literal('approved'), Type.Literal('rejected')]),
  notes: Type.Optional(Type.String({ maxLength: 2000 })),
})

export type ReviewImportBody = Static<typeof ReviewImportBodySchema>

export const ReviewWorkflowContentTypeSchema = Type.Union([
  Type.Literal('paper'),
  Type.Literal('degree_thesis'),
])

export const ReviewWorkflowParamsSchema = Type.Object({
  slug: Type.String({ minLength: 1, maxLength: 200 }),
  contentType: ReviewWorkflowContentTypeSchema,
})

export const ReviewWorkflowStepInputSchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 100 }),
  reviewer_roles: Type.Array(
    Type.Union([Type.Literal('owner'), Type.Literal('admin'), Type.Literal('reviewer')]),
    { minItems: 1, maxItems: 3 },
  ),
})

export const UpsertReviewWorkflowBodySchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 100 }),
  steps: Type.Array(ReviewWorkflowStepInputSchema, { minItems: 1, maxItems: 3 }),
})

export type ReviewWorkflowContentType = Static<typeof ReviewWorkflowContentTypeSchema>
export type UpsertReviewWorkflowBody = Static<typeof UpsertReviewWorkflowBodySchema>

export const ReviewWorkflowSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  content_type: ReviewWorkflowContentTypeSchema,
  name: Type.String(),
  steps: Type.Array(
    Type.Object({
      order: Type.Integer(),
      name: Type.String(),
      reviewer_roles: Type.Array(Type.String()),
    }),
  ),
  updated_at: Type.String(),
})

export const ReviewWorkflowResponseSchema = Type.Object({
  code: Type.Literal(0),
  data: Type.Object({
    workflow: Type.Union([ReviewWorkflowSchema, Type.Null()]),
  }),
})
