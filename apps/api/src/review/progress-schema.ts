import { Type, type Static } from 'typebox'

const uuid = Type.String({ format: 'uuid' })
const text = Type.Union([Type.String(), Type.Null()])
const date = Type.Union([Type.String({ format: 'date-time' }), Type.Null()])
const offset = Type.Union([Type.Integer({ minimum: 0 }), Type.Null()])
export const ProgressQuerySchema = Type.Object(
  {
    roundNumber: Type.Optional(Type.Integer({ minimum: 1 })),
    roundOffset: Type.Optional(Type.Integer({ minimum: 0, maximum: 100000 })),
  },
  { additionalProperties: false },
)
export const ProgressPageQuerySchema = Type.Object(
  {
    offset: Type.Optional(Type.Integer({ minimum: 0, maximum: 100000 })),
    roundNumber: Type.Optional(Type.Integer({ minimum: 1 })),
  },
  { additionalProperties: false },
)

export const ProgressTaskSchema = Type.Object({
  hasNode: Type.Boolean(),
  id: uuid,
  kind: Type.String(),
  role: text,
  status: Type.String(),
  personName: text,
  assignedPersonName: text,
  completedByName: text,
  nodeName: text,
  hasPerson: Type.Boolean(),
  hasAssignee: Type.Boolean(),
  hasCompletedBy: Type.Boolean(),
  dueAt: date,
  completedAt: date,
  overdue: Type.Boolean(),
  exception: text,
  canAct: Type.Boolean(),
  candidateNames: Type.Array(Type.String()),
  candidateCount: Type.Union([Type.Integer(), Type.Null()]),
})
export type ProgressTask = Static<typeof ProgressTaskSchema>
export const ProgressTasksResponseSchema = Type.Object({
  code: Type.Literal(0),
  data: Type.Object({
    items: Type.Array(ProgressTaskSchema),
    nextOffset: offset,
  }),
})
const RoundSummarySchema = Type.Object({
  number: Type.Integer(),
  status: Type.String(),
  createdAt: date,
})
export const ProgressResponseSchema = Type.Object({
  code: Type.Literal(0),
  data: Type.Object({
    caseId: uuid,
    title: Type.String(),
    contentType: Type.String(),
    status: Type.String(),
    currentRound: Type.Integer(),
    viewer: Type.Union([
      Type.Literal('administrator'),
      Type.Literal('applicant'),
      Type.Literal('reviewer'),
    ]),
    rounds: Type.Array(RoundSummarySchema),
    nextRoundOffset: offset,
    round: Type.Union([
      Type.Object({
        number: Type.Integer(),
        versionId: Type.Union([uuid, Type.Null()]),
        status: Type.String(),
        executionStatus: Type.String(),
        createdAt: date,
        completedAt: date,
        workflowName: text,
        ruleName: text,
        ruleRevision: Type.Union([Type.Integer(), Type.Null()]),
        stages: Type.Array(
          Type.Object({
            id: uuid,
            name: Type.String(),
            order: Type.Integer(),
            status: Type.String(),
            legacy: Type.Boolean(),
            taskCount: Type.Integer(),
            approvedCount: Type.Integer(),
            tasks: Type.Array(ProgressTaskSchema),
            nextTaskOffset: offset,
          }),
        ),
      }),
      Type.Null(),
    ]),
  }),
})
export type ReviewProgress = Static<typeof ProgressResponseSchema>['data']
export const ProgressHistoryResponseSchema = Type.Object({
  code: Type.Literal(0),
  data: Type.Object({
    items: Type.Array(
      Type.Object({
        id: uuid,
        action: Type.String(),
        actorName: text,
        assigneeName: text,
        roundNumber: Type.Union([Type.Integer(), Type.Null()]),
        stageName: text,
        taskId: Type.Union([uuid, Type.Null()]),
        notes: text,
        createdAt: Type.String({ format: 'date-time' }),
      }),
    ),
    nextOffset: offset,
  }),
})
export type ProgressHistory = Static<typeof ProgressHistoryResponseSchema>['data']
export const ProgressHistoryQuerySchema = Type.Object(
  {
    ...ProgressPageQuerySchema.properties,
    taskId: Type.Optional(uuid),
  },
  { additionalProperties: false },
)
