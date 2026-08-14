import assert from 'node:assert/strict'
import test from 'node:test'
import jwt from '@fastify/jwt'
import sensible from '@fastify/sensible'
import Fastify from 'fastify'
import type { DeploymentRuntimeConfig } from '../src/utils/deployment'
import {
  completeInstitutionSsoLogin,
  createInstitutionSsoAuthorization,
} from '../src/routes/auth/oauth/institution-sso'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const INSTITUTION_ID = '22222222-2222-4222-8222-222222222222'

const deployment: DeploymentRuntimeConfig = {
  mode: 'private',
  auth: {
    enablePasswordSignin: false,
    enablePublicSignup: false,
    enableAiralogyOauth: false,
    enableInstitutionLogin: true,
    enableInstitutionProvisionLogin: false,
    enableInstitutionSso: true,
  },
  features: {
    aiChat: false,
    paperUpload: true,
    degreeTheses: true,
    forum: false,
  },
  branding: {
    appName: 'Institution Scholar',
    showBrandLogo: false,
    showInstitutionLogo: false,
    brandLogoUrl: null,
    institutionLogoUrl: null,
    institutionWatermarkUrl: null,
  },
  navigation: { defaultHomePath: '/institutions/example-university/papers' },
  paperLibrary: {
    defaultPath: '/institutions/example-university/papers',
    fixedInstitutionSlug: 'example-university',
  },
  scholarTimeline: { generationMode: 'disabled' },
  institutionLogin: { institutionSlug: 'example-university' },
  institutionSso: {
    type: 'oauth2',
    providerId: 'institution-sso',
    displayName: 'Institution Single Sign-On',
    authorizationUrl: 'https://identity.example.test/oauth/authorize',
    tokenUrl: 'https://identity.example.test/oauth/token',
    userInfoUrl: 'https://identity.example.test/oauth/userinfo',
    clientId: 'scholar-client',
    clientSecret: 'provider-secret',
    redirectUri: 'https://scholar.example.test/institution_sso_callback',
    scope: 'basic',
    externalIdField: 'account.id',
    emailField: 'account.email',
    nameField: 'account.name',
    userInfoTokenMode: 'bearer',
  },
}

test('institution SSO links a verified identity to an existing institution member', async (t) => {
  const app = Fastify({ logger: false })
  await app.register(sensible)
  await app.register(jwt, { secret: 'institution-sso-test-jwt-secret-1234567890' })
  app.decorate('config', {
    JWT_SECRET: 'institution-sso-test-jwt-secret-1234567890',
  } as never)
  app.decorate('deployment', deployment)

  const createdIdentities: Array<{ userId: string; provider: string; externalId: string }> = []
  let membershipUpserted = false
  app.decorate('prisma', {
    user_external_identities: {
      findUnique: async () => null,
      create: async ({
        data,
      }: {
        data: { userId: string; provider: string; externalId: string }
      }) => {
        createdIdentities.push({
          userId: data.userId,
          provider: data.provider,
          externalId: data.externalId,
        })
        return data
      },
    },
    users: {
      findUnique: async () => ({
        id: USER_ID,
        email: 'member@example.edu',
        username: 'existing_member',
        name: 'Existing Member',
        institution_memberships: [{ id: 1 }],
      }),
      update: async () => assert.fail('A populated existing user should not be updated'),
    },
    institutions: {
      findUnique: async () => ({ id: INSTITUTION_ID }),
    },
    institution_memberships: {
      upsert: async () => {
        membershipUpserted = true
        return { id: 1 }
      },
    },
  } as never)

  const originalFetch = globalThis.fetch
  const providerRequests: Array<{ url: string; authorization: string | null }> = []
  globalThis.fetch = async (input, init) => {
    const url = input.toString()
    providerRequests.push({
      url,
      authorization: new Headers(init?.headers).get('Authorization'),
    })

    if (url.endsWith('/oauth/token')) {
      assert.match(init?.body?.toString() ?? '', /client_id=scholar-client/u)
      return new Response(JSON.stringify({ access_token: 'provider-access-token' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(
      JSON.stringify({
        account: {
          id: 20260001,
          email: 'member@example.edu',
          name: 'Verified Member',
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }
  t.after(async () => {
    globalThis.fetch = originalFetch
    await app.close()
  })

  const authorizationUrl = new URL(
    createInstitutionSsoAuthorization(app, '/institutions/example-university/papers'),
  )
  assert.equal(authorizationUrl.origin, 'https://identity.example.test')
  assert.equal(authorizationUrl.searchParams.get('client_id'), 'scholar-client')
  assert.equal(
    authorizationUrl.searchParams.get('redirect_uri'),
    'https://scholar.example.test/institution_sso_callback',
  )

  const state = authorizationUrl.searchParams.get('state')
  assert.ok(state)
  const result = await completeInstitutionSsoLogin(app, {
    code: 'authorization-code',
    state,
  })

  assert.equal(result.username, 'existing_member')
  assert.equal(result.redirect_to, '/institutions/example-university/papers')
  assert.equal(createdIdentities.length, 1)
  assert.deepEqual(createdIdentities[0], {
    userId: USER_ID,
    provider: 'institution-sso',
    externalId: '20260001',
  })
  assert.equal(membershipUpserted, true)
  assert.equal(providerRequests[1]?.authorization, 'Bearer provider-access-token')
})
