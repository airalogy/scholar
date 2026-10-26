import type { Prisma, institution_directory_sources } from '../../prisma/generated/client'
import type { DirectoryRow } from './schema'

type RelationshipRow = Extract<DirectoryRow, { kind: 'identity' | 'relationship' }>

export const writePersonnelRelationship = async (
  tx: Prisma.TransactionClient,
  source: institution_directory_sources,
  sequence: number,
  row: RelationshipRow,
): Promise<'created' | 'updated'> => {
  const person = await tx.institution_directory_people.findUnique({
    where: { sourceId_externalId: { sourceId: source.id, externalId: row.personExternalId } },
  })
  if (!person) throw new Error('Unknown source person')
  const startsAt = row.startsAt ? new Date(row.startsAt) : null
  const endsAt = row.endsAt ? new Date(row.endsAt) : null
  if (startsAt && endsAt && startsAt >= endsAt) throw new Error('Invalid effective interval')
  const where = { sourceId: source.id, externalId: row.externalId, supersededAt: null }
  const common = {
    institutionId: source.institutionId,
    sourceId: source.id,
    externalId: row.externalId,
    sequence,
    personId: person.personId,
    startsAt,
    endsAt,
    status: row.status,
  }
  if (row.kind === 'identity') {
    const previous = await tx.institution_person_roles.findFirst({ where })
    if (previous && previous.personId !== person.personId)
      throw new Error('An identity record cannot be transferred to another person')
    if (
      previous &&
      previous.code === row.code &&
      previous.status === row.status &&
      previous.startsAt?.getTime() === startsAt?.getTime() &&
      previous.endsAt?.getTime() === endsAt?.getTime()
    ) {
      await tx.institution_person_roles.update({ where: { id: previous.id }, data: { sequence } })
      return 'updated'
    }
    if (previous)
      await tx.institution_person_roles.update({
        where: { id: previous.id },
        data: { supersededAt: new Date() },
      })
    await tx.institution_person_roles.create({
      data: { ...common, code: row.code, revision: (previous?.revision ?? 0) + 1 },
    })
    return previous ? 'updated' : 'created'
  }
  const related = await tx.institution_directory_people.findUnique({
    where: {
      sourceId_externalId: { sourceId: source.id, externalId: row.relatedPersonExternalId },
    },
  })
  if (!related || related.personId === person.personId)
    throw new Error('Invalid responsible person')
  const previous = await tx.institution_person_relations.findFirst({ where })
  if (previous && previous.personId !== person.personId)
    throw new Error('A relationship record cannot be transferred to another subject')
  if (
    previous &&
    previous.kind === row.relationship &&
    previous.relatedPersonId === related.personId &&
    previous.status === row.status &&
    previous.startsAt?.getTime() === startsAt?.getTime() &&
    previous.endsAt?.getTime() === endsAt?.getTime()
  ) {
    await tx.institution_person_relations.update({ where: { id: previous.id }, data: { sequence } })
    return 'updated'
  }
  if (previous)
    await tx.institution_person_relations.update({
      where: { id: previous.id },
      data: { supersededAt: new Date() },
    })
  await tx.institution_person_relations.create({
    data: {
      ...common,
      relatedPersonId: related.personId,
      kind: row.relationship,
      revision: (previous?.revision ?? 0) + 1,
    },
  })
  return previous ? 'updated' : 'created'
}

// Only a v2 complete authoritative snapshot owns omission semantics for these
// records. Old v1 producers must never retire facts they cannot represent.
export const retireMissingRelationships = async (
  tx: Prisma.TransactionClient,
  sourceId: string,
  sequence: number,
): Promise<{ identities: number; relationships: number }> => {
  const now = new Date()
  const ended = { identities: 0, relationships: 0 }
  for (const kind of ['identity', 'relationship'] as const) {
    while (true) {
      const where = { sourceId, sequence: { lt: sequence }, supersededAt: null, status: 'active' }
      if (kind === 'identity') {
        const rows = await tx.institution_person_roles.findMany({ where, take: 250 })
        ended.identities += rows.length
        for (const row of rows) {
          await tx.institution_person_roles.update({
            where: { id: row.id },
            data: { supersededAt: now },
          })
          const { id: _id, recordedAt: _recordedAt, supersededAt: _supersededAt, ...data } = row
          await tx.institution_person_roles.create({
            data: {
              ...data,
              revision: row.revision + 1,
              sequence,
              status: 'ended',
              endsAt: row.startsAt && row.startsAt >= now ? row.endsAt : now,
            },
          })
        }
        if (rows.length < 250) break
      } else {
        const rows = await tx.institution_person_relations.findMany({ where, take: 250 })
        ended.relationships += rows.length
        for (const row of rows) {
          await tx.institution_person_relations.update({
            where: { id: row.id },
            data: { supersededAt: now },
          })
          const { id: _id, recordedAt: _recordedAt, supersededAt: _supersededAt, ...data } = row
          await tx.institution_person_relations.create({
            data: {
              ...data,
              revision: row.revision + 1,
              sequence,
              status: 'ended',
              endsAt: row.startsAt && row.startsAt >= now ? row.endsAt : now,
            },
          })
        }
        if (rows.length < 250) break
      }
    }
  }
  return ended
}
