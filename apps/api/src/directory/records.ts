import { createHash, randomUUID } from 'node:crypto'
import type { Prisma, institution_directory_sources } from '../../prisma/generated/client'
import {
  normalizeInstitutionInternalId,
  assertInstitutionInternalId,
} from '../utils/institution-identifiers'
import type { DirectoryRow } from './schema'
import { writePersonnelRelationship } from './relationships'
import { reconcilePersonCorrections } from './corrections'

type Source = institution_directory_sources
const ownedKey = (source: Source, id: string): string =>
  `directory:${createHash('sha256').update(`${source.id}:${id}`).digest('hex')}`

export const endAppointmentAuthority = async (
  tx: Prisma.TransactionClient,
  institutionId: string,
  appointmentIds: string[],
): Promise<void> => {
  if (!appointmentIds.length) return
  const ended = new Set(appointmentIds)
  const grants = await tx.institution_reviewer_grants.findMany({
    where: { institutionId, revokedAt: null, appointmentIds: { hasSome: appointmentIds } },
  })
  for (const grant of grants) {
    const remaining = grant.appointmentIds.filter((id) => !ended.has(id))
    await tx.institution_reviewer_grants.update({
      where: { id: grant.id },
      data: { appointmentIds: remaining, ...(remaining.length ? {} : { revokedAt: new Date() }) },
    })
    await tx.institution_identity_events.create({
      data: {
        institutionId,
        personId: grant.personId,
        action: 'reviewer_appointment_ended',
        notes: `Grant ${grant.id}; ended appointment authority removed without affecting unrelated appointments`,
      },
    })
  }
}

export const suspendPersonPrivileges = async (
  tx: Prisma.TransactionClient,
  institutionId: string,
  personId: string,
): Promise<void> => {
  const person = await tx.institution_people.findUniqueOrThrow({ where: { id: personId } })
  const now = new Date()
  await tx.institution_reviewer_grants.updateMany({
    where: { institutionId, personId, revokedAt: null },
    data: {
      revokedAt: now,
      notes: 'Revoked after personnel status changed; explicit regrant required',
    },
  })
  if (person.userId) {
    await tx.institution_memberships.updateMany({
      where: { institutionId, userId: person.userId },
      data: { role: 'member', can_review_content: false, can_import_data: false, updatedAt: now },
    })
    // Recovery belongs to the deployment's independent platform administrator.
    // Returning personnel must not regain an old owner or reviewer appointment.
  }
  if (person.provisionId)
    await tx.institution_user_provisions.update({
      where: { id: person.provisionId },
      data: { role: 'member', can_review_content: false, can_import_data: false, updatedAt: now },
    })
}

const writePerson = async (
  tx: Prisma.TransactionClient,
  source: Source,
  sequence: number,
  row: Extract<DirectoryRow, { kind: 'person' }>,
): Promise<'created' | 'updated'> => {
  const ids = row.identifiers.map((value) => ({
    value: assertInstitutionInternalId(value),
    normalizedValue: normalizeInstitutionInternalId(value),
  }))
  if (new Set(ids.map((item) => item.normalizedValue)).size !== ids.length)
    throw new Error('Duplicate normalized identifiers')
  const record = await tx.institution_directory_people.findUnique({
    where: { sourceId_externalId: { sourceId: source.id, externalId: row.externalId } },
    include: { person: true },
  })
  const existingIds = await tx.institution_person_identifiers.findMany({
    where: {
      institutionId: source.institutionId,
      normalizedValue: { in: ids.map((item) => item.normalizedValue) },
    },
    include: { person: { include: { directory_record: true } } },
  })
  const candidates = new Set(existingIds.map((item) => item.personId))
  if (record) candidates.add(record.personId)
  if (candidates.size > 1 || existingIds.some((item) => item.revokedAt))
    throw new Error('Identifier conflict requires administrator verification')
  const existing = record?.person ?? existingIds[0]?.person
  const ownership = existing
    ? await tx.institution_directory_people.findUnique({ where: { personId: existing.id } })
    : null
  if (ownership && (ownership.sourceId !== source.id || ownership.externalId !== row.externalId))
    throw new Error('Person is owned by another source record')
  if (existing && !record && !source.authoritative)
    throw new Error('An authoritative source is required to adopt an existing person')
  const now = new Date()
  const data = {
    name: row.name.trim(),
    email: row.email === undefined ? undefined : (row.email?.toLowerCase() ?? null),
    lifecycle_status: row.status,
    personnel_category: row.category,
    is_active: row.status === 'active',
    updatedAt: now,
  }
  const person = existing
    ? await tx.institution_people.update({ where: { id: existing.id }, data })
    : await tx.institution_people.create({
        data: {
          ...data,
          institutionId: source.institutionId,
          key: `directory:${randomUUID()}`,
          internalId: ids[0]!.value,
          normalizedInternalId: ids[0]!.normalizedValue,
        },
      })
  for (const id of ids) {
    await tx.institution_person_identifiers.upsert({
      where: {
        institutionId_normalizedValue: {
          institutionId: source.institutionId,
          normalizedValue: id.normalizedValue,
        },
      },
      create: {
        ...id,
        institutionId: source.institutionId,
        personId: person.id,
        source: 'directory',
      },
      update: {},
    })
  }
  await tx.institution_directory_people.upsert({
    where: { sourceId_externalId: { sourceId: source.id, externalId: row.externalId } },
    create: {
      institutionId: source.institutionId,
      sourceId: source.id,
      personId: person.id,
      externalId: row.externalId,
      lastSeenSequence: sequence,
      sourceName: row.name.trim(),
    },
    update: { lastSeenSequence: sequence, sourceName: row.name.trim() },
  })
  if (row.status !== 'active') await suspendPersonPrivileges(tx, source.institutionId, person.id)
  await reconcilePersonCorrections(tx, source.institutionId, person.id)
  return existing ? 'updated' : 'created'
}

export const writeDirectoryRecord = async (
  tx: Prisma.TransactionClient,
  source: Source,
  sequence: number,
  row: DirectoryRow,
): Promise<'created' | 'updated'> => {
  if (row.kind === 'person') return writePerson(tx, source, sequence, row)
  if (row.kind === 'identity' || row.kind === 'relationship')
    return writePersonnelRelationship(tx, source, sequence, row)
  // Hash the source-specific key to stay within the existing 100-character limit.
  const key = ownedKey(source, row.externalId)
  const institutionId = source.institutionId
  const directorySourceId = source.id
  if (row.kind === 'unit') {
    const existing = await tx.institution_org_nodes.findUnique({
      where: { institutionId_key: { institutionId, key } },
    })
    if (existing && !row.active)
      await endAppointmentAuthority(
        tx,
        institutionId,
        (
          await tx.institution_org_appointments.findMany({
            where: { institutionId, position: { nodeId: existing.id } },
            select: { id: true },
          })
        ).map((appointment) => appointment.id),
      )
    await tx.institution_org_nodes.upsert({
      where: { institutionId_key: { institutionId, key } },
      create: {
        institutionId,
        key,
        directorySourceId,
        directorySequence: sequence,
        name: row.name,
        is_active: row.active,
      },
      update: {
        directorySequence: sequence,
        name: row.name,
        is_active: row.active,
        updatedAt: new Date(),
      },
    })
    return existing ? 'updated' : 'created'
  }
  if (row.kind === 'position') {
    const unit = await tx.institution_org_nodes.findUnique({
      where: { institutionId_key: { institutionId, key: ownedKey(source, row.unitExternalId) } },
    })
    if (!unit || unit.directorySourceId !== source.id) throw new Error('Unknown source unit')
    const existing = await tx.institution_org_positions.findUnique({
      where: { institutionId_key: { institutionId, key } },
    })
    if (existing && (!row.active || existing.nodeId !== unit.id))
      await endAppointmentAuthority(
        tx,
        institutionId,
        (
          await tx.institution_org_appointments.findMany({
            where: { institutionId, positionId: existing.id },
            select: { id: true },
          })
        ).map((appointment) => appointment.id),
      )
    await tx.institution_org_positions.upsert({
      where: { institutionId_key: { institutionId, key } },
      create: {
        institutionId,
        key,
        directorySourceId,
        directorySequence: sequence,
        name: row.name,
        nodeId: unit.id,
        is_active: row.active,
      },
      update: {
        directorySequence: sequence,
        name: row.name,
        nodeId: unit.id,
        is_active: row.active,
        updatedAt: new Date(),
      },
    })
    return existing ? 'updated' : 'created'
  }
  const [person, position] = await Promise.all([
    tx.institution_directory_people.findUnique({
      where: { sourceId_externalId: { sourceId: source.id, externalId: row.personExternalId } },
    }),
    tx.institution_org_positions.findUnique({
      where: {
        institutionId_key: { institutionId, key: ownedKey(source, row.positionExternalId) },
      },
    }),
  ])
  if (!person || !position || position.directorySourceId !== source.id)
    throw new Error('Unknown appointment person or position')
  const startsAt = row.startsAt ? new Date(row.startsAt) : null
  const endsAt = row.endsAt ? new Date(row.endsAt) : null
  if (startsAt && endsAt && startsAt >= endsAt)
    throw new Error('Appointment end must be later than start')
  const existing = await tx.institution_org_appointments.findUnique({
    where: { institutionId_key: { institutionId, key } },
  })
  if (existing && existing.personId !== person.personId)
    throw new Error('Appointment cannot be transferred to another person')
  if (
    existing &&
    (row.status === 'ended' ||
      existing.status !== 'active' ||
      existing.positionId !== position.id ||
      (existing.endsAt && existing.endsAt <= new Date()) ||
      (endsAt && endsAt <= new Date()))
  )
    await endAppointmentAuthority(tx, institutionId, [existing.id])
  const data = {
    directorySequence: sequence,
    personId: person.personId,
    positionId: position.id,
    status: row.status,
    startsAt,
    endsAt,
    updatedAt: new Date(),
  }
  await tx.institution_org_appointments.upsert({
    where: { institutionId_key: { institutionId, key } },
    create: { institutionId, key, directorySourceId, ...data },
    update: data,
  })
  return existing ? 'updated' : 'created'
}

export const writeDirectoryHierarchy = async (
  tx: Prisma.TransactionClient,
  source: Source,
  row: Extract<DirectoryRow, { kind: 'unit' }>,
): Promise<void> => {
  if (row.parentExternalId === undefined) return
  const child = await tx.institution_org_nodes.findUniqueOrThrow({
    where: {
      institutionId_key: {
        institutionId: source.institutionId,
        key: ownedKey(source, row.externalId),
      },
    },
  })
  const parent = row.parentExternalId
    ? await tx.institution_org_nodes.findUnique({
        where: {
          institutionId_key: {
            institutionId: source.institutionId,
            key: ownedKey(source, row.parentExternalId),
          },
        },
      })
    : null
  if (row.parentExternalId && (!parent || parent.id === child.id))
    throw new Error('Invalid parent unit')
  if (parent) {
    const cycle = await tx.$queryRaw<Array<{ id: string }>>`
      WITH RECURSIVE descendants AS (
        SELECT "toNodeId" AS id FROM institution_org_edges WHERE "fromNodeId" = ${child.id}::uuid AND edge_type = 'hierarchy'
        UNION SELECT e."toNodeId" FROM institution_org_edges e JOIN descendants d ON e."fromNodeId" = d.id WHERE e.edge_type = 'hierarchy'
      ) SELECT id FROM descendants WHERE id = ${parent.id}::uuid LIMIT 1`
    if (cycle.length) throw new Error('Organization hierarchy contains a cycle')
  }
  const foreignParent = await tx.institution_org_edges.count({
    where: {
      institutionId: source.institutionId,
      toNodeId: child.id,
      edge_type: 'hierarchy',
      from_node: { directorySourceId: { not: source.id } },
    },
  })
  const manualParent = await tx.institution_org_edges.count({
    where: {
      institutionId: source.institutionId,
      toNodeId: child.id,
      edge_type: 'hierarchy',
      from_node: { directorySourceId: null },
    },
  })
  if (foreignParent || manualParent)
    throw new Error('Source cannot replace a manually managed organization relationship')
  const current = await tx.institution_org_edges.findMany({
    where: { institutionId: source.institutionId, toNodeId: child.id, edge_type: 'hierarchy' },
  })
  if (
    (!parent && !current.length) ||
    (parent && current.length === 1 && current[0]!.fromNodeId === parent.id)
  )
    return
  await tx.institution_org_edges.deleteMany({
    where: { institutionId: source.institutionId, toNodeId: child.id, edge_type: 'hierarchy' },
  })
  if (parent)
    await tx.institution_org_edges.create({
      data: {
        institutionId: source.institutionId,
        fromNodeId: parent.id,
        toNodeId: child.id,
        edge_type: 'hierarchy',
        is_primary: true,
      },
    })
}
