import { createHash } from 'node:crypto'
import type { Prisma, institution_directory_sources } from '../../prisma/generated/client'
import type { DirectoryRow } from './schema'
import { normalizeInstitutionInternalId } from '../utils/institution-identifiers'

// Record the bounded per-row baseline during staging. Preview never mutates
// personnel facts; apply rechecks the entire snapshot under the institution lock.
export const directoryRecordBefore = async (
  tx: Prisma.TransactionClient,
  source: institution_directory_sources,
  row: DirectoryRow,
): Promise<Prisma.InputJsonValue | undefined> => {
  if (row.kind === 'identity' || row.kind === 'relationship') {
    const where = { sourceId: source.id, externalId: row.externalId, supersededAt: null }
    const previous =
      row.kind === 'identity'
        ? await tx.institution_person_roles.findFirst({ where })
        : await tx.institution_person_relations.findFirst({ where })
    return previous ? (JSON.parse(JSON.stringify(previous)) as Prisma.InputJsonValue) : undefined
  }
  if (row.kind === 'person') {
    const owned = await tx.institution_directory_people.findUnique({
      where: { sourceId_externalId: { sourceId: source.id, externalId: row.externalId } },
    })
    const person = await tx.institution_people.findFirst({
      where: owned
        ? { id: owned.personId }
        : {
            institutionId: source.institutionId,
            identifiers: {
              some: {
                normalizedValue: { in: row.identifiers.map(normalizeInstitutionInternalId) },
              },
            },
          },
      include: {
        identifiers: {
          where: { revokedAt: null },
          select: { value: true },
          orderBy: { value: 'asc' },
        },
      },
    })
    return person
      ? {
          kind: row.kind,
          externalId: row.externalId,
          name: person.name,
          category: person.personnel_category,
          status: person.lifecycle_status,
          email: person.email,
          identifiers: person.identifiers.map((item) => item.value),
        }
      : undefined
  }
  const key = `directory:${createHash('sha256').update(`${source.id}:${row.externalId}`).digest('hex')}`
  const where = { institutionId_key: { institutionId: source.institutionId, key } }
  if (row.kind === 'unit') {
    const unit = await tx.institution_org_nodes.findUnique({ where })
    return unit ? { name: unit.name, active: unit.is_active } : undefined
  }
  if (row.kind === 'position') {
    const position = await tx.institution_org_positions.findUnique({
      where,
      include: { node: { select: { name: true } } },
    })
    return position
      ? { name: position.name, unit: position.node.name, active: position.is_active }
      : undefined
  }
  const appointment = await tx.institution_org_appointments.findUnique({
    where,
    include: { person: { select: { name: true } }, position: { select: { name: true } } },
  })
  return appointment
    ? {
        person: appointment.person.name,
        position: appointment.position.name,
        status: appointment.status,
        startsAt: appointment.startsAt?.toISOString() ?? null,
        endsAt: appointment.endsAt?.toISOString() ?? null,
      }
    : undefined
}
