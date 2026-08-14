import assert from 'node:assert/strict'
import { test } from 'node:test'
import bcrypt from 'bcrypt'
import Fastify, { type FastifyInstance } from 'fastify'
import sensible from '@fastify/sensible'
import jwtPlugin from '../src/plugins/global/jwt'
import authRoutes from '../src/routes/auth'
import institutionRoutes from '../src/routes/institutions'
import scholarRoutes from '../src/routes/scholars'
import { assertImportActorAccess, resolveImportActor } from '../src/utils/integration-auth'
import { assertCanImportInstitutionData } from '../src/utils/permissions'
import { resolvePaperImportScope } from '../src/routes/v1/institutions/service.papers'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const INSTITUTION_ID = '22222222-2222-4222-8222-222222222222'
const OTHER_INSTITUTION_ID = '33333333-3333-4333-8333-333333333333'
const CREDENTIAL_ID = '44444444-4444-4444-8444-444444444444'
const JWT_SECRET = 'test-jwt-secret-that-is-longer-than-thirty-two-characters'

interface AuthState {
  credential: {
    id: string
    institutionId: string
    name: string
    clientId: string
    secretHash: string
    scopes: string[]
    expiresAt: Date
    revokedAt: Date | null
    secretVersion: number
    lastUsedAt: Date | null
    lastUsedIp: string | null
    createdBy: string
    createdAt: Date
    updatedAt: Date
  }
  membershipRole: 'owner' | 'admin' | 'member' | null
  canImportData: boolean
  platformRole: 'member' | 'platform_admin'
}

const buildPrismaMock = (state: AuthState) => {
  return {
    users: {
      findUnique: async ({ where }: { where: { id?: string } }) => {
        if (where.id !== USER_ID) {
          return null
        }
        return {
          id: USER_ID,
          platform_role: state.platformRole,
        }
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
        if (
          !key ||
          key.userId !== USER_ID ||
          key.institutionId !== INSTITUTION_ID ||
          state.membershipRole === null
        ) {
          return null
        }
        return {
          role: state.membershipRole,
          can_review_content: false,
          can_import_data: state.canImportData,
        }
      },
    },
    institution_api_credentials: {
      findUnique: async ({ where }: { where: { id?: string; clientId?: string } }) => {
        if (where.id === state.credential.id || where.clientId === state.credential.clientId) {
          return state.credential
        }
        return null
      },
      update: async ({
        data,
      }: {
        data: {
          lastUsedAt?: Date
          lastUsedIp?: string
          updatedAt?: Date
        }
      }) => {
        Object.assign(state.credential, data)
        return state.credential
      },
    },
  }
}

const buildAuthApp = async (state: AuthState): Promise<FastifyInstance> => {
  const app = Fastify({ logger: false })
  await app.register(sensible)
  app.decorate('config', { JWT_SECRET } as never)
  app.decorate('prisma', buildPrismaMock(state) as never)
  await app.register(jwtPlugin)
  await app.register(authRoutes, { prefix: '/auth' })
  await app.register(scholarRoutes, { prefix: '/scholars' })

  app.get('/auth/internal-test', async () => ({ ok: true }))
  app.get('/business', async () => ({ ok: true }))
  app.get(
    '/integration-only',
    {
      config: {
        allowIntegrationAuth: true,
        integrationScopes: ['papers:import'],
      },
    },
    async () => ({ ok: true }),
  )
  app.get(
    '/integration-cross',
    {
      config: {
        allowIntegrationAuth: true,
        integrationScopes: ['papers:import'],
      },
    },
    async (request) => {
      await assertImportActorAccess(
        app,
        resolveImportActor(request),
        OTHER_INSTITUTION_ID,
        'papers:import',
      )
      return { ok: true }
    },
  )
  app.get('/human-import/:institutionId', async (request) => {
    const params = request.params as { institutionId: string }
    await assertCanImportInstitutionData(app, request.user.userId, params.institutionId)
    return { ok: true }
  })
  await app.ready()
  return app
}

const exchangeToken = async (
  app: FastifyInstance,
  clientId: string,
  clientSecret: string,
): Promise<string> => {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/integration-token',
    payload: {
      client_id: clientId,
      client_secret: clientSecret,
    },
  })
  assert.equal(response.statusCode, 200)
  const payload = response.json() as { access_token: string }
  return payload.access_token
}

test('integration tokens are short-lived, scoped, isolated, and immediately revocable', async (t) => {
  const clientSecret = 'sch_secret_test-secret-that-is-long-enough'
  const now = new Date()
  const state: AuthState = {
    credential: {
      id: CREDENTIAL_ID,
      institutionId: INSTITUTION_ID,
      name: 'test sync',
      clientId: 'sch_inst_test',
      secretHash: await bcrypt.hash(clientSecret, 4),
      scopes: ['papers:import', 'imports:read'],
      expiresAt: new Date(now.getTime() + 86_400_000),
      revokedAt: null,
      secretVersion: 1,
      lastUsedAt: null,
      lastUsedIp: null,
      createdBy: USER_ID,
      createdAt: now,
      updatedAt: now,
    },
    membershipRole: 'member',
    canImportData: false,
    platformRole: 'member',
  }
  const app = await buildAuthApp(state)
  t.after(async () => app.close())

  await t.test('rejects an incorrect client secret', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/integration-token',
      payload: {
        client_id: state.credential.clientId,
        client_secret: 'wrong-secret-that-is-longer-than-thirty-two',
      },
    })
    assert.equal(response.statusCode, 401)
  })

  const token = await exchangeToken(app, state.credential.clientId, clientSecret)

  await t.test('keeps ordinary user JWT behavior working', async () => {
    const userToken = app.jwt.sign({
      userId: USER_ID,
      token_type: 'access',
    })
    const response = await app.inject({
      method: 'GET',
      url: '/business',
      headers: { authorization: `Bearer ${userToken}` },
    })
    assert.equal(response.statusCode, 200)
  })

  await t.test('does not make future auth routes public by path prefix', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/auth/internal-test',
    })
    assert.equal(response.statusCode, 401)
  })

  await t.test('blocks ordinary members from global scholar writes', async () => {
    const userToken = app.jwt.sign({
      userId: USER_ID,
      token_type: 'access',
    })
    const response = await app.inject({
      method: 'DELETE',
      url: `/scholars/${CREDENTIAL_ID}`,
      headers: { authorization: `Bearer ${userToken}` },
    })
    assert.equal(response.statusCode, 403)
  })

  await t.test('blocks integration JWTs from normal business routes', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/business',
      headers: { authorization: `Bearer ${token}` },
    })
    assert.equal(response.statusCode, 403)
  })

  await t.test('allows only explicitly scoped integration routes', async () => {
    const allowed = await app.inject({
      method: 'GET',
      url: '/integration-only',
      headers: { authorization: `Bearer ${token}` },
    })
    assert.equal(allowed.statusCode, 200)

    state.credential.scopes = ['imports:read']
    const readOnlyToken = await exchangeToken(app, state.credential.clientId, clientSecret)
    const denied = await app.inject({
      method: 'GET',
      url: '/integration-only',
      headers: { authorization: `Bearer ${readOnlyToken}` },
    })
    assert.equal(denied.statusCode, 403)
    state.credential.scopes = ['papers:import', 'imports:read']
  })

  await t.test('rejects cross-institution integration access', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/integration-cross',
      headers: { authorization: `Bearer ${token}` },
    })
    assert.equal(response.statusCode, 403)
  })

  await t.test('applies human import permission independently', async () => {
    const userToken = app.jwt.sign({
      userId: USER_ID,
      token_type: 'access',
    })
    const denied = await app.inject({
      method: 'GET',
      url: `/human-import/${INSTITUTION_ID}`,
      headers: { authorization: `Bearer ${userToken}` },
    })
    assert.equal(denied.statusCode, 403)

    state.canImportData = true
    const allowed = await app.inject({
      method: 'GET',
      url: `/human-import/${INSTITUTION_ID}`,
      headers: { authorization: `Bearer ${userToken}` },
    })
    assert.equal(allowed.statusCode, 200)

    const crossInstitution = await app.inject({
      method: 'GET',
      url: `/human-import/${OTHER_INSTITUTION_ID}`,
      headers: { authorization: `Bearer ${userToken}` },
    })
    assert.equal(crossInstitution.statusCode, 403)
  })

  await t.test('invalidates issued JWTs immediately after rotation or revocation', async () => {
    state.credential.secretVersion += 1
    const rotated = await app.inject({
      method: 'GET',
      url: '/integration-only',
      headers: { authorization: `Bearer ${token}` },
    })
    assert.equal(rotated.statusCode, 401)

    state.credential.secretVersion = 1
    state.credential.revokedAt = new Date()
    const revoked = await app.inject({
      method: 'GET',
      url: '/integration-only',
      headers: { authorization: `Bearer ${token}` },
    })
    assert.equal(revoked.statusCode, 401)
  })
})

test('integration paper scope remains institution-bound without creator membership checks', async () => {
  const scope = await resolvePaperImportScope({} as FastifyInstance, INSTITUTION_ID, {
    type: 'integration',
    userId: USER_ID,
    credentialId: CREDENTIAL_ID,
    institutionId: INSTITUTION_ID,
    scopes: ['papers:import'],
  })

  assert.deepEqual(scope, {
    institutionId: INSTITUTION_ID,
    labId: null,
    reviewNodeId: null,
  })
})

test('only institution owners and platform admins can manage credentials', async (t) => {
  const now = new Date()
  const createdCredentials: AuthState['credential'][] = []
  const state: AuthState = {
    credential: {
      id: CREDENTIAL_ID,
      institutionId: INSTITUTION_ID,
      name: 'existing',
      clientId: 'sch_inst_existing',
      secretHash: 'unused',
      scopes: ['imports:read'],
      expiresAt: new Date(now.getTime() + 86_400_000),
      revokedAt: null,
      secretVersion: 1,
      lastUsedAt: null,
      lastUsedIp: null,
      createdBy: USER_ID,
      createdAt: now,
      updatedAt: now,
    },
    membershipRole: 'admin',
    canImportData: false,
    platformRole: 'member',
  }
  const prisma = {
    ...buildPrismaMock(state),
    institutions: {
      findUnique: async ({ where }: { where: { slug?: string } }) => {
        return where.slug === 'test' ? { id: INSTITUTION_ID, slug: 'test' } : null
      },
    },
    institution_api_credentials: {
      ...buildPrismaMock(state).institution_api_credentials,
      count: async () => 0,
      findMany: async () => createdCredentials,
      create: async ({ data }: { data: Omit<AuthState['credential'], 'id'> }) => {
        const credential = {
          ...data,
          id: CREDENTIAL_ID,
          revokedAt: null,
          secretVersion: 1,
          lastUsedAt: null,
          lastUsedIp: null,
        }
        createdCredentials.push(credential)
        return credential
      },
    },
    $queryRawUnsafe: async () => [],
    $transaction: async (operation: (client: unknown) => Promise<unknown>) => {
      return operation(prisma)
    },
  }
  const app = Fastify({ logger: false })
  await app.register(sensible)
  app.decorate('config', { JWT_SECRET } as never)
  app.decorate('prisma', prisma as never)
  await app.register(jwtPlugin)
  await app.register(institutionRoutes, { prefix: '/institutions' })
  await app.ready()
  t.after(async () => app.close())

  const userToken = app.jwt.sign({
    userId: USER_ID,
    token_type: 'access',
  })
  const headers = { authorization: `Bearer ${userToken}` }

  await t.test('institution admins cannot list or create credentials', async () => {
    const listResponse = await app.inject({
      method: 'GET',
      url: '/institutions/test/api-credentials',
      headers,
    })
    assert.equal(listResponse.statusCode, 403)

    const createResponse = await app.inject({
      method: 'POST',
      url: '/institutions/test/api-credentials',
      headers,
      payload: {
        name: 'HR sync',
        scopes: ['scholars:import'],
      },
    })
    assert.equal(createResponse.statusCode, 403)
  })

  await t.test('owners receive the plaintext secret exactly on creation', async () => {
    state.membershipRole = 'owner'
    const response = await app.inject({
      method: 'POST',
      url: '/institutions/test/api-credentials',
      headers,
      payload: {
        name: 'HR sync',
        scopes: ['scholars:import', 'imports:read'],
      },
    })
    assert.equal(response.statusCode, 200)
    const body = response.json() as {
      code: number
      data: {
        credential: { clientId: string }
        clientSecret: string
      }
    }
    assert.equal(body.code, 0)
    assert.match(body.data.credential.clientId, /^sch_inst_/u)
    assert.match(body.data.clientSecret, /^sch_secret_/u)

    const listResponse = await app.inject({
      method: 'GET',
      url: '/institutions/test/api-credentials',
      headers,
    })
    assert.equal(listResponse.statusCode, 200)
    assert.equal(listResponse.body.includes(body.data.clientSecret), false)
    assert.equal(listResponse.body.includes('secretHash'), false)
  })

  await t.test('platform admins can manage credentials without membership', async () => {
    state.membershipRole = null
    state.platformRole = 'platform_admin'
    const response = await app.inject({
      method: 'GET',
      url: '/institutions/test/api-credentials',
      headers,
    })
    assert.equal(response.statusCode, 200)
  })
})
