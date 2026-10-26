import { createHash } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type {
  Prisma,
  institution_directory_runs,
  institution_directory_sources,
} from '../../prisma/generated/client'
import { Check } from 'typebox/value'
import { lockMutationScope } from '../utils/advisory-lock'
import { DirectoryRowSchema, type DirectoryRow, type DirectoryRunInput } from './schema'
import {
  writeDirectoryRecord,
  writeDirectoryHierarchy,
  suspendPersonPrivileges,
  endAppointmentAuthority,
} from './records'
import { exceedsDeactivationLimit } from './policy'
import { directoryRecordBefore } from './preview'
import { retireMissingRelationships } from './relationships'
import { reconcilePersonCorrections } from './corrections'

export interface DirectoryActor {
  userId: string
  credentialId: string | null
  sourceIp?: string
  userAgent?: string
}
const digest = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')

export const beginDirectoryRun = async (
  fastify: FastifyInstance,
  sourceId: string,
  key: string,
  input: DirectoryRunInput,
  actor: DirectoryActor,
): Promise<institution_directory_runs> =>
  fastify.prisma.$transaction(async (tx) => {
    const initial = await tx.institution_directory_sources.findUniqueOrThrow({
      where: { id: sourceId },
    })
    await lockMutationScope(tx, 'institution-identity', initial.institutionId)
    const source = await tx.institution_directory_sources.findUniqueOrThrow({
      where: { id: sourceId },
    })
    if (!source.enabled) throw fastify.httpErrors.conflict('Directory source is suspended')
    const existing = await tx.institution_directory_runs.findUnique({
      where: { sourceId_idempotencyKey: { sourceId, idempotencyKey: key } },
    })
    if (existing) {
      if (
        existing.sequence !== input.sequence ||
        existing.schemaVersion !== (input.schemaVersion ?? 1) ||
        existing.mode !== input.mode ||
        existing.expectedPages !== input.expectedPages ||
        existing.expectedRows !== input.expectedRows
      )
        throw fastify.httpErrors.conflict('Idempotency key was used with different input')
      return existing
    }
    if (input.sequence <= source.lastSequence)
      throw fastify.httpErrors.conflict('Stale directory sequence')
    return tx.institution_directory_runs.create({
      data: {
        ...input,
        sourceId,
        institutionId: source.institutionId,
        idempotencyKey: key,
        actorUserId: actor.credentialId ? null : actor.userId,
        credentialId: actor.credentialId,
      },
    })
  })

export const stageDirectoryPage = async (
  fastify: FastifyInstance,
  sourceId: string,
  runId: string,
  page: number,
  rows: DirectoryRow[],
): Promise<void> => {
  await fastify.prisma.$transaction(
    async (tx) => {
      const initial = await tx.institution_directory_sources.findUniqueOrThrow({
        where: { id: sourceId },
      })
      await lockMutationScope(tx, 'institution-identity', initial.institutionId)
      const source = await tx.institution_directory_sources.findUniqueOrThrow({
        where: { id: sourceId },
      })
      const run = await tx.institution_directory_runs.findFirst({ where: { id: runId, sourceId } })
      if (!run) throw fastify.httpErrors.notFound('Directory run not found')
      if (!source.enabled || run.status !== 'staging')
        throw fastify.httpErrors.conflict('Run is not accepting pages')
      if (page < 1 || page > run.expectedPages)
        throw fastify.httpErrors.badRequest('Page is outside the declared snapshot')
      const hash = digest(rows)
      const previous = await tx.institution_directory_pages.findUnique({
        where: { runId_page: { runId, page } },
      })
      if (previous) {
        if (previous.digest !== hash)
          throw fastify.httpErrors.conflict('Page was already staged with different content')
        return
      }
      if (rows.some((row) => !Check(DirectoryRowSchema, row)))
        throw fastify.httpErrors.badRequest('Invalid directory row')
      if (
        run.schemaVersion < 2 &&
        rows.some((row) => row.kind === 'identity' || row.kind === 'relationship')
      )
        throw fastify.httpErrors.badRequest(
          'Identity and relationship records require schemaVersion 2',
        )
      const count = await tx.institution_directory_rows.count({ where: { runId } })
      if (count + rows.length > run.expectedRows)
        throw fastify.httpErrors.badRequest('Snapshot exceeds declared row count')
      const keys = rows.map((row) => `${row.kind}:${row.externalId}`)
      if (
        new Set(keys).size !== keys.length ||
        (rows.length &&
          (await tx.institution_directory_rows.count({
            where: { runId, OR: rows.map(({ kind, externalId }) => ({ kind, externalId })) },
          })))
      )
        throw fastify.httpErrors.conflict('Duplicate source record in this snapshot')
      const staged = []
      for (const row of rows)
        staged.push({
          runId,
          kind: row.kind,
          externalId: row.externalId,
          payload: row as Prisma.InputJsonValue,
          previousSnapshot: await directoryRecordBefore(tx, source, row),
        })
      await tx.institution_directory_rows.createMany({
        data: staged,
      })
      await tx.institution_directory_pages.create({
        data: { runId, page, digest: hash, rowCount: rows.length },
      })
    },
    { timeout: 120000 },
  )
}

interface Changes {
  created: number
  updated: number
  deactivated: number
  endedIdentities: number
  endedRelationships: number
  confirmationRequired: boolean
}
class DirectoryRowError extends Error {
  constructor(
    readonly rowId: string,
    message: string,
  ) {
    super(message)
  }
}
const applyRows = async (
  tx: Prisma.TransactionClient,
  source: institution_directory_sources,
  run: institution_directory_runs,
): Promise<Changes> => {
  const changes: Changes = {
    created: 0,
    updated: 0,
    deactivated: 0,
    endedIdentities: 0,
    endedRelationships: 0,
    confirmationRequired: false,
  }
  const currentFacts = { sourceId: source.id, status: 'active', supersededAt: null }
  const identitiesBefore = await tx.institution_person_roles.count({ where: currentFacts })
  const relationshipsBefore = await tx.institution_person_relations.count({ where: currentFacts })
  const activeBefore = await tx.institution_directory_people.count({
    where: { sourceId: source.id, person: { is_active: true } },
  })
  const grantsBefore = await tx.institution_reviewer_grants.count({
    where: { institutionId: source.institutionId, revokedAt: null },
  })
  for (const kind of ['unit', 'person', 'position', 'appointment', 'identity', 'relationship']) {
    let cursor: string | undefined
    while (true) {
      const rows = await tx.institution_directory_rows.findMany({
        where: { runId: run.id, kind },
        take: 250,
        orderBy: { id: 'asc' },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      })
      for (const row of rows) {
        if (!Check(DirectoryRowSchema, row.payload)) throw new Error('Invalid staged row')
        const data = row.payload as DirectoryRow
        if ((data.kind === 'identity' || data.kind === 'relationship') && data.status === 'ended') {
          const where = { ...currentFacts, externalId: data.externalId }
          if (data.kind === 'identity')
            changes.endedIdentities += await tx.institution_person_roles.count({ where })
          else changes.endedRelationships += await tx.institution_person_relations.count({ where })
        }
        if (data.kind === 'person' && data.status !== 'active') {
          const prior = await tx.institution_directory_people.findUnique({
            where: { sourceId_externalId: { sourceId: source.id, externalId: data.externalId } },
            include: { person: true },
          })
          if (prior?.person.is_active) changes.deactivated++
        }
        let outcome: 'created' | 'updated'
        try {
          outcome = await writeDirectoryRecord(tx, source, run.sequence, data)
        } catch (error) {
          throw new DirectoryRowError(
            row.id,
            error instanceof Error && !('code' in error)
              ? error.message
              : 'Invalid record or relationship',
          )
        }
        changes[outcome]++
        await tx.institution_directory_rows.update({
          where: { id: row.id },
          data: { outcome, error: null },
        })
      }
      if (rows.length < 250) break
      cursor = rows.at(-1)!.id
    }
  }
  let cursor: string | undefined
  while (true) {
    const units = await tx.institution_directory_rows.findMany({
      where: { runId: run.id, kind: 'unit' },
      take: 250,
      orderBy: { id: 'asc' },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })
    for (const row of units) {
      try {
        await writeDirectoryHierarchy(
          tx,
          source,
          row.payload as Extract<DirectoryRow, { kind: 'unit' }>,
        )
      } catch {
        throw new DirectoryRowError(row.id, 'Invalid hierarchy or conflicting source ownership')
      }
    }
    if (units.length < 250) break
    cursor = units.at(-1)!.id
  }
  if (run.mode === 'full' && source.authoritative && source.deactivateMissing) {
    if (run.schemaVersion >= 2) {
      const ended = await retireMissingRelationships(tx, source.id, run.sequence)
      changes.endedIdentities += ended.identities
      changes.endedRelationships += ended.relationships
    }
    // A full source snapshot covers assignments as well as people. Removing a
    // post must not leave its former reviewer authorization alive indefinitely.
    while (true) {
      const missing = await tx.institution_org_appointments.findMany({
        where: {
          institutionId: source.institutionId,
          status: 'active',
          OR: [
            { directorySourceId: source.id, directorySequence: { lt: run.sequence } },
            { position: { directorySourceId: source.id, directorySequence: { lt: run.sequence } } },
            {
              position: {
                node: { directorySourceId: source.id, directorySequence: { lt: run.sequence } },
              },
            },
          ],
        },
        take: 250,
        select: { id: true },
      })
      const ids = missing.map((item) => item.id)
      await endAppointmentAuthority(tx, source.institutionId, ids)
      await tx.institution_org_appointments.updateMany({
        where: { id: { in: ids } },
        data: { status: 'ended', updatedAt: new Date() },
      })
      if (missing.length < 250) break
    }
    const absent = { directorySourceId: source.id, directorySequence: { lt: run.sequence } }
    await tx.institution_org_positions.updateMany({
      where: absent,
      data: { is_active: false, updatedAt: new Date() },
    })
    await tx.institution_org_nodes.updateMany({
      where: absent,
      data: { is_active: false, updatedAt: new Date() },
    })
    while (true) {
      const missing = await tx.institution_directory_people.findMany({
        where: {
          sourceId: source.id,
          lastSeenSequence: { lt: run.sequence },
          person: { is_active: true },
        },
        take: 250,
      })
      for (const record of missing) {
        await tx.institution_people.update({
          where: { id: record.personId },
          data: { is_active: false, lifecycle_status: 'departed', updatedAt: new Date() },
        })
        await suspendPersonPrivileges(tx, source.institutionId, record.personId)
        await reconcilePersonCorrections(tx, source.institutionId, record.personId)
      }
      changes.deactivated += missing.length
      if (missing.length < 250) break
    }
  }
  // Count actual transitions, not net growth: new arrivals cannot hide departures.
  changes.confirmationRequired = exceedsDeactivationLimit(
    activeBefore,
    changes.deactivated,
    source.maxDeactivationPercent,
  )
  const grantsAfter = await tx.institution_reviewer_grants.count({
    where: { institutionId: source.institutionId, revokedAt: null },
  })
  changes.confirmationRequired ||= exceedsDeactivationLimit(
    grantsBefore,
    grantsBefore - grantsAfter,
    source.maxDeactivationPercent,
  )
  changes.confirmationRequired ||=
    exceedsDeactivationLimit(
      identitiesBefore,
      changes.endedIdentities,
      source.maxDeactivationPercent,
    ) ||
    exceedsDeactivationLimit(
      relationshipsBefore,
      changes.endedRelationships,
      source.maxDeactivationPercent,
    )
  return changes
}

class PreviewRollback extends Error {
  constructor(readonly changes: Changes) {
    super('Directory preview rollback')
  }
}

export const finishDirectoryRun = async (
  fastify: FastifyInstance,
  sourceId: string,
  runId: string,
  options: {
    preview: boolean
    confirmDeactivation?: boolean
    actor: DirectoryActor
    notes?: string
  },
): Promise<institution_directory_runs> => {
  try {
    return await fastify.prisma.$transaction(
      async (tx) => {
        const initial = await tx.institution_directory_sources.findUniqueOrThrow({
          where: { id: sourceId },
        })
        await lockMutationScope(tx, 'institution-identity', initial.institutionId)
        const source = await tx.institution_directory_sources.findUniqueOrThrow({
          where: { id: sourceId },
        })
        const run = await tx.institution_directory_runs.findFirst({
          where: { id: runId, sourceId },
        })
        if (!run) throw fastify.httpErrors.notFound('Directory run not found')
        if (run.status === 'applied') return run
        if (!source.enabled || run.sequence <= source.lastSequence)
          throw fastify.httpErrors.conflict(
            'Directory source is suspended or this snapshot is stale',
          )
        if (!options.preview && !['validated', 'needs_confirmation'].includes(run.status))
          throw fastify.httpErrors.conflict('Validate this run before applying it')
        const [pages, rows] = await Promise.all([
          tx.institution_directory_pages.count({ where: { runId } }),
          tx.institution_directory_rows.count({ where: { runId } }),
        ])
        if (pages !== run.expectedPages || rows !== run.expectedRows)
          throw fastify.httpErrors.conflict('Incomplete directory snapshot; no records changed')
        const changes = await applyRows(tx, source, run)
        if (options.preview) throw new PreviewRollback(changes)
        if (
          changes.confirmationRequired &&
          (!options.confirmDeactivation || options.actor.credentialId || !options.notes?.trim())
        )
          throw fastify.httpErrors.conflict(
            'Large deactivation requires administrator confirmation with a reason',
          )
        const now = new Date()
        await tx.institution_directory_sources.update({
          where: { id: sourceId },
          data: { lastSequence: run.sequence, lastAppliedAt: now, updatedAt: now },
        })
        await tx.institution_identity_events.create({
          data: {
            institutionId: source.institutionId,
            actorUserId: options.actor.credentialId ? null : options.actor.userId,
            action: 'directory_run_applied',
            notes: JSON.stringify({
              runId,
              sourceId,
              sequence: run.sequence,
              credentialId: options.actor.credentialId,
              changes,
              reason: options.notes?.trim() ?? null,
              sourceIp: options.actor.sourceIp ?? null,
              userAgent: options.actor.userAgent?.slice(0, 200) ?? null,
            }).slice(0, 2000),
          },
        })
        return tx.institution_directory_runs.update({
          where: { id: runId },
          data: {
            status: 'applied',
            appliedAt: now,
            appliedBy: options.actor.credentialId ? null : options.actor.userId,
            createdCount: changes.created,
            updatedCount: changes.updated,
            deactivatedCount: changes.deactivated,
            endedIdentityCount: changes.endedIdentities,
            endedRelationshipCount: changes.endedRelationships,
            error: null,
          },
        })
      },
      { timeout: 120000, maxWait: 10000 },
    )
  } catch (error) {
    if (error instanceof PreviewRollback) {
      await fastify.prisma.institution_directory_runs.updateMany({
        where: { id: runId, sourceId, status: { not: 'applied' } },
        data: {
          status: error.changes.confirmationRequired ? 'needs_confirmation' : 'validated',
          validatedAt: new Date(),
          createdCount: error.changes.created,
          updatedCount: error.changes.updated,
          deactivatedCount: error.changes.deactivated,
          endedIdentityCount: error.changes.endedIdentities,
          endedRelationshipCount: error.changes.endedRelationships,
          error: null,
        },
      })
      return fastify.prisma.institution_directory_runs.findUniqueOrThrow({ where: { id: runId } })
    }
    if (error instanceof Error && !('statusCode' in error)) {
      if (error instanceof DirectoryRowError)
        await fastify.prisma.institution_directory_rows.updateMany({
          where: { id: error.rowId, runId },
          data: { outcome: 'error', error: error.message.slice(0, 500) },
        })
      await fastify.prisma.institution_directory_runs.updateMany({
        where: { id: runId, sourceId, status: { not: 'applied' } },
        data: {
          status: 'failed',
          error:
            'Directory validation failed. Check duplicate identifiers, ownership and organization references.',
        },
      })
      fastify.log.warn({ runId, errorName: error.name }, 'Directory transaction rolled back')
      throw fastify.httpErrors.conflict('Directory validation failed; no personnel records changed')
    }
    throw error
  }
}
