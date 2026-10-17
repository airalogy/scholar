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
import { directoryRoutes } from '../src/routes/v1/institutions/routes.directory'
import { reviewGovernanceRoutes } from '../src/routes/v1/institutions/routes.review-governance'
import reviewRoutes from '../src/routes/v1/reviews'
import { submitReviewCase, decideReviewCase } from '../src/review/service'
import { lockMutationScope } from '../src/utils/advisory-lock'
import { claimInboxEvents, deliverInboxEvent } from '../src/integrations/task-inbox/outbox'
import { publicReviewMaterial } from '../src/review/queries'
import { Check } from 'typebox/value'
import { DirectoryRowSchema } from '../src/directory/schema'
import { exceedsDeactivationLimit } from '../src/directory/policy'
import { eligibleGrantPeople } from '../src/review/authorization'
import { executeNextReviewChange } from '../src/review/execution'
import { applyPaperBibliography } from '../src/bibliography/apply'
import { createPaper } from '../src/routes/papers/service.create'

const databaseUrl = process.env.GOVERNANCE_TEST_DATABASE_URL
const schemaName = `scholar_governance_test_${randomBytes(8).toString('hex')}`
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let prisma: PrismaClient
const sql = (input: string): void => {
  execFileSync('pnpm', ['exec', 'prisma', 'db', 'execute', '--stdin'], {
    cwd: root,
    input,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

test('directory contract rejects privileges and non-boolean state; safety threshold counts departures', () => {
  const row = {
    kind: 'person',
    externalId: 'opaque-1',
    name: 'Example Person',
    identifiers: ['EMP-1'],
    category: 'staff',
    status: 'active',
  }
  assert.equal(Check(DirectoryRowSchema, row), true)
  assert.equal(Check(DirectoryRowSchema, { ...row, can_review_content: true }), false)
  assert.equal(
    Check(DirectoryRowSchema, { kind: 'unit', externalId: 'u', name: 'Unit', active: 1 }),
    false,
  )
  assert.equal(exceedsDeactivationLimit(10, 2, 10), true)
  assert.equal(exceedsDeactivationLimit(10, 1, 10), false)
  assert.equal(exceedsDeactivationLimit(0, 0, 10), false)
  assert.deepEqual(
    publicReviewMaterial({
      title: 'Safe',
      student_id: 'PRIVATE',
      email: 'private@example.invalid',
      fileId: null,
    }),
    { title: 'Safe', fileId: null },
  )
})

const fixture = async (t: TestContext) => {
  const suffix = randomBytes(6).toString('hex')
  const institution = await prisma.institutions.create({
    data: { name: 'Example University', slug: `governance-${suffix}` },
  })
  const user = async (name: string, role = 'member') =>
    prisma.users.create({
      data: {
        name,
        username: `${name}-${suffix}`,
        email: `${name}-${suffix}@example.invalid`,
        platform_role: role,
      },
    })
  const owner = await user('owner')
  const member = await user('member')
  const platform = await user('platform', 'platform_admin')
  for (const [account, role] of [
    [owner, 'owner'],
    [member, 'member'],
  ] as const)
    await prisma.institution_memberships.create({
      data: { institutionId: institution.id, userId: account.id, role },
    })
  const app = Fastify({ logger: false })
  await app.register(sensible)
  app.decorate('prisma', prisma)
  app.decorate('config', {
    JWT_SECRET: 'governance-test-secret-longer-than-thirty-two-characters',
    REVIEW_INBOX_URL: 'https://adapter.example.invalid/events',
    REVIEW_INBOX_SECRET: 'governance-inbox-signing-secret-longer-than-thirty-two-characters',
    REVIEW_PUBLIC_ORIGIN: 'https://scholar.example.invalid',
  } as never)
  app.decorate('deployment', {
    institution: { slug: institution.slug },
    contentAccess: 'public',
    managementMode: 'self_hosted',
  } as never)
  await app.register(jwtPlugin)
  await app.register(directoryRoutes, { prefix: '/v1/institutions' })
  await app.register(reviewGovernanceRoutes, { prefix: '/v1/institutions' })
  await app.register(reviewRoutes, { prefix: '/v1/reviews' })
  await app.ready()
  t.after(async () => app.close())
  const token = (id: string): string => app.jwt.sign({ userId: id })
  const base = `/v1/institutions/${institution.slug}`
  const post = async (
    url: string,
    payload: object,
    actor = owner.id,
    extra: Record<string, string> = {},
  ) =>
    app.inject({
      method: 'POST',
      url,
      payload,
      headers: { authorization: `Bearer ${token(actor)}`, ...extra },
    })
  const settings = {
    key: 'directory',
    name: 'Example Directory',
    enabled: true,
    authoritative: true,
    deactivateMissing: false,
    maxDeactivationPercent: 10,
    expectedIntervalHours: 24,
  }
  const created = await post(`${base}/directory/sources`, settings)
  assert.equal(created.statusCode, 200, created.body)
  const source = created.json().data as { id: string }
  let sequence = 0
  const stage = async (rows: object[], mode = 'incremental') => {
    const result = await post(
      `${base}/directory/sources/${source.id}/runs`,
      { sequence: ++sequence, mode, expectedPages: 1, expectedRows: rows.length },
      owner.id,
      { 'idempotency-key': `run-${sequence}` },
    )
    assert.equal(result.statusCode, 200, result.body)
    const run = result.json().data as { id: string }
    const url = `${base}/directory/sources/${source.id}/runs/${run.id}`
    const page = await app.inject({
      method: 'PUT',
      url: `${url}/pages/1`,
      headers: { authorization: `Bearer ${token(owner.id)}` },
      payload: { rows },
    })
    assert.equal(page.statusCode, 200, page.body)
    return { run, url }
  }
  const sync = async (rows: object[], mode = 'incremental') => {
    const { run, url } = await stage(rows, mode)
    const preview = await post(`${url}/validate`, {})
    assert.equal(preview.statusCode, 200, preview.body)
    const applied = await post(`${url}/apply`, {
      confirmDeactivation: true,
      notes: 'Verified synthetic snapshot',
    })
    assert.equal(applied.statusCode, 200, applied.body)
    return run
  }
  return {
    app,
    institution,
    owner,
    member,
    platform,
    user,
    token,
    base,
    post,
    source,
    settings,
    stage,
    sync,
  }
}

const personRow = (id: string, status = 'active') => ({
  kind: 'person',
  externalId: id,
  name: 'Same Name',
  identifiers: [id],
  category: 'staff',
  status,
})

describe(
  'PostgreSQL directory and review governance',
  { skip: !databaseUrl, concurrency: false },
  () => {
    before(() => {
      assert.ok(databaseUrl)
      assert.ok(
        ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(new URL(databaseUrl).hostname),
        'Use a disposable local PostgreSQL database',
      )
      const directory = path.join(root, 'prisma/migrations')
      const migrations = readdirSync(directory, { withFileTypes: true })
        .filter((item) => item.isDirectory())
        .map((item) => item.name)
        .sort()
      sql(
        `CREATE SCHEMA "${schemaName}"; SET search_path TO "${schemaName}", public;\n${migrations.map((name) => readFileSync(path.join(directory, name, 'migration.sql'), 'utf8')).join('\n')}`,
      )
      prisma = new PrismaClient({
        adapter: new PrismaPg(
          { connectionString: databaseUrl, options: `-c search_path=${schemaName},public` },
          { schema: schemaName },
        ),
      })
    })
    after(async () => {
      await prisma?.$disconnect()
      if (databaseUrl && /^scholar_governance_test_[0-9a-f]{16}$/.test(schemaName))
        sql(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`)
    })

    test('directory staging, preview, stable identities and partial snapshots never grant review rights', async (t) => {
      const f = await fixture(t)
      const rejected = await f.post(`${f.base}/directory/sources`, f.settings, f.member.id)
      assert.equal(rejected.statusCode, 403)
      const { url } = await f.stage([personRow('A'), personRow('B')], 'full')
      const preview = await f.post(`${url}/validate`, {})
      assert.equal(preview.statusCode, 200, preview.body)
      assert.equal(
        await prisma.institution_people.count({ where: { institutionId: f.institution.id } }),
        0,
      )
      assert.equal((await f.post(`${url}/apply`, {})).statusCode, 200)
      const before = await prisma.institution_people.findMany({
        where: { institutionId: f.institution.id },
        orderBy: { internalId: 'asc' },
      })
      assert.equal(before.length, 2)
      assert.equal(before[0]!.userId, null)
      assert.equal(
        await prisma.institution_reviewer_grants.count({
          where: { institutionId: f.institution.id },
        }),
        0,
      )
      await f.sync([{ ...personRow('A'), identifiers: ['A-NEW', 'A'] }], 'full')
      const after = await prisma.institution_people.findUniqueOrThrow({
        where: { id: before[0]!.id },
        include: { identifiers: true },
      })
      assert.equal(after.id, before[0]!.id)
      assert.equal(after.internalId, 'A')
      assert.equal(after.identifiers.length, 2)
      assert.equal(
        (await prisma.institution_people.findUniqueOrThrow({ where: { id: before[1]!.id } }))
          .is_active,
        true,
      )
    })

    test('incomplete snapshots, duplicate identities and stale sequences cannot change personnel', async (t) => {
      const f = await fixture(t)
      await f.sync([personRow('A')], 'full')
      const begin = await f.post(
        `${f.base}/directory/sources/${f.source.id}/runs`,
        { sequence: 100, mode: 'full', expectedPages: 2, expectedRows: 1 },
        f.owner.id,
        { 'idempotency-key': 'incomplete' },
      )
      const url = `${f.base}/directory/sources/${f.source.id}/runs/${begin.json().data.id}`
      assert.equal((await f.post(`${url}/validate`, {})).statusCode, 409)
      const conflict = await f.stage([personRow('X'), { ...personRow('Y'), identifiers: ['X'] }])
      assert.equal((await f.post(`${conflict.url}/validate`, {})).statusCode, 409)
      assert.equal(
        await prisma.institution_people.count({ where: { institutionId: f.institution.id } }),
        1,
      )
      const stale = await f.post(
        `${f.base}/directory/sources/${f.source.id}/runs`,
        { sequence: 1, mode: 'full', expectedPages: 1, expectedRows: 0 },
        f.owner.id,
        { 'idempotency-key': 'stale' },
      )
      assert.equal(stale.statusCode, 409)
    })

    test('mass deactivation needs human confirmation; departure blocks legacy JWT and reentry does not restore grants', async (t) => {
      const f = await fixture(t)
      await f.sync([personRow('A')], 'full')
      const person = await prisma.institution_people.findFirstOrThrow({
        where: { institutionId: f.institution.id },
      })
      await prisma.institution_people.update({
        where: { id: person.id },
        data: { userId: f.member.id },
      })
      await prisma.institution_reviewer_grants.create({
        data: {
          institutionId: f.institution.id,
          personId: person.id,
          role: 'library_final',
          grantedBy: f.owner.id,
          notes: 'Explicit test grant',
        },
      })
      await f.post(`${f.base}/directory/sources`, { ...f.settings, deactivateMissing: true })
      const { url } = await f.stage([], 'full')
      const preview = await f.post(`${url}/validate`, {})
      assert.equal(preview.json().data.status, 'needs_confirmation', preview.body)
      assert.equal((await f.post(`${url}/apply`, {})).statusCode, 409)
      assert.equal(
        (
          await f.post(`${url}/apply`, {
            confirmDeactivation: true,
            notes: 'Confirmed complete snapshot',
          })
        ).statusCode,
        200,
      )
      const denied = await f.app.inject({
        url: '/v1/reviews/tasks',
        headers: { authorization: `Bearer ${f.token(f.member.id)}` },
      })
      assert.equal(denied.statusCode, 403, denied.body)
      await f.sync([personRow('A')])
      assert.equal(
        await prisma.institution_reviewer_grants.count({
          where: { personId: person.id, revokedAt: null },
        }),
        0,
      )
      assert.equal(await prisma.users.count({ where: { id: f.member.id } }), 1)
    })

    test('strict admission refuses to strand existing reviewers and never admits a manual-only identity', async (t) => {
      const f = await fixture(t)
      await f.sync([personRow('ADMITTED')], 'full')
      const admitted = await prisma.institution_people.findFirstOrThrow({
        where: { institutionId: f.institution.id },
      })
      const manual = await prisma.institution_people.create({
        data: {
          institutionId: f.institution.id,
          key: 'manual',
          internalId: 'MANUAL',
          normalizedInternalId: 'manual',
          name: 'Manual Person',
          userId: f.member.id,
        },
      })
      const grant = async (personId: string) =>
        f.post(`${f.base}/review-governance/grants`, {
          personId,
          role: 'library_final',
          startsAt: new Date(Date.now() - 1000).toISOString(),
          endsAt: null,
          notes: 'Explicit final reviewer',
        })
      assert.equal((await grant(manual.id)).statusCode, 200)
      const workflow = await f.app.inject({
        method: 'PUT',
        url: `${f.base}/review-governance/workflows/paper`,
        headers: { authorization: `Bearer ${f.token(f.owner.id)}` },
        payload: {
          name: 'Final review',
          steps: [
            { name: 'Final', groups: [{ kind: 'role', role: 'library_final' }], deadlineHours: 24 },
          ],
        },
      })
      assert.equal(workflow.statusCode, 200, workflow.body)
      const enable = async () =>
        f.app.inject({
          method: 'PUT',
          url: `${f.base}/directory/policy`,
          headers: { authorization: `Bearer ${f.token(f.platform.id)}` },
          payload: {
            admissionMode: 'directory',
            requireAppointment: false,
            notes: 'Verified readiness',
          },
        })
      const blocked = await enable()
      assert.equal(blocked.statusCode, 409, blocked.body)
      assert.equal(
        await prisma.institution_directory_policies.findUnique({
          where: { institutionId: f.institution.id },
        }),
        null,
      )
      assert.equal((await grant(admitted.id)).statusCode, 200)
      const enabled = await enable()
      assert.equal(enabled.statusCode, 200, enabled.body)
      assert.deepEqual(
        (await eligibleGrantPeople(prisma, f.institution.id, 'library_final', null)).map(
          (person) => person.id,
        ),
        [admitted.id],
      )
      const denied = await f.app.inject({
        url: '/v1/reviews/tasks',
        headers: { authorization: `Bearer ${f.token(f.member.id)}` },
      })
      assert.equal(denied.statusCode, 403, denied.body)
    })

    test('source credentials cannot cross sources, change admission policy, or approve tasks', async (t) => {
      const f = await fixture(t)
      const credential = await prisma.institution_api_credentials.create({
        data: {
          institutionId: f.institution.id,
          directorySourceId: f.source.id,
          name: 'Directory connector',
          clientId: randomUUID(),
          secretHash: 'not-used',
          scopes: ['directory:sync'],
          expiresAt: new Date(Date.now() + 3600000),
          createdBy: f.owner.id,
        },
      })
      const token = f.app.jwt.sign({
        userId: f.owner.id,
        token_type: 'integration',
        credentialId: credential.id,
        institutionId: f.institution.id,
        credentialVersion: 1,
        scopes: ['directory:sync'],
      })
      const headers = { authorization: `Bearer ${token}` }
      assert.equal((await f.app.inject({ url: '/v1/reviews/tasks', headers })).statusCode, 403)
      assert.equal(
        (
          await f.app.inject({
            method: 'PUT',
            url: `${f.base}/directory/policy`,
            headers,
            payload: {
              admissionMode: 'directory',
              requireAppointment: false,
              notes: 'Not allowed',
            },
          })
        ).statusCode,
        403,
      )
      const source2 = await f.post(`${f.base}/directory/sources`, { ...f.settings, key: 'second' })
      const denied = await f.app.inject({
        method: 'POST',
        url: `${f.base}/directory/sources/${source2.json().data.id}/runs`,
        headers: { ...headers, 'idempotency-key': 'foreign-source' },
        payload: { sequence: 1, mode: 'full', expectedPages: 1, expectedRows: 0 },
      })
      assert.equal(denied.statusCode, 403, denied.body)
    })

    test('parallel author tasks require every author; final grant revocation, versioning and outbox are enforced', async (t) => {
      const f = await fixture(t)
      await f.sync([personRow('AUTHOR-A'), personRow('AUTHOR-B'), personRow('LIBRARY')])
      const people = await prisma.institution_people.findMany({
        where: { institutionId: f.institution.id },
        orderBy: { internalId: 'asc' },
      })
      const authorA = await f.user('author-a')
      const authorB = await f.user('author-b')
      const librarian = await f.user('librarian')
      for (const [person, user] of [
        [people[0]!, authorA],
        [people[1]!, authorB],
        [people[2]!, librarian],
      ] as const)
        await prisma.institution_people.update({
          where: { id: person.id },
          data: { userId: user.id },
        })
      const grant = await f.post(`${f.base}/review-governance/grants`, {
        personId: people[2]!.id,
        role: 'library_final',
        startsAt: new Date(Date.now() - 1000).toISOString(),
        endsAt: null,
        notes: 'Library final reviewer',
      })
      assert.equal(grant.statusCode, 200, grant.body)
      const workflow = await f.app.inject({
        method: 'PUT',
        url: `${f.base}/review-governance/workflows/paper`,
        headers: { authorization: `Bearer ${f.token(f.owner.id)}` },
        payload: {
          name: 'Parallel confirmation',
          steps: [
            { name: 'Authors', groups: [{ kind: 'authors' }], deadlineHours: 24 },
            { name: 'Final', groups: [{ kind: 'role', role: 'library_final' }], deadlineHours: 24 },
          ],
        },
      })
      assert.equal(workflow.statusCode, 200, workflow.body)
      const paper = await prisma.papers.create({
        data: {
          title: 'Synthetic review paper',
          doi: '',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      })
      const claimId = randomUUID()
      const submission = await prisma.paper_submissions.create({
        data: {
          paperId: paper.id,
          institutionId: f.institution.id,
          userId: authorA.id,
          metadata_snapshot: { title: paper.title },
        },
      })
      const review = await prisma.content_review_cases.create({
        data: {
          institutionId: f.institution.id,
          content_type: 'paper',
          subjectId: claimId,
          submittedBy: authorA.id,
          currentVersionId: submission.id,
        },
      })
      await prisma.paper_claims.create({
        data: {
          id: claimId,
          institutionId: f.institution.id,
          paperId: paper.id,
          submittedBy: authorA.id,
          reviewCaseId: review.id,
          submissionId: submission.id,
        },
      })
      for (const person of people.slice(0, 2)) {
        const author = await prisma.authors.create({
          data: { name: person.name, createdAt: new Date(), updatedAt: new Date() },
        })
        await prisma.institution_paper_author_bindings.create({
          data: {
            institutionId: f.institution.id,
            paperId: paper.id,
            authorId: author.id,
            personId: person.id,
            boundBy: f.owner.id,
          },
        })
      }
      await prisma.$transaction((tx) =>
        submitReviewCase(f.app, tx, {
          caseId: review.id,
          actorId: authorA.id,
          versionId: submission.id,
        }),
      )
      const missingAuthor = await prisma.content_review_tasks.findFirstOrThrow({
        where: { kind: 'author', step: { caseId: review.id } },
      })
      assert.ok(missingAuthor.exception)
      const verified = await f.post(`${f.base}/review-governance/cases/${review.id}/participants`, {
        versionId: submission.id,
        personIds: people.slice(0, 2).map((person) => person.id),
        nodeIds: [],
        notes: 'All institution authors checked against this paper',
      })
      assert.equal(verified.statusCode, 200, verified.body)
      const tasks = await prisma.content_review_tasks.findMany({
        where: { step: { caseId: review.id, roundNumber: 2 } },
        include: { step: true },
      })
      const taskA = tasks.find((task) => task.personId === people[0]!.id)!
      const taskB = tasks.find((task) => task.personId === people[1]!.id)!
      const taskFinal = tasks.find((task) => task.role === 'library_final')!
      const decide = async (taskId: string, userId: string, versionId = submission.id) =>
        prisma.$transaction(async (tx) => {
          await lockMutationScope(tx, 'paper-claim', claimId)
          return decideReviewCase(f.app, tx, {
            caseId: review.id,
            actorId: userId,
            decision: 'approve',
            taskId,
            expectedVersionId: versionId,
          })
        })
      await assert.rejects(decide(taskA.id, f.platform.id), /authority|unavailable/)
      await assert.rejects(decide(taskA.id, authorA.id, randomUUID()), /changed/)
      await decide(taskA.id, authorA.id)
      assert.equal(
        (await prisma.content_review_cases.findUniqueOrThrow({ where: { id: review.id } }))
          .currentStep,
        1,
      )
      await decide(taskB.id, authorB.id)
      assert.equal(
        (await prisma.content_review_cases.findUniqueOrThrow({ where: { id: review.id } }))
          .currentStep,
        2,
      )
      await f.post(`${f.base}/review-governance/grants/${grant.json().data.id}/revoke`, {
        notes: 'Revoked before final decision',
      })
      await assert.rejects(decide(taskFinal.id, librarian.id), /authority|unavailable/)
      await f.post(`${f.base}/review-governance/grants`, {
        personId: people[2]!.id,
        role: 'library_final',
        startsAt: new Date(Date.now() - 1000).toISOString(),
        endsAt: null,
        notes: 'Explicit new grant',
      })
      await decide(taskFinal.id, librarian.id)
      const round = await prisma.content_review_rounds.findFirstOrThrow({
        where: { caseId: review.id, number: 2 },
      })
      assert.equal(round.executionStatus, 'pending')
      await assert.rejects(
        prisma.content_review_rounds.update({
          where: { id: round.id },
          data: { materialSnapshot: { title: 'Tampered' } },
        }),
        /immutable/,
      )
      const claims = await prisma.$transaction((tx) => claimInboxEvents(tx))
      assert.ok(claims.length)
      const delivered: object[] = []
      for (const claim of claims)
        await deliverInboxEvent(f.app, claim, async (_input, init) => {
          delivered.push(JSON.parse(String(init?.body)))
          return new Response(null, { status: 204 })
        })
      assert.ok(delivered.length)
      assert.equal(JSON.stringify(delivered).includes('student_id'), false)
      assert.equal(
        await prisma.review_inbox_events.count({ where: { status: 'delivered' } }),
        delivered.length,
      )
      const retryClaims = await prisma.$transaction((tx) => claimInboxEvents(tx))
      assert.ok(retryClaims.length)
      const failedDelivery = retryClaims[0]!
      await deliverInboxEvent(f.app, failedDelivery, async () => {
        throw new Error('Synthetic offline inbox')
      })
      const waiting = await prisma.review_inbox_events.findUniqueOrThrow({
        where: { id: failedDelivery.id },
      })
      assert.equal(waiting.status, 'pending')
      assert.ok(waiting.availableAt > new Date())
      assert.equal(
        (await prisma.content_review_cases.findUniqueOrThrow({ where: { id: review.id } })).status,
        'approved',
      )
      await prisma.review_inbox_events.update({
        where: { id: failedDelivery.id },
        data: { status: 'sending', attempts: 8, leaseUntil: new Date(0), leaseToken: randomUUID() },
      })
      const recovered = await prisma.$transaction((tx) => claimInboxEvents(tx))
      assert.ok(!recovered.some((event) => event.id === failedDelivery.id))
      assert.equal(
        (await prisma.review_inbox_events.findUniqueOrThrow({ where: { id: failedDelivery.id } }))
          .status,
        'failed',
      )
      const hidden = await f.app.inject({
        url: `/v1/reviews/tasks/${taskA.id}`,
        headers: { authorization: `Bearer ${f.token(f.member.id)}` },
      })
      assert.equal(hidden.statusCode, 404)
      const simple = await f.app.inject({
        method: 'PUT',
        url: `${f.base}/review-governance/workflows/paper`,
        headers: { authorization: `Bearer ${f.token(f.owner.id)}` },
        payload: {
          name: 'Explicit final reviewer',
          steps: [
            {
              name: 'Final',
              groups: [{ kind: 'role', role: 'library_final' }],
              ccPersonIds: [people[0]!.id],
              deadlineHours: 24,
            },
          ],
        },
      })
      assert.equal(simple.statusCode, 200, simple.body)
      const body = {
        subjectType: 'paper',
        subjectId: claimId,
        change: { kind: 'metadata', title: 'Approved corrected title' },
        notes: 'Author correction against the published version',
      }
      const proposed = await f.post('/v1/reviews/changes', body, authorA.id, {
        'idempotency-key': 'metadata-one',
      })
      assert.equal(proposed.statusCode, 200, proposed.body)
      const repeated = await f.post('/v1/reviews/changes', body, authorA.id, {
        'idempotency-key': 'metadata-one',
      })
      assert.equal(repeated.json().data.id, proposed.json().data.id)
      assert.equal(
        (await prisma.papers.findUniqueOrThrow({ where: { id: paper.id } })).title,
        paper.title,
      )
      const approveChange = async (change: { id: string; caseId: string }) => {
        const task = await prisma.content_review_tasks.findFirstOrThrow({
          where: { role: 'library_final', step: { caseId: change.caseId } },
        })
        const result = await f.post(
          `/v1/reviews/tasks/${task.id}/decision`,
          { versionId: change.id, decision: 'approve' },
          librarian.id,
        )
        assert.equal(result.statusCode, 200, result.body)
        return task
      }
      const proposedChange = proposed.json().data as { id: string; caseId: string }
      await approveChange(proposedChange)
      assert.equal(
        (
          await prisma.content_review_changes.findUniqueOrThrow({
            where: { id: proposedChange.id },
          })
        ).status,
        'pending',
      )
      // CC did not require a decision. Two workers cannot execute the same change twice.
      await Promise.all([executeNextReviewChange(f.app), executeNextReviewChange(f.app)])
      assert.equal(
        (await prisma.papers.findUniqueOrThrow({ where: { id: paper.id } })).title,
        'Approved corrected title',
      )
      assert.equal(
        await prisma.content_review_actions.count({
          where: { caseId: proposedChange.caseId, action: 'change_applied' },
        }),
        1,
      )
      assert.equal(
        (
          await prisma.content_review_changes.findUniqueOrThrow({
            where: { id: proposedChange.id },
          })
        ).status,
        'applied',
      )
      const stale = await f.post(
        '/v1/reviews/changes',
        { ...body, change: { kind: 'metadata', title: 'Stale proposal' } },
        authorA.id,
        { 'idempotency-key': 'metadata-stale' },
      )
      assert.equal(stale.statusCode, 200, stale.body)
      await approveChange(stale.json().data)
      await prisma.papers.update({
        where: { id: paper.id },
        data: { title: 'Newer published title', updatedAt: new Date() },
      })
      await executeNextReviewChange(f.app)
      assert.equal(
        (
          await prisma.content_review_changes.findUniqueOrThrow({
            where: { id: stale.json().data.id },
          })
        ).status,
        'failed',
      )
      assert.equal(
        (await prisma.papers.findUniqueOrThrow({ where: { id: paper.id } })).title,
        'Newer published title',
      )
      const restricted = await f.post(
        '/v1/reviews/changes',
        { ...body, change: { kind: 'access', restricted: true } },
        authorA.id,
        { 'idempotency-key': 'access-one' },
      )
      assert.equal(restricted.statusCode, 200, restricted.body)
      await approveChange(restricted.json().data)
      await executeNextReviewChange(f.app)
      assert.equal(
        (await prisma.paper_claims.findUniqueOrThrow({ where: { id: claimId } }))
          .fullTextRestricted,
        true,
      )
      const withdraw = await f.post(
        '/v1/reviews/changes',
        { ...body, change: { kind: 'institutional_withdrawal', withdrawn: true } },
        authorA.id,
        { 'idempotency-key': 'withdraw-one' },
      )
      assert.equal(withdraw.statusCode, 200, withdraw.body)
      const withdrawn = await f.post(
        `/v1/reviews/cases/${withdraw.json().data.caseId}/close`,
        {
          versionId: withdraw.json().data.id,
          outcome: 'withdrawn',
          notes: 'Applicant withdrew this request',
        },
        authorA.id,
      )
      assert.equal(withdrawn.statusCode, 200, withdrawn.body)
      assert.equal(
        (
          await prisma.content_review_rounds.findFirstOrThrow({
            where: { caseId: withdraw.json().data.caseId },
          })
        ).status,
        'withdrawn',
      )
      assert.equal(
        (await prisma.content_review_cases.findUniqueOrThrow({ where: { id: review.id } })).status,
        'approved',
      )
      const imported = await prisma.$transaction((tx) =>
        applyPaperBibliography(
          tx,
          f.app,
          f.institution.id,
          {
            type: 'user',
            userId: f.owner.id,
            credentialId: null,
            institutionId: f.institution.id,
            scopes: [],
          },
          { paper_id: paper.id, title: 'Imported reviewed title' },
          { institutionId: f.institution.id, labId: null, reviewNodeId: null },
        ),
      )
      assert.equal(imported.status, 'pending')
      assert.equal(
        (await prisma.papers.findUniqueOrThrow({ where: { id: paper.id } })).title,
        'Newer published title',
      )
      const importedChange = await prisma.content_review_changes.findFirstOrThrow({
        where: { subjectId: claimId, kind: 'bibliography' },
      })
      await approveChange(importedChange)
      await executeNextReviewChange(f.app)
      assert.equal(
        (
          await prisma.content_review_changes.findUniqueOrThrow({
            where: { id: importedChange.id },
          })
        ).status,
        'applied',
      )
      assert.equal(
        (await prisma.papers.findUniqueOrThrow({ where: { id: paper.id } })).title,
        'Imported reviewed title',
      )
      // Archiving a never-published claim is not a restoration eligibility proof.
      await prisma.content_review_cases.update({
        where: { id: review.id },
        data: { status: 'archived' },
      })
      const invalidRestore = await f.post(
        '/v1/reviews/changes',
        { ...body, change: { kind: 'institutional_withdrawal', withdrawn: false } },
        authorA.id,
        { 'idempotency-key': 'unverified-restore' },
      )
      assert.equal(invalidRestore.statusCode, 409)
    })
    test('duplicate uploads cannot replace another submitter or hide a published governed claim', async (t) => {
      const f = await fixture(t)
      await f.sync([personRow('LIBRARY')])
      const reviewer = await prisma.institution_people.findFirstOrThrow({
        where: { institutionId: f.institution.id },
      })
      await prisma.institution_people.update({
        where: { id: reviewer.id },
        data: { userId: f.member.id },
      })
      const grant = await f.post(`${f.base}/review-governance/grants`, {
        personId: reviewer.id,
        role: 'library_final',
        startsAt: new Date(Date.now() - 1000).toISOString(),
        endsAt: null,
        notes: 'Independent library reviewer',
      })
      assert.equal(grant.statusCode, 200, grant.body)
      const workflow = await f.app.inject({
        method: 'PUT',
        url: `${f.base}/review-governance/workflows/paper`,
        headers: { authorization: `Bearer ${f.token(f.owner.id)}` },
        payload: {
          name: 'Final review',
          steps: [
            {
              name: 'Library',
              groups: [{ kind: 'role', role: 'library_final' }],
              deadlineHours: 24,
            },
          ],
        },
      })
      assert.equal(workflow.statusCode, 200, workflow.body)
      const input = {
        title: 'Original submission',
        doi: `10.1234/governance-${randomUUID()}`,
        institution_id: f.institution.id,
        publish_year: 2026,
        paper_type: 1,
        language: 2,
      }
      const first = await createPaper(f.app, input, f.owner.id)
      await assert.rejects(
        createPaper(f.app, { ...input, title: 'Unrelated replacement' }, f.member.id),
        /original submitter/,
      )
      const claim = await prisma.paper_claims.findUniqueOrThrow({ where: { id: first.claimId! } })
      const task = await prisma.content_review_tasks.findFirstOrThrow({
        where: { step: { caseId: claim.reviewCaseId }, status: 'pending' },
      })
      const approved = await f.post(
        `/v1/reviews/tasks/${task.id}/decision`,
        { decision: 'approve', notes: 'Verified publication', versionId: claim.submissionId },
        f.member.id,
      )
      assert.equal(approved.statusCode, 200, approved.body)
      await assert.rejects(
        createPaper(f.app, { ...input, title: 'Premature replacement' }, f.owner.id),
        /change request/,
      )
      assert.equal(
        (await prisma.content_review_cases.findUniqueOrThrow({ where: { id: claim.reviewCaseId } }))
          .status,
        'approved',
      )
      assert.equal(
        (await prisma.paper_claims.findUniqueOrThrow({ where: { id: claim.id } })).submissionId,
        claim.submissionId,
      )
      assert.equal(await prisma.paper_submissions.count({ where: { claimId: claim.id } }), 1)
      assert.equal(
        (await prisma.papers.findUniqueOrThrow({ where: { id: claim.paperId } })).title,
        input.title,
      )
    })

    test('thesis review and corrections preserve published versions until approval, withdrawal is reversible without deletion', async (t) => {
      const f = await fixture(t)
      await f.sync([personRow('LIBRARIAN')])
      const reviewer = await f.user('thesis-reviewer')
      const person = await prisma.institution_people.findFirstOrThrow({
        where: { institutionId: f.institution.id },
      })
      await prisma.institution_people.update({
        where: { id: person.id },
        data: { userId: reviewer.id },
      })
      const grant = await f.post(`${f.base}/review-governance/grants`, {
        personId: person.id,
        role: 'library_final',
        startsAt: new Date(Date.now() - 1000).toISOString(),
        endsAt: null,
        notes: 'Verified final reviewer',
      })
      assert.equal(grant.statusCode, 200, grant.body)
      const configured = await f.app.inject({
        method: 'PUT',
        url: `${f.base}/review-governance/workflows/degree_thesis`,
        headers: { authorization: `Bearer ${f.token(f.owner.id)}` },
        payload: {
          name: 'Thesis final',
          steps: [
            { name: 'Final', groups: [{ kind: 'role', role: 'library_final' }], deadlineHours: 24 },
          ],
        },
      })
      assert.equal(configured.statusCode, 200, configured.body)
      const thesisId = randomUUID()
      const review = await prisma.content_review_cases.create({
        data: {
          institutionId: f.institution.id,
          content_type: 'degree_thesis',
          subjectId: thesisId,
          submittedBy: f.owner.id,
        },
      })
      await prisma.degree_theses.create({
        data: {
          id: thesisId,
          institutionId: f.institution.id,
          submittedBy: f.owner.id,
          reviewCaseId: review.id,
          record_code: `EXAMPLE-TH-${randomUUID()}`,
        },
      })
      const version = await prisma.degree_thesis_versions.create({
        data: {
          thesisId,
          version_number: 1,
          title: 'Original thesis',
          author_name: 'Example',
          training_unit: 'Example Unit',
          major: 'Example Subject',
          degree_category: 'doctoral',
          award_year: 2026,
          createdBy: f.owner.id,
        },
      })
      await prisma.degree_theses.update({
        where: { id: thesisId },
        data: { currentVersionId: version.id },
      })
      await prisma.$transaction((tx) =>
        submitReviewCase(f.app, tx, {
          caseId: review.id,
          actorId: f.owner.id,
          versionId: version.id,
        }),
      )
      const approve = async (caseId: string, versionId: string) => {
        const task = await prisma.content_review_tasks.findFirstOrThrow({
          where: { step: { caseId, status: 'pending' }, role: 'library_final' },
        })
        const approved = await f.post(
          `/v1/reviews/tasks/${task.id}/decision`,
          { versionId, decision: 'approve' },
          reviewer.id,
        )
        assert.equal(approved.statusCode, 200, approved.body)
      }
      await approve(review.id, version.id)
      assert.equal(
        (await prisma.degree_theses.findUniqueOrThrow({ where: { id: thesisId } }))
          .publishedVersionId,
        version.id,
      )
      const change = async (payload: object) => {
        const result = await f.post(
          '/v1/reviews/changes',
          {
            subjectType: 'degree_thesis',
            subjectId: thesisId,
            change: payload,
            notes: 'Verified proposed change',
          },
          f.owner.id,
          { 'idempotency-key': randomUUID() },
        )
        assert.equal(result.statusCode, 200, result.body)
        return result.json().data as { id: string; caseId: string }
      }
      const proposed = await change({ kind: 'metadata', title: 'Corrected thesis' })
      assert.equal(
        (await prisma.degree_theses.findUniqueOrThrow({ where: { id: thesisId } }))
          .publishedVersionId,
        version.id,
      )
      await approve(proposed.caseId, proposed.id)
      await executeNextReviewChange(f.app)
      const corrected = await prisma.degree_theses.findUniqueOrThrow({
        where: { id: thesisId },
        include: { published_version: true },
      })
      assert.equal(corrected.published_version?.title, 'Corrected thesis')
      assert.equal(
        (await prisma.degree_thesis_versions.findUniqueOrThrow({ where: { id: version.id } }))
          .title,
        'Original thesis',
      )
      await assert.rejects(
        prisma.degree_thesis_versions.update({
          where: { id: version.id },
          data: { title: 'Tamper' },
        }),
        /immutable/,
      )
      const withdrawn = await change({ kind: 'institutional_withdrawal', withdrawn: true })
      await approve(withdrawn.caseId, withdrawn.id)
      await executeNextReviewChange(f.app)
      assert.equal(
        (await prisma.degree_theses.findUniqueOrThrow({ where: { id: thesisId } }))
          .publishedVersionId,
        null,
      )
      const restored = await change({ kind: 'institutional_withdrawal', withdrawn: false })
      await approve(restored.caseId, restored.id)
      await executeNextReviewChange(f.app)
      assert.equal(
        (await prisma.degree_theses.findUniqueOrThrow({ where: { id: thesisId } }))
          .publishedVersionId,
        corrected.publishedVersionId,
      )
      assert.equal(await prisma.degree_thesis_versions.count({ where: { thesisId } }), 2)
    })

    test('ending one appointment preserves another but returning to the ended appointment does not restore its grant', async (t) => {
      const f = await fixture(t)
      const unit = (id: string) => ({ kind: 'unit', externalId: id, name: id, active: true })
      const position = (id: string) => ({
        kind: 'position',
        externalId: id,
        unitExternalId: id,
        name: id,
        active: true,
      })
      const appointment = (id: string, status = 'active') => ({
        kind: 'appointment',
        externalId: id,
        personExternalId: 'REVIEWER',
        positionExternalId: id,
        status,
        startsAt: null,
        endsAt: null,
      })
      await f.sync(
        [
          personRow('REVIEWER'),
          unit('A'),
          unit('B'),
          position('A'),
          position('B'),
          appointment('A'),
          appointment('B'),
        ],
        'full',
      )
      const person = await prisma.institution_people.findFirstOrThrow({
        where: { institutionId: f.institution.id },
      })
      const units = await prisma.institution_org_nodes.findMany({
        where: { institutionId: f.institution.id },
        orderBy: { name: 'asc' },
      })
      for (const node of units) {
        const granted = await f.post(`${f.base}/review-governance/grants`, {
          personId: person.id,
          role: 'department',
          nodeId: node.id,
          startsAt: new Date().toISOString(),
          endsAt: null,
          notes: 'Verified independent appointment',
        })
        assert.equal(granted.statusCode, 200, granted.body)
      }
      await f.sync([appointment('A', 'ended')])
      assert.equal(
        (await eligibleGrantPeople(prisma, f.institution.id, 'department', units[0]!.id)).length,
        0,
      )
      assert.equal(
        (await eligibleGrantPeople(prisma, f.institution.id, 'department', units[1]!.id)).length,
        1,
      )
      assert.equal(
        (await prisma.institution_people.findUniqueOrThrow({ where: { id: person.id } })).is_active,
        true,
      )
      await f.sync([appointment('A')])
      assert.equal(
        (await eligibleGrantPeople(prisma, f.institution.id, 'department', units[0]!.id)).length,
        0,
      )
      assert.equal(
        (await eligibleGrantPeople(prisma, f.institution.id, 'department', units[1]!.id)).length,
        1,
      )
      await f.post(`${f.base}/directory/sources`, { ...f.settings, deactivateMissing: true })
      await f.sync([personRow('REVIEWER'), unit('A'), position('A'), appointment('A')], 'full')
      assert.equal(
        (await eligibleGrantPeople(prisma, f.institution.id, 'department', units[1]!.id)).length,
        0,
      )
      assert.equal(
        (await prisma.institution_people.findUniqueOrThrow({ where: { id: person.id } })).is_active,
        true,
      )
      assert.equal(
        (await prisma.institution_org_nodes.findUniqueOrThrow({ where: { id: units[1]!.id } }))
          .is_active,
        false,
      )
    })
  },
)
