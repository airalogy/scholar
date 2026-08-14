import { Type, type Static } from 'typebox'

export const ProjectExperienceSchema = Type.Object({
  id: Type.String(),
  title: Type.String(),
  period: Type.String(),
})

export const PublicationSchema = Type.Object({
  id: Type.String(),
  title: Type.String(),
})

export const ManageableLabSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  name: Type.String(),
  slug: Type.String(),
  role: Type.String(),
})

export const ManageableInstitutionSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  name: Type.String(),
  slug: Type.String(),
  role: Type.String(),
})

export const UserInstitutionMembershipSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  name: Type.String(),
  slug: Type.String(),
  role: Type.String(),
  can_review_content: Type.Boolean(),
  can_import_data: Type.Boolean(),
})

export const UserLabMembershipSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  institutionId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  name: Type.String(),
  slug: Type.String(),
  role: Type.String(),
})

export const AdminAccessSchema = Type.Object({
  can_access: Type.Boolean(),
  manage_platform: Type.Boolean(),
  manage_institutions: Type.Boolean(),
  manage_labs: Type.Boolean(),
  review_content: Type.Boolean(),
  import_data: Type.Boolean(),
})

export const UserProfileSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  username: Type.String(),
  email: Type.String(),
  phone: Type.Union([Type.String(), Type.Null()]),
  name: Type.String(),
  avatar: Type.Union([Type.String(), Type.Null()]),
  avatar_url: Type.Union([Type.String(), Type.Null()]),
  gender: Type.Union([Type.String(), Type.Null()]),
  grade: Type.Union([Type.String(), Type.Null()]),
  degree: Type.Union([Type.String(), Type.Null()]),
  college: Type.Union([Type.String(), Type.Null()]),
  major: Type.Union([Type.String(), Type.Null()]),
  laboratory: Type.Union([Type.String(), Type.Null()]),
  bio: Type.Union([Type.String(), Type.Null()]),
  research_interests: Type.Union([Type.String(), Type.Null()]),
  project_experiences: Type.Array(ProjectExperienceSchema),
  publications: Type.Array(PublicationSchema),
  platform_role: Type.String(),
  admin_access: AdminAccessSchema,
  manageable_labs: Type.Array(ManageableLabSchema),
  manageable_institutions: Type.Array(ManageableInstitutionSchema),
  institution_memberships: Type.Array(UserInstitutionMembershipSchema),
  lab_memberships: Type.Array(UserLabMembershipSchema),
})

export const UserProfileResponseSchema = Type.Object({
  code: Type.Literal(0),
  data: UserProfileSchema,
})

export type UserProfileResponse = Static<typeof UserProfileResponseSchema>

export const UserSearchQuerySchema = Type.Object({
  q: Type.String({ minLength: 1 }),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 20, default: 10 })),
})

export type UserSearchQuery = Static<typeof UserSearchQuerySchema>

export const UserSearchItemSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  username: Type.String(),
  name: Type.String(),
  email: Type.String(),
  avatar: Type.Union([Type.String(), Type.Null()]),
  degree: Type.Union([Type.String(), Type.Null()]),
  college: Type.Union([Type.String(), Type.Null()]),
  major: Type.Union([Type.String(), Type.Null()]),
  laboratory: Type.Union([Type.String(), Type.Null()]),
})

export const UserSearchResponseSchema = Type.Object({
  items: Type.Array(UserSearchItemSchema),
})

export const UpdateUserProfileBodySchema = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  avatar: Type.Optional(Type.String({ maxLength: 255 })),
  gender: Type.Optional(Type.String({ maxLength: 16 })),
  grade: Type.Optional(Type.String({ maxLength: 32 })),
  degree: Type.Optional(Type.String({ maxLength: 32 })),
  college: Type.Optional(Type.String({ maxLength: 100 })),
  major: Type.Optional(Type.String({ maxLength: 100 })),
  laboratory: Type.Optional(Type.String({ maxLength: 200 })),
  bio: Type.Optional(Type.String({ maxLength: 1000 })),
  research_interests: Type.Optional(Type.String({ maxLength: 2000 })),
  project_experiences: Type.Optional(Type.Array(ProjectExperienceSchema)),
  publications: Type.Optional(Type.Array(PublicationSchema)),
})

export type UpdateUserProfileBody = Static<typeof UpdateUserProfileBodySchema>

export const ChangePasswordBodySchema = Type.Object({
  oldPassword: Type.String({ minLength: 6 }),
  newPassword: Type.String({ minLength: 12 }),
})

export type ChangePasswordBody = Static<typeof ChangePasswordBodySchema>

export const CommonSuccessResponseSchema = Type.Object({
  code: Type.Literal(0),
  message: Type.String(),
})
