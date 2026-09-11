import assert from 'node:assert/strict'
import { after, before, describe, test, type TestContext } from 'node:test'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'
import sensible from '@fastify/sensible'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../prisma/generated/client'
import jwtPlugin from '../src/plugins/global/jwt'
import authRoutes from '../src/routes/auth'
import { identityAdminRoutes } from '../src/routes/v1/institutions/routes.identity'
import { createInstitutionSsoAuthorization } from '../src/routes/auth/oauth/institution-sso'
import { resolveInstitutionPerson, upsertInstitutionPerson } from '../src/utils/institution-people'
import type { DeploymentRuntimeConfig } from '../src/utils/deployment'
import { lockMutationScope } from '../src/utils/advisory-lock'

const databaseUrl = process.env.IDENTITY_TEST_DATABASE_URL
const schema = `scholar_identity_test_${randomBytes(8).toString('hex')}`
const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const JWT_SECRET = 'identity-test-signing-secret-at-least-32-characters'
let prisma: PrismaClient
let sequence = 0
const executeSql = (sql: string): void => {
  execFileSync('pnpm', ['exec', 'prisma', 'db', 'execute', '--stdin'], {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    input: sql,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

const fixture = async (t: TestContext) => {
  const key = `${++sequence}-${randomBytes(4).toString('hex')}`
  const institution = await prisma.institutions.create({
    data: { name: 'Example University', slug: `identity-${key}` },
  })
  const user = async (name: string, role = 'member') =>
    prisma.users.create({
      data: {
        name,
        email: `${name.replaceAll(' ', '-').toLowerCase()}-${key}@example.invalid`,
        username: `${name.replaceAll(' ', '-')}-${key}`,
        platform_role: role,
      },
    })
  const owner = await user('Owner')
  const admin = await user('Admin')
  const member = await user('Member')
  const platform = await user('Platform', 'platform_admin')
  const original = await user('Same Name')
  const other = await user('Other')
  for (const [account, role] of [
    [owner, 'owner'],
    [admin, 'admin'],
    [member, 'member'],
    [original, 'member'],
  ] as const) {
    await prisma.institution_memberships.create({
      data: { institutionId: institution.id, userId: account.id, role },
    })
  }
  const person = await prisma.institution_people.create({
    data: {
      institutionId: institution.id,
      key: 'original',
      internalId: 'OLD-001',
      normalizedInternalId: 'old-001',
      name: 'Same Name',
      email: original.email,
      userId: original.id,
    },
  })
  const otherPerson = await prisma.institution_people.create({
    data: {
      institutionId: institution.id,
      key: 'other',
      internalId: 'OTHER-001',
      normalizedInternalId: 'other-001',
      name: 'Same Name',
      email: other.email,
      userId: other.id,
    },
  })
  const scholar = await prisma.scholars.create({
    data: { name: 'Same Name', createdAt: new Date(), updatedAt: new Date() },
  })
  await prisma.institution_people.update({
    where: { id: person.id },
    data: { scholarId: scholar.id },
  })
  const paper = await prisma.papers.create({
    data: {
      title: 'Anonymous identity fixture',
      doi: `10.1234/identity-${key}`,
      normalized_doi: `10.1234/identity-${key}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  })
  const author = await prisma.authors.create({
    data: { name: 'Same Name', createdAt: new Date(), updatedAt: new Date() },
  })
  await prisma.paper_authors.create({ data: { paperId: paper.id, authorId: author.id, order: 1 } })
  await prisma.scholar_papers.create({ data: { paperId: paper.id, scholarId: scholar.id } })
  const binding = await prisma.institution_paper_author_bindings.create({
    data: {
      institutionId: institution.id,
      paperId: paper.id,
      authorId: author.id,
      personId: person.id,
      boundBy: owner.id,
    },
  })
  let profile = { internalId: 'NEW-001', email: original.email, name: 'Same Name' }
  let providerFailure = false
  let providerCalls = 0
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    providerCalls++
    if (providerFailure) return new Response('{}', { status: 401 })
    return new Response(
      JSON.stringify(
        String(input).endsWith('/token') ? { access_token: 'anonymous-provider-token' } : profile,
      ),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  })
  const deployment: DeploymentRuntimeConfig = {
    tenancyMode: 'single_institution',
    managementMode: 'self_hosted',
    contentAccess: 'authenticated',
    institution: { slug: institution.slug },
    auth: {
      enablePasswordSignin: false,
      enablePublicSignup: false,
      enableAiralogyOauth: false,
      enableInstitutionLogin: true,
      enableInstitutionProvisionLogin: false,
      enableInstitutionSso: true,
    },
    features: { aiChat: false, paperUpload: true, degreeTheses: true, forum: false },
    branding: {
      appName: 'Example Scholar',
      showBrandLogo: false,
      showInstitutionLogo: false,
      brandLogoUrl: null,
      institutionLogoUrl: null,
      institutionWatermarkUrl: null,
    },
    navigation: { defaultHomePath: '/papers' },
    paperLibrary: { defaultPath: '/papers', fixedInstitutionSlug: institution.slug },
    scholarTimeline: { generationMode: 'disabled' },
    institutionLogin: { institutionSlug: institution.slug },
    institutionSso: {
      type: 'oauth2',
      providerId: `test-${key}`,
      displayName: 'Example SSO',
      authorizationUrl: 'https://identity.example.invalid/authorize',
      tokenUrl: 'https://identity.example.invalid/token',
      userInfoUrl: 'https://identity.example.invalid/userinfo',
      clientId: 'example',
      clientSecret: 'example-secret',
      redirectUri: 'https://scholar.example.invalid/institution_sso_callback',
      scope: 'basic',
      internalIdField: 'internalId',
      emailField: 'email',
      nameField: 'name',
      userInfoTokenMode: 'bearer',
    },
  }
  const app = Fastify({ logger: false })
  await app.register(sensible)
  app.decorate('config', { JWT_SECRET } as never)
  app.decorate('deployment', deployment)
  app.decorate('prisma', prisma)
  app.setErrorHandler((error, _request, reply) => {
    const status = error.statusCode ?? (error.code === 'P2002' ? 409 : 500)
    reply
      .code(status)
      .send({ code: status, message: status === 500 ? 'Internal Server Error' : error.message })
  })
  await app.register(jwtPlugin)
  await app.register(authRoutes, { prefix: '/auth' })
  await app.register(identityAdminRoutes, { prefix: '/v1/institutions' })
  app.get('/protected-test', async (request) => ({ userId: request.user.userId }))
  await app.ready()
  t.after(async () => {
    await app.close()
  })
  const headers = (id: string) => ({
    authorization: `Bearer ${app.jwt.sign({ userId: id, token_type: 'access' })}`,
  })
  const base = `/v1/institutions/${institution.slug}/identity`
  const login = async () => {
    const state = new URL(createInstitutionSsoAuthorization(app)).searchParams.get('state')
    return app.inject({
      method: 'POST',
      url: '/auth/institution-sso/callback',
      payload: { code: 'test-code', state },
    })
  }
  const proof = async (): Promise<string> => {
    const response = await login()
    assert.equal(response.statusCode, 409, response.body)
    assert.equal(response.json().data.reason, 'institution_identity_conflict')
    return response.json().data.proofToken as string
  }
  const submit = async (proofToken: string, explanation = 'My institution changed my student ID') =>
    app.inject({
      method: 'POST',
      url: '/auth/institution-identity-requests',
      payload: { proofToken, previousInternalId: 'OLD-001', explanation, confirmsOwnAccount: true },
    })
  const add = async (value: string, personId = person.id, actor = owner.id) =>
    app.inject({
      method: 'POST',
      url: `${base}/people/${personId}/identifiers`,
      headers: headers(actor),
      payload: { value, notes: 'Verified against the institution register' },
    })
  const decision = async (
    requestId: string,
    action: string,
    personId = person.id,
    actor = owner.id,
    applicantMessage?: string,
  ) =>
    app.inject({
      method: 'POST',
      url: `${base}/requests/${requestId}/decision`,
      headers: headers(actor),
      payload: { action, personId, notes: 'Private administrator evidence', applicantMessage },
    })
  return {
    app,
    prisma,
    institution,
    deployment,
    owner,
    admin,
    member,
    platform,
    original,
    other,
    person,
    otherPerson,
    scholar,
    paper,
    binding,
    base,
    headers,
    login,
    proof,
    submit,
    add,
    decision,
    setProfile: (next: Partial<typeof profile>): void => {
      profile = { ...profile, ...next }
    },
    failProvider: (): void => {
      providerFailure = true
    },
    providerCalls: (): number => providerCalls,
  }
}

describe(
  'PostgreSQL institution identity verification',
  { skip: !databaseUrl, concurrency: false },
  () => {
    before(() => {
      assert.ok(databaseUrl)
      const url = new URL(databaseUrl)
      assert.ok(
        ['localhost', '127.0.0.1', '::1', '[::1]', 'postgres'].includes(url.hostname),
        'Identity tests require a local test database',
      )
      const directory = path.join(apiRoot, 'prisma/migrations')
      const migrations = readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
      const sql = migrations
        .map((name) => readFileSync(path.join(directory, name, 'migration.sql'), 'utf8'))
        .join('\n')
      executeSql(`CREATE SCHEMA "${schema}"; SET search_path TO "${schema}", public;\n${sql}`)
      prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: databaseUrl }, { schema }),
      })
    })
    after(async () => {
      await prisma?.$disconnect()
      if (databaseUrl && /^scholar_identity_test_[0-9a-f]{16}$/.test(schema))
        executeSql(`DROP SCHEMA IF EXISTS "${schema}" CASCADE;`)
    })

    test('SSO email conflicts issue only a limited proof; names do not link accounts', async (t) => {
      const f = await fixture(t)
      const beforeCount = await prisma.users.count()
      const proofToken = await f.proof()
      assert.equal(proofToken.length, 43)
      assert.equal(await prisma.users.count(), beforeCount)
      const status = await f.app.inject({
        method: 'POST',
        url: '/auth/institution-identity-requests/status',
        payload: { proofToken },
      })
      assert.deepEqual(status.json(), { code: 0, data: { internalId: 'NEW-001', request: null } })
      assert.equal(
        (
          await f.app.inject({
            url: '/protected-test',
            headers: { authorization: `Bearer ${proofToken}` },
          })
        ).statusCode,
        401,
      )
      f.setProfile({ internalId: 'DISTINCT', email: `distinct-${randomUUID()}@example.invalid` })
      const separate = await f.login()
      assert.equal(separate.statusCode, 200, separate.body)
      const separateUser = f.app.jwt.verify<{ userId: string }>(separate.json().access_token)
      assert.notEqual(separateUser.userId, f.original.id)
    })

    test('approved IDs sign in to the original account without changing canonical IDs, papers or permissions', async (t) => {
      const f = await fixture(t)
      const token = await f.proof()
      const submitted = await f.submit(token)
      assert.equal(submitted.statusCode, 200, submitted.body)
      const id = submitted.json().data.request.id as string
      const approved = await f.decision(id, 'approve')
      assert.equal(approved.statusCode, 200, approved.body)
      for (const internalId of ['NEW-001', ' old-001 ', 'NEW-001']) {
        f.setProfile({ internalId })
        const response = await f.login()
        assert.equal(response.statusCode, 200, response.body)
        assert.equal(
          f.app.jwt.verify<{ userId: string }>(response.json().access_token).userId,
          f.original.id,
        )
      }
      const person = await prisma.institution_people.findUniqueOrThrow({
        where: { id: f.person.id },
      })
      assert.equal(person.internalId, 'OLD-001')
      assert.equal(person.scholarId, f.scholar.id)
      assert.equal(
        (
          await prisma.institution_paper_author_bindings.findUniqueOrThrow({
            where: { id: f.binding.id },
          })
        ).personId,
        person.id,
      )
      assert.equal(
        await prisma.scholar_papers.count({
          where: { scholarId: f.scholar.id, paperId: f.paper.id },
        }),
        1,
      )
      assert.equal(
        (
          await prisma.institution_memberships.findUniqueOrThrow({
            where: {
              institutionId_userId: { institutionId: f.institution.id, userId: f.original.id },
            },
          })
        ).role,
        'member',
      )
      assert.equal(
        await prisma.user_external_identities.count({
          where: { userId: f.original.id, provider: f.deployment.institutionSso.providerId },
        }),
        1,
      )
      assert.equal(
        (
          await resolveInstitutionPerson(prisma, f.institution.id, {
            institutionInternalId: 'new-001',
          })
        )?.id,
        person.id,
      )
      await upsertInstitutionPerson(prisma, {
        institutionId: f.institution.id,
        internalId: 'NEW-001',
        name: person.name,
        source: 'test_import',
      })
      assert.equal(
        (await prisma.institution_people.findUniqueOrThrow({ where: { id: person.id } }))
          .internalId,
        'OLD-001',
      )
    })

    test('concurrent applicant submissions are deduplicated and cannot set verified identity fields', async (t) => {
      const f = await fixture(t)
      const token = await f.proof()
      const responses = await Promise.all([f.submit(token), f.submit(token), f.submit(token)])
      for (const response of responses) assert.equal(response.statusCode, 200, response.body)
      assert.equal(new Set(responses.map((response) => response.json().data.request.id)).size, 1)
      assert.equal(
        await prisma.institution_identity_requests.count({
          where: { institutionId: f.institution.id },
        }),
        1,
      )
      assert.equal(
        await prisma.institution_identity_events.count({
          where: { institutionId: f.institution.id, action: 'applicant_submitted' },
        }),
        1,
      )
      const forged = await f.app.inject({
        method: 'POST',
        url: '/auth/institution-identity-requests',
        payload: {
          proofToken: token,
          previousInternalId: 'OLD-001',
          explanation: 'test',
          confirmsOwnAccount: false,
          internalId: 'VICTIM',
        },
      })
      assert.equal(forged.statusCode, 400)
      const saved = await prisma.institution_identity_requests.findFirstOrThrow({
        where: { institutionId: f.institution.id },
      })
      assert.equal(saved.internalId, 'NEW-001')
      assert.equal(saved.email, f.original.email)
    })

    test('more-information and rejected outcomes remain private and can be revisited after fresh SSO', async (t) => {
      const f = await fixture(t)
      const token = await f.proof()
      const submitted = await f.submit(token)
      const id = submitted.json().data.request.id as string
      assert.equal(
        (
          await f.decision(
            id,
            'request_information',
            f.person.id,
            f.owner.id,
            'Please explain the change',
          )
        ).statusCode,
        200,
      )
      const nextToken = await f.proof()
      const status = await f.app.inject({
        method: 'POST',
        url: '/auth/institution-identity-requests/status',
        payload: { proofToken: nextToken },
      })
      assert.equal(status.json().data.request.status, 'needs_information')
      assert.equal(status.json().data.request.applicantMessage, 'Please explain the change')
      assert.ok(!status.body.includes('Private administrator evidence'))
      assert.ok(!status.body.includes(f.owner.id))
      assert.equal(
        (await f.submit(nextToken, 'Supplemented explanation')).json().data.request.id,
        id,
      )
      assert.equal(
        (await f.decision(id, 'reject', f.person.id, f.owner.id, 'The records do not match'))
          .statusCode,
        200,
      )
      const rejected = await f.app.inject({
        method: 'POST',
        url: '/auth/institution-identity-requests/status',
        payload: { proofToken: nextToken },
      })
      assert.equal(rejected.json().data.request.status, 'rejected')
      assert.equal(
        await prisma.institution_person_identifiers.count({
          where: { institutionId: f.institution.id, normalizedValue: 'new-001' },
        }),
        0,
      )
    })

    test('only scoped owners and platform administrators manage identifiers or review requests', async (t) => {
      const f = await fixture(t)
      const token = await f.proof()
      const id = (await f.submit(token)).json().data.request.id as string
      for (const actor of [f.admin.id, f.member.id, f.other.id]) {
        assert.equal((await f.add('NEW-001', f.person.id, actor)).statusCode, 403)
        assert.equal((await f.decision(id, 'approve', f.person.id, actor)).statusCode, 403)
        assert.equal(
          (await f.app.inject({ url: `${f.base}/requests`, headers: f.headers(actor) })).statusCode,
          403,
        )
      }
      assert.equal((await f.app.inject({ url: `${f.base}/requests` })).statusCode, 401)
      assert.equal(
        (
          await f.app.inject({
            url: '/v1/institutions/other/identity/requests',
            headers: f.headers(f.platform.id),
          })
        ).statusCode,
        404,
      )
      assert.equal((await f.add('NEW-001', randomUUID(), f.platform.id)).statusCode, 404)
      const integration = f.app.jwt.sign({ userId: f.owner.id, token_type: 'integration' })
      assert.equal(
        (
          await f.app.inject({
            url: `${f.base}/requests`,
            headers: { authorization: `Bearer ${integration}` },
          })
        ).statusCode,
        403,
      )
      assert.equal(
        (
          await f.app.inject({
            method: 'POST',
            url: '/auth/institution-identity-requests/status',
            headers: { authorization: `Bearer ${integration}` },
            payload: { proofToken: token },
          })
        ).statusCode,
        403,
      )
      assert.equal((await f.decision(id, 'approve', f.person.id, f.platform.id)).statusCode, 200)
    })

    test('invalid proofs, expired proofs and unsuccessful SSO never grant a verification request', async (t) => {
      const f = await fixture(t)
      assert.equal((await f.submit('A'.repeat(43))).statusCode, 401)
      const token = await f.proof()
      await prisma.institution_identity_challenges.updateMany({
        where: { institutionId: f.institution.id },
        data: { expiresAt: new Date(0) },
      })
      assert.equal((await f.submit(token)).statusCode, 401)
      const beforeCalls = f.providerCalls()
      const badState = await f.app.inject({
        method: 'POST',
        url: '/auth/institution-sso/callback',
        payload: { code: 'test', state: 'not-signed' },
      })
      assert.notEqual(badState.statusCode, 409)
      assert.equal(f.providerCalls(), beforeCalls)
      f.failProvider()
      const failed = await f.login()
      assert.notEqual(failed.statusCode, 409)
      assert.ok(!failed.body.includes('proofToken'))
    })

    test('reserved IDs cannot move between people, including concurrent aliases and direct inserts', async (t) => {
      const f = await fixture(t)
      const responses = await Promise.all([
        f.add('SHARED', f.person.id),
        f.add('SHARED', f.otherPerson.id),
      ])
      assert.deepEqual(responses.map((response) => response.statusCode).sort(), [200, 409])
      assert.equal((await f.add('OTHER-001')).statusCode, 409)
      await assert.rejects(
        prisma.institution_people.create({
          data: {
            institutionId: f.institution.id,
            key: 'collision',
            internalId: 'SHARED',
            normalizedInternalId: 'shared',
            name: 'No automatic merge',
          },
        }),
      )
      assert.equal(
        await prisma.institution_people.count({ where: { institutionId: f.institution.id } }),
        2,
      )
    })

    test('revocation invalidates identity-bound sessions; restoration cannot revive old tokens', async (t) => {
      const f = await fixture(t)
      assert.equal((await f.add('NEW-001')).statusCode, 200)
      const signedIn = await f.login()
      assert.equal(signedIn.statusCode, 200, signedIn.body)
      const token = signedIn.json().access_token as string
      const privateHeaders = { authorization: `Bearer ${token}` }
      assert.equal(
        (await f.app.inject({ url: '/protected-test', headers: privateHeaders })).statusCode,
        200,
      )
      const identifier = await prisma.institution_person_identifiers.findUniqueOrThrow({
        where: {
          institutionId_normalizedValue: {
            institutionId: f.institution.id,
            normalizedValue: 'new-001',
          },
        },
      })
      const revoke = await f.app.inject({
        method: 'POST',
        url: `${f.base}/people/${f.person.id}/identifiers/${identifier.id}/revoke`,
        headers: f.headers(f.owner.id),
        payload: { notes: 'Institution withdrew this ID' },
      })
      assert.equal(revoke.statusCode, 200, revoke.body)
      assert.equal(
        (await f.app.inject({ url: '/protected-test', headers: privateHeaders })).statusCode,
        401,
      )
      const denied = await f.login()
      assert.equal(denied.statusCode, 409)
      assert.ok(!denied.body.includes('proofToken'))
      assert.equal((await f.add('NEW-001', f.otherPerson.id)).statusCode, 409)
      assert.equal((await f.add('NEW-001')).statusCode, 200)
      assert.equal(
        (await f.app.inject({ url: '/protected-test', headers: privateHeaders })).statusCode,
        401,
      )
      assert.equal((await f.login()).statusCode, 200)
      assert.equal(
        (await f.app.inject({ url: '/protected-test', headers: f.headers(f.original.id) }))
          .statusCode,
        200,
      )
      assert.equal(
        await prisma.institution_paper_author_bindings.count({ where: { personId: f.person.id } }),
        1,
      )
    })

    test('a revoked canonical login does not disable another verified ID or rewrite the canonical ID', async (t) => {
      const f = await fixture(t)
      await f.add('NEW-001')
      const identifier = await prisma.institution_person_identifiers.findFirstOrThrow({
        where: { personId: f.person.id, isPrimary: true },
      })
      await f.app.inject({
        method: 'POST',
        url: `${f.base}/people/${f.person.id}/identifiers/${identifier.id}/revoke`,
        headers: f.headers(f.owner.id),
        payload: { notes: 'Old enrolment ended' },
      })
      const login = await f.login()
      assert.equal(login.statusCode, 200, login.body)
      assert.equal(
        (await prisma.institution_people.findUniqueOrThrow({ where: { id: f.person.id } }))
          .internalId,
        'OLD-001',
      )
      f.setProfile({ internalId: 'OLD-001' })
      assert.equal((await f.login()).statusCode, 409)
    })

    test('person writers wait for the identity lock before locking the same row as SSO', async (t) => {
      const f = await fixture(t)
      let loginHasLock: () => void = () => {}
      const acquired = new Promise<void>((resolve) => {
        loginHasLock = resolve
      })
      let writerStarted: (pid: number) => void = () => {}
      const writerPid = new Promise<number>((resolve) => {
        writerStarted = resolve
      })
      const login = prisma.$transaction(
        async (tx) => {
          await lockMutationScope(tx, 'institution-identity', f.institution.id)
          loginHasLock()
          const pid = await writerPid
          let waiting = false
          const deadline = Date.now() + 4000
          while (Date.now() < deadline) {
            const states = await prisma.$queryRawUnsafe<Array<{ wait_event: string | null }>>(
              'SELECT wait_event FROM pg_stat_activity WHERE pid = $1',
              pid,
            )
            if (states[0]?.wait_event === 'advisory') {
              waiting = true
              break
            }
            await new Promise((resolve) => setTimeout(resolve, 10))
          }
          assert.ok(waiting, 'Concurrent writer must wait on the advisory lock')
          // This row update would deadlock if the other writer already held its row lock.
          return upsertInstitutionPerson(tx, {
            institutionId: f.institution.id,
            internalId: 'OLD-001',
            name: 'Same Name',
            userId: f.original.id,
            source: 'institution_sso',
          })
        },
        { timeout: 10000 },
      )
      await acquired
      const writer = prisma.$transaction(
        async (tx) => {
          const [{ pid }] = await tx.$queryRawUnsafe<Array<{ pid: number }>>(
            'SELECT pg_backend_pid() AS pid',
          )
          writerStarted(pid)
          return upsertInstitutionPerson(tx, {
            institutionId: f.institution.id,
            internalId: 'OLD-001',
            name: 'Same Name',
            userId: f.original.id,
            source: 'membership_assignment',
          })
        },
        { timeout: 10000 },
      )
      const results = await Promise.all([login, writer])
      assert.ok(results.every((person) => person.id === f.person.id))
    })

    test('competing approval decisions cannot both win', async (t) => {
      const f = await fixture(t)
      const id = (await f.submit(await f.proof())).json().data.request.id as string
      const decisions = await Promise.all([
        f.decision(id, 'approve'),
        f.decision(id, 'reject', f.person.id, f.owner.id, 'Rejected after review'),
      ])
      assert.deepEqual(decisions.map((response) => response.statusCode).sort(), [200, 409])
      const saved = await prisma.institution_identity_requests.findUniqueOrThrow({ where: { id } })
      assert.equal(
        await prisma.institution_person_identifiers.count({
          where: { institutionId: f.institution.id, normalizedValue: 'new-001' },
        }),
        saved.status === 'approved' ? 1 : 0,
      )
    })

    test('imports cannot replace an account-linked canonical ID through another matching anchor', async (t) => {
      const f = await fixture(t)
      await assert.rejects(
        upsertInstitutionPerson(prisma, {
          institutionId: f.institution.id,
          internalId: 'UNVERIFIED',
          name: 'Same Name',
          scholarId: f.scholar.id,
          source: 'institution_import',
        }),
        /verified alias/,
      )
      assert.equal(
        (await prisma.institution_people.findUniqueOrThrow({ where: { id: f.person.id } }))
          .internalId,
        'OLD-001',
      )
      assert.equal(
        await prisma.institution_person_identifiers.count({ where: { personId: f.person.id } }),
        1,
      )
    })

    test('verified proofs are scoped to the configured institution and provider, and new requests are capped', async (t) => {
      const f = await fixture(t)
      const token = await f.proof()
      const providerId = f.deployment.institutionSso.providerId
      f.deployment.institutionSso.providerId = 'different-provider'
      assert.equal((await f.submit(token)).statusCode, 401)
      f.deployment.institutionSso.providerId = providerId
      const g = await fixture(t)
      assert.equal((await g.submit(token)).statusCode, 401)
      for (let i = 0; i < 3; i++) {
        const response = await f.submit(token)
        assert.equal(response.statusCode, 200, response.body)
        assert.equal(
          (
            await f.decision(
              response.json().data.request.id,
              'reject',
              f.person.id,
              f.owner.id,
              'Please recheck',
            )
          ).statusCode,
          200,
        )
      }
      assert.equal((await f.submit(token)).statusCode, 429)
    })

    test('owners cannot verify their own alias or a platform account; resolved submission retries are harmless', async (t) => {
      const f = await fixture(t)
      const ownPerson = await prisma.institution_people.create({
        data: {
          institutionId: f.institution.id,
          key: 'owner',
          internalId: 'OWNER',
          normalizedInternalId: 'owner',
          name: 'Owner',
          userId: f.owner.id,
        },
      })
      const platformPerson = await prisma.institution_people.create({
        data: {
          institutionId: f.institution.id,
          key: 'platform',
          internalId: 'PLATFORM',
          normalizedInternalId: 'platform',
          name: 'Platform',
          userId: f.platform.id,
        },
      })
      assert.equal((await f.add('OWN-NEW', ownPerson.id)).statusCode, 403)
      assert.equal((await f.add('PLATFORM-NEW', platformPerson.id)).statusCode, 403)
      const token = await f.proof()
      const id = (await f.submit(token)).json().data.request.id
      assert.equal((await f.decision(id, 'approve')).statusCode, 200)
      const retried = await f.submit(token)
      assert.equal(retried.json().data.request.id, id)
      assert.equal(retried.json().data.request.status, 'approved')
      assert.equal(
        await prisma.institution_identity_requests.count({
          where: { institutionId: f.institution.id },
        }),
        1,
      )
      const status = await f.app.inject({
        method: 'POST',
        url: '/auth/institution-identity-requests/status',
        payload: { proofToken: token },
      })
      assert.equal(status.headers['cache-control'], 'no-store')
    })
  },
)
