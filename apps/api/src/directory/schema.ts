import { Type, type Static } from 'typebox'

const key = Type.String({ minLength: 1, maxLength: 100, pattern: '\\S' })
const nullableDate = Type.Union([Type.String({ format: 'date-time' }), Type.Null()])
export const PersonnelRoleSchema = Type.Union([
  Type.Literal('undergraduate'),
  Type.Literal('masters_student'),
  Type.Literal('doctoral_student'),
  Type.Literal('postgraduate'),
  Type.Literal('postdoc'),
  Type.Literal('faculty'),
  Type.Literal('staff'),
  Type.Literal('pi'),
  Type.Literal('research_assistant'),
  Type.Literal('visitor'),
  Type.Literal('other'),
])
const relationshipDates = {
  status: Type.Union([Type.Literal('active'), Type.Literal('ended')]),
  startsAt: nullableDate,
  endsAt: nullableDate,
}
export const DirectoryRowSchema = Type.Union([
  Type.Object(
    {
      kind: Type.Literal('identity'),
      externalId: key,
      personExternalId: key,
      code: PersonnelRoleSchema,
      ...relationshipDates,
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      kind: Type.Literal('relationship'),
      externalId: key,
      personExternalId: key,
      relatedPersonExternalId: key,
      relationship: Type.Union([Type.Literal('supervisor'), Type.Literal('responsible')]),
      ...relationshipDates,
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      kind: Type.Literal('person'),
      externalId: key,
      name: Type.String({ minLength: 1, maxLength: 100 }),
      identifiers: Type.Array(key, { minItems: 1, maxItems: 20, uniqueItems: true }),
      email: Type.Optional(
        Type.Union([Type.String({ format: 'email', maxLength: 100 }), Type.Null()]),
      ),
      category: Type.Union([
        Type.Literal('staff'),
        Type.Literal('undergraduate'),
        Type.Literal('postgraduate'),
        Type.Literal('visitor'),
        Type.Literal('other'),
        Type.Literal('unknown'),
      ]),
      status: Type.Union([
        Type.Literal('active'),
        Type.Literal('departed'),
        Type.Literal('graduated'),
        Type.Literal('suspended'),
      ]),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      kind: Type.Literal('unit'),
      externalId: key,
      name: Type.String({ minLength: 1, maxLength: 200 }),
      active: Type.Boolean(),
      parentExternalId: Type.Optional(Type.Union([key, Type.Null()])),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      kind: Type.Literal('position'),
      externalId: key,
      unitExternalId: key,
      name: Type.String({ minLength: 1, maxLength: 100 }),
      active: Type.Boolean(),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      kind: Type.Literal('appointment'),
      externalId: key,
      personExternalId: key,
      positionExternalId: key,
      status: Type.Union([Type.Literal('active'), Type.Literal('ended')]),
      startsAt: nullableDate,
      endsAt: nullableDate,
    },
    { additionalProperties: false },
  ),
])
export type DirectoryRow = Static<typeof DirectoryRowSchema>
export const DirectoryPageSchema = Type.Object(
  {
    rows: Type.Array(DirectoryRowSchema, { maxItems: 500 }),
  },
  { additionalProperties: false },
)
export const DirectoryRunSchema = Type.Object(
  {
    schemaVersion: Type.Optional(Type.Union([Type.Literal(1), Type.Literal(2)])),
    sequence: Type.Integer({ minimum: 1, maximum: 2147483647 }),
    mode: Type.Union([Type.Literal('full'), Type.Literal('incremental')]),
    expectedPages: Type.Integer({ minimum: 1, maximum: 1000 }),
    expectedRows: Type.Integer({ minimum: 0, maximum: 100000 }),
  },
  { additionalProperties: false },
)
export type DirectoryRunInput = Static<typeof DirectoryRunSchema>
export const DirectorySourceSchema = Type.Object(
  {
    key: Type.String({ minLength: 1, maxLength: 64, pattern: '^[a-z0-9_-]+$' }),
    name: Type.String({ minLength: 1, maxLength: 100 }),
    enabled: Type.Boolean(),
    authoritative: Type.Boolean(),
    deactivateMissing: Type.Boolean(),
    maxDeactivationPercent: Type.Integer({ minimum: 0, maximum: 100 }),
    expectedIntervalHours: Type.Integer({ minimum: 1, maximum: 720 }),
  },
  { additionalProperties: false },
)
export const DirectoryPolicySchema = Type.Object(
  {
    admissionMode: Type.Union([Type.Literal('sso'), Type.Literal('directory')]),
    requireAppointment: Type.Boolean(),
    notes: Type.String({ minLength: 1, maxLength: 2000 }),
  },
  { additionalProperties: false },
)
export const DirectoryApplySchema = Type.Object(
  {
    confirmDeactivation: Type.Optional(Type.Boolean()),
    notes: Type.Optional(Type.String({ minLength: 1, maxLength: 2000 })),
  },
  { additionalProperties: false },
)
export const DirectoryResponseSchema = Type.Object({
  code: Type.Literal(0),
  data: Type.Unknown(),
})
