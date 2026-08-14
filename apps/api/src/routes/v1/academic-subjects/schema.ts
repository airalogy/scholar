import { Type, type Static } from 'typebox'

export const AcademicSubjectCatalogQuerySchema = Type.Object({
  institution_slug: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  include_inactive: Type.Optional(Type.Boolean({ default: false })),
})

export const AcademicSubjectParamsSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
})

export const AcademicSubjectAliasInputSchema = Type.Object({
  alias: Type.String({ minLength: 1, maxLength: 200 }),
  locale: Type.Optional(Type.String({ minLength: 2, maxLength: 16 })),
})

const AcademicSubjectWritableFieldsSchema = Type.Object({
  parent_id: Type.Optional(Type.Union([Type.String({ format: 'uuid' }), Type.Null()])),
  name_zh: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  name_en: Type.Optional(Type.Union([Type.String({ minLength: 1, maxLength: 200 }), Type.Null()])),
  aliases: Type.Optional(Type.Array(AcademicSubjectAliasInputSchema, { maxItems: 100 })),
  sort_order: Type.Optional(Type.Integer({ minimum: 0, maximum: 100000 })),
  is_active: Type.Optional(Type.Boolean()),
  local_code: Type.Optional(
    Type.Union([
      Type.String({ minLength: 1, maxLength: 100, pattern: '^[A-Za-z0-9][A-Za-z0-9._-]*$' }),
      Type.Null(),
    ]),
  ),
})

export const CreateAcademicSubjectBodySchema = Type.Intersect([
  AcademicSubjectWritableFieldsSchema,
  Type.Object({
    institution_slug: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
    code: Type.Optional(
      Type.String({
        minLength: 1,
        maxLength: 100,
        pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
      }),
    ),
    name_zh: Type.String({ minLength: 1, maxLength: 200 }),
  }),
])

export const UpdateAcademicSubjectBodySchema = AcademicSubjectWritableFieldsSchema

export const AcademicSubjectAliasSchema = Type.Object({
  alias: Type.String(),
  locale: Type.Union([Type.String(), Type.Null()]),
})

export const AcademicSubjectSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  code: Type.String(),
  parent_id: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  institution_id: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  institution_slug: Type.Union([Type.String(), Type.Null()]),
  name_zh: Type.String(),
  name_en: Type.Union([Type.String(), Type.Null()]),
  source: Type.String(),
  taxonomy_version: Type.Union([Type.String(), Type.Null()]),
  is_active: Type.Boolean(),
  sort_order: Type.Integer(),
  aliases: Type.Array(AcademicSubjectAliasSchema),
  local_code: Type.Union([Type.String(), Type.Null()]),
  scholar_count: Type.Integer({ minimum: 0 }),
  can_edit: Type.Boolean(),
  created_at: Type.String(),
  updated_at: Type.String(),
})

export const AcademicSubjectListResponseSchema = Type.Object({
  code: Type.Literal(0),
  data: Type.Object({
    items: Type.Array(AcademicSubjectSchema),
  }),
})

export const AcademicSubjectResponseSchema = Type.Object({
  code: Type.Literal(0),
  data: AcademicSubjectSchema,
})

export type AcademicSubjectCatalogQuery = Static<typeof AcademicSubjectCatalogQuerySchema>
export type CreateAcademicSubjectBody = Static<typeof CreateAcademicSubjectBodySchema>
export type UpdateAcademicSubjectBody = Static<typeof UpdateAcademicSubjectBodySchema>
