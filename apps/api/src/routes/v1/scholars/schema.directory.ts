import { Type, type Static } from '@fastify/type-provider-typebox'

const NullableString = Type.Union([Type.String(), Type.Null()])
const UnitKind = Type.Union([
  Type.Literal('college'),
  Type.Literal('department'),
  Type.Literal('unit'),
])

export const ScholarDirectoryQuerySchema = Type.Object(
  {
    q: Type.Optional(Type.String({ maxLength: 200 })),
    unit: Type.Optional(Type.String({ maxLength: 512 })),
    subject_id: Type.Optional(Type.String({ format: 'uuid' })),
    letter: Type.Optional(Type.String({ pattern: '^[A-Za-z#]$' })),
    sort: Type.Optional(
      Type.Union([Type.Literal('relevance'), Type.Literal('name')], { default: 'relevance' }),
    ),
    institution_slug: Type.Optional(Type.String({ maxLength: 200 })),
    page: Type.Optional(Type.Integer({ minimum: 1, maximum: 100000, default: 1 })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 60, default: 24 })),
  },
  { additionalProperties: false },
)

export const ScholarDirectoryDataSchema = Type.Object({
  items: Type.Array(
    Type.Object({
      id: Type.String({ format: 'uuid' }),
      name: Type.String(),
      avatar: NullableString,
      title: NullableString,
      units: Type.Array(Type.Object({ id: Type.String(), name: Type.String() })),
      research: Type.Array(Type.String()),
      summary: Type.String(),
      letter: Type.String(),
    }),
  ),
  total: Type.Integer({ minimum: 0 }),
  page: Type.Integer({ minimum: 1 }),
  limit: Type.Integer({ minimum: 1 }),
  nameOrder: Type.Union([Type.Literal('pinyin'), Type.Literal('unicode')]),
  facets: Type.Object({
    units: Type.Array(
      Type.Object({
        id: Type.String(),
        name: Type.String(),
        kind: UnitKind,
        parentId: NullableString,
        count: Type.Integer({ minimum: 0 }),
      }),
    ),
    subjects: Type.Array(
      Type.Object({
        id: Type.String(),
        code: Type.String(),
        parentId: NullableString,
        nameZh: Type.String(),
        nameEn: NullableString,
        count: Type.Integer({ minimum: 0 }),
      }),
    ),
    letters: Type.Array(
      Type.Object({ letter: Type.String(), count: Type.Integer({ minimum: 0 }) }),
    ),
  }),
})

export const ScholarDirectoryResponseSchema = Type.Object({
  code: Type.Literal(0),
  data: ScholarDirectoryDataSchema,
})

export type ScholarDirectoryQuery = Static<typeof ScholarDirectoryQuerySchema>
export type ScholarDirectoryData = Static<typeof ScholarDirectoryDataSchema>
