import { Type, type Static } from 'typebox'
import { PersonnelRoleSchema } from '../directory/schema'
import { GovernedWorkflowSchema } from './governance-schema'

export const RequestKindSchema = Type.Union([
  Type.Literal('submission'),
  Type.Literal('metadata'),
  Type.Literal('attribution'),
  Type.Literal('access'),
  Type.Literal('bibliography'),
  Type.Literal('institutional_withdrawal'),
])
export const RouteSchema = Type.Object(
  {
    ...GovernedWorkflowSchema.properties,
    key: Type.String({ pattern: '^[a-z0-9][a-z0-9_-]{0,63}$' }),
    contentType: Type.Union([Type.Literal('paper'), Type.Literal('degree_thesis')]),
    priority: Type.Integer({ minimum: 0, maximum: 10000 }),
    identityCodes: Type.Array(PersonnelRoleSchema, { uniqueItems: true, maxItems: 11 }),
    nodeIds: Type.Array(Type.String({ format: 'uuid' }), { uniqueItems: true, maxItems: 100 }),
    requestKinds: Type.Array(RequestKindSchema, { minItems: 1, uniqueItems: true, maxItems: 7 }),
    enabled: Type.Boolean(),
    expectedRevision: Type.Integer({ minimum: 0 }),
    notes: Type.String({ minLength: 1, maxLength: 2000, pattern: '\\S' }),
  },
  { additionalProperties: false },
)
export type RouteInput = Static<typeof RouteSchema>
export const SimulationSchema = Type.Object(
  {
    contentType: RouteSchema.properties.contentType,
    requestKind: RequestKindSchema,
    personIds: Type.Array(Type.String({ format: 'uuid' }), { maxItems: 500, uniqueItems: true }),
    nodeIds: RouteSchema.properties.nodeIds,
  },
  { additionalProperties: false },
)
export type SimulationInput = Static<typeof SimulationSchema>
