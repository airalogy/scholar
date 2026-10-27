import { createHash } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { Prisma } from '../../prisma/generated/client'
import { assertActiveTarget, assertPermissionManager, permissionContext } from './access'
import { lockMutationScope } from '../utils/advisory-lock'
import { suspendPersonPrivileges } from '../directory/records'

export interface HandoffInput {
  fromUserId: string
  toUserId: string
}

interface HandoffSnapshot {
  from: Prisma.institution_membershipsGetPayload<{
    include: { user: { select: { name: true; platform_role: true } } }
  }>
  to: HandoffSnapshot['from']
  fromPersonId: string
  toPersonId: string
  labs: { labId: string }[]
  grants: Prisma.institution_reviewer_grantsGetPayload<Record<string, never>>[]
  tasks: { id: string; kind: string; status: string; step: { caseId: string } }[]
  invitations: { id: string }[]
  credentials: { id: string }[]
  digest: string
}

export const handoffSnapshot = async (
  fastify: FastifyInstance,
  tx: Prisma.TransactionClient,
  institutionId: string,
  actorUserId: string,
  input: HandoffInput,
): Promise<HandoffSnapshot> => {
  await assertPermissionManager(fastify, tx, institutionId, actorUserId)
  if (input.fromUserId === input.toUserId)
    throw fastify.httpErrors.badRequest('Choose a different successor')
  const members = await tx.institution_memberships.findMany({
    where: { institutionId, userId: { in: [input.fromUserId, input.toUserId] } },
    include: { user: { select: { name: true, platform_role: true } } },
  })
  const from = members.find((item) => item.userId === input.fromUserId)
  const to = members.find((item) => item.userId === input.toUserId)
  if (!from || !['owner', 'admin'].includes(from.role) || !to)
    throw fastify.httpErrors.conflict(
      'Both accounts must be members, and the departing account must be an administrator',
    )
  if (from.user.platform_role === 'platform_admin')
    throw fastify.httpErrors.conflict(
      'Revoke platform authority through the host recovery command before institution handoff',
    )
  await assertActiveTarget(fastify, tx, institutionId, input.toUserId)
  const people = await tx.institution_people.findMany({
    where: { institutionId, userId: { in: [input.fromUserId, input.toUserId] } },
  })
  const fromPerson = people.find((item) => item.userId === input.fromUserId)
  const toPerson = people.find((item) => item.userId === input.toUserId)
  if (!fromPerson || !toPerson)
    throw fastify.httpErrors.conflict('Verify both institution identities before handoff')
  const labs = await tx.lab_memberships.findMany({
    where: { userId: input.fromUserId, role: 'owner', lab: { institutionId } },
    select: { labId: true },
    orderBy: { labId: 'asc' },
  })
  const grants = await tx.institution_reviewer_grants.findMany({
    where: { institutionId, personId: fromPerson.id, revokedAt: null },
    orderBy: { id: 'asc' },
  })
  // Include shared queues covered by grants as potentially affected work, not
  // only tasks already assigned to the departing person. This is a checklist,
  // not a claim that every matching grant currently permits a decision.
  const tasks = await tx.content_review_tasks.findMany({
    where: {
      step: { institutionId },
      status: { in: ['pending', 'queued'] },
      OR: [
        { personId: fromPerson.id },
        { assignedPersonId: fromPerson.id },
        ...grants.map((grant) => ({
          kind: 'role',
          role: grant.role,
          nodeId: grant.nodeId,
          assignedPersonId: null,
        })),
      ],
    },
    select: { id: true, kind: true, status: true, step: { select: { caseId: true } } },
    orderBy: { id: 'asc' },
  })
  const invitations = await tx.institution_user_provisions.findMany({
    where: { institutionId, createdBy: input.fromUserId, status: 'pending_activation' },
    select: { id: true },
    orderBy: { id: 'asc' },
  })
  const credentials = await tx.institution_api_credentials.findMany({
    where: { institutionId, createdBy: input.fromUserId, revokedAt: null },
    select: { id: true },
    orderBy: { id: 'asc' },
  })
  const snapshot = {
    from,
    to,
    fromPersonId: fromPerson.id,
    toPersonId: toPerson.id,
    labs,
    grants,
    tasks,
    invitations,
    credentials,
  }
  return {
    ...snapshot,
    digest: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),
  }
}

export const completeHandoff = async (
  fastify: FastifyInstance,
  institutionId: string,
  actorUserId: string,
  input: HandoffInput & { digest: string; reason: string; acknowledgeOutstanding: boolean },
): Promise<void> => {
  if (input.reason.trim().length < 3 || !input.acknowledgeOutstanding)
    throw fastify.httpErrors.badRequest('A reason and checklist acknowledgement are required')
  await fastify.prisma.$transaction(async (tx) => {
    await lockMutationScope(tx, 'institution', institutionId)
    await lockMutationScope(tx, 'institution-identity', institutionId)
    const snapshot = await handoffSnapshot(fastify, tx, institutionId, actorUserId, input)
    if (snapshot.digest !== input.digest)
      throw fastify.httpErrors.conflict(
        'Permissions or outstanding work changed; preview the handoff again',
      )
    await permissionContext(tx, {
      actorUserId,
      source: 'administrator_handoff',
      reason: input.reason.trim(),
    })
    // The successor keeps their own account and identifier. Only the institution
    // role and lab ownership move; reviewer grants require independent approval.
    await tx.institution_memberships.update({
      where: { id: snapshot.to.id },
      data: {
        role: snapshot.to.role === 'owner' ? 'owner' : snapshot.from.role,
        updatedAt: new Date(),
      },
    })
    for (const lab of snapshot.labs) {
      await lockMutationScope(tx, 'lab', lab.labId)
      await tx.lab_memberships.upsert({
        where: { labId_userId: { labId: lab.labId, userId: input.toUserId } },
        create: { labId: lab.labId, userId: input.toUserId, role: 'owner' },
        update: { role: 'owner', updatedAt: new Date() },
      })
    }
    await tx.institution_people.update({
      where: { id: snapshot.fromPersonId },
      data: { manually_suspended: true, updatedAt: new Date() },
    })
    await suspendPersonPrivileges(tx, institutionId, snapshot.fromPersonId)
    await tx.institution_permission_events.create({
      data: {
        institutionId,
        entity: 'administrator_handoff',
        entityId: snapshot.fromPersonId,
        actorUserId,
        actorLabel: (await tx.users.findUniqueOrThrow({ where: { id: actorUserId } })).name,
        source: 'administrator_handoff',
        reason: input.reason.trim(),
        before: { fromUserId: input.fromUserId, role: snapshot.from.role },
        after: {
          toUserId: input.toUserId,
          role: snapshot.to.role === 'owner' ? 'owner' : snapshot.from.role,
          pendingTasks: snapshot.tasks.map((task) => task.id),
          transferredLabs: snapshot.labs.map((lab) => lab.labId),
          revokedGrants: snapshot.grants.map((grant) => grant.id),
          disabledInvitations: snapshot.invitations.map((invite) => invite.id),
          revokedCredentials: snapshot.credentials.map((credential) => credential.id),
        },
      },
    })
  })
}
