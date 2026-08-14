import assert from 'node:assert/strict'
import test from 'node:test'
import Fastify, { type FastifyInstance } from 'fastify'
import sensible from '@fastify/sensible'
import jwtPlugin from '../src/plugins/global/jwt'
import scholarTimelineRoutes from '../src/routes/v1/scholars'
import type { ScholarTimelineGenerationMode } from '../src/utils/deployment'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222'
const ADMIN_ID = '33333333-3333-4333-8333-333333333333'
const SCHOLAR_ID = '44444444-4444-4444-8444-444444444444'
const INSTITUTION_ID = '55555555-5555-4555-8555-555555555555'
const JWT_SECRET = 'test-jwt-secret-that-is-longer-than-thirty-two-characters'

interface StoredGeneration {
  id: string
  scholar_id: string
  source_type: string
  status: string
  requested_by: string | null
  reviewed_by: string | null
  reused_from_id: string | null
  idempotency_key: string | null
  source_fingerprint: string | null
  timeline_policy: string
  window_size_years: number
  model: string
  prompt_version: string
  source_paper_count: number
  resolved_paper_count: number
  unresolved_paper_count: number
  progress_stage: string
  completed_periods: number
  total_periods: number
  input_tokens: number | null
  output_tokens: number | null
  attempt_count: number
  lease_owner: string | null
  lease_expires_at: Date | null
  error_code: string | null
  error_message: string | null
  review_notes: string | null
  request_ip: string | null
  user_agent: string | null
  requested_at: Date
  started_at: Date | null
  completed_at: Date | null
  reviewed_at: Date | null
  published_at: Date | null
  createdAt: Date
  updatedAt: Date
}

interface TimelineRouteState {
  roles: Record<string, 'member' | 'platform_admin'>
  institutionRoles: Record<string, 'owner' | 'admin' | 'member' | undefined>
  mapped: boolean
  generations: StoredGeneration[]
  requests: Array<{
    id: string
    generation_id: string
    user_id: string
    idempotency_key: string
    createdAt: Date
  }>
}

const makeGeneration = (
  id: string,
  status: string,
  requestedBy: string | null,
): StoredGeneration => {
  const now = new Date('2026-08-07T00:00:00.000Z')
  return {
    id,
    scholar_id: SCHOLAR_ID,
    source_type: 'ai',
    status,
    requested_by: requestedBy,
    reviewed_by: null,
    reused_from_id: null,
    idempotency_key: null,
    source_fingerprint: 'fingerprint',
    timeline_policy: 'fixed_calendar_windows',
    window_size_years: 5,
    model: 'timeline-test-model',
    prompt_version: 'research-timeline-v1',
    source_paper_count: 0,
    resolved_paper_count: 0,
    unresolved_paper_count: 0,
    progress_stage: status,
    completed_periods: 0,
    total_periods: 0,
    input_tokens: null,
    output_tokens: null,
    attempt_count: 0,
    lease_owner: null,
    lease_expires_at: null,
    error_code: null,
    error_message: null,
    review_notes: null,
    request_ip: null,
    user_agent: null,
    requested_at: now,
    started_at: null,
    completed_at: status === 'ready' ? now : null,
    reviewed_at: null,
    published_at: null,
    createdAt: now,
    updatedAt: now,
  }
}

const matchesStatus = (generation: StoredGeneration, status: unknown): boolean => {
  if (typeof status === 'string') {
    return generation.status === status
  }
  if (typeof status === 'object' && status !== null) {
    const values = Reflect.get(status, 'in')
    return Array.isArray(values) && values.includes(generation.status)
  }
  return true
}

const buildPrismaMock = (state: TimelineRouteState) => {
  const prisma = {
    users: {
      findUnique: async (args: unknown) => {
        const where = Reflect.get(args as object, 'where') as { id?: string }
        const role = where.id ? state.roles[where.id] : undefined
        return role && where.id ? { id: where.id, platform_role: role } : null
      },
    },
    institutions: {
      findUnique: async (args: unknown) => {
        const where = Reflect.get(args as object, 'where') as { slug?: string }
        return where.slug === 'test-institution' ? { id: INSTITUTION_ID } : null
      },
    },
    institution_memberships: {
      findUnique: async (args: unknown) => {
        const where = Reflect.get(args as object, 'where') as {
          institutionId_userId?: { institutionId: string; userId: string }
        }
        const key = where.institutionId_userId
        const role =
          key?.institutionId === INSTITUTION_ID ? state.institutionRoles[key.userId] : undefined
        return role ? { role, can_review_content: false, can_import_data: false } : null
      },
    },
    institution_scholar_mappings: {
      findFirst: async () => (state.mapped ? { id: 'mapping' } : null),
    },
    scholars: {
      findUnique: async (args: unknown) => {
        const where = Reflect.get(args as object, 'where') as { id?: string }
        return where.id === SCHOLAR_ID ? { id: SCHOLAR_ID, name: 'Test Scholar' } : null
      },
    },
    scholar_papers: {
      findMany: async () => [],
    },
    papers: {
      findMany: async () => [],
    },
    scholar_research_timeline_requests: {
      findUnique: async (args: unknown) => {
        const where = Reflect.get(args as object, 'where') as {
          user_id_idempotency_key?: { user_id: string; idempotency_key: string }
        }
        const key = where.user_id_idempotency_key
        return (
          state.requests.find((request) => {
            return (
              key &&
              request.user_id === key.user_id &&
              request.idempotency_key === key.idempotency_key
            )
          }) ?? null
        )
      },
      findFirst: async (args: unknown) => {
        const where = Reflect.get(args as object, 'where') as {
          generation_id?: string
          user_id?: string
        }
        return (
          state.requests.find((request) => {
            return (
              request.generation_id === where.generation_id && request.user_id === where.user_id
            )
          }) ?? null
        )
      },
      create: async (args: unknown) => {
        const data = Reflect.get(args as object, 'data') as Omit<
          (typeof state.requests)[number],
          'id' | 'createdAt'
        >
        const request = {
          ...data,
          id: `request-${state.requests.length + 1}`,
          createdAt: new Date(),
        }
        state.requests.push(request)
        return request
      },
    },
    scholar_research_timeline_generations: {
      findUnique: async (args: unknown) => {
        const where = Reflect.get(args as object, 'where') as { id?: string }
        return state.generations.find((generation) => generation.id === where.id) ?? null
      },
      findFirst: async (args: unknown) => {
        const where = Reflect.get(args as object, 'where') as Record<string, unknown>
        return (
          state.generations.find((generation) => {
            if (where.scholar_id && generation.scholar_id !== where.scholar_id) {
              return false
            }
            if (where.status && !matchesStatus(generation, where.status)) {
              return false
            }
            if (
              where.source_fingerprint &&
              generation.source_fingerprint !== where.source_fingerprint
            ) {
              return false
            }
            return true
          }) ?? null
        )
      },
      count: async () => 0,
      create: async (args: unknown) => {
        const data = Reflect.get(args as object, 'data') as Partial<StoredGeneration> & {
          scholar_id: string
          status: string
          requested_by: string | null
        }
        const generation = {
          ...makeGeneration(
            `66666666-6666-4666-8666-${String(state.generations.length + 1).padStart(12, '0')}`,
            data.status,
            data.requested_by,
          ),
          ...data,
        }
        state.generations.push(generation)
        return generation
      },
      update: async (args: unknown) => {
        const where = Reflect.get(args as object, 'where') as { id: string }
        const data = Reflect.get(args as object, 'data') as Partial<StoredGeneration>
        const generation = state.generations.find((item) => item.id === where.id)
        assert.ok(generation)
        Object.assign(generation, data)
        return generation
      },
      updateMany: async (args: unknown) => {
        const where = Reflect.get(args as object, 'where') as Record<string, unknown>
        const data = Reflect.get(args as object, 'data') as Partial<StoredGeneration>
        let count = 0
        for (const generation of state.generations) {
          if (where.scholar_id && generation.scholar_id !== where.scholar_id) {
            continue
          }
          if (where.status && !matchesStatus(generation, where.status)) {
            continue
          }
          Object.assign(generation, data)
          count += 1
        }
        return { count }
      },
    },
    scholar_research_periods: {
      findMany: async () => [],
    },
    scholar_research_period_papers: {
      findMany: async () => [],
    },
    scholar_research_timeline_issues: {
      findMany: async () => [],
    },
    $transaction: async (operation: unknown) => {
      return typeof operation === 'function'
        ? await operation(prisma)
        : await Promise.all(operation as Promise<unknown>[])
    },
  }
  return prisma
}

const buildApp = async (
  mode: ScholarTimelineGenerationMode,
  deploymentMode: 'public' | 'private' = 'public',
  stateOverrides: Partial<TimelineRouteState> = {},
): Promise<{ app: FastifyInstance; state: TimelineRouteState }> => {
  const state: TimelineRouteState = {
    roles: {
      [USER_ID]: 'member',
      [OTHER_USER_ID]: 'member',
      [ADMIN_ID]: 'platform_admin',
    },
    institutionRoles: {},
    mapped: true,
    generations: [],
    requests: [],
    ...stateOverrides,
  }
  const app = Fastify({ logger: false })
  await app.register(sensible)
  app.decorate('config', {
    JWT_SECRET,
    OPENAI_BASE_URL: 'https://example.invalid/v1',
    OPENAI_API_KEY: 'test-key',
    OPENAI_EMBEDDING_MODEL: 'test-embedding',
    CHAT_MODEL: 'test-chat',
    TIMELINE_MODEL: 'test-timeline',
    TIMELINE_DAILY_USER_LIMIT: 3,
  } as never)
  app.decorate('deployment', {
    mode: deploymentMode,
    paperLibrary: {
      fixedInstitutionSlug: deploymentMode === 'private' ? 'test-institution' : null,
    },
    scholarTimeline: { generationMode: mode },
  } as never)
  app.decorate('prisma', buildPrismaMock(state) as never)
  await app.register(jwtPlugin)
  await app.register(scholarTimelineRoutes, { prefix: '/v1/scholars' })
  await app.ready()
  return { app, state }
}

const userHeaders = (
  app: FastifyInstance,
  userId: string,
  key?: string,
): Record<string, string> => ({
  authorization: `Bearer ${app.jwt.sign({ userId, token_type: 'access' })}`,
  ...(key ? { 'idempotency-key': key } : {}),
})

const createGeneration = async (app: FastifyInstance, userId: string, key: string) => {
  return app.inject({
    method: 'POST',
    url: `/v1/scholars/${SCHOLAR_ID}/research-timeline/generations`,
    headers: userHeaders(app, userId, key),
    payload: {},
  })
}

test('timeline generation modes enforce disabled, request-only, preview, and admin behavior', async (t) => {
  for (const [mode, userId, expectedStatus, expectedCode] of [
    ['disabled', USER_ID, null, 404],
    ['request_only', USER_ID, 'requested', 202],
    ['preview', USER_ID, 'queued', 202],
    ['admin', USER_ID, null, 403],
    ['admin', ADMIN_ID, 'queued', 202],
  ] as const) {
    await t.test(`${mode} for ${userId}`, async () => {
      const { app } = await buildApp(mode)
      t.after(async () => app.close())
      const response = await createGeneration(app, userId, `key-${mode}-${userId}`)
      assert.equal(response.statusCode, expectedCode)
      if (expectedStatus) {
        assert.equal(response.json().data.status, expectedStatus)
      }
    })
  }
})

test('ordinary users can read only previews attached to their account', async (t) => {
  const { app } = await buildApp('preview')
  t.after(async () => app.close())
  const created = await createGeneration(app, USER_ID, 'private-preview-key')
  const generationId = created.json().data.id as string

  const own = await app.inject({
    method: 'GET',
    url: `/v1/scholars/${SCHOLAR_ID}/research-timeline/generations/${generationId}`,
    headers: userHeaders(app, USER_ID),
  })
  const other = await app.inject({
    method: 'GET',
    url: `/v1/scholars/${SCHOLAR_ID}/research-timeline/generations/${generationId}`,
    headers: userHeaders(app, OTHER_USER_ID),
  })
  assert.equal(own.statusCode, 200)
  assert.equal(other.statusCode, 403)
})

test('idempotency, active-job deduplication, and ready-result cache prevent duplicate work', async (t) => {
  const { app, state } = await buildApp('preview')
  t.after(async () => app.close())
  const first = await createGeneration(app, USER_ID, 'stable-preview-key')
  const repeated = await createGeneration(app, USER_ID, 'stable-preview-key')
  const shared = await createGeneration(app, OTHER_USER_ID, 'other-preview-key')
  assert.equal(first.statusCode, 202)
  assert.equal(repeated.json().data.id, first.json().data.id)
  assert.equal(shared.json().data.id, first.json().data.id)
  assert.equal(shared.json().data.reused, true)
  assert.equal(state.generations.length, 1)

  state.generations[0].status = 'ready'
  state.generations[0].progress_stage = 'ready'
  const cached = await createGeneration(app, OTHER_USER_ID, 'cached-preview-key')
  assert.equal(cached.json().data.id, first.json().data.id)
  assert.equal(cached.json().data.reused, true)
  assert.equal(state.generations.length, 1)
})

test('integration JWTs cannot access timeline generation endpoints', async (t) => {
  const { app } = await buildApp('preview')
  t.after(async () => app.close())
  const token = app.jwt.sign({
    userId: 'integration:test',
    token_type: 'integration',
    credentialId: '77777777-7777-4777-8777-777777777777',
    institutionId: INSTITUTION_ID,
    credentialVersion: 1,
    scopes: ['scholars:import'],
  })
  const response = await app.inject({
    method: 'POST',
    url: `/v1/scholars/${SCHOLAR_ID}/research-timeline/generations`,
    headers: {
      authorization: `Bearer ${token}`,
      'idempotency-key': 'integration-preview-key',
    },
    payload: {},
  })
  assert.equal(response.statusCode, 403)
})

test('publication requires a platform admin publicly or mapped owner/admin privately', async (t) => {
  const publicGenerationId = '88888888-8888-4888-8888-888888888888'
  const publicSetup = await buildApp('admin', 'public', {
    generations: [makeGeneration(publicGenerationId, 'ready', USER_ID)],
  })
  t.after(async () => publicSetup.app.close())
  const ordinary = await publicSetup.app.inject({
    method: 'POST',
    url: `/v1/scholars/${SCHOLAR_ID}/research-timeline/generations/${publicGenerationId}/publish`,
    headers: userHeaders(publicSetup.app, USER_ID),
    payload: {},
  })
  const admin = await publicSetup.app.inject({
    method: 'POST',
    url: `/v1/scholars/${SCHOLAR_ID}/research-timeline/generations/${publicGenerationId}/publish`,
    headers: userHeaders(publicSetup.app, ADMIN_ID),
    payload: {},
  })
  assert.equal(ordinary.statusCode, 403)
  assert.equal(admin.statusCode, 200)
  assert.equal(admin.json().data.status, 'published')

  const privateGenerationId = '99999999-9999-4999-8999-999999999999'
  const privateSetup = await buildApp('admin', 'private', {
    institutionRoles: { [USER_ID]: 'owner' },
    generations: [makeGeneration(privateGenerationId, 'ready', USER_ID)],
  })
  t.after(async () => privateSetup.app.close())
  const owner = await privateSetup.app.inject({
    method: 'POST',
    url: `/v1/scholars/${SCHOLAR_ID}/research-timeline/generations/${privateGenerationId}/publish`,
    headers: userHeaders(privateSetup.app, USER_ID),
    payload: { notes: 'Reviewed' },
  })
  assert.equal(owner.statusCode, 200)
  assert.equal(owner.json().data.status, 'published')
})
