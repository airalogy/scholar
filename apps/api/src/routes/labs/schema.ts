import { Type, type Static } from 'typebox'
import { ResearchDirectionSchema } from '../scholars/schema'

export const PlatformRoleSchema = Type.Union([
  Type.Literal('member'),
  Type.Literal('platform_admin'),
])

export const InstitutionRoleSchema = Type.Union([
  Type.Literal('owner'),
  Type.Literal('admin'),
  Type.Literal('member'),
])

export const LabRoleSchema = Type.Union([
  Type.Literal('owner'),
  Type.Literal('admin'),
  Type.Literal('member'),
])

export const LabParamsSchema = Type.Object({
  slug: Type.String({ minLength: 1 }),
})

export type LabParams = Static<typeof LabParamsSchema>

export const LabMemberParamsSchema = Type.Object({
  slug: Type.String({ minLength: 1 }),
  userId: Type.String({ format: 'uuid' }),
})

export type LabMemberParams = Static<typeof LabMemberParamsSchema>

export const LabScholarSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  avatar: Type.Union([Type.String(), Type.Null()]),
  title: Type.Union([Type.String(), Type.Null()]),
  college: Type.Array(Type.String()),
  research_directions: Type.Array(ResearchDirectionSchema),
})

export const LabMemberSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  avatar: Type.Union([Type.String(), Type.Null()]),
  degree: Type.Union([Type.String(), Type.Null()]),
  major: Type.Union([Type.String(), Type.Null()]),
  research_interests: Type.Union([Type.String(), Type.Null()]),
})

export const LabPaperSchema = Type.Object({
  id: Type.String(),
  title: Type.String(),
  journal_name: Type.Union([Type.String(), Type.Null()]),
  publish_year: Type.Union([Type.Integer(), Type.Null()]),
  doi: Type.String(),
  keywords: Type.Array(Type.String()),
  authors: Type.Array(Type.String()),
})

export const LabAccessSchema = Type.Object({
  platform_role: PlatformRoleSchema,
  institution_role: Type.Union([InstitutionRoleSchema, Type.Null()]),
  lab_role: Type.Union([LabRoleSchema, Type.Null()]),
  can_edit_content: Type.Boolean(),
  can_manage_members: Type.Boolean(),
  can_review_content: Type.Boolean(),
})

export const LabMembershipSchema = Type.Object({
  userId: Type.String(),
  name: Type.String(),
  email: Type.String(),
  avatar: Type.Union([Type.String(), Type.Null()]),
  degree: Type.Union([Type.String(), Type.Null()]),
  major: Type.Union([Type.String(), Type.Null()]),
  role: LabRoleSchema,
})

export const LabDetailResponseSchema = Type.Object({
  id: Type.String(),
  institutionId: Type.Union([Type.String(), Type.Null()]),
  institutionName: Type.Union([Type.String(), Type.Null()]),
  name: Type.String(),
  slug: Type.String(),
  summary: Type.Union([Type.String(), Type.Null()]),
  college: Type.Union([Type.String(), Type.Null()]),
  location: Type.Union([Type.String(), Type.Null()]),
  website: Type.Union([Type.String(), Type.Null()]),
  scholarCount: Type.Integer(),
  memberCount: Type.Integer(),
  representativePaperCount: Type.Integer(),
  access: LabAccessSchema,
  scholars: Type.Array(LabScholarSchema),
  members: Type.Array(LabMemberSchema),
  representativePapers: Type.Array(LabPaperSchema),
})

export const LabMembershipListResponseSchema = Type.Object({
  items: Type.Array(LabMembershipSchema),
})

export const UpdateLabBodySchema = Type.Partial(
  Type.Object({
    summary: Type.String({ maxLength: 5000 }),
    college: Type.String({ maxLength: 100 }),
    location: Type.String({ maxLength: 100 }),
    website: Type.Union([Type.String({ maxLength: 255, pattern: '^https?://' }), Type.Literal('')]),
  }),
)

export type UpdateLabBody = Static<typeof UpdateLabBodySchema>

export const UpsertLabMembershipBodySchema = Type.Object({
  userId: Type.String({ format: 'uuid' }),
  role: LabRoleSchema,
})

export type UpsertLabMembershipBody = Static<typeof UpsertLabMembershipBodySchema>
