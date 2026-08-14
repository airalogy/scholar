import { Type, type Static } from 'typebox'

export const DegreeThesisStatusSchema = Type.Union([
  Type.Literal('draft'),
  Type.Literal('pending_review'),
  Type.Literal('changes_requested'),
  Type.Literal('approved'),
  Type.Literal('archived'),
])

export const DegreeThesisVisibilitySchema = Type.Union([
  Type.Literal('public'),
  Type.Literal('institution'),
  Type.Literal('restricted'),
])

const DegreeThesisFieldsSchema = Type.Object({
  institution_reference: Type.Optional(
    Type.Union([Type.String({ minLength: 1, maxLength: 100 }), Type.Null()]),
  ),
  title: Type.String({ minLength: 1, maxLength: 500 }),
  title_en: Type.Optional(Type.String({ maxLength: 500 })),
  author_name: Type.String({ minLength: 1, maxLength: 100 }),
  student_id: Type.Optional(Type.String({ maxLength: 100 })),
  training_unit: Type.String({ minLength: 1, maxLength: 200 }),
  major: Type.String({ minLength: 1, maxLength: 200 }),
  degree_category: Type.String({ minLength: 1, maxLength: 64 }),
  award_year: Type.Integer({ minimum: 1900, maximum: 2100 }),
  advisors: Type.Array(Type.String({ minLength: 1, maxLength: 100 }), { maxItems: 20 }),
  abstract: Type.Optional(Type.String({ maxLength: 100000 })),
  keywords: Type.Array(Type.String({ minLength: 1, maxLength: 100 }), { maxItems: 50 }),
  language: Type.String({ minLength: 2, maxLength: 16, default: 'zh-CN' }),
  visibility: DegreeThesisVisibilitySchema,
  confidentiality_until: Type.Optional(Type.String({ format: 'date' })),
  file_id: Type.Optional(Type.String({ format: 'uuid' })),
})

export const CreateDegreeThesisBodySchema = Type.Intersect([
  DegreeThesisFieldsSchema,
  Type.Object({
    institution_id: Type.String({ format: 'uuid' }),
    review_node_id: Type.Optional(Type.String({ format: 'uuid' })),
  }),
])

export const UpdateDegreeThesisBodySchema = DegreeThesisFieldsSchema

export const DegreeThesisParamsSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
})

export const DegreeThesisRecordCodeParamsSchema = Type.Object({
  recordCode: Type.String({ pattern: '^[A-Z0-9][A-Z0-9-]{5,63}$' }),
})

export const DegreeThesisReviewBodySchema = Type.Object({
  decision: Type.Union([Type.Literal('approve'), Type.Literal('request_changes')]),
  notes: Type.Optional(Type.String({ maxLength: 5000 })),
})

export const DegreeThesisListQuerySchema = Type.Object({
  q: Type.Optional(Type.String({ maxLength: 200 })),
  institution_id: Type.Optional(Type.String({ format: 'uuid' })),
  training_unit: Type.Optional(Type.String({ maxLength: 200 })),
  major: Type.Optional(Type.String({ maxLength: 200 })),
  degree_category: Type.Optional(Type.String({ maxLength: 64 })),
  year_from: Type.Optional(Type.Integer({ minimum: 1900, maximum: 2100 })),
  year_to: Type.Optional(Type.Integer({ minimum: 1900, maximum: 2100 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
  offset: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
})

export const DegreeThesisReviewQueueQuerySchema = Type.Object({
  q: Type.Optional(Type.String({ maxLength: 200 })),
  institution_id: Type.Optional(Type.String({ format: 'uuid' })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
  offset: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
})

export const DegreeThesisVersionSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  version_number: Type.Integer(),
  title: Type.String(),
  title_en: Type.Union([Type.String(), Type.Null()]),
  author_name: Type.String(),
  student_id: Type.Union([Type.String(), Type.Null()]),
  training_unit: Type.String(),
  major: Type.String(),
  degree_category: Type.String(),
  award_year: Type.Integer(),
  advisors: Type.Array(Type.String()),
  abstract: Type.Union([Type.String(), Type.Null()]),
  keywords: Type.Array(Type.String()),
  language: Type.String(),
  visibility: DegreeThesisVisibilitySchema,
  confidentiality_until: Type.Union([Type.String(), Type.Null()]),
  file_id: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  preview_url: Type.Union([Type.String(), Type.Null()]),
  download_url: Type.Union([Type.String(), Type.Null()]),
  created_at: Type.String(),
  submitted_at: Type.Union([Type.String(), Type.Null()]),
})

export const ContentReviewStepSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  order: Type.Integer(),
  name: Type.String(),
  status: Type.String(),
  eligible_reviewer_user_ids: Type.Array(Type.String({ format: 'uuid' })),
  resolution_notes: Type.Union([Type.String(), Type.Null()]),
  review_notes: Type.Union([Type.String(), Type.Null()]),
  reviewed_by: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  reviewed_at: Type.Union([Type.String(), Type.Null()]),
})

export const ContentReviewActionSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  action: Type.String(),
  from_status: Type.Union([Type.String(), Type.Null()]),
  to_status: Type.String(),
  version_id: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  notes: Type.Union([Type.String(), Type.Null()]),
  actor_id: Type.String({ format: 'uuid' }),
  actor_name: Type.String(),
  step_order: Type.Union([Type.Integer(), Type.Null()]),
  step_name: Type.Union([Type.String(), Type.Null()]),
  created_at: Type.String(),
})

export const DegreeThesisSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  record_code: Type.String(),
  institution_reference: Type.Union([Type.String(), Type.Null()]),
  institution_id: Type.String({ format: 'uuid' }),
  institution_name: Type.String(),
  submitted_by: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  status: DegreeThesisStatusSchema,
  current_step: Type.Union([Type.Integer(), Type.Null()]),
  decision_notes: Type.Union([Type.String(), Type.Null()]),
  submitted_at: Type.Union([Type.String(), Type.Null()]),
  published_at: Type.Union([Type.String(), Type.Null()]),
  created_at: Type.String(),
  updated_at: Type.String(),
  can_edit: Type.Boolean(),
  can_review: Type.Boolean(),
  current_version: Type.Union([DegreeThesisVersionSchema, Type.Null()]),
  published_version: Type.Union([DegreeThesisVersionSchema, Type.Null()]),
  versions: Type.Array(DegreeThesisVersionSchema),
  review_steps: Type.Array(ContentReviewStepSchema),
  review_history: Type.Array(ContentReviewActionSchema),
})

export const DegreeThesisResponseSchema = Type.Object({
  code: Type.Literal(0),
  data: DegreeThesisSchema,
})

export const DegreeThesisListResponseSchema = Type.Object({
  code: Type.Literal(0),
  data: Type.Object({
    items: Type.Array(DegreeThesisSchema),
    total: Type.Integer(),
  }),
})

export const DegreeThesisFacetsResponseSchema = Type.Object({
  code: Type.Literal(0),
  data: Type.Object({
    training_units: Type.Array(Type.String()),
    majors: Type.Array(Type.String()),
    degree_categories: Type.Array(Type.String()),
    award_years: Type.Array(Type.Integer()),
  }),
})

export type CreateDegreeThesisBody = Static<typeof CreateDegreeThesisBodySchema>
export type UpdateDegreeThesisBody = Static<typeof UpdateDegreeThesisBodySchema>
export type DegreeThesisReviewBody = Static<typeof DegreeThesisReviewBodySchema>
export type DegreeThesisListQuery = Static<typeof DegreeThesisListQuerySchema>
export type DegreeThesisReviewQueueQuery = Static<typeof DegreeThesisReviewQueueQuerySchema>
