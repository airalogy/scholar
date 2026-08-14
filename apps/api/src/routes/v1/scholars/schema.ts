import { Type, type Static } from 'typebox'
import { ScholarResearchPeriodSchema } from '../../scholars/schema'

export const ScholarFacetsQuerySchema = Type.Object({
  q: Type.Optional(Type.String({ maxLength: 200 })),
  college: Type.Optional(Type.String({ maxLength: 200 })),
  subject_id: Type.Optional(Type.String({ format: 'uuid' })),
  letter: Type.Optional(Type.String({ minLength: 1, maxLength: 1 })),
  institution_slug: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
})

export type ScholarFacetsQuery = Static<typeof ScholarFacetsQuerySchema>

export const ScholarSubjectFacetSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  code: Type.String(),
  parentId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  nameZh: Type.String(),
  nameEn: Type.Union([Type.String(), Type.Null()]),
  count: Type.Integer({ minimum: 0 }),
})

export const ScholarFacetsResponseSchema = Type.Object({
  code: Type.Literal(0),
  data: Type.Object({
    subjects: Type.Array(ScholarSubjectFacetSchema),
    colleges: Type.Array(Type.String()),
    letters: Type.Array(Type.String()),
  }),
})

export const TimelineGenerationStatusSchema = Type.Union([
  Type.Literal('requested'),
  Type.Literal('queued'),
  Type.Literal('running'),
  Type.Literal('ready'),
  Type.Literal('published'),
  Type.Literal('failed'),
  Type.Literal('rejected'),
  Type.Literal('archived'),
])

export const TimelineGenerationParamsSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  generationId: Type.String({ format: 'uuid' }),
})

export const TimelineScholarParamsSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
})

export const TimelineIdempotencyHeadersSchema = Type.Object({
  'idempotency-key': Type.String({ minLength: 8, maxLength: 128 }),
})

export const CreateTimelineGenerationBodySchema = Type.Object({
  force: Type.Optional(Type.Boolean({ default: false })),
})

export const ReviewTimelineGenerationBodySchema = Type.Object({
  notes: Type.Optional(Type.String({ maxLength: 2000 })),
})

export const TimelineGenerationIssueSchema = Type.Object({
  id: Type.String(),
  paperId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  doi: Type.String(),
  issueType: Type.String(),
  existingYear: Type.Union([Type.Integer(), Type.Null()]),
  candidateYear: Type.Union([Type.Integer(), Type.Null()]),
  metadataSource: Type.Union([Type.String(), Type.Null()]),
  message: Type.String(),
})

export const TimelineGenerationSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  scholarId: Type.String({ format: 'uuid' }),
  scholarName: Type.String(),
  sourceType: Type.String(),
  status: TimelineGenerationStatusSchema,
  sourceFingerprint: Type.Union([Type.String(), Type.Null()]),
  model: Type.String(),
  promptVersion: Type.String(),
  progressStage: Type.String(),
  completedPeriods: Type.Integer(),
  totalPeriods: Type.Integer(),
  sourcePaperCount: Type.Integer(),
  resolvedPaperCount: Type.Integer(),
  unresolvedPaperCount: Type.Integer(),
  inputTokens: Type.Union([Type.Integer(), Type.Null()]),
  outputTokens: Type.Union([Type.Integer(), Type.Null()]),
  errorMessage: Type.Union([Type.String(), Type.Null()]),
  reviewNotes: Type.Union([Type.String(), Type.Null()]),
  requestedAt: Type.String(),
  startedAt: Type.Union([Type.String(), Type.Null()]),
  completedAt: Type.Union([Type.String(), Type.Null()]),
  publishedAt: Type.Union([Type.String(), Type.Null()]),
  reused: Type.Boolean(),
  periods: Type.Array(ScholarResearchPeriodSchema),
  issues: Type.Array(TimelineGenerationIssueSchema),
})

export const TimelineGenerationResponseSchema = Type.Object({
  code: Type.Literal(0),
  data: TimelineGenerationSchema,
})

export type CreateTimelineGenerationBody = Static<typeof CreateTimelineGenerationBodySchema>
export type ReviewTimelineGenerationBody = Static<typeof ReviewTimelineGenerationBodySchema>

export const TimelineGenerationListQuerySchema = Type.Object({
  status: Type.Optional(TimelineGenerationStatusSchema),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
  offset: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
})

export const TimelineGenerationListResponseSchema = Type.Object({
  code: Type.Literal(0),
  data: Type.Object({
    items: Type.Array(Type.Omit(TimelineGenerationSchema, ['periods', 'issues'])),
    total: Type.Integer(),
  }),
})

export type TimelineGenerationListQuery = Static<typeof TimelineGenerationListQuerySchema>
