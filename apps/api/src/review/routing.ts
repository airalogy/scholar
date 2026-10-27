import type { Prisma, institution_review_routes } from '../../prisma/generated/client'
import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import { Check } from 'typebox/value'
import { requireIdentityAdmin } from '../identity/service'
import { assertPermissionManager } from '../administrators/access'
import { lockMutationScope } from '../utils/advisory-lock'
import { resolveApplicableWorkflow } from '../utils/institution-org-structure'
import { snapshotJson } from './rounds'
import { GovernedStepSchema } from './governance-schema'
import { eligibleGrantPeople } from './authorization'
import type { RouteInput, SimulationInput } from './routing-schema'
import { hasGovernedReview } from './configuration'
import { InstitutionPersonInputError } from '../utils/institution-identifiers'

export interface RoutingContext {
  verified: boolean
  personIds: string[]
  nodeIds: string[]
  identities: Array<{ personId: string; codes: string[]; revisionIds: string[] }>
  requestKind: string
  at: string
}
type Rule = Pick<
  institution_review_routes,
  'id' | 'key' | 'revision' | 'name' | 'priority' | 'identityCodes' | 'nodeIds' | 'requestKinds'
>
type BaseWorkflow = NonNullable<Awaited<ReturnType<typeof resolveApplicableWorkflow>>>
type MatchResult = ReturnType<typeof matchReviewRoutes>
type RoutedWorkflow = BaseWorkflow & {
  routing?: MatchResult & { context: RoutingContext }
}
export interface RouteSimulation {
  workflowName: string | null
  routing: RoutedWorkflow['routing'] | null
  stages: Array<{
    name: string
    reviewers: Array<{ personId: string; name: string; role: string }>
    problems: string[]
  }>
}

export const matchReviewRoutes = (
  rules: Rule[],
  context: RoutingContext,
): { selected: Rule | null; matched: string[]; error: string | null } => {
  const relevant = rules.filter((rule) => rule.requestKinds.includes(context.requestKind))
  if (
    relevant.some((rule) => rule.identityCodes.length || rule.nodeIds.length) &&
    !context.verified
  )
    return {
      selected: null,
      matched: [],
      error: 'Verify institution authors and publication units before routing',
    }
  if (
    relevant.some((rule) => rule.identityCodes.length) &&
    (!context.identities.length || context.identities.some((person) => !person.codes.length))
  )
    return {
      selected: null,
      matched: [],
      error: 'Author identity data is incomplete; synchronize authoritative identities',
    }
  const matched = relevant
    .filter(
      (rule) =>
        (!rule.nodeIds.length || rule.nodeIds.some((id) => context.nodeIds.includes(id))) &&
        (!rule.identityCodes.length ||
          context.identities.some((person) =>
            person.codes.some((code) => rule.identityCodes.includes(code)),
          )),
    )
    .sort((a, b) => b.priority - a.priority || a.key.localeCompare(b.key))
  if (matched.length > 1 && matched[0]!.priority === matched[1]!.priority)
    return {
      selected: null,
      matched: matched.map((rule) => rule.id),
      error: 'Multiple routes share the highest priority; resolve the configuration conflict',
    }
  return { selected: matched[0] ?? null, matched: matched.map((rule) => rule.id), error: null }
}

export const loadRoutingContext = async (
  tx: Prisma.TransactionClient,
  institutionId: string,
  input: SimulationInput,
  verified: boolean,
): Promise<RoutingContext> => {
  const now = new Date()
  const people = await tx.institution_people.findMany({
    where: { institutionId, id: { in: input.personIds } },
    select: { id: true },
  })
  if (people.length !== input.personIds.length)
    throw new InstitutionPersonInputError('Routing person is outside this institution')
  const nodes = await tx.institution_org_nodes.count({
    where: { institutionId, id: { in: input.nodeIds } },
  })
  if (nodes !== input.nodeIds.length)
    throw new InstitutionPersonInputError('Routing unit is outside this institution')
  const identities = await tx.institution_person_roles.findMany({
    where: {
      institutionId,
      personId: { in: input.personIds },
      supersededAt: null,
      status: 'active',
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      ],
    },
  })
  return {
    verified,
    personIds: input.personIds,
    nodeIds: input.nodeIds,
    requestKind: input.requestKind,
    at: now.toISOString(),
    identities: input.personIds.map((personId) => ({
      personId,
      codes: identities.filter((item) => item.personId === personId).map((item) => item.code),
      revisionIds: identities.filter((item) => item.personId === personId).map((item) => item.id),
    })),
  }
}

export const resolveRoutedWorkflow = async (
  tx: Prisma.TransactionClient,
  institutionId: string,
  contentType: 'paper' | 'degree_thesis',
  reviewNodeId: string | null,
  context: RoutingContext,
): Promise<RoutedWorkflow | null> => {
  // Opt-in governed intake has precedence over legacy node-specific workflows.
  const governed = await tx.institution_review_workflows.findUnique({
    where: { institutionId_key: { institutionId, key: `governed-${contentType}` } },
    include: { steps: { orderBy: { step_order: 'asc' } } },
  })
  if (!governed?.is_active)
    return resolveApplicableWorkflow(tx, institutionId, reviewNodeId, contentType)
  const rules = await tx.institution_review_routes.findMany({
    where: { institutionId, contentType, enabled: true, supersededAt: null },
    take: 101,
  })
  const result = matchReviewRoutes(rules, context)
  const chosen = result.selected
    ? await tx.institution_review_routes.findUniqueOrThrow({
        where: { id: result.selected.id },
        include: { workflow: { include: { steps: { orderBy: { step_order: 'asc' } } } } },
      })
    : null
  const workflow = chosen?.workflow ?? governed
  const steps = workflow.steps
  if (!steps.length) throw new Error('Governed workflow has no stages')
  const error = rules.length > 100 ? 'Too many active review routes' : result.error
  return {
    workflow,
    steps: error
      ? [
          {
            ...steps[0]!,
            step_order: 1,
            name: 'Routing requires verification',
            resolver_type: 'governance',
            resolver_config: { routingError: error } as Prisma.JsonObject,
          },
        ]
      : steps,
    routing: { ...result, context, error },
  }
}

export const resolveSubmissionWorkflow = async (
  tx: Prisma.TransactionClient,
  institutionId: string,
  contentType: 'paper' | 'degree_thesis',
  reviewNodeId: string | null,
  caseId: string,
  versionId: string,
  requestKind: string,
): Promise<RoutedWorkflow | null> => {
  if (!(await hasGovernedReview(tx, institutionId, contentType)))
    return resolveApplicableWorkflow(tx, institutionId, reviewNodeId, contentType)
  const scope = await tx.content_review_participant_scopes.findUnique({
    where: { caseId_versionId: { caseId, versionId } },
  })
  const context = await loadRoutingContext(
    tx,
    institutionId,
    {
      contentType,
      requestKind: requestKind as SimulationInput['requestKind'],
      personIds: scope?.personIds ?? [],
      nodeIds: scope?.nodeIds ?? [],
    },
    Boolean(scope),
  )
  return resolveRoutedWorkflow(tx, institutionId, contentType, reviewNodeId, context)
}

export const saveReviewRoute = async (
  fastify: FastifyInstance,
  slug: string,
  userId: string,
  input: RouteInput,
): Promise<string> => {
  const admin = await requireIdentityAdmin(fastify, slug, userId)
  return fastify.prisma.$transaction(async (tx) => {
    await lockMutationScope(tx, 'institution-identity', admin.institutionId)
    await assertPermissionManager(fastify, tx, admin.institutionId, userId)
    const previous = await tx.institution_review_routes.findFirst({
      where: { institutionId: admin.institutionId, key: input.key, supersededAt: null },
    })
    if ((previous?.revision ?? 0) !== input.expectedRevision)
      throw fastify.httpErrors.conflict('Rule changed; reload before saving')
    const defaults = await tx.institution_review_workflows.findUnique({
      where: {
        institutionId_key: {
          institutionId: admin.institutionId,
          key: `governed-${input.contentType}`,
        },
      },
    })
    if (!defaults?.is_active)
      throw fastify.httpErrors.conflict('Enable a governed default workflow first')
    if (
      !input.steps
        .at(-1)!
        .groups.some((group) => group.kind === 'role' && group.role === 'library_final')
    )
      throw fastify.httpErrors.badRequest('Every route requires an explicit final reviewer')
    if (
      (await tx.institution_review_routes.count({
        where: { institutionId: admin.institutionId, supersededAt: null },
      })) >= 100 &&
      !previous
    )
      throw fastify.httpErrors.conflict('At most 100 routing keys are supported')
    const nodeIds = [
      ...new Set([
        ...input.nodeIds,
        ...input.steps.flatMap((step) =>
          step.groups.flatMap((group) =>
            group.kind === 'role' && group.nodeId ? [group.nodeId] : [],
          ),
        ),
      ]),
    ]
    if (
      (await tx.institution_org_nodes.count({
        where: { id: { in: nodeIds }, institutionId: admin.institutionId, is_active: true },
      })) !== nodeIds.length
    )
      throw fastify.httpErrors.badRequest('Rule units must be active units in this institution')
    const cc = [...new Set(input.steps.flatMap((step) => step.ccPersonIds ?? []))]
    if (
      (await tx.institution_people.count({
        where: { institutionId: admin.institutionId, id: { in: cc } },
      })) !== cc.length
    )
      throw fastify.httpErrors.badRequest('CC recipient is outside this institution')
    if (input.enabled)
      for (const step of input.steps)
        for (const group of step.groups) {
          if (
            group.kind === 'role' &&
            !(await eligibleGrantPeople(tx, admin.institutionId, group.role, group.nodeId ?? null))
              .length
          )
            throw fastify.httpErrors.conflict(
              'Configure active reviewer grants before publishing a rule',
            )
        }
    const workflow = await tx.institution_review_workflows.create({
      data: {
        institutionId: admin.institutionId,
        key: `routed-${randomUUID()}`,
        name: input.name,
        createdBy: userId,
        steps: {
          create: input.steps.map((step, index) => ({
            institutionId: admin.institutionId,
            step_order: index + 1,
            name: step.name,
            resolver_type: 'governance',
            resolver_config: snapshotJson(step),
          })),
        },
      },
    })
    if (previous) {
      await tx.institution_review_routes.update({
        where: { id: previous.id },
        data: { supersededAt: new Date() },
      })
      await tx.institution_review_workflows.update({
        where: { id: previous.workflowId },
        data: { is_active: false },
      })
    }
    if (!input.enabled)
      await tx.institution_review_workflows.update({
        where: { id: workflow.id },
        data: { is_active: false },
      })
    const { steps: _steps, expectedRevision, ...values } = input
    const route = await tx.institution_review_routes.create({
      data: {
        ...values,
        institutionId: admin.institutionId,
        workflowId: workflow.id,
        revision: expectedRevision + 1,
        createdBy: userId,
      },
    })
    await tx.institution_identity_events.create({
      data: {
        institutionId: admin.institutionId,
        actorUserId: userId,
        action: 'review_route_published',
        notes: `${route.id}: ${input.notes}`.slice(0, 2000),
      },
    })
    return route.id
  })
}

export const simulateReviewRoute = async (
  tx: Prisma.TransactionClient,
  institutionId: string,
  input: SimulationInput,
): Promise<RouteSimulation> => {
  const context = await loadRoutingContext(tx, institutionId, input, true)
  const result = await resolveRoutedWorkflow(tx, institutionId, input.contentType, null, context)
  const stages = []
  for (const stage of result?.steps ?? []) {
    const problems: string[] = []
    const reviewers: Array<{ personId: string; name: string; role: string }> = []
    if (Check(GovernedStepSchema, stage.resolver_config)) {
      for (const group of stage.resolver_config.groups) {
        const scopes =
          group.kind === 'departments'
            ? context.nodeIds.map((nodeId) => ({ role: 'department', nodeId }))
            : group.kind === 'role'
              ? [{ role: group.role, nodeId: group.nodeId ?? null }]
              : []
        if (group.kind === 'departments' && !scopes.length)
          problems.push('No verified publication units')
        for (const scope of scopes) {
          const people = await eligibleGrantPeople(tx, institutionId, scope.role, scope.nodeId)
          if (!people.length) problems.push(`No eligible reviewer: ${scope.role}`)
          const names = await tx.institution_people.findMany({
            where: { institutionId, id: { in: people.map((person) => person.id) } },
            select: { id: true, name: true },
          })
          reviewers.push(
            ...names.map((person) => ({
              personId: person.id,
              name: person.name,
              role: scope.role,
            })),
          )
        }
        if (group.kind === 'authors' && !context.personIds.length)
          problems.push('No verified authors')
        if (group.kind === 'authors' && context.personIds.length) {
          const authors = await tx.institution_people.findMany({
            where: { institutionId, id: { in: context.personIds } },
            select: { id: true, name: true },
          })
          reviewers.push(
            ...authors.map((person) => ({
              personId: person.id,
              name: person.name,
              role: 'author',
            })),
          )
        }
        if (group.kind === 'supervisors' || group.kind === 'responsible') {
          const kind = group.kind === 'supervisors' ? 'supervisor' : 'responsible'
          const now = new Date(context.at)
          const eligible = await eligibleGrantPeople(tx, institutionId, kind, null)
          const roleFilter = result?.routing?.selected?.identityCodes ?? []
          const subjects = context.personIds.filter(
            (id) =>
              !roleFilter.length ||
              context.identities.some(
                (person) =>
                  person.personId === id && person.codes.some((code) => roleFilter.includes(code)),
              ),
          )
          for (const personId of subjects) {
            const relations = await tx.institution_person_relations.findMany({
              where: {
                institutionId,
                personId,
                kind,
                status: 'active',
                supersededAt: null,
                AND: [
                  { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
                  { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
                ],
              },
              include: { relatedPerson: { select: { name: true } } },
            })
            if (!relations.length) problems.push(`Missing ${kind} relationship for ${personId}`)
            for (const relation of relations) {
              if (!eligible.some((person) => person.id === relation.relatedPersonId))
                problems.push(`No explicit ${kind} grant: ${relation.relatedPerson.name}`)
              reviewers.push({
                personId: relation.relatedPersonId,
                name: relation.relatedPerson.name,
                role: kind,
              })
            }
          }
          if (!context.personIds.length) problems.push('No verified authors')
        }
      }
    }
    stages.push({
      name: stage.name,
      reviewers: [
        ...new Map(
          reviewers.map((reviewer) => [`${reviewer.personId}:${reviewer.role}`, reviewer]),
        ).values(),
      ],
      problems: [...new Set(problems)],
    })
  }
  return {
    workflowName: result?.workflow.name ?? null,
    routing: result?.routing ?? null,
    stages,
  }
}
