import assert from 'node:assert/strict'
import test from 'node:test'
import {
  InstitutionPersonConflictError,
  InstitutionPersonInputError,
  normalizeInstitutionInternalId,
  resolveInstitutionPerson,
  upsertInstitutionPerson,
} from '../src/utils/institution-people'

const INSTITUTION_ID = '11111111-1111-4111-8111-111111111111'

test('institution internal IDs are compared case-insensitively without changing display form', () => {
  assert.equal(normalizeInstitutionInternalId('  Faculty-0042  '), 'faculty-0042')
})

test('institution person references require exactly one supported identifier', async () => {
  const prisma = {
    institution_people: {
      findFirst: async () => null,
      findUnique: async () => null,
    },
    institution_person_events: { create: async () => null },
  }

  await assert.rejects(
    resolveInstitutionPerson(prisma as never, INSTITUTION_ID, {}),
    InstitutionPersonInputError,
  )
  await assert.rejects(
    resolveInstitutionPerson(prisma as never, INSTITUTION_ID, {
      institutionPersonId: '22222222-2222-4222-8222-222222222222',
      institutionInternalId: 'faculty-42',
      scholarId: '33333333-3333-4333-8333-333333333333',
    }),
    InstitutionPersonInputError,
  )
})

test('a Scholar UUID resolves only through the configured institution person', async () => {
  const scholarId = '33333333-3333-4333-8333-333333333333'
  let capturedWhere: unknown
  const prisma = {
    institution_people: {
      findFirst: async ({ where }: { where: unknown }) => {
        capturedWhere = where
        return { id: '22222222-2222-4222-8222-222222222222' }
      },
      findUnique: async () => null,
    },
    institution_person_events: { create: async () => null },
  }

  const person = await resolveInstitutionPerson(prisma as never, INSTITUTION_ID, { scholarId })

  assert.deepEqual(capturedWhere, { institutionId: INSTITUTION_ID, scholarId })
  assert.equal(person?.id, '22222222-2222-4222-8222-222222222222')
})

test('an institution internal ID cannot be reassigned to a different user', async () => {
  let eventCount = 0
  const prisma = {
    institution_people: {
      findUnique: async () => ({
        id: '22222222-2222-4222-8222-222222222222',
        institutionId: INSTITUTION_ID,
        key: 'person:faculty-42',
        internalId: 'FACULTY-42',
        normalizedInternalId: 'faculty-42',
        name: 'Existing Person',
        email: null,
        userId: '33333333-3333-4333-8333-333333333333',
        scholarId: null,
        provisionId: null,
        userLinkedAt: new Date(),
        scholarLinkedAt: null,
      }),
      findFirst: async () => null,
      update: async () => null,
      create: async () => null,
    },
    institution_person_events: {
      create: async () => {
        eventCount += 1
        return null
      },
    },
  }

  await assert.rejects(
    upsertInstitutionPerson(prisma as never, {
      institutionId: INSTITUTION_ID,
      internalId: 'faculty-42',
      name: 'Another Person',
      userId: '44444444-4444-4444-8444-444444444444',
      source: 'test',
    }),
    InstitutionPersonConflictError,
  )
  assert.equal(eventCount, 0)
})

test('a trusted provision anchor can correct an institution internal ID', async () => {
  const existingPerson = {
    id: '22222222-2222-4222-8222-222222222222',
    institutionId: INSTITUTION_ID,
    key: 'person:faculty-0042',
    internalId: 'FACULTY-0042',
    normalizedInternalId: 'faculty-0042',
    name: 'Existing Person',
    email: 'person@example.edu',
    userId: null,
    scholarId: null,
    provisionId: '33333333-3333-4333-8333-333333333333',
    userLinkedAt: null,
    scholarLinkedAt: null,
  }
  let updateData: Record<string, unknown> | undefined
  const prisma = {
    institution_people: {
      findUnique: async () => null,
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        return where.provisionId === existingPerson.provisionId ? existingPerson : null
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updateData = data
        return { ...existingPerson, ...data }
      },
      create: async () => null,
    },
    institution_person_events: { create: async () => null },
  }

  const person = await upsertInstitutionPerson(prisma as never, {
    institutionId: INSTITUTION_ID,
    internalId: 'FACULTY-0099',
    name: 'Existing Person',
    provisionId: existingPerson.provisionId,
    source: 'test',
  })

  assert.equal(person.internalId, 'FACULTY-0099')
  assert.equal(updateData?.normalizedInternalId, 'faculty-0099')
})

test('different identity anchors cannot merge two institution people', async () => {
  const prisma = {
    institution_people: {
      findUnique: async () => ({
        id: '22222222-2222-4222-8222-222222222222',
        userId: null,
        scholarId: null,
        provisionId: null,
      }),
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        return where.userId
          ? {
              id: '33333333-3333-4333-8333-333333333333',
              userId: where.userId,
              scholarId: null,
              provisionId: null,
            }
          : null
      },
      update: async () => null,
      create: async () => null,
    },
    institution_person_events: { create: async () => null },
  }

  await assert.rejects(
    upsertInstitutionPerson(prisma as never, {
      institutionId: INSTITUTION_ID,
      internalId: 'faculty-42',
      name: 'Conflicting Person',
      userId: '44444444-4444-4444-8444-444444444444',
      source: 'test',
    }),
    InstitutionPersonConflictError,
  )
})

test('a concurrent unique constraint race becomes a stable identity conflict', async () => {
  let eventCount = 0
  const prisma = {
    institution_people: {
      findUnique: async () => null,
      findFirst: async () => null,
      update: async () => null,
      create: async () => {
        throw { code: 'P2002' }
      },
    },
    institution_person_events: {
      create: async () => {
        eventCount += 1
        return null
      },
    },
  }

  await assert.rejects(
    upsertInstitutionPerson(prisma as never, {
      institutionId: INSTITUTION_ID,
      internalId: 'faculty-42',
      name: 'Concurrent Person',
      source: 'test',
    }),
    InstitutionPersonConflictError,
  )
  assert.equal(eventCount, 0)
})
