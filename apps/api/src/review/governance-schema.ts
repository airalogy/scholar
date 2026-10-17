import { Type, type Static } from 'typebox'

export const ReviewerRoleSchema = Type.Union([
  Type.Literal('library_intake'),
  Type.Literal('department'),
  Type.Literal('library_final'),
])
export const ReviewGroupSchema = Type.Union([
  Type.Object(
    {
      kind: Type.Literal('role'),
      role: ReviewerRoleSchema,
      nodeId: Type.Optional(Type.String({ format: 'uuid' })),
    },
    { additionalProperties: false },
  ),
  Type.Object({ kind: Type.Literal('authors') }, { additionalProperties: false }),
  Type.Object({ kind: Type.Literal('departments') }, { additionalProperties: false }),
])
export const GovernedStepSchema = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 100 }),
    groups: Type.Array(ReviewGroupSchema, { minItems: 1, maxItems: 20 }),
    deadlineHours: Type.Integer({ minimum: 1, maximum: 8760 }),
    ccPersonIds: Type.Optional(
      Type.Array(Type.String({ format: 'uuid' }), { maxItems: 100, uniqueItems: true }),
    ),
  },
  { additionalProperties: false },
)
export type GovernedStep = Static<typeof GovernedStepSchema>
export const GovernedWorkflowSchema = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 100 }),
    steps: Type.Array(GovernedStepSchema, { minItems: 1, maxItems: 10 }),
  },
  { additionalProperties: false },
)
export const ReviewerGrantSchema = Type.Object(
  {
    personId: Type.String({ format: 'uuid' }),
    role: ReviewerRoleSchema,
    nodeId: Type.Optional(Type.String({ format: 'uuid' })),
    startsAt: Type.String({ format: 'date-time' }),
    endsAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    notes: Type.String({ minLength: 1, maxLength: 2000 }),
  },
  { additionalProperties: false },
)
export const TaskDecisionSchema = Type.Object(
  {
    versionId: Type.String({ format: 'uuid' }),
    decision: Type.Union([Type.Literal('approve'), Type.Literal('request_changes')]),
    notes: Type.Optional(Type.String({ maxLength: 2000 })),
  },
  { additionalProperties: false },
)
