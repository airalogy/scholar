import assert from 'node:assert/strict'
import { test } from 'node:test'
import Fastify, { type FastifyInstance } from 'fastify'
import sensible from '@fastify/sensible'
import jwtPlugin from '../src/plugins/global/jwt'
import institutionImportRoutes from '../src/routes/v1/institutions'
import { normalizeDoi } from '../src/utils/doi'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const INSTITUTION_ID = '22222222-2222-4222-8222-222222222222'
const OTHER_INSTITUTION_ID = '33333333-3333-4333-8333-333333333333'
const SCHOLAR_ID = '44444444-4444-4444-8444-444444444444'
const JWT_SECRET = 'test-jwt-secret-that-is-longer-than-thirty-two-characters'

interface StoredImport {
  id: string
  institutionId: string
  kind: string
  status: string
  idempotencyKey: string
  requestDigest: string
  actorType: string
  actorUserId: string | null
  actorScopes: string[]
  credentialId: string | null
  sourceIp: string | null
  userAgent: string | null
  totalRows: number
  createdCount: number
  updatedCount: number
  unchangedCount: number
  pendingCount: number
  errorCount: number
  reviewedBy: string | null
  reviewNotes: string | null
  reviewedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

interface StoredImportItem {
  id: string
  importId: string
  rowIndex: number
  externalKey: string | null
  targetId: string | null
  action: string
  status: string
  message: string | null
  payload: object
  createdAt: Date
  updatedAt: Date
}

interface ImportTestState {
  canImportData: boolean
  deploymentMode: 'public' | 'private'
  imports: StoredImport[]
  items: StoredImportItem[]
  importCreateCount: number
}

const buildImportPrismaMock = (state: ImportTestState) => {
  const scholarMappings: Array<{
    id: string
    institutionId: string
    externalId: string
    scholarId: string
    createdAt: Date
    updatedAt: Date
  }> = []
  const scholars: Array<{
    id: string
    name: string
    createdAt: Date
    updatedAt: Date
  }> = []

  const prisma = {
    users: {
      findUnique: async ({ where }: { where: { id?: string } }) => {
        return where.id === USER_ID ? { id: USER_ID, platform_role: 'member' } : null
      },
    },
    institution_memberships: {
      findUnique: async ({
        where,
      }: {
        where: {
          institutionId_userId?: {
            institutionId: string
            userId: string
          }
        }
      }) => {
        const key = where.institutionId_userId
        if (!key || key.userId !== USER_ID || key.institutionId !== INSTITUTION_ID) {
          return null
        }
        return {
          role: 'member',
          can_review_content: false,
          can_import_data: state.canImportData,
        }
      },
    },
    institutions: {
      findUnique: async ({ where }: { where: { slug?: string } }) => {
        if (where.slug === 'test') {
          return { id: INSTITUTION_ID, slug: 'test' }
        }
        if (where.slug === 'other') {
          return { id: OTHER_INSTITUTION_ID, slug: 'other' }
        }
        return null
      },
    },
    institution_data_imports: {
      findUnique: async ({
        where,
      }: {
        where: {
          id?: string
          institutionId_kind_idempotencyKey?: {
            institutionId: string
            kind: string
            idempotencyKey: string
          }
        }
      }) => {
        if (where.id) {
          return state.imports.find((record) => record.id === where.id) ?? null
        }
        const key = where.institutionId_kind_idempotencyKey
        return (
          state.imports.find((record) => {
            return (
              key &&
              record.institutionId === key.institutionId &&
              record.kind === key.kind &&
              record.idempotencyKey === key.idempotencyKey
            )
          }) ?? null
        )
      },
      create: async ({
        data,
      }: {
        data: Omit<
          StoredImport,
          | 'id'
          | 'createdCount'
          | 'updatedCount'
          | 'unchangedCount'
          | 'pendingCount'
          | 'errorCount'
          | 'reviewedBy'
          | 'reviewNotes'
          | 'reviewedAt'
        >
      }) => {
        state.importCreateCount += 1
        const record: StoredImport = {
          ...data,
          id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(state.importCreateCount).padStart(12, '0')}`,
          createdCount: 0,
          updatedCount: 0,
          unchangedCount: 0,
          pendingCount: 0,
          errorCount: 0,
          reviewedBy: null,
          reviewNotes: null,
          reviewedAt: null,
        }
        state.imports.push(record)
        return record
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<StoredImport> }) => {
        const record = state.imports.find((item) => item.id === where.id)
        assert.ok(record)
        Object.assign(record, data)
        return record
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string }
        data: Partial<StoredImport>
      }) => {
        const record = state.imports.find((item) => item.id === where.id)
        if (!record) {
          return { count: 0 }
        }
        Object.assign(record, data)
        return { count: 1 }
      },
      findMany: async ({
        where,
        take,
        skip,
      }: {
        where: { institutionId: string; kind?: string }
        take?: number
        skip?: number
      }) => {
        return state.imports
          .filter((record) => {
            return (
              record.institutionId === where.institutionId &&
              (!where.kind || record.kind === where.kind)
            )
          })
          .slice(skip ?? 0, (skip ?? 0) + (take ?? 20))
      },
      count: async ({ where }: { where: { institutionId: string; kind?: string } }) => {
        return state.imports.filter((record) => {
          return (
            record.institutionId === where.institutionId &&
            (!where.kind || record.kind === where.kind)
          )
        }).length
      },
    },
    institution_data_import_items: {
      create: async ({ data }: { data: Omit<StoredImportItem, 'id'> }) => {
        const item: StoredImportItem = {
          ...data,
          id: `bbbbbbbb-bbbb-4bbb-8bbb-${String(state.items.length + 1).padStart(12, '0')}`,
        }
        state.items.push(item)
        return item
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string }
        data: Partial<StoredImportItem>
      }) => {
        const item = state.items.find((record) => record.id === where.id)
        assert.ok(item)
        Object.assign(item, data)
        return item
      },
      findMany: async ({ where }: { where: { importId: string; status?: string } }) => {
        return state.items
          .filter((item) => {
            return (
              item.importId === where.importId && (!where.status || item.status === where.status)
            )
          })
          .sort((left, right) => left.rowIndex - right.rowIndex)
      },
      count: async ({
        where,
      }: {
        where: { importId: string; status?: string | { in: string[] } }
      }) => {
        return state.items.filter((item) => {
          if (item.importId !== where.importId || !where.status) {
            return item.importId === where.importId
          }
          return typeof where.status === 'string'
            ? item.status === where.status
            : where.status.in.includes(item.status)
        }).length
      },
    },
    institution_scholar_mappings: {
      findUnique: async ({
        where,
      }: {
        where: {
          institutionId_externalId: {
            institutionId: string
            externalId: string
          }
        }
      }) => {
        return (
          scholarMappings.find((mapping) => {
            return (
              mapping.institutionId === where.institutionId_externalId.institutionId &&
              mapping.externalId === where.institutionId_externalId.externalId
            )
          }) ?? null
        )
      },
      create: async ({ data }: { data: Omit<(typeof scholarMappings)[number], 'id'> }) => {
        const mapping = {
          ...data,
          id: 'cccccccc-cccc-4ccc-8ccc-000000000001',
        }
        scholarMappings.push(mapping)
        return mapping
      },
    },
    scholars: {
      create: async ({
        data,
      }: {
        data: {
          name: string
          createdAt: Date
          updatedAt: Date
        }
      }) => {
        const scholar = {
          ...data,
          id: SCHOLAR_ID,
        }
        scholars.push(scholar)
        return scholar
      },
    },
    papers: {
      findMany: async () => [],
    },
    scholar_research_timeline_generations: {
      updateMany: async () => ({ count: 0 }),
      create: async () => ({ id: 'dddddddd-dddd-4ddd-8ddd-000000000001' }),
    },
    scholar_research_periods: {
      deleteMany: async () => ({ count: 0 }),
      createMany: async ({ data }: { data: unknown[] }) => ({ count: data.length }),
      create: async () => ({ id: 1n }),
    },
    scholar_research_period_papers: {
      createMany: async ({ data }: { data: unknown[] }) => ({ count: data.length }),
    },
    scholar_research_timeline_issues: {
      createMany: async ({ data }: { data: unknown[] }) => ({ count: data.length }),
    },
    scholar_papers: {
      createMany: async () => ({ count: 0 }),
    },
    $transaction: async (
      operation: ((client: typeof prisma) => Promise<unknown>) | Promise<unknown>[],
    ) => {
      if (typeof operation === 'function') {
        return operation(prisma)
      }
      return Promise.all(operation)
    },
  }
  return prisma
}

const buildImportApp = async (state: ImportTestState): Promise<FastifyInstance> => {
  const app = Fastify({ logger: false })
  await app.register(sensible)
  app.decorate('config', { JWT_SECRET } as never)
  app.decorate('prisma', buildImportPrismaMock(state) as never)
  app.decorate('deployment', {
    mode: state.deploymentMode,
    paperLibrary: {
      fixedInstitutionSlug: null,
    },
  } as never)
  await app.register(jwtPlugin)
  await app.register(institutionImportRoutes, {
    prefix: '/v1/institutions',
  })
  await app.ready()
  return app
}

const buildUserHeaders = (
  app: FastifyInstance,
  idempotencyKey?: string,
): Record<string, string> => {
  const token = app.jwt.sign({
    userId: USER_ID,
    token_type: 'access',
  })
  return {
    authorization: `Bearer ${token}`,
    ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
  }
}

test('DOIs are normalized consistently for idempotent paper identity', () => {
  assert.equal(normalizeDoi(' HTTPS://doi.org/10.1000/Example.DOI '), '10.1000/example.doi')
  assert.equal(normalizeDoi('doi: 10.1000/ABC'), '10.1000/abc')
})

test('public imports enforce permission, institution scope, validation, and idempotency', async (t) => {
  const state: ImportTestState = {
    canImportData: false,
    deploymentMode: 'public',
    imports: [],
    items: [],
    importCreateCount: 0,
  }
  const app = await buildImportApp(state)
  t.after(async () => app.close())
  const body = {
    items: [
      {
        external_id: 'faculty-001',
        name: 'Scholar One',
      },
      {
        external_id: 'faculty-001',
        name: 'Duplicate Scholar',
      },
    ],
  }

  await t.test('an unprivileged member receives 403', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/institutions/test/imports/scholars',
      headers: buildUserHeaders(app, 'permission-test'),
      payload: body,
    })
    assert.equal(response.statusCode, 403)
  })

  state.canImportData = true

  await t.test('permission remains bound to the member institution', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/institutions/other/imports/scholars',
      headers: buildUserHeaders(app, 'cross-inst-test'),
      payload: body,
    })
    assert.equal(response.statusCode, 403)
  })

  let firstImportId = ''
  await t.test('public scholar imports remain pending with partial row errors', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/institutions/test/imports/scholars',
      headers: buildUserHeaders(app, 'scholar-import-001'),
      payload: body,
    })
    assert.equal(response.statusCode, 200)
    const payload = response.json() as {
      data: {
        id: string
        status: string
        summary: {
          pending: number
          errors: number
        }
        items: Array<{
          action: string
          status: string
        }>
      }
    }
    firstImportId = payload.data.id
    assert.equal(payload.data.status, 'pending_review')
    assert.deepEqual(payload.data.summary, {
      total: 2,
      created: 0,
      updated: 0,
      unchanged: 0,
      pending: 1,
      errors: 1,
    })
    assert.equal(payload.data.items[0].status, 'pending')
    assert.equal(payload.data.items[1].action, 'error')
    assert.deepEqual(state.imports[0].actorScopes, ['can_import_data'])
  })

  await t.test('repeating the same key and payload returns the original result', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/institutions/test/imports/scholars',
      headers: buildUserHeaders(app, 'scholar-import-001'),
      payload: body,
    })
    assert.equal(response.statusCode, 200)
    const payload = response.json() as { data: { id: string } }
    assert.equal(payload.data.id, firstImportId)
    assert.equal(state.importCreateCount, 1)
    assert.equal(state.items.length, 2)
  })

  await t.test('a failed import resumes pending rows without duplicating audit items', async () => {
    state.imports[0].status = 'failed'
    state.items[0].status = 'pending'
    state.items[0].action = 'pending'
    state.items[0].targetId = null

    const response = await app.inject({
      method: 'POST',
      url: '/v1/institutions/test/imports/scholars',
      headers: buildUserHeaders(app, 'scholar-import-001'),
      payload: body,
    })
    assert.equal(response.statusCode, 200)
    assert.equal(state.items.length, 2)
    assert.equal(state.imports[0].status, 'pending_review')
  })

  await t.test('reusing an idempotency key for another payload returns 409', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/institutions/test/imports/scholars',
      headers: buildUserHeaders(app, 'scholar-import-001'),
      payload: {
        items: [{ external_id: 'faculty-002', name: 'Scholar Two' }],
      },
    })
    assert.equal(response.statusCode, 409)
  })

  await t.test('the idempotency header and 500-item limit are enforced', async () => {
    const missingHeader = await app.inject({
      method: 'POST',
      url: '/v1/institutions/test/imports/scholars',
      headers: buildUserHeaders(app),
      payload: {
        items: [{ external_id: 'faculty-002', name: 'Scholar Two' }],
      },
    })
    assert.equal(missingHeader.statusCode, 400)

    const tooManyItems = await app.inject({
      method: 'POST',
      url: '/v1/institutions/test/imports/scholars',
      headers: buildUserHeaders(app, 'scholar-import-500'),
      payload: {
        items: Array.from({ length: 501 }, (_, index) => ({
          external_id: `faculty-${index}`,
          name: `Scholar ${index}`,
        })),
      },
    })
    assert.equal(tooManyItems.statusCode, 400)
  })
})

test('private scholar imports apply immediately through external_id mapping', async (t) => {
  const state: ImportTestState = {
    canImportData: true,
    deploymentMode: 'private',
    imports: [],
    items: [],
    importCreateCount: 0,
  }
  const app = await buildImportApp(state)
  t.after(async () => app.close())

  const response = await app.inject({
    method: 'POST',
    url: '/v1/institutions/test/imports/scholars',
    headers: buildUserHeaders(app, 'private-scholar-001'),
    payload: {
      items: [
        {
          external_id: 'faculty-001',
          name: 'Scholar One',
          college: ['Computer Science'],
          research_timeline: [
            {
              period_start_year: 2020,
              period_end_year: 2024,
              paper_count: 1,
              papers_with_abstract: 1,
              papers_without_abstract: 0,
              focus_summary: 'Research period summary',
              focus_tags: ['research'],
              source_papers: [
                {
                  year: 2024,
                  title: 'Representative paper',
                  doi: '10.1000/example',
                  has_abstract: true,
                  source_status: 'matched_by_doi',
                },
              ],
            },
          ],
        },
      ],
    },
  })
  assert.equal(response.statusCode, 200)
  const payload = response.json() as {
    data: {
      status: string
      summary: {
        created: number
        pending: number
        errors: number
      }
      items: Array<{
        targetId: string | null
        action: string
        status: string
      }>
    }
  }
  assert.equal(payload.data.status, 'completed')
  assert.equal(payload.data.summary.created, 1)
  assert.equal(payload.data.summary.pending, 0)
  assert.equal(payload.data.summary.errors, 0)
  assert.equal(payload.data.items[0].targetId, SCHOLAR_ID)
  assert.equal(payload.data.items[0].action, 'created')
  assert.equal(payload.data.items[0].status, 'completed')
})
