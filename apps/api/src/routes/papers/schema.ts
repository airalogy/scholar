import { Type, type Static } from 'typebox'

export const PaperReviewStatusSchema = Type.Union([
  Type.Literal('draft'),
  Type.Literal('pending_review'),
  Type.Literal('changes_requested'),
  Type.Literal('approved'),
  Type.Literal('archived'),
])

export const CreatePaperBodySchema = Type.Object({
  title: Type.String({ minLength: 1, maxLength: 500 }),
  abstract: Type.Optional(Type.String()),
  doi: Type.String({ minLength: 1, maxLength: 100 }),
  journal_name: Type.Optional(Type.String({ maxLength: 100 })),
  publish_year: Type.Integer(),
  publish_date: Type.Optional(Type.String({ format: 'date' })),
  paper_type: Type.Integer(),
  language: Type.Integer(),
  citation_count: Type.Optional(Type.Integer()),
  pages: Type.Optional(Type.String({ maxLength: 50 })),
  keywords: Type.Optional(Type.Array(Type.String())),
  link: Type.Optional(Type.String({ maxLength: 255 })),
  oss_file_id: Type.Optional(Type.String({ format: 'uuid' })),
  institution_id: Type.String({ format: 'uuid' }),
  lab_id: Type.Optional(Type.String({ format: 'uuid' })),
  review_node_id: Type.Optional(Type.String({ format: 'uuid' })),
})

export type CreatePaperBody = Static<typeof CreatePaperBodySchema>

export const UpdatePaperBodySchema = Type.Partial(
  Type.Omit(CreatePaperBodySchema, ['oss_file_id', 'institution_id', 'lab_id', 'review_node_id']),
)

export type UpdatePaperBody = Static<typeof UpdatePaperBodySchema>

export const PaperParamsSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
})

export type PaperParams = Static<typeof PaperParamsSchema>

export const PaperClaimParamsSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
})

export type PaperClaimParams = Static<typeof PaperClaimParamsSchema>

export const AuthorSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  email: Type.Union([Type.String(), Type.Null()]),
  order: Type.Integer(),
})

export const PaperBoundMemberSchema = Type.Object({
  bindingId: Type.String({ format: 'uuid' }),
  paperId: Type.String({ format: 'uuid' }),
  userId: Type.String({ format: 'uuid' }),
  name: Type.String(),
  avatar: Type.Union([Type.String(), Type.Null()]),
  authorId: Type.String({ format: 'uuid' }),
  authorName: Type.String(),
})

export const PaperResponseSchema = Type.Object({
  id: Type.String(),
  claimId: Type.Union([Type.String(), Type.Null()]),
  submissionId: Type.Union([Type.String(), Type.Null()]),
  title: Type.String(),
  abstract: Type.Union([Type.String(), Type.Null()]),
  doi: Type.String(),
  journal_name: Type.Union([Type.String(), Type.Null()]),
  publish_year: Type.Union([Type.Integer(), Type.Null()]),
  publish_date: Type.Union([Type.String(), Type.Null()]),
  paper_type: Type.Union([Type.Integer(), Type.Null()]),
  language: Type.Union([Type.Integer(), Type.Null()]),
  citation_count: Type.Union([Type.Integer(), Type.Null()]),
  pages: Type.Union([Type.String(), Type.Null()]),
  keywords: Type.Array(Type.String()),
  authors: Type.Array(AuthorSchema),
  boundMembers: Type.Array(PaperBoundMemberSchema),
  oss_file_id: Type.Union([Type.String(), Type.Null()]),
  preview_url: Type.Union([Type.String(), Type.Null()]),
  download_url: Type.Union([Type.String(), Type.Null()]),
  file_url: Type.Union([Type.String(), Type.Null()]),
  link: Type.Union([Type.String(), Type.Null()]),
  uploadUserId: Type.String(),
  uploadUserName: Type.Union([Type.String(), Type.Null()]),
  institutionId: Type.Union([Type.String(), Type.Null()]),
  institutionName: Type.Union([Type.String(), Type.Null()]),
  labId: Type.Union([Type.String(), Type.Null()]),
  labName: Type.Union([Type.String(), Type.Null()]),
  reviewNodeId: Type.Union([Type.String(), Type.Null()]),
  reviewWorkflowId: Type.Union([Type.String(), Type.Null()]),
  currentReviewStep: Type.Union([Type.Integer(), Type.Null()]),
  reviewStatus: PaperReviewStatusSchema,
  reviewNotes: Type.Union([Type.String(), Type.Null()]),
  reviewedAt: Type.Union([Type.String(), Type.Null()]),
  createdAt: Type.String(),
  updatedAt: Type.String(),
})

export const PaperStatusTotalsSchema = Type.Object({
  draft: Type.Integer(),
  pending_review: Type.Integer(),
  changes_requested: Type.Integer(),
  approved: Type.Integer(),
  archived: Type.Integer(),
})

export const PaperListResponseSchema = Type.Object({
  items: Type.Array(PaperResponseSchema),
  total: Type.Integer(),
  statusTotals: PaperStatusTotalsSchema,
})

export const SearchQuerySchema = Type.Object({
  q: Type.String({ minLength: 1 }),
  mode: Type.Optional(
    Type.Union([Type.Literal('fulltext'), Type.Literal('vector')], { default: 'fulltext' }),
  ),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
  offset: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
})

export type SearchQuery = Static<typeof SearchQuerySchema>

export const ListQuerySchema = Type.Object({
  q: Type.Optional(Type.String()),
  institution_id: Type.Optional(Type.String({ format: 'uuid' })),
  college: Type.Optional(Type.String()),
  lab_id: Type.Optional(Type.String({ format: 'uuid' })),
  scholar_id: Type.Optional(Type.String({ format: 'uuid' })),
  author_id: Type.Optional(Type.String({ format: 'uuid' })),
  year_from: Type.Optional(Type.Integer()),
  year_to: Type.Optional(Type.Integer()),
  paper_type: Type.Optional(Type.Integer()),
  language: Type.Optional(Type.Integer()),
  review_status: Type.Optional(PaperReviewStatusSchema),
  scope: Type.Optional(Type.Union([Type.Literal('public'), Type.Literal('institution')])),
  sort: Type.Optional(
    Type.Union([Type.Literal('latest'), Type.Literal('citations'), Type.Literal('relevance')]),
  ),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
  offset: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
})

export type ListQuery = Static<typeof ListQuerySchema>

export const MyPapersQuerySchema = Type.Object({
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
  offset: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
})

export type MyPapersQuery = Static<typeof MyPapersQuerySchema>

export const InstitutionUploadsQuerySchema = Type.Object({
  institution_id: Type.String({ format: 'uuid' }),
  lab_id: Type.Optional(Type.String({ format: 'uuid' })),
  q: Type.Optional(Type.String()),
  review_status: Type.Optional(PaperReviewStatusSchema),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
  offset: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
})

export type InstitutionUploadsQuery = Static<typeof InstitutionUploadsQuerySchema>

export const ReviewQueueQuerySchema = Type.Object({
  q: Type.Optional(Type.String()),
  reviewStatus: Type.Optional(PaperReviewStatusSchema),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
  offset: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
})

export type ReviewQueueQuery = Static<typeof ReviewQueueQuerySchema>

export const ReviewPaperBodySchema = Type.Object({
  decision: Type.Union([Type.Literal('approve'), Type.Literal('request_changes')]),
  notes: Type.Optional(Type.String({ maxLength: 2000 })),
})

export type ReviewPaperBody = Static<typeof ReviewPaperBodySchema>

export const SearchResultSchema = Type.Object({
  items: Type.Array(
    Type.Object({
      paperId: Type.String(),
      text: Type.String(),
      score: Type.Number(),
      paper: Type.Optional(PaperResponseSchema),
    }),
  ),
})
