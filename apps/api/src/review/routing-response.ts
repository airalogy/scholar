import { Type, type Static } from 'typebox'
import { Check } from 'typebox/value'
import type { Prisma } from '../../prisma/generated/client'
import { GovernedStepSchema } from './governance-schema'

const uuid = Type.String({ format: 'uuid' })
const date = Type.String({ format: 'date-time' })
const nullableDate = Type.Union([date, Type.Null()])
const RouteResponseSchema = Type.Object({
  id: uuid,
  institutionId: uuid,
  key: Type.String(),
  revision: Type.Integer(),
  name: Type.String(),
  contentType: Type.String(),
  priority: Type.Integer(),
  identityCodes: Type.Array(Type.String()),
  nodeIds: Type.Array(uuid),
  requestKinds: Type.Array(Type.String()),
  enabled: Type.Boolean(),
  workflowId: uuid,
  createdBy: uuid,
  notes: Type.String(),
  createdAt: date,
  supersededAt: nullableDate,
  workflow: Type.Object({
    id: uuid,
    name: Type.String(),
    isActive: Type.Boolean(),
    steps: Type.Array(
      Type.Object({
        id: uuid,
        name: Type.String(),
        stepOrder: Type.Integer(),
        resolverType: Type.Literal('governance'),
        resolverConfig: GovernedStepSchema,
      }),
    ),
  }),
})
export const ReviewRoutesResponseSchema = Type.Object({
  code: Type.Literal(0),
  data: Type.Object({
    items: Type.Array(RouteResponseSchema),
    nextOffset: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
  }),
})

type RouteRecord = Prisma.institution_review_routesGetPayload<{
  include: { workflow: { include: { steps: true } } }
}>

// Explicitly project database fields; never recursively rename stored JSON or enum values.
export const toReviewRouteResponse = (route: RouteRecord): Static<typeof RouteResponseSchema> => ({
  id: route.id,
  institutionId: route.institutionId,
  key: route.key,
  revision: route.revision,
  name: route.name,
  contentType: route.contentType,
  priority: route.priority,
  identityCodes: route.identityCodes,
  nodeIds: route.nodeIds,
  requestKinds: route.requestKinds,
  enabled: route.enabled,
  workflowId: route.workflowId,
  createdBy: route.createdBy,
  notes: route.notes,
  createdAt: route.createdAt.toISOString(),
  supersededAt: route.supersededAt?.toISOString() ?? null,
  workflow: {
    id: route.workflow.id,
    name: route.workflow.name,
    isActive: route.workflow.is_active,
    steps: route.workflow.steps.map((step) => {
      if (step.resolver_type !== 'governance' || !Check(GovernedStepSchema, step.resolver_config))
        throw new Error('Invalid governed review route configuration')
      return {
        id: step.id,
        name: step.name,
        stepOrder: step.step_order,
        resolverType: 'governance' as const,
        resolverConfig: step.resolver_config,
      }
    }),
  },
})
