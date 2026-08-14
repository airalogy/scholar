import { Type, type Static } from 'typebox'

export const ResearchDirectionSchema = Type.Object({
  name: Type.String(),
  description: Type.String(),
})

export const EducationSchema = Type.Object({
  school: Type.String(),
  degree: Type.String(),
  period: Type.String(),
})

export const AchievementItemSchema = Type.Object({
  title: Type.String(),
  description: Type.String(),
})

export const AchievementYearSchema = Type.Object({
  year: Type.String(),
  items: Type.Array(AchievementItemSchema),
})

export const AchievementGroupSchema = Type.Object({
  phase: Type.String(),
  label: Type.String(),
  years: Type.Array(AchievementYearSchema),
})

export const ScholarResearchSourcePaperSchema = Type.Object({
  year: Type.Integer(),
  title: Type.String(),
  doi: Type.String(),
  has_abstract: Type.Boolean(),
  source_status: Type.String(),
})

export const ScholarResearchPeriodSchema = Type.Object({
  period_start_year: Type.Integer(),
  period_end_year: Type.Integer(),
  paper_count: Type.Integer(),
  papers_with_abstract: Type.Integer(),
  papers_without_abstract: Type.Integer(),
  focus_summary: Type.String(),
  focus_tags: Type.Array(Type.String()),
  source_papers: Type.Array(ScholarResearchSourcePaperSchema),
})

export const ScholarParamsSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
})

export const ScholarListQuerySchema = Type.Object({
  q: Type.Optional(Type.String({ maxLength: 200 })),
  college: Type.Optional(Type.String({ maxLength: 200 })),
  subject: Type.Optional(Type.String({ maxLength: 200 })),
  subject_id: Type.Optional(Type.String({ format: 'uuid' })),
  letter: Type.Optional(Type.String({ minLength: 1, maxLength: 1 })),
  institution_slug: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
  offset: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
})

export type ScholarListQuery = Static<typeof ScholarListQuerySchema>

export const ScholarResponseSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  avatar: Type.Union([Type.String(), Type.Null()]),
  college: Type.Array(Type.String()),
  title: Type.Union([Type.String(), Type.Null()]),
  lab: Type.Union([Type.String(), Type.Null()]),
  lab_slug: Type.Union([Type.String(), Type.Null()]),
  office: Type.Union([Type.String(), Type.Null()]),
  email: Type.Union([Type.String(), Type.Null()]),
  phone: Type.Union([Type.String(), Type.Null()]),
  bio: Type.Union([Type.String(), Type.Null()]),
  join_year: Type.Union([Type.Integer(), Type.Null()]),
  research_directions: Type.Array(ResearchDirectionSchema),
  education: Type.Array(EducationSchema),
  achievements: Type.Array(AchievementGroupSchema),
  research_timeline: Type.Array(ScholarResearchPeriodSchema),
  letter_index: Type.Union([Type.String(), Type.Null()]),
  subjects: Type.Array(Type.String()),
  subject_codes: Type.Array(Type.String()),
  createdAt: Type.String(),
  updatedAt: Type.String(),
})

export const ScholarListResponseSchema = Type.Object({
  items: Type.Array(ScholarResponseSchema),
  total: Type.Integer(),
})

export const CreateScholarBodySchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 100 }),
  avatar: Type.Optional(Type.String()),
  college: Type.Optional(Type.Array(Type.String({ maxLength: 100 }))),
  title: Type.Optional(Type.String({ maxLength: 50 })),
  lab: Type.Optional(Type.String({ maxLength: 200 })),
  office: Type.Optional(Type.String({ maxLength: 100 })),
  email: Type.Optional(Type.String({ maxLength: 100 })),
  phone: Type.Optional(Type.String({ maxLength: 20 })),
  bio: Type.Optional(Type.String()),
  join_year: Type.Optional(Type.Integer()),
  research_directions: Type.Optional(Type.Array(ResearchDirectionSchema)),
  education: Type.Optional(Type.Array(EducationSchema)),
  achievements: Type.Optional(Type.Array(AchievementGroupSchema)),
  research_timeline: Type.Optional(Type.Array(ScholarResearchPeriodSchema)),
  letter_index: Type.Optional(Type.String({ maxLength: 1 })),
  subject_codes: Type.Optional(Type.Array(Type.String({ maxLength: 100 }), { maxItems: 100 })),
})

export type CreateScholarBody = Static<typeof CreateScholarBodySchema>

export const UpdateScholarBodySchema = Type.Partial(CreateScholarBodySchema)

export type UpdateScholarBody = Static<typeof UpdateScholarBodySchema>
