import crypto from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { Prisma } from '../../prisma/generated/client'
import type { UpsertInstitutionOrgStructureBody } from '../routes/institutions/schema'

type PrismaClientLike = FastifyInstance['prisma'] | Prisma.TransactionClient
type InstitutionRole = 'owner' | 'admin' | 'member'
type WorkflowResolverType = 'position' | 'institution_role' | 'user'

export interface WorkflowStepRecord {
  id: string
  institutionId: string
  workflowId: string
  step_order: number
  name: string
  resolver_type: string
  resolver_config: Prisma.JsonValue
  createdAt: Date
  updatedAt: Date
}

interface ReviewResolutionContext {
  nodes: Array<{
    id: string
    key: string
    node_type: string
    is_active: boolean
  }>
  edges: Array<{
    fromNodeId: string
    toNodeId: string
    edge_type: string
    is_primary: boolean
  }>
  people: Array<{
    id: string
    userId: string | null
    is_active: boolean
  }>
  positions: Array<{
    id: string
    nodeId: string
    key: string
    code: string | null
    is_active: boolean
  }>
  appointments: Array<{
    personId: string
    positionId: string
    status: string
    startsAt: Date | null
    endsAt: Date | null
  }>
  memberships: Array<{
    userId: string
    role: string
    can_review_content: boolean
  }>
}

const normalizeInstitutionRole = (role: unknown): InstitutionRole => {
  if (role === 'owner' || role === 'admin') {
    return role
  }

  return 'member'
}

const trimNullableString = (value?: string | null): string | null => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

const normalizeNullableEmail = (value?: string | null): string | null => {
  const trimmed = trimNullableString(value)
  return trimmed ? trimmed.toLocaleLowerCase() : null
}

const parseOptionalDate = (value?: string | null): Date | null => {
  if (!value) {
    return null
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const normalizeProvisionStatus = (
  status: unknown,
): 'pending_activation' | 'claimed' | 'disabled' => {
  if (status === 'claimed' || status === 'disabled') {
    return status
  }

  return 'pending_activation'
}

const toNullableJsonInput = (
  value: unknown,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput => {
  if (value === undefined || value === null) {
    return Prisma.DbNull
  }

  return value as Prisma.InputJsonValue
}

const generateInviteToken = (): string => {
  return `${crypto.randomUUID().replaceAll('-', '')}${crypto.randomBytes(12).toString('hex')}`
}

const buildProvisionExpiry = (days = 30): Date => {
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + days)
  return expiresAt
}

const uniq = <T>(values: T[]): T[] => [...new Set(values)]

const readStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return []
  }

  return uniq(
    value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => item.length > 0),
  )
}

const readInstitutionRoleArray = (value: unknown): Array<InstitutionRole | 'reviewer'> => {
  return readStringArray(value)
    .map((item) => {
      if (item === 'owner' || item === 'admin' || item === 'member' || item === 'reviewer') {
        return item
      }

      return null
    })
    .filter((item): item is InstitutionRole | 'reviewer' => item !== null)
}

const readRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

const ensureUniqueKeys = (fastify: FastifyInstance, label: string, keys: string[]): void => {
  const seen = new Set<string>()
  for (const key of keys) {
    if (seen.has(key)) {
      throw fastify.httpErrors.badRequest(`Duplicate ${label} key: ${key}`)
    }

    seen.add(key)
  }
}

const ensureUniqueComposites = (
  fastify: FastifyInstance,
  label: string,
  values: string[],
): void => {
  const seen = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) {
      throw fastify.httpErrors.badRequest(`Duplicate ${label}: ${value}`)
    }

    seen.add(value)
  }
}

const validateStructurePayload = (
  fastify: FastifyInstance,
  body: UpsertInstitutionOrgStructureBody,
): void => {
  ensureUniqueKeys(
    fastify,
    'node',
    body.nodes.map((item) => item.key),
  )
  ensureUniqueKeys(
    fastify,
    'person',
    body.people.map((item) => item.key),
  )
  ensureUniqueKeys(
    fastify,
    'position',
    body.positions.map((item) => item.key),
  )
  ensureUniqueKeys(
    fastify,
    'appointment',
    body.appointments.map((item) => item.key),
  )
  ensureUniqueKeys(
    fastify,
    'workflow',
    body.workflows.map((item) => item.key),
  )

  ensureUniqueComposites(
    fastify,
    'edge',
    body.edges.map(
      (item) => `${item.fromNodeKey}->${item.toNodeKey}:${item.edgeType ?? 'hierarchy'}`,
    ),
  )

  const nodeKeys = new Set(body.nodes.map((item) => item.key))
  const personKeys = new Set(body.people.map((item) => item.key))
  const positionKeys = new Set(body.positions.map((item) => item.key))

  for (const edge of body.edges) {
    if (!nodeKeys.has(edge.fromNodeKey) || !nodeKeys.has(edge.toNodeKey)) {
      throw fastify.httpErrors.badRequest(
        `Edge references unknown node: ${edge.fromNodeKey} -> ${edge.toNodeKey}`,
      )
    }
  }

  for (const position of body.positions) {
    if (!nodeKeys.has(position.nodeKey)) {
      throw fastify.httpErrors.badRequest(`Position references unknown node: ${position.nodeKey}`)
    }
  }

  for (const appointment of body.appointments) {
    if (!personKeys.has(appointment.personKey)) {
      throw fastify.httpErrors.badRequest(
        `Appointment references unknown person: ${appointment.personKey}`,
      )
    }
    if (!positionKeys.has(appointment.positionKey)) {
      throw fastify.httpErrors.badRequest(
        `Appointment references unknown position: ${appointment.positionKey}`,
      )
    }
  }

  for (const workflow of body.workflows) {
    if (workflow.steps.length === 0) {
      throw fastify.httpErrors.badRequest(`Workflow ${workflow.key} must contain at least one step`)
    }
    if (workflow.steps.length > 3) {
      throw fastify.httpErrors.badRequest(`Workflow ${workflow.key} cannot exceed three steps`)
    }

    ensureUniqueComposites(
      fastify,
      `workflow step order for ${workflow.key}`,
      workflow.steps.map((step) => String(step.order)),
    )

    const orderedSteps = workflow.steps
      .map((step) => step.order)
      .sort((left, right) => left - right)
    if (orderedSteps.some((order, index) => order !== index + 1)) {
      throw fastify.httpErrors.badRequest(
        `Workflow ${workflow.key} step orders must be consecutive starting at 1`,
      )
    }

    for (const binding of workflow.bindings) {
      if (binding.type === 'node_default' && !binding.nodeKey) {
        throw fastify.httpErrors.badRequest(
          `Workflow ${workflow.key} has node binding without nodeKey`,
        )
      }

      if (binding.nodeKey && !nodeKeys.has(binding.nodeKey)) {
        throw fastify.httpErrors.badRequest(
          `Workflow ${workflow.key} references unknown node: ${binding.nodeKey}`,
        )
      }
    }
  }
}

const resolveActiveAppointment = (
  appointment: ReviewResolutionContext['appointments'][number],
  now: Date,
): boolean => {
  if (appointment.status !== 'active') {
    return false
  }

  if (appointment.startsAt && appointment.startsAt.getTime() > now.getTime()) {
    return false
  }

  if (appointment.endsAt && appointment.endsAt.getTime() < now.getTime()) {
    return false
  }

  return true
}

const resolveInstitutionRoleReviewers = (
  ctx: ReviewResolutionContext,
  roles: Array<InstitutionRole | 'reviewer'>,
): string[] => {
  if (roles.length === 0) {
    return []
  }

  const includeExplicitReviewers = roles.includes('reviewer')
  const roleSet = new Set(roles.filter((item): item is InstitutionRole => item !== 'reviewer'))

  return uniq(
    ctx.memberships
      .filter((membership) => {
        const normalizedRole = normalizeInstitutionRole(membership.role)
        return (
          roleSet.has(normalizedRole) ||
          (includeExplicitReviewers && membership.can_review_content === true)
        )
      })
      .map((membership) => membership.userId),
  )
}

const resolveHierarchyParents = (ctx: ReviewResolutionContext): Map<string, string[]> => {
  const parents = new Map<string, string[]>()

  const edges = ctx.edges
    .filter((edge) => edge.edge_type === 'hierarchy')
    .sort((left, right) => Number(right.is_primary) - Number(left.is_primary))

  for (const edge of edges) {
    const current = parents.get(edge.fromNodeId) ?? []
    current.push(edge.toNodeId)
    parents.set(edge.fromNodeId, current)
  }

  return parents
}

const resolvePositionUsersForNodeIds = (
  ctx: ReviewResolutionContext,
  nodeIds: string[],
  positionKeys: string[],
  positionCodes: string[],
): string[] => {
  const nodeIdSet = new Set(nodeIds)
  const keySet = new Set(positionKeys)
  const codeSet = new Set(positionCodes)
  const now = new Date()

  const matchedPositions = ctx.positions.filter((position) => {
    if (!position.is_active || !nodeIdSet.has(position.nodeId)) {
      return false
    }

    if (keySet.size === 0 && codeSet.size === 0) {
      return false
    }

    return keySet.has(position.key) || (position.code !== null && codeSet.has(position.code))
  })

  if (matchedPositions.length === 0) {
    return []
  }

  const positionIdSet = new Set(matchedPositions.map((position) => position.id))
  const peopleMap = new Map(
    ctx.people
      .filter((person) => person.is_active && person.userId)
      .map((person) => [person.id, person.userId as string]),
  )

  return uniq(
    ctx.appointments
      .filter(
        (appointment) =>
          positionIdSet.has(appointment.positionId) && resolveActiveAppointment(appointment, now),
      )
      .map((appointment) => peopleMap.get(appointment.personId) ?? null)
      .filter((value): value is string => Boolean(value)),
  )
}

const resolvePositionReviewers = (
  ctx: ReviewResolutionContext,
  reviewNodeId: string | null,
  config: Record<string, unknown>,
): { eligibleUserIds: string[]; resolutionNotes: string | null } => {
  const scope = typeof config.scope === 'string' ? config.scope : 'review_node'
  const includeSelf = config.includeSelf === true
  const positionKeys = readStringArray(config.positionKeys)
  const positionCodes = readStringArray(config.positionCodes)
  const fallbackRoles = readInstitutionRoleArray(config.fallbackInstitutionRoles)

  const nodeByKey = new Map(ctx.nodes.map((node) => [node.key, node]))
  const institutionRootNodeIds = ctx.nodes
    .filter((node) => node.is_active && node.node_type === 'institution')
    .map((node) => node.id)
  const hierarchyParents = resolveHierarchyParents(ctx)

  let eligibleUserIds: string[] = []
  if (scope === 'specific_node') {
    const nodeKey = trimNullableString(typeof config.nodeKey === 'string' ? config.nodeKey : null)
    const node = nodeKey ? nodeByKey.get(nodeKey) : null
    eligibleUserIds = node
      ? resolvePositionUsersForNodeIds(ctx, [node.id], positionKeys, positionCodes)
      : []
  } else if (scope === 'institution_root') {
    eligibleUserIds = resolvePositionUsersForNodeIds(
      ctx,
      institutionRootNodeIds,
      positionKeys,
      positionCodes,
    )
  } else if (scope === 'ancestor') {
    if (reviewNodeId) {
      const visited = new Set<string>(includeSelf ? [reviewNodeId] : [])
      let levelNodeIds = includeSelf
        ? [reviewNodeId]
        : uniq(hierarchyParents.get(reviewNodeId) ?? [])

      while (levelNodeIds.length > 0 && eligibleUserIds.length === 0) {
        eligibleUserIds = resolvePositionUsersForNodeIds(
          ctx,
          levelNodeIds,
          positionKeys,
          positionCodes,
        )

        if (eligibleUserIds.length > 0) {
          break
        }

        const nextLevel: string[] = []
        for (const nodeId of levelNodeIds) {
          for (const parentId of hierarchyParents.get(nodeId) ?? []) {
            if (visited.has(parentId)) {
              continue
            }

            visited.add(parentId)
            nextLevel.push(parentId)
          }
        }
        levelNodeIds = uniq(nextLevel)
      }
    }
  } else if (reviewNodeId) {
    eligibleUserIds = resolvePositionUsersForNodeIds(
      ctx,
      [reviewNodeId],
      positionKeys,
      positionCodes,
    )
  }

  if (eligibleUserIds.length > 0) {
    return {
      eligibleUserIds,
      resolutionNotes: null,
    }
  }

  const fallbackUserIds = resolveInstitutionRoleReviewers(ctx, fallbackRoles)
  if (fallbackUserIds.length > 0) {
    return {
      eligibleUserIds: fallbackUserIds,
      resolutionNotes:
        'No active position assignee was found. Institution role fallback was applied.',
    }
  }

  return {
    eligibleUserIds: [],
    resolutionNotes: 'No eligible reviewer could be resolved for this step.',
  }
}

export const resolveWorkflowStepReviewers = (
  ctx: ReviewResolutionContext,
  reviewNodeId: string | null,
  step: WorkflowStepRecord,
): { eligibleUserIds: string[]; resolutionNotes: string | null } => {
  const resolverType = step.resolver_type as WorkflowResolverType
  const config = readRecord(step.resolver_config)

  if (resolverType === 'user') {
    return {
      eligibleUserIds: readStringArray(config.userIds),
      resolutionNotes: null,
    }
  }

  if (resolverType === 'institution_role') {
    const roles = readInstitutionRoleArray(config.roles)
    const eligibleUserIds = resolveInstitutionRoleReviewers(ctx, roles)
    return {
      eligibleUserIds,
      resolutionNotes:
        eligibleUserIds.length > 0 ? null : 'No institution member matched the configured roles.',
    }
  }

  if (resolverType === 'position') {
    return resolvePositionReviewers(ctx, reviewNodeId, config)
  }

  return {
    eligibleUserIds: [],
    resolutionNotes: `Unsupported resolver type: ${step.resolver_type}`,
  }
}

export const loadReviewResolutionContext = async (
  prisma: PrismaClientLike,
  institutionId: string,
): Promise<ReviewResolutionContext> => {
  const [nodes, edges, people, positions, appointments, memberships] = await Promise.all([
    prisma.institution_org_nodes.findMany({
      where: { institutionId },
      select: {
        id: true,
        key: true,
        node_type: true,
        is_active: true,
      },
    }),
    prisma.institution_org_edges.findMany({
      where: { institutionId },
      select: {
        fromNodeId: true,
        toNodeId: true,
        edge_type: true,
        is_primary: true,
      },
    }),
    prisma.institution_org_people.findMany({
      where: { institutionId },
      select: {
        id: true,
        userId: true,
        is_active: true,
      },
    }),
    prisma.institution_org_positions.findMany({
      where: { institutionId },
      select: {
        id: true,
        nodeId: true,
        key: true,
        code: true,
        is_active: true,
      },
    }),
    prisma.institution_org_appointments.findMany({
      where: { institutionId },
      select: {
        personId: true,
        positionId: true,
        status: true,
        startsAt: true,
        endsAt: true,
      },
    }),
    prisma.institution_memberships.findMany({
      where: { institutionId },
      select: {
        userId: true,
        role: true,
        can_review_content: true,
      },
    }),
  ])

  return {
    nodes,
    edges,
    people,
    positions,
    appointments,
    memberships,
  }
}

export const resolveApplicableWorkflow = async (
  prisma: PrismaClientLike,
  institutionId: string,
  reviewNodeId: string | null,
  contentType: 'paper' | 'degree_thesis' = 'paper',
): Promise<{
  workflow: {
    id: string
    key: string
    name: string
  }
  steps: WorkflowStepRecord[]
} | null> => {
  const [workflows, bindings, steps] = await Promise.all([
    prisma.institution_review_workflows.findMany({
      where: {
        institutionId,
        is_active: true,
      },
      select: {
        id: true,
        key: true,
        name: true,
      },
    }),
    prisma.institution_review_workflow_bindings.findMany({
      where: {
        institutionId,
        is_active: true,
      },
    }),
    prisma.institution_review_workflow_steps.findMany({
      where: { institutionId },
      orderBy: { step_order: 'asc' },
    }),
  ])

  const workflowMap = new Map(workflows.map((workflow) => [workflow.id, workflow]))
  const candidateBindings = bindings
    .filter(
      (binding) => workflowMap.has(binding.workflowId) && binding.content_type === contentType,
    )
    .map((binding) => {
      let score = Number.MIN_SAFE_INTEGER
      if (
        binding.binding_type === 'node_default' &&
        reviewNodeId &&
        binding.nodeId === reviewNodeId
      ) {
        score = 2000 + binding.priority
      } else if (binding.binding_type === 'institution_default' && !binding.nodeId) {
        score = 1000 + binding.priority
      }

      return {
        binding,
        score,
      }
    })
    .filter((item) => item.score > Number.MIN_SAFE_INTEGER)
    .sort((left, right) => right.score - left.score)

  const selectedBinding = candidateBindings[0]?.binding
  if (!selectedBinding) {
    return null
  }

  const workflow = workflowMap.get(selectedBinding.workflowId)
  if (!workflow) {
    return null
  }

  return {
    workflow,
    steps: steps.filter((step) => step.workflowId === workflow.id),
  }
}

const ensureInstitutionMembership = async (
  prisma: PrismaClientLike,
  institutionId: string,
  userId: string,
  now: Date,
): Promise<void> => {
  await prisma.institution_memberships.upsert({
    where: {
      institutionId_userId: {
        institutionId,
        userId,
      },
    },
    create: {
      institutionId,
      userId,
      role: 'member',
      can_review_content: false,
      createdAt: now,
      updatedAt: now,
    },
    update: {
      updatedAt: now,
    },
  })
}

const upsertProvisionForPerson = async (
  prisma: PrismaClientLike,
  institutionId: string,
  actorId: string,
  person: UpsertInstitutionOrgStructureBody['people'][number],
  now: Date,
): Promise<{
  provisionId: string | null
  claimedUserId: string | null
}> => {
  const email = normalizeNullableEmail(person.email)
  if (!email || person.createProvision !== true) {
    return {
      provisionId: null,
      claimedUserId: null,
    }
  }

  const existingProvision = await prisma.institution_user_provisions.findUnique({
    where: {
      institutionId_email: {
        institutionId,
        email,
      },
    },
  })

  if (existingProvision) {
    const provision = await prisma.institution_user_provisions.update({
      where: { id: existingProvision.id },
      data: {
        name: person.name.trim(),
        externalId: trimNullableString(person.externalId),
        updatedAt: now,
      },
      select: {
        id: true,
        claimedUserId: true,
      },
    })

    return {
      provisionId: provision.id,
      claimedUserId: provision.claimedUserId,
    }
  }

  const provision = await prisma.institution_user_provisions.create({
    data: {
      institutionId,
      createdBy: actorId,
      email,
      name: person.name.trim(),
      role: 'member',
      can_review_content: false,
      externalId: trimNullableString(person.externalId),
      inviteToken: generateInviteToken(),
      status: 'pending_activation',
      expiresAt: buildProvisionExpiry(30),
      createdAt: now,
      updatedAt: now,
    },
    select: {
      id: true,
      claimedUserId: true,
    },
  })

  return {
    provisionId: provision.id,
    claimedUserId: provision.claimedUserId,
  }
}

export const getInstitutionOrgStructure = async (
  fastify: FastifyInstance,
  institutionId: string,
) => {
  const [nodes, edges, people, positions, appointments, workflows] = await Promise.all([
    fastify.prisma.institution_org_nodes.findMany({
      where: { institutionId },
      orderBy: { key: 'asc' },
    }),
    fastify.prisma.institution_org_edges.findMany({
      where: { institutionId },
      orderBy: [{ edge_type: 'asc' }, { fromNodeId: 'asc' }, { toNodeId: 'asc' }],
    }),
    fastify.prisma.institution_org_people.findMany({
      where: { institutionId },
      orderBy: { key: 'asc' },
    }),
    fastify.prisma.institution_org_positions.findMany({
      where: { institutionId },
      orderBy: { key: 'asc' },
    }),
    fastify.prisma.institution_org_appointments.findMany({
      where: { institutionId },
      orderBy: { key: 'asc' },
    }),
    fastify.prisma.institution_review_workflows.findMany({
      where: { institutionId },
      orderBy: { key: 'asc' },
    }),
  ])

  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const personMap = new Map(people.map((person) => [person.id, person]))
  const positionMap = new Map(positions.map((position) => [position.id, position]))

  const [provisions, bindings, steps] = await Promise.all([
    people.length > 0
      ? fastify.prisma.institution_user_provisions.findMany({
          where: {
            id: {
              in: people
                .map((person) => person.provisionId)
                .filter((value): value is string => Boolean(value)),
            },
          },
          select: {
            id: true,
            status: true,
          },
        })
      : Promise.resolve([]),
    workflows.length > 0
      ? fastify.prisma.institution_review_workflow_bindings.findMany({
          where: {
            workflowId: { in: workflows.map((workflow) => workflow.id) },
          },
          orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        })
      : Promise.resolve([]),
    workflows.length > 0
      ? fastify.prisma.institution_review_workflow_steps.findMany({
          where: {
            workflowId: { in: workflows.map((workflow) => workflow.id) },
          },
          orderBy: [{ step_order: 'asc' }, { createdAt: 'asc' }],
        })
      : Promise.resolve([]),
  ])

  const provisionStatusMap = new Map(
    provisions.map((provision) => [provision.id, provision.status]),
  )

  return {
    institutionId,
    nodes: nodes.map((node) => ({
      id: node.id,
      key: node.key,
      name: node.name,
      code: node.code,
      nodeType: node.node_type,
      isActive: node.is_active,
      metadata: node.metadata ?? null,
      createdAt: node.createdAt.toISOString(),
      updatedAt: node.updatedAt.toISOString(),
    })),
    edges: edges
      .map((edge) => {
        const fromNode = nodeMap.get(edge.fromNodeId)
        const toNode = nodeMap.get(edge.toNodeId)
        if (!fromNode || !toNode) {
          return null
        }

        return {
          id: edge.id,
          fromNodeId: edge.fromNodeId,
          fromNodeKey: fromNode.key,
          toNodeId: edge.toNodeId,
          toNodeKey: toNode.key,
          edgeType: edge.edge_type,
          isPrimary: edge.is_primary,
          metadata: edge.metadata ?? null,
          createdAt: edge.createdAt.toISOString(),
          updatedAt: edge.updatedAt.toISOString(),
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null),
    people: people.map((person) => ({
      id: person.id,
      key: person.key,
      name: person.name,
      email: person.email,
      externalId: person.externalId,
      userId: person.userId,
      provisionId: person.provisionId,
      provisionStatus: person.provisionId
        ? normalizeProvisionStatus(provisionStatusMap.get(person.provisionId))
        : null,
      isProvisioningEnabled: person.is_provisioning_enabled,
      isActive: person.is_active,
      metadata: person.metadata ?? null,
      createdAt: person.createdAt.toISOString(),
      updatedAt: person.updatedAt.toISOString(),
    })),
    positions: positions
      .map((position) => {
        const node = nodeMap.get(position.nodeId)
        if (!node) {
          return null
        }

        return {
          id: position.id,
          key: position.key,
          nodeId: position.nodeId,
          nodeKey: node.key,
          name: position.name,
          code: position.code,
          canReviewContent: position.can_review_content,
          isActive: position.is_active,
          metadata: position.metadata ?? null,
          createdAt: position.createdAt.toISOString(),
          updatedAt: position.updatedAt.toISOString(),
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null),
    appointments: appointments
      .map((appointment) => {
        const person = personMap.get(appointment.personId)
        const position = positionMap.get(appointment.positionId)
        if (!person || !position) {
          return null
        }

        return {
          id: appointment.id,
          key: appointment.key,
          personId: appointment.personId,
          personKey: person.key,
          positionId: appointment.positionId,
          positionKey: position.key,
          title: appointment.title,
          status: appointment.status,
          isPrimary: appointment.is_primary,
          startsAt: appointment.startsAt ? appointment.startsAt.toISOString() : null,
          endsAt: appointment.endsAt ? appointment.endsAt.toISOString() : null,
          metadata: appointment.metadata ?? null,
          createdAt: appointment.createdAt.toISOString(),
          updatedAt: appointment.updatedAt.toISOString(),
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null),
    workflows: workflows.map((workflow) => ({
      id: workflow.id,
      key: workflow.key,
      name: workflow.name,
      description: workflow.description,
      isActive: workflow.is_active,
      metadata: workflow.metadata ?? null,
      createdAt: workflow.createdAt.toISOString(),
      updatedAt: workflow.updatedAt.toISOString(),
      bindings: bindings
        .filter((binding) => binding.workflowId === workflow.id)
        .map((binding) => ({
          type: binding.binding_type as 'institution_default' | 'node_default',
          contentType: binding.content_type as 'paper' | 'degree_thesis',
          nodeId: binding.nodeId,
          nodeKey: binding.nodeId ? (nodeMap.get(binding.nodeId)?.key ?? null) : null,
          priority: binding.priority,
          isActive: binding.is_active,
        })),
      steps: steps
        .filter((step) => step.workflowId === workflow.id)
        .map((step) => ({
          order: step.step_order,
          name: step.name,
          resolverType: step.resolver_type as WorkflowResolverType,
          resolverConfig: step.resolver_config,
        })),
    })),
  }
}

export const upsertInstitutionOrgStructure = async (
  fastify: FastifyInstance,
  institutionId: string,
  actorId: string,
  body: UpsertInstitutionOrgStructureBody,
) => {
  validateStructurePayload(fastify, body)
  const now = new Date()
  const replaceMissing = body.replaceMissing !== false

  await fastify.prisma.$transaction(async (tx) => {
    for (const node of body.nodes) {
      await tx.institution_org_nodes.upsert({
        where: {
          institutionId_key: {
            institutionId,
            key: node.key,
          },
        },
        create: {
          institutionId,
          key: node.key,
          name: node.name.trim(),
          code: trimNullableString(node.code),
          node_type: trimNullableString(node.nodeType) ?? 'unit',
          is_active: node.isActive !== false,
          metadata: toNullableJsonInput(node.metadata),
          createdBy: actorId,
          createdAt: now,
          updatedAt: now,
        },
        update: {
          name: node.name.trim(),
          code: trimNullableString(node.code),
          node_type: trimNullableString(node.nodeType) ?? 'unit',
          is_active: node.isActive !== false,
          metadata: toNullableJsonInput(node.metadata),
          updatedAt: now,
        },
      })
    }

    if (replaceMissing) {
      const keepNodeKeys = body.nodes.map((item) => item.key)
      await tx.institution_org_nodes.updateMany({
        where: {
          institutionId,
          key: {
            notIn: keepNodeKeys.length > 0 ? keepNodeKeys : ['__none__'],
          },
        },
        data: {
          is_active: false,
          updatedAt: now,
        },
      })
    }

    const allNodes = await tx.institution_org_nodes.findMany({
      where: { institutionId },
      select: { id: true, key: true },
    })
    const nodeMap = new Map(allNodes.map((node) => [node.key, node.id]))

    await tx.institution_org_edges.deleteMany({
      where: { institutionId },
    })

    if (body.edges.length > 0) {
      await tx.institution_org_edges.createMany({
        data: body.edges.map((edge) => ({
          institutionId,
          fromNodeId: nodeMap.get(edge.fromNodeKey) as string,
          toNodeId: nodeMap.get(edge.toNodeKey) as string,
          edge_type: trimNullableString(edge.edgeType) ?? 'hierarchy',
          is_primary: edge.isPrimary === true,
          metadata: toNullableJsonInput(edge.metadata),
          createdAt: now,
          updatedAt: now,
        })),
      })
    }

    for (const person of body.people) {
      const normalizedEmail = normalizeNullableEmail(person.email)
      let resolvedUserId = person.userId ?? null
      if (!resolvedUserId && normalizedEmail) {
        const existingUser = await tx.users.findUnique({
          where: { email: normalizedEmail },
          select: { id: true },
        })
        resolvedUserId = existingUser?.id ?? null
      }

      const provision = await upsertProvisionForPerson(tx, institutionId, actorId, person, now)
      if (!resolvedUserId && provision.claimedUserId) {
        resolvedUserId = provision.claimedUserId
      }

      if (resolvedUserId) {
        await ensureInstitutionMembership(tx, institutionId, resolvedUserId, now)
      }

      await tx.institution_org_people.upsert({
        where: {
          institutionId_key: {
            institutionId,
            key: person.key,
          },
        },
        create: {
          institutionId,
          key: person.key,
          name: person.name.trim(),
          email: normalizedEmail,
          externalId: trimNullableString(person.externalId),
          userId: resolvedUserId,
          provisionId: provision.provisionId,
          is_provisioning_enabled: person.createProvision === true,
          is_active: person.isActive !== false,
          metadata: toNullableJsonInput(person.metadata),
          createdAt: now,
          updatedAt: now,
        },
        update: {
          name: person.name.trim(),
          email: normalizedEmail,
          externalId: trimNullableString(person.externalId),
          userId: resolvedUserId,
          provisionId: provision.provisionId,
          is_provisioning_enabled: person.createProvision === true,
          is_active: person.isActive !== false,
          metadata: toNullableJsonInput(person.metadata),
          updatedAt: now,
        },
      })
    }

    if (replaceMissing) {
      const keepPersonKeys = body.people.map((item) => item.key)
      await tx.institution_org_people.updateMany({
        where: {
          institutionId,
          key: {
            notIn: keepPersonKeys.length > 0 ? keepPersonKeys : ['__none__'],
          },
        },
        data: {
          is_active: false,
          updatedAt: now,
        },
      })
    }

    const allPeople = await tx.institution_org_people.findMany({
      where: { institutionId },
      select: { id: true, key: true },
    })
    const personMap = new Map(allPeople.map((person) => [person.key, person.id]))

    for (const position of body.positions) {
      await tx.institution_org_positions.upsert({
        where: {
          institutionId_key: {
            institutionId,
            key: position.key,
          },
        },
        create: {
          institutionId,
          nodeId: nodeMap.get(position.nodeKey) as string,
          key: position.key,
          name: position.name.trim(),
          code: trimNullableString(position.code),
          can_review_content: position.canReviewContent === true,
          is_active: position.isActive !== false,
          metadata: toNullableJsonInput(position.metadata),
          createdAt: now,
          updatedAt: now,
        },
        update: {
          nodeId: nodeMap.get(position.nodeKey) as string,
          name: position.name.trim(),
          code: trimNullableString(position.code),
          can_review_content: position.canReviewContent === true,
          is_active: position.isActive !== false,
          metadata: toNullableJsonInput(position.metadata),
          updatedAt: now,
        },
      })
    }

    if (replaceMissing) {
      const keepPositionKeys = body.positions.map((item) => item.key)
      await tx.institution_org_positions.updateMany({
        where: {
          institutionId,
          key: {
            notIn: keepPositionKeys.length > 0 ? keepPositionKeys : ['__none__'],
          },
        },
        data: {
          is_active: false,
          updatedAt: now,
        },
      })
    }

    const allPositions = await tx.institution_org_positions.findMany({
      where: { institutionId },
      select: { id: true, key: true },
    })
    const positionMap = new Map(allPositions.map((position) => [position.key, position.id]))

    for (const appointment of body.appointments) {
      await tx.institution_org_appointments.upsert({
        where: {
          institutionId_key: {
            institutionId,
            key: appointment.key,
          },
        },
        create: {
          institutionId,
          key: appointment.key,
          personId: personMap.get(appointment.personKey) as string,
          positionId: positionMap.get(appointment.positionKey) as string,
          title: trimNullableString(appointment.title),
          status: trimNullableString(appointment.status) ?? 'active',
          is_primary: appointment.isPrimary === true,
          startsAt: parseOptionalDate(appointment.startsAt),
          endsAt: parseOptionalDate(appointment.endsAt),
          metadata: toNullableJsonInput(appointment.metadata),
          createdAt: now,
          updatedAt: now,
        },
        update: {
          personId: personMap.get(appointment.personKey) as string,
          positionId: positionMap.get(appointment.positionKey) as string,
          title: trimNullableString(appointment.title),
          status: trimNullableString(appointment.status) ?? 'active',
          is_primary: appointment.isPrimary === true,
          startsAt: parseOptionalDate(appointment.startsAt),
          endsAt: parseOptionalDate(appointment.endsAt),
          metadata: toNullableJsonInput(appointment.metadata),
          updatedAt: now,
        },
      })
    }

    if (replaceMissing) {
      const keepAppointmentKeys = body.appointments.map((item) => item.key)
      await tx.institution_org_appointments.updateMany({
        where: {
          institutionId,
          key: {
            notIn: keepAppointmentKeys.length > 0 ? keepAppointmentKeys : ['__none__'],
          },
        },
        data: {
          status: 'inactive',
          updatedAt: now,
        },
      })
    }

    for (const workflow of body.workflows) {
      const savedWorkflow = await tx.institution_review_workflows.upsert({
        where: {
          institutionId_key: {
            institutionId,
            key: workflow.key,
          },
        },
        create: {
          institutionId,
          key: workflow.key,
          name: workflow.name.trim(),
          description: trimNullableString(workflow.description),
          is_active: workflow.isActive !== false,
          metadata: toNullableJsonInput(workflow.metadata),
          createdBy: actorId,
          createdAt: now,
          updatedAt: now,
        },
        update: {
          name: workflow.name.trim(),
          description: trimNullableString(workflow.description),
          is_active: workflow.isActive !== false,
          metadata: toNullableJsonInput(workflow.metadata),
          updatedAt: now,
        },
        select: {
          id: true,
        },
      })

      await tx.institution_review_workflow_bindings.deleteMany({
        where: {
          workflowId: savedWorkflow.id,
        },
      })
      await tx.institution_review_workflow_steps.deleteMany({
        where: {
          workflowId: savedWorkflow.id,
        },
      })

      if (workflow.bindings.length > 0) {
        await tx.institution_review_workflow_bindings.createMany({
          data: workflow.bindings.map((binding) => ({
            institutionId,
            workflowId: savedWorkflow.id,
            binding_type: binding.type,
            content_type: binding.contentType ?? 'paper',
            nodeId: binding.nodeKey ? (nodeMap.get(binding.nodeKey) as string) : null,
            priority: binding.priority ?? 0,
            is_active: binding.isActive !== false,
            createdAt: now,
            updatedAt: now,
          })),
        })
      }

      await tx.institution_review_workflow_steps.createMany({
        data: workflow.steps
          .slice()
          .sort((left, right) => left.order - right.order)
          .map((step) => ({
            institutionId,
            workflowId: savedWorkflow.id,
            step_order: step.order,
            name: step.name.trim(),
            resolver_type: step.resolverType,
            resolver_config: step.resolverConfig as Prisma.InputJsonValue,
            createdAt: now,
            updatedAt: now,
          })),
      })
    }

    if (replaceMissing) {
      const keepWorkflowKeys = body.workflows.map((item) => item.key)
      await tx.institution_review_workflows.updateMany({
        where: {
          institutionId,
          key: {
            notIn: keepWorkflowKeys.length > 0 ? keepWorkflowKeys : ['__none__'],
          },
        },
        data: {
          is_active: false,
          updatedAt: now,
        },
      })
    }
  })

  return getInstitutionOrgStructure(fastify, institutionId)
}

export const isUserEligibleForClaimReview = async (
  fastify: FastifyInstance,
  userId: string,
  claim: {
    reviewCaseId: string
  },
): Promise<boolean> => {
  const reviewCase = await fastify.prisma.content_review_cases.findUnique({
    where: { id: claim.reviewCaseId },
    include: { steps: true },
  })
  const currentStep = reviewCase?.steps.find(
    (step) => step.step_order === reviewCase.currentStep && step.status === 'pending',
  )
  return currentStep?.eligible_reviewer_user_ids.includes(userId) === true
}

export const getUserWorkflowReviewableClaimIds = async (
  fastify: FastifyInstance,
  userId: string,
): Promise<string[]> => {
  const rows = await fastify.prisma.$queryRaw<Array<{ claimId: string }>>`
    SELECT DISTINCT crc."subjectId" AS "claimId"
    FROM content_review_cases crc
    JOIN content_review_step_instances crs ON crs."caseId" = crc.id
    WHERE crc.content_type = 'paper'
      AND crc.status = 'pending_review'
      AND crs.status = 'pending'
      AND ${userId}::uuid = ANY(crs.eligible_reviewer_user_ids)
  `

  return uniq(rows.map((row) => row.claimId))
}
