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
import { personAdmitted } from '../src/directory/policy'
import { canActOnTask } from '../src/review/authorization'
import { assertInstitutionIdentitySession } from '../src/utils/institution-identifiers'
import intakeRoutes from '../src/routes/v1/papers'
import { updatePaper, deletePaper } from '../src/routes/papers/service.paper'
import { reviewLegacyPaperImport } from '../src/routes/v1/institutions/service.paper-import-review'
import { administratorRoutes } from '../src/routes/v1/institutions/routes.administrators'
import institutionRoutes from '../src/routes/institutions'
import { bootstrapDeployment, recoverAdministrator } from '../src/administrators/deployment'
import { upsertInstitutionPerson } from '../src/utils/institution-people'
import { syncInstitutionProvisionToUser } from '../src/utils/institution-provisions'
import { permissionContext } from '../src/administrators/access'

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
    features: { paperUpload: true },
    institution: { slug: institution.slug },
    contentAccess: 'public',
    managementMode: 'self_hosted',
  } as never)
  await app.register(jwtPlugin)
  await app.register(directoryRoutes, { prefix: '/v1/institutions' })
  await app.register(administratorRoutes, { prefix: '/v1/institutions' })
  await app.register(institutionRoutes, { prefix: '/institutions' })
  await app.register(reviewGovernanceRoutes, { prefix: '/v1/institutions' })
  await app.register(reviewRoutes, { prefix: '/v1/reviews' })
  await app.register(intakeRoutes, { prefix: '/v1/papers' })
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
  const stage = async (rows: object[], mode = 'incremental', schemaVersion = 1) => {
    const result = await post(
      `${base}/directory/sources/${source.id}/runs`,
      { schemaVersion, sequence: ++sequence, mode, expectedPages: 1, expectedRows: rows.length },
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
  const sync = async (rows: object[], mode = 'incremental', schemaVersion = 1) => {
    const { run, url } = await stage(rows, mode, schemaVersion)
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
    before(async () => {
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
      // Connection-string options override pool options, including the raw SQL search path.
      const isolatedDatabaseUrl = new URL(databaseUrl)
      isolatedDatabaseUrl.searchParams.set('schema', schemaName)
      isolatedDatabaseUrl.searchParams.set('options', `-c search_path=${schemaName},public`)
      prisma = new PrismaClient({
        adapter: new PrismaPg(
          { connectionString: isolatedDatabaseUrl.toString() },
          { schema: schemaName },
        ),
      })
      const [connection] = await prisma.$queryRaw<Array<{ schema: string }>>`
        SELECT current_schema() AS schema
      `
      assert.equal(connection.schema, schemaName, 'Raw SQL must use the isolated test schema')
    })
    after(async () => {
      await prisma?.$disconnect()
      if (databaseUrl && /^scholar_governance_test_[0-9a-f]{16}$/.test(schemaName))
        sql(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`)
    })

    test('administrator grants enforce hierarchy, immutable account identity, reasons and current target status', async (t) => {
      const f = await fixture(t)
      const admin = await f.user('admin')
      await prisma.institution_memberships.create({
        data: { institutionId: f.institution.id, userId: admin.id, role: 'admin' },
      })
      const url = `/institutions/${f.institution.slug}/memberships`
      assert.equal(
        (await f.post(url, { userId: f.member.id, role: 'admin', internalId: 'MEMBER' }, admin.id))
          .statusCode,
        403,
      )
      assert.equal(
        (await f.post(url, { userId: f.owner.id, role: 'member' }, admin.id)).statusCode,
        403,
      )
      assert.equal(
        (
          await f.post(
            `${f.base}/administrators/handoff/preview`,
            { fromUserId: f.owner.id, toUserId: f.member.id },
            admin.id,
          )
        ).statusCode,
        403,
      )
      const granted = await f.post(url, {
        userId: f.member.id,
        role: 'admin',
        internalId: 'MEMBER',
        reason: 'Approved appointment',
      })
      assert.equal(granted.statusCode, 200, granted.body)
      assert.equal(
        (
          await f.post(url, {
            userId: f.member.id,
            role: 'admin',
            internalId: 'OTHER',
            reason: 'Wrong identity',
          })
        ).statusCode,
        409,
      )
      const event = await prisma.institution_permission_events.findFirstOrThrow({
        where: {
          institutionId: f.institution.id,
          source: 'membership_update',
          entity: 'institution_memberships',
        },
      })
      assert.equal(event.actorUserId, f.owner.id)
      assert.equal(event.reason, 'Approved appointment')
      assert.equal((event.before as { role: string }).role, 'member')
      assert.equal((event.after as { role: string }).role, 'admin')
      await prisma.institution_people.updateMany({
        where: { userId: f.member.id },
        data: { manually_suspended: true },
      })
      assert.equal(
        (await f.post(url, { userId: f.member.id, role: 'owner', reason: 'Cannot regrant' }))
          .statusCode,
        409,
      )
      assert.equal(
        (
          await f.post(
            url,
            { userId: admin.id, role: 'member', reason: 'Old session' },
            f.member.id,
          )
        ).statusCode,
        403,
      )
      const deniedAudit = await f.app.inject({
        url: `${f.base}/administrators/audit`,
        headers: { authorization: `Bearer ${f.token(admin.id)}` },
      })
      assert.equal(deniedAudit.statusCode, 403)
    })

    test('concurrent demotions cannot remove the last active owner', async (t) => {
      const f = await fixture(t)
      const url = `/institutions/${f.institution.slug}/memberships`
      for (const [user, internalId] of [
        [f.owner, 'OWNER'],
        [f.member, 'SUCCESSOR'],
      ] as const) {
        const result = await f.post(url, {
          userId: user.id,
          internalId,
          role: 'owner',
          reason: 'Assign initial owners',
        })
        assert.equal(result.statusCode, 200, result.body)
      }
      const results = await Promise.all(
        [f.owner, f.member].map((user) =>
          f.post(
            url,
            { userId: user.id, role: 'member', reason: 'Concurrent demotion' },
            f.platform.id,
          ),
        ),
      )
      assert.deepEqual(results.map((result) => result.statusCode).sort(), [200, 409])
      assert.equal(
        await prisma.institution_memberships.count({
          where: { institutionId: f.institution.id, role: 'owner' },
        }),
        1,
      )
    })

    test('handoff is preview-bound, atomic and preserves identities while revoking departure authority', async (t) => {
      const f = await fixture(t)
      const people = []
      for (const [user, internalId] of [
        [f.owner, 'OLD-ID'],
        [f.member, 'NEW-ID'],
      ] as const) {
        people.push(
          await upsertInstitutionPerson(prisma, {
            institutionId: f.institution.id,
            internalId,
            name: user.name,
            userId: user.id,
            source: 'test',
          }),
        )
      }
      const oldPerson = people[0]!
      const lab = await prisma.labs.create({
        data: { institutionId: f.institution.id, name: 'Handoff lab', slug: `lab-${randomUUID()}` },
      })
      await prisma.lab_memberships.create({
        data: { labId: lab.id, userId: f.owner.id, role: 'owner' },
      })
      const grant = await prisma.institution_reviewer_grants.create({
        data: {
          institutionId: f.institution.id,
          personId: oldPerson.id,
          role: 'library_final',
          grantedBy: f.owner.id,
          notes: 'Original appointment',
        },
      })
      const invite = await prisma.institution_user_provisions.create({
        data: {
          institutionId: f.institution.id,
          createdBy: f.owner.id,
          name: 'Pending',
          email: 'pending@example.invalid',
          role: 'admin',
          inviteToken: randomUUID(),
        },
      })
      const credential = await prisma.institution_api_credentials.create({
        data: {
          institutionId: f.institution.id,
          createdBy: f.owner.id,
          name: 'Integration',
          clientId: randomUUID(),
          secretHash: 'PRIVATE-HASH',
          scopes: ['papers:import'],
          expiresAt: new Date(Date.now() + 86400000),
        },
      })
      const review = await prisma.content_review_cases.create({
        data: {
          institutionId: f.institution.id,
          content_type: 'paper',
          subjectId: randomUUID(),
          submittedBy: f.member.id,
          status: 'pending_review',
        },
      })
      await prisma.content_review_rounds.create({
        data: {
          caseId: review.id,
          number: 1,
          status: 'pending_review',
          materialDigest: 'synthetic',
          materialSnapshot: {},
          workflowSnapshot: {},
        },
      })
      const step = await prisma.content_review_step_instances.create({
        data: {
          caseId: review.id,
          institutionId: f.institution.id,
          step_order: 1,
          step_name: 'Library review',
          status: 'pending',
          resolver_type: 'governance',
          resolver_config: {},
        },
      })
      const pending = await prisma.content_review_tasks.create({
        data: { stepId: step.id, kind: 'role', role: 'library_final', status: 'pending' },
      })
      const historical = await prisma.content_review_tasks.create({
        data: {
          stepId: step.id,
          kind: 'author',
          personId: oldPerson.id,
          status: 'approved',
          completedBy: f.owner.id,
          completedAt: new Date(),
        },
      })
      const input = { fromUserId: f.owner.id, toUserId: f.member.id }
      const preview = await f.post(`${f.base}/administrators/handoff/preview`, input)
      assert.equal(preview.statusCode, 200, preview.body)
      assert.deepEqual(
        preview.json().data.tasks.map((task: { id: string }) => task.id),
        [pending.id],
      )
      const digest = preview.json().data.digest as string
      assert.equal(
        (
          await f.post(`${f.base}/administrators/handoff`, {
            ...input,
            digest,
            reason: 'Departure handoff',
            acknowledgeOutstanding: false,
          })
        ).statusCode,
        400,
      )
      await prisma.institution_memberships.update({
        where: { institutionId_userId: { institutionId: f.institution.id, userId: f.member.id } },
        data: { can_import_data: true },
      })
      assert.equal(
        (
          await f.post(`${f.base}/administrators/handoff`, {
            ...input,
            digest,
            reason: 'Departure handoff',
            acknowledgeOutstanding: true,
          })
        ).statusCode,
        409,
      )
      const fresh = await f.post(`${f.base}/administrators/handoff/preview`, input)
      const auditCount = await prisma.institution_permission_events.count({
        where: { institutionId: f.institution.id },
      })
      await prisma.$executeRawUnsafe(
        `CREATE FUNCTION test_reject_handoff() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity = 'administrator_handoff' THEN RAISE EXCEPTION 'Injected handoff audit failure'; END IF; RETURN NEW; END $$`,
      )
      await prisma.$executeRawUnsafe(
        'CREATE TRIGGER test_reject_handoff BEFORE INSERT ON institution_permission_events FOR EACH ROW EXECUTE FUNCTION test_reject_handoff()',
      )
      try {
        const failed = await f.post(`${f.base}/administrators/handoff`, {
          ...input,
          digest: fresh.json().data.digest,
          reason: 'Departure handoff',
          acknowledgeOutstanding: true,
        })
        assert.equal(failed.statusCode, 500)
        assert.equal(
          (await prisma.institution_people.findUniqueOrThrow({ where: { id: oldPerson.id } }))
            .manually_suspended,
          false,
        )
        assert.equal(
          (
            await prisma.institution_api_credentials.findUniqueOrThrow({
              where: { id: credential.id },
            })
          ).revokedAt,
          null,
        )
        assert.equal(
          (
            await prisma.institution_memberships.findFirstOrThrow({
              where: { userId: f.member.id, institutionId: f.institution.id },
            })
          ).role,
          'member',
        )
        assert.equal(
          await prisma.lab_memberships.count({ where: { labId: lab.id, userId: f.member.id } }),
          0,
        )
        assert.equal(
          await prisma.institution_permission_events.count({
            where: { institutionId: f.institution.id },
          }),
          auditCount,
        )
      } finally {
        await prisma.$executeRawUnsafe(
          'DROP TRIGGER test_reject_handoff ON institution_permission_events',
        )
        await prisma.$executeRawUnsafe('DROP FUNCTION test_reject_handoff()')
      }
      const done = await f.post(`${f.base}/administrators/handoff`, {
        ...input,
        digest: fresh.json().data.digest,
        reason: 'Departure handoff',
        acknowledgeOutstanding: true,
      })
      assert.equal(done.statusCode, 200, done.body)
      const members = await prisma.institution_memberships.findMany({
        where: { institutionId: f.institution.id },
      })
      assert.equal(members.find((item) => item.userId === f.owner.id)?.role, 'member')
      assert.equal(members.find((item) => item.userId === f.member.id)?.role, 'owner')
      assert.equal(
        (await prisma.institution_people.findUniqueOrThrow({ where: { id: oldPerson.id } }))
          .manually_suspended,
        true,
      )
      assert.equal(
        (await prisma.institution_people.findUniqueOrThrow({ where: { id: people[1]!.id } }))
          .internalId,
        'NEW-ID',
      )
      assert.equal(
        (await prisma.institution_people.findUniqueOrThrow({ where: { id: oldPerson.id } }))
          .internalId,
        'OLD-ID',
      )
      assert.equal(
        (
          await prisma.lab_memberships.findUniqueOrThrow({
            where: { labId_userId: { labId: lab.id, userId: f.member.id } },
          })
        ).role,
        'owner',
      )
      assert.ok(
        (await prisma.institution_reviewer_grants.findUniqueOrThrow({ where: { id: grant.id } }))
          .revokedAt,
      )
      assert.equal(
        await prisma.institution_reviewer_grants.count({ where: { personId: people[1]!.id } }),
        0,
      )
      assert.equal(
        (await prisma.institution_user_provisions.findUniqueOrThrow({ where: { id: invite.id } }))
          .status,
        'disabled',
      )
      assert.equal(
        (
          await prisma.institution_api_credentials.findUniqueOrThrow({
            where: { id: credential.id },
          })
        ).secretVersion,
        2,
      )
      assert.deepEqual(
        await prisma.content_review_tasks.findUniqueOrThrow({ where: { id: historical.id } }),
        historical,
      )
      assert.deepEqual(
        await prisma.content_review_tasks.findUniqueOrThrow({ where: { id: pending.id } }),
        pending,
      )
      const oldSession = await f.app.inject({
        url: `${f.base}/administrators/audit`,
        headers: { authorization: `Bearer ${f.token(f.owner.id)}` },
      })
      assert.equal(oldSession.statusCode, 403)
      const audit = await f.app.inject({
        url: `${f.base}/administrators/audit`,
        headers: { authorization: `Bearer ${f.token(f.member.id)}` },
      })
      assert.equal(audit.statusCode, 200, audit.body)
      assert.equal(audit.json().data.activeOwners, 1)
      assert.ok(
        audit
          .json()
          .data.items.some((event: { entity: string }) => event.entity === 'administrator_handoff'),
      )
      assert.ok(!audit.body.includes(invite.inviteToken))
      assert.ok(!audit.body.includes('PRIVATE-HASH'))
    })

    test('audit events are append-only and roll back with failed permission mutations', async (t) => {
      const f = await fixture(t)
      const before = await prisma.institution_permission_events.count({
        where: { institutionId: f.institution.id },
      })
      await assert.rejects(
        prisma.$transaction(async (tx) => {
          await permissionContext(tx, {
            actorUserId: f.owner.id,
            source: 'test_rollback',
            reason: 'Injected failure',
          })
          await tx.institution_memberships.updateMany({
            where: { institutionId: f.institution.id },
            data: { role: 'admin' },
          })
          throw new Error('Injected failure')
        }),
        /Injected failure/,
      )
      assert.equal(
        await prisma.institution_permission_events.count({
          where: { institutionId: f.institution.id },
        }),
        before,
      )
      assert.equal(
        (
          await prisma.institution_memberships.findFirstOrThrow({
            where: { institutionId: f.institution.id, userId: f.owner.id },
          })
        ).role,
        'owner',
      )
      await assert.rejects(
        prisma.institution_permission_events.updateMany({
          where: { institutionId: f.institution.id },
          data: { reason: 'tamper' },
        }),
        /append-only/,
      )
      await assert.rejects(
        prisma.institution_permission_events.deleteMany({
          where: { institutionId: f.institution.id },
        }),
        /append-only/,
      )
      await assert.rejects(
        prisma.$executeRawUnsafe('TRUNCATE institution_permission_events'),
        /append-only/,
      )
    })

    test('bootstrap is one-time; recovery requires exact confirmation and expires even existing tokens', async (t) => {
      const f = await fixture(t)
      const suffix = randomBytes(5).toString('hex')
      const input = {
        institutionName: 'New institution',
        institutionSlug: `bootstrap-${suffix}`,
        ownerName: 'First owner',
        ownerEmail: `first-${suffix}@example.invalid`,
        ownerUsername: `first-${suffix}`,
        ownerInternalId: 'FIRST',
        ownerPassword: 'test-password-long-enough',
        makePlatformAdmin: false,
      }
      const first = await bootstrapDeployment(prisma, input)
      await assert.rejects(bootstrapDeployment(prisma, input), /already initialized/)
      await prisma.institution_memberships.deleteMany({
        where: { institutionId: first.institutionId },
      })
      await assert.rejects(bootstrapDeployment(prisma, input), /already initialized/)
      await assert.rejects(
        bootstrapDeployment(prisma, { ...input, institutionSlug: `other-${suffix}` }),
        /existing accounts/,
      )
      const recovery = {
        institutionSlug: f.institution.slug,
        operator: 'Operator incident 123',
        reason: 'Lost all owners',
        confirmation: `RECOVER ${f.institution.slug}`,
        action: 'create' as const,
        name: 'Emergency',
        email: `recovery-${suffix}@example.invalid`,
        username: `recovery-${suffix}`,
        password: 'test-recovery-password',
      }
      await assert.rejects(
        recoverAdministrator(prisma, { ...recovery, confirmation: 'RECOVER wrong' }),
        /confirmation/,
      )
      await assert.rejects(
        recoverAdministrator(prisma, { ...recovery, password: '短'.repeat(25) }),
        /72 UTF-8 bytes/,
      )
      const result = await recoverAdministrator(prisma, recovery)
      assert.ok(result.expiresAt && Date.parse(result.expiresAt) > Date.now() + 3 * 3600000)
      assert.ok(result.expiresAt && Date.parse(result.expiresAt) <= Date.now() + 4 * 3600000)
      await assert.rejects(recoverAdministrator(prisma, recovery), /new independent account/)
      const token = f.token(result.userId)
      const get = (): ReturnType<typeof f.app.inject> =>
        f.app.inject({
          url: `${f.base}/administrators/audit`,
          headers: { authorization: `Bearer ${token}` },
        })
      assert.equal((await get()).statusCode, 200)
      await prisma.users.update({
        where: { id: result.userId },
        data: { administratorAccessExpiresAt: new Date(0) },
      })
      assert.equal((await get()).statusCode, 401)
      await recoverAdministrator(prisma, {
        ...recovery,
        action: 'revoke-platform',
        userId: result.userId,
      })
      assert.equal(
        (await prisma.users.findUniqueOrThrow({ where: { id: result.userId } })).platform_role,
        'member',
      )
      const audit = await prisma.institution_permission_events.findMany({
        where: { institutionId: f.institution.id, source: 'host_recovery' },
      })
      assert.equal(audit.length, 2)
      assert.ok(!JSON.stringify(audit).includes(recovery.password))
    })

    test('invitation activation rechecks token, status and grantor authority atomically', async (t) => {
      const f = await fixture(t)
      const invite = await prisma.institution_user_provisions.create({
        data: {
          institutionId: f.institution.id,
          createdBy: f.owner.id,
          name: 'Invited',
          email: 'invited@example.invalid',
          role: 'admin',
          inviteToken: randomUUID(),
        },
      })
      const account = await f.user('invited')
      await upsertInstitutionPerson(prisma, {
        institutionId: f.institution.id,
        internalId: 'INVITED',
        name: 'Invited',
        provisionId: invite.id,
        source: 'test',
      })
      await assert.rejects(
        syncInstitutionProvisionToUser(f.app, invite, account.id, 'old-token'),
        /no longer valid/,
      )
      await prisma.institution_memberships.updateMany({
        where: { institutionId: f.institution.id, userId: f.owner.id },
        data: { role: 'admin' },
      })
      await assert.rejects(
        syncInstitutionProvisionToUser(f.app, invite, account.id, invite.inviteToken),
        /Only owners/,
      )
      await prisma.institution_memberships.updateMany({
        where: { institutionId: f.institution.id, userId: f.owner.id },
        data: { role: 'owner' },
      })
      await prisma.institution_user_provisions.update({
        where: { id: invite.id },
        data: { status: 'disabled' },
      })
      await assert.rejects(
        syncInstitutionProvisionToUser(f.app, invite, account.id, invite.inviteToken),
        /no longer valid/,
      )
      assert.equal(await prisma.institution_memberships.count({ where: { userId: account.id } }), 0)
      await prisma.institution_user_provisions.update({
        where: { id: invite.id },
        data: { status: 'pending_activation' },
      })
      await syncInstitutionProvisionToUser(f.app, invite, account.id, invite.inviteToken)
      assert.equal(
        (await prisma.institution_user_provisions.findUniqueOrThrow({ where: { id: invite.id } }))
          .status,
        'claimed',
      )
      await assert.rejects(
        syncInstitutionProvisionToUser(f.app, invite, account.id, invite.inviteToken),
        /no longer valid/,
      )
    })

    test('review progress is scoped, paginated and preserves historical names without granting decision rights', async (t) => {
      const f = await fixture(t)
      const librarian = await f.user('progress-reviewer')
      const outsider = await f.user('unrelated')
      await f.sync([{ ...personRow('PROGRESS'), name: 'Original reviewer' }])
      const person = await prisma.institution_people.findFirstOrThrow({
        where: { institutionId: f.institution.id },
      })
      await prisma.institution_people.update({
        where: { id: person.id },
        data: { userId: librarian.id },
      })
      const grant = await f.post(`${f.base}/review-governance/grants`, {
        personId: person.id,
        role: 'library_final',
        startsAt: new Date(Date.now() - 1000).toISOString(),
        endsAt: null,
        notes: 'Synthetic authorization',
      })
      assert.equal(grant.statusCode, 200, grant.body)
      const review = await prisma.content_review_cases.create({
        data: {
          institutionId: f.institution.id,
          content_type: 'paper',
          subjectId: randomUUID(),
          submittedBy: f.member.id,
          currentRound: 2,
          currentVersionId: randomUUID(),
          status: 'pending_review',
        },
      })
      for (const number of [1, 2])
        await prisma.content_review_rounds.create({
          data: {
            caseId: review.id,
            number,
            versionId: review.currentVersionId,
            status: number === 1 ? 'superseded' : 'pending_review',
            materialDigest: 'synthetic',
            materialSnapshot: { title: `Frozen title ${number}`, student_id: 'PRIVATE-ID' },
            workflowSnapshot: {
              workflow: { name: `Frozen workflow ${number}` },
              routing: { selected: { name: 'Frozen rule', revision: number } },
            },
          },
        })
      const stage = await prisma.content_review_step_instances.create({
        data: {
          caseId: review.id,
          institutionId: f.institution.id,
          roundNumber: 2,
          step_order: 1,
          step_name: 'Final library review',
          status: 'pending',
          resolver_type: 'governance',
          resolver_config: {},
        },
      })
      const task = await prisma.content_review_tasks.create({
        data: {
          stepId: stage.id,
          kind: 'role',
          role: 'library_final',
          status: 'pending',
          dueAt: new Date(Date.now() + 3600000),
        },
      })
      const get = (path: string, actor = f.member.id) =>
        f.app.inject({
          url: `/v1/reviews/cases/${review.id}/${path}`,
          headers: { authorization: `Bearer ${f.token(actor)}` },
        })
      assert.equal(
        (await f.app.inject({ url: `/v1/reviews/cases/${review.id}/progress` })).statusCode,
        401,
      )
      const applicant = await get('progress')
      assert.equal(applicant.statusCode, 200, applicant.body)
      assert.equal(applicant.json().data.viewer, 'applicant')
      assert.equal(applicant.json().data.round.stages[0].tasks[0].candidateCount, null)
      assert.equal(applicant.json().data.round.stages[0].tasks[0].canAct, false)
      assert.equal(applicant.body.includes('PRIVATE-ID'), false)
      assert.equal((await get('progress', outsider.id)).statusCode, 404)
      assert.equal((await get('history', outsider.id)).statusCode, 404)
      assert.equal((await get(`stages/${stage.id}/tasks`, outsider.id)).statusCode, 404)
      assert.equal((await get('progress?round_number=1')).statusCode, 400)
      assert.equal((await get('progress?roundNumber=99')).statusCode, 404)
      const admin = (await get('progress', f.owner.id)).json().data
      assert.equal(admin.viewer, 'administrator')
      assert.deepEqual(admin.round.stages[0].tasks[0].candidateNames, ['Original reviewer'])
      assert.equal(admin.round.stages[0].tasks[0].canAct, false)
      assert.equal((await get('progress', f.platform.id)).statusCode, 200)
      assert.equal(
        (await get('progress', librarian.id)).json().data.round.stages[0].tasks[0].canAct,
        true,
      )
      const reassign = await f.post(`${f.base}/review-governance/tasks/${task.id}/reassign`, {
        personId: person.id,
        expectedVersionId: review.currentVersionId,
        notes: 'Synthetic reassignment',
      })
      assert.equal(reassign.statusCode, 200, reassign.body)
      await prisma.institution_people.update({
        where: { id: person.id },
        data: { name: 'Renamed person' },
      })
      await prisma.users.update({
        where: { id: f.owner.id },
        data: { name: 'Renamed administrator' },
      })
      await prisma.content_review_tasks.update({
        where: { id: task.id },
        data: { dueAt: new Date(Date.now() - 1000), assignedPersonName: 'Tampered' },
      })
      const overdue = await get('progress', librarian.id)
      assert.equal(overdue.statusCode, 200, overdue.body)
      assert.equal(
        overdue.json().data.round.stages[0].tasks[0].assignedPersonName,
        'Original reviewer',
      )
      assert.equal(overdue.json().data.round.stages[0].tasks[0].overdue, true)
      assert.equal(overdue.json().data.round.stages[0].tasks[0].canAct, false)
      const events = await get('history?roundNumber=2')
      assert.equal(events.statusCode, 200, events.body)
      assert.equal(events.json().data.items[0].actorName, 'owner')
      assert.equal(events.json().data.items[0].assigneeName, 'Original reviewer')
      assert.equal(events.json().data.items[0].notes, null)
      await prisma.content_review_actions.update({
        where: { id: events.json().data.items[0].id },
        data: { actorName: 'Tampered', assigneeName: 'Tampered' },
      })
      assert.equal((await get('history?roundNumber=2')).json().data.items[0].actorName, 'owner')
      assert.equal(
        (await get('history?roundNumber=2')).json().data.items[0].assigneeName,
        'Original reviewer',
      )
      for (const privateField of [
        'actorId',
        'assigneeId',
        'sourceIp',
        'userAgent',
        'internalId',
        'email',
      ])
        assert.equal(events.body.includes(`"${privateField}"`), false)
      assert.match(
        (await get('history', f.owner.id)).json().data.items[0].notes,
        /Synthetic reassignment/,
      )
      await prisma.content_review_tasks.update({
        where: { id: task.id },
        data: { completedBy: librarian.id, completedAt: new Date(), status: 'approved' },
      })
      await prisma.users.update({ where: { id: librarian.id }, data: { name: 'Renamed login' } })
      const completed = (await get('progress')).json().data.round.stages[0].tasks[0]
      assert.equal(completed.completedByName, 'progress-reviewer')
      const past = (await get('progress?roundNumber=1')).json().data
      assert.equal(past.title, 'Frozen title 1')
      assert.equal(past.round.workflowName, 'Frozen workflow 1')
      assert.equal(past.round.ruleRevision, 1)
      const legacyReviewer = await f.user('legacy-reviewer')
      await prisma.content_review_step_instances.create({
        data: {
          caseId: review.id,
          institutionId: f.institution.id,
          roundNumber: 1,
          step_order: 1,
          step_name: 'Legacy stage',
          status: 'approved',
          resolver_type: 'institution_admin',
          resolver_config: {},
          reviewedBy: legacyReviewer.id,
        },
      })
      const legacy = await get('progress?roundNumber=1', legacyReviewer.id)
      assert.equal(legacy.statusCode, 200, legacy.body)
      assert.equal(legacy.json().data.round.stages[0].legacy, true)
      assert.deepEqual(legacy.json().data.round.stages[0].tasks, [])
      await prisma.content_review_tasks.createMany({
        data: Array.from({ length: 51 }, () => ({
          stepId: stage.id,
          kind: 'cc',
          status: 'notified',
          personId: person.id,
        })),
      })
      const page = (await get('progress')).json().data.round.stages[0]
      assert.equal(page.tasks.length, 50)
      assert.equal(page.nextTaskOffset, 50)
      assert.equal(page.taskCount, 1)
      assert.equal(page.approvedCount, 1)
      const more = await get(`stages/${stage.id}/tasks?offset=50`)
      assert.equal(more.json().data.items.length, 2)
      assert.equal(more.json().data.nextOffset, null)
      assert.equal((await get(`stages/${randomUUID()}/tasks`)).statusCode, 404)
      await prisma.content_review_actions.createMany({
        data: Array.from({ length: 51 }, () => ({
          caseId: review.id,
          institutionId: f.institution.id,
          actorId: librarian.id,
          roundNumber: 2,
          action: 'task_approved',
          to_status: 'pending_review',
          taskId: task.id,
          notes: 'Public review comment',
        })),
      })
      const history = (await get('history?roundNumber=2')).json().data
      assert.equal(history.items.length, 50)
      assert.equal(history.nextOffset, 50)
      assert.equal(history.items[0].notes, 'Public review comment')
      assert.equal((await get('history?roundNumber=2&offset=50')).json().data.items.length, 2)
      assert.equal(
        (await get(`history?roundNumber=2&taskId=${task.id}`)).json().data.items.length,
        50,
      )
      assert.equal((await get(`history?taskId=${randomUUID()}`)).json().data.items.length, 0)
      const foreign = await fixture(t)
      assert.equal(
        (
          await foreign.app.inject({
            url: `/v1/reviews/cases/${review.id}/progress`,
            headers: { authorization: `Bearer ${foreign.token(f.platform.id)}` },
          })
        ).statusCode,
        404,
      )
      await prisma.institution_people.update({
        where: { id: person.id },
        data: { manually_suspended: true },
      })
      assert.equal((await get('progress', librarian.id)).statusCode, 403)
    })

    test('v2 preserves multiple identities, relationship revisions and organization/appointment history', async (t) => {
      const f = await fixture(t)
      const base = [
        personRow('A'),
        personRow('B'),
        { kind: 'unit', externalId: 'u1', name: 'First unit', active: true },
        { kind: 'unit', externalId: 'u2', name: 'Second unit', active: true },
        { kind: 'unit', externalId: 'lab', name: 'Lab', active: true, parentExternalId: 'u1' },
        {
          kind: 'position',
          externalId: 'position',
          unitExternalId: 'lab',
          name: 'Researcher',
          active: true,
        },
      ]
      const appointment = {
        kind: 'appointment',
        externalId: 'appointment',
        personExternalId: 'A',
        positionExternalId: 'position',
        status: 'active',
        startsAt: null,
        endsAt: null,
      }
      const identity = {
        kind: 'identity',
        externalId: 'doctoral',
        personExternalId: 'A',
        code: 'doctoral_student',
        status: 'active',
        startsAt: null,
        endsAt: null,
      }
      const relationship = {
        kind: 'relationship',
        externalId: 'supervisor',
        personExternalId: 'A',
        relatedPersonExternalId: 'B',
        relationship: 'supervisor',
        status: 'active',
        startsAt: null,
        endsAt: null,
      }
      await f.sync(
        [
          ...base,
          appointment,
          identity,
          { ...identity, externalId: 'assistant', code: 'research_assistant' },
          relationship,
        ],
        'full',
        2,
      )
      assert.equal(
        await prisma.institution_person_roles.count({
          where: { institutionId: f.institution.id, supersededAt: null },
        }),
        2,
      )
      assert.equal(
        await prisma.institution_reviewer_grants.count({
          where: { institutionId: f.institution.id },
        }),
        0,
      )
      await f.sync(
        [
          { ...identity, status: 'ended' },
          { ...relationship, status: 'ended' },
          { ...appointment, status: 'ended' },
          {
            kind: 'unit',
            externalId: 'lab',
            name: 'Lab renamed',
            active: true,
            parentExternalId: 'u2',
          },
        ],
        'incremental',
        2,
      )
      assert.equal(
        await prisma.institution_person_roles.count({ where: { institutionId: f.institution.id } }),
        3,
      )
      assert.equal(
        await prisma.institution_person_relations.count({
          where: { institutionId: f.institution.id },
        }),
        2,
      )
      assert.equal(
        await prisma.institution_appointment_history.count({
          where: { institutionId: f.institution.id },
        }),
        2,
      )
      assert.equal(
        await prisma.institution_org_edge_history.count({
          where: { institutionId: f.institution.id },
        }),
        2,
      )
      await prisma.institution_directory_sources.update({
        where: { id: f.source.id },
        data: { deactivateMissing: true },
      })
      await f.sync(base, 'full', 1)
      assert.equal(
        await prisma.institution_person_roles.count({
          where: { institutionId: f.institution.id, status: 'active', supersededAt: null },
        }),
        1,
        'v1 cannot retire v2 relationships',
      )
      await f.sync(base, 'full', 2)
      assert.equal(
        await prisma.institution_person_roles.count({
          where: { institutionId: f.institution.id, status: 'active', supersededAt: null },
        }),
        0,
      )
      const person = await prisma.institution_people.findFirstOrThrow({
        where: { institutionId: f.institution.id, internalId: 'A' },
      })
      const history = await f.app.inject({
        url: `${f.base}/directory/people/${person.id}/history`,
        headers: { authorization: `Bearer ${f.token(f.owner.id)}` },
      })
      assert.equal(history.statusCode, 200, history.body)
      assert.equal(history.json().data.identities.length, 4)
    })

    test('missing v2 facts require mass-change confirmation and preserve future-dated immutable history', async (t) => {
      const f = await fixture(t)
      const people = [personRow('A'), personRow('B')]
      const dates = {
        startsAt: new Date(Date.now() + 86400000).toISOString(),
        endsAt: null,
        status: 'active',
      }
      await f.sync(
        [
          ...people,
          {
            kind: 'identity',
            externalId: 'role',
            personExternalId: 'A',
            code: 'doctoral_student',
            ...dates,
          },
          {
            kind: 'relationship',
            externalId: 'relation',
            personExternalId: 'A',
            relatedPersonExternalId: 'B',
            relationship: 'supervisor',
            ...dates,
          },
        ],
        'full',
        2,
      )
      const original = await prisma.institution_person_roles.findFirstOrThrow({
        where: { institutionId: f.institution.id },
      })
      await assert.rejects(
        prisma.institution_person_roles.update({
          where: { id: original.id },
          data: { code: 'pi' },
        }),
        /immutable/,
      )
      await prisma.institution_directory_sources.update({
        where: { id: f.source.id },
        data: { deactivateMissing: true },
      })
      const staged = await f.stage(people, 'full', 2)
      const preview = await f.post(`${staged.url}/validate`, {})
      assert.equal(preview.statusCode, 200, preview.body)
      assert.equal(preview.json().data.status, 'needs_confirmation')
      assert.equal(preview.json().data.deactivatedCount, 0)
      assert.equal(preview.json().data.endedIdentityCount, 1)
      assert.equal(preview.json().data.endedRelationshipCount, 1)
      assert.equal((await f.post(`${staged.url}/apply`, {})).statusCode, 409)
      const applied = await f.post(`${staged.url}/apply`, {
        confirmDeactivation: true,
        notes: 'Verified future appointment cancellation',
      })
      assert.equal(applied.statusCode, 200, applied.body)
      const revisions = await prisma.institution_person_roles.findMany({
        where: { institutionId: f.institution.id },
        orderBy: { revision: 'asc' },
      })
      assert.deepEqual(
        revisions.map((row) => row.status),
        ['active', 'ended'],
      )
      assert.equal(revisions[1]!.startsAt?.toISOString(), dates.startsAt)
      assert.equal(revisions[1]!.endsAt, null)
    })

    test('corrections require independent approval, reconcile source changes and never restore reviewer rights', async (t) => {
      const f = await fixture(t)
      await f.sync([personRow('A')])
      const person = await prisma.institution_people.findFirstOrThrow({
        where: { institutionId: f.institution.id },
      })
      const input = {
        personId: person.id,
        field: 'name',
        value: 'Corrected Name',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        reason: 'Verified against authoritative record; upstream ticket EXAMPLE',
      }
      const created = await f.post(`${f.base}/directory/corrections`, input)
      assert.equal(created.statusCode, 200, created.body)
      const id = created.json().data.id
      const url = `${f.base}/directory/corrections/${id}/decision`
      assert.equal(
        (await f.post(url, { decision: 'approve', notes: 'Self approval is forbidden' }))
          .statusCode,
        403,
      )
      assert.equal(
        (
          await f.post(
            url,
            { decision: 'approve', notes: 'Independent verification' },
            f.platform.id,
          )
        ).statusCode,
        200,
      )
      assert.equal(
        (await prisma.institution_people.findUniqueOrThrow({ where: { id: person.id } })).name,
        'Corrected Name',
      )
      await f.sync([personRow('A')])
      assert.equal(
        (await prisma.institution_people.findUniqueOrThrow({ where: { id: person.id } })).name,
        'Corrected Name',
      )
      await f.sync([{ ...personRow('A'), name: 'Corrected Name' }])
      assert.equal(
        (await prisma.institution_directory_corrections.findUniqueOrThrow({ where: { id } }))
          .status,
        'resolved',
      )
      await prisma.institution_people.update({
        where: { id: person.id },
        data: { userId: f.member.id },
      })
      await f.sync([personRow('A', 'departed')])
      assert.equal(await personAdmitted(prisma, f.institution.id, person.id), false)
      const admission = await f.post(`${f.base}/directory/corrections`, {
        ...input,
        field: 'admission',
        value: 'allow',
      })
      assert.equal(admission.statusCode, 200, admission.body)
      assert.equal(
        (
          await f.post(
            `${f.base}/directory/corrections/${admission.json().data.id}/decision`,
            {
              decision: 'approve',
              notes: 'Source status verified incorrect; temporary login only',
            },
            f.platform.id,
          )
        ).statusCode,
        200,
      )
      assert.equal(await personAdmitted(prisma, f.institution.id, person.id), true)
      assert.deepEqual(
        await eligibleGrantPeople(prisma, f.institution.id, 'library_final', null),
        [],
      )
      assert.equal(
        (
          await f.post(`${f.base}/review-governance/grants`, {
            personId: person.id,
            role: 'library_final',
            startsAt: new Date().toISOString(),
            endsAt: null,
            notes: 'Exception must not grant review rights',
          })
        ).statusCode,
        409,
      )
      const identifier = await prisma.institution_person_identifiers.findFirstOrThrow({
        where: { personId: person.id },
      })
      assert.equal(
        await assertInstitutionIdentitySession(prisma, f.member.id, {
          institutionIdentifierId: identifier.id,
          institutionIdentifierVersion: identifier.version,
        }),
        true,
      )
      await f.post(`${f.base}/directory/people/${person.id}/suspension`, {
        suspended: true,
        notes: 'Independent security hold',
      })
      assert.equal(await personAdmitted(prisma, f.institution.id, person.id), false)
      assert.equal(
        await assertInstitutionIdentitySession(prisma, f.member.id, {
          institutionIdentifierId: identifier.id,
          institutionIdentifierVersion: identifier.version,
        }),
        false,
      )
      await f.sync([personRow('A')])
      assert.equal(
        (await prisma.institution_people.findUniqueOrThrow({ where: { id: person.id } }))
          .manually_suspended,
        true,
      )
    })

    test('expired or conflicted corrections stop applying and foreign institutions cannot inspect personnel', async (t) => {
      const f = await fixture(t)
      await f.sync([personRow('A')])
      const person = await prisma.institution_people.findFirstOrThrow({
        where: { institutionId: f.institution.id },
      })
      const create = async (): Promise<string> => {
        const requested = await f.post(`${f.base}/directory/corrections`, {
          personId: person.id,
          field: 'name',
          value: 'Temporary name',
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          reason: 'Verified temporary typo correction',
        })
        assert.equal(requested.statusCode, 200, requested.body)
        const id = requested.json().data.id as string
        assert.equal(
          (
            await f.post(
              `${f.base}/directory/corrections/${id}/decision`,
              { decision: 'approve', notes: 'Independent verification' },
              f.platform.id,
            )
          ).statusCode,
          200,
        )
        return id
      }
      const expiredId = await create()
      await prisma.institution_directory_corrections.update({
        where: { id: expiredId },
        data: {
          createdAt: new Date(Date.now() - 86400000),
          expiresAt: new Date(Date.now() - 1000),
        },
      })
      const headers = { authorization: `Bearer ${f.token(f.owner.id)}` }
      const history = await f.app.inject({
        url: `${f.base}/directory/people/${person.id}/history`,
        headers,
      })
      assert.equal(history.statusCode, 200, history.body)
      assert.equal(history.json().data.person.name, 'Same Name')
      assert.equal(
        (
          await prisma.institution_directory_corrections.findUniqueOrThrow({
            where: { id: expiredId },
          })
        ).status,
        'expired',
      )
      const conflictedId = await create()
      await f.sync([{ ...personRow('A'), name: 'Another authoritative name' }])
      assert.equal(
        (
          await prisma.institution_directory_corrections.findUniqueOrThrow({
            where: { id: conflictedId },
          })
        ).status,
        'conflicted',
      )
      assert.equal(
        (await prisma.institution_people.findUniqueOrThrow({ where: { id: person.id } })).name,
        'Another authoritative name',
      )
      const foreign = await f.app.inject({
        url: `/v1/institutions/not-this-institution/directory/people/${person.id}/history`,
        headers,
      })
      assert.equal(foreign.statusCode, 404)
      assert.equal(
        (
          await f.post(`${f.base}/review-governance/simulate`, {
            contentType: 'paper',
            requestKind: 'submission',
            personIds: [randomUUID()],
            nodeIds: [],
          })
        ).statusCode,
        400,
      )
    })

    test('routing simulation, immutable rule revisions, supervisor grants and conflict rounds are enforced', async (t) => {
      const f = await fixture(t)
      await f.sync(
        [
          personRow('STUDENT'),
          personRow('SUPERVISOR'),
          personRow('FINAL'),
          {
            kind: 'identity',
            externalId: 'doctoral',
            personExternalId: 'STUDENT',
            code: 'doctoral_student',
            status: 'active',
            startsAt: null,
            endsAt: null,
          },
          {
            kind: 'relationship',
            externalId: 'supervisor',
            personExternalId: 'STUDENT',
            relatedPersonExternalId: 'SUPERVISOR',
            relationship: 'supervisor',
            status: 'active',
            startsAt: null,
            endsAt: null,
          },
        ],
        'full',
        2,
      )
      const student = await prisma.institution_people.findFirstOrThrow({
        where: { institutionId: f.institution.id, internalId: 'STUDENT' },
      })
      const supervisor = await prisma.institution_people.findFirstOrThrow({
        where: { institutionId: f.institution.id, internalId: 'SUPERVISOR' },
      })
      const final = await prisma.institution_people.findFirstOrThrow({
        where: { institutionId: f.institution.id, internalId: 'FINAL' },
      })
      const supervisorUser = await f.user('supervisor')
      await prisma.institution_people.update({
        where: { id: supervisor.id },
        data: { userId: supervisorUser.id },
      })
      for (const [personId, role] of [
        [supervisor.id, 'supervisor'],
        [final.id, 'library_final'],
      ]) {
        const grant = await f.post(`${f.base}/review-governance/grants`, {
          personId,
          role,
          startsAt: new Date(Date.now() - 1000).toISOString(),
          endsAt: null,
          notes: 'Explicit reviewer appointment',
        })
        assert.equal(grant.statusCode, 200, grant.body)
      }
      const finalStage = {
        name: 'Library final',
        groups: [{ kind: 'role', role: 'library_final' }],
        deadlineHours: 24,
      }
      const enabled = await f.app.inject({
        method: 'PUT',
        url: `${f.base}/review-governance/workflows/paper`,
        headers: { authorization: `Bearer ${f.token(f.owner.id)}` },
        payload: { name: 'Default', steps: [finalStage] },
      })
      assert.equal(enabled.statusCode, 200, enabled.body)
      const rule = {
        key: 'doctoral',
        name: 'Doctoral submissions',
        contentType: 'paper',
        priority: 100,
        identityCodes: ['doctoral_student'],
        nodeIds: [],
        requestKinds: ['submission'],
        enabled: true,
        expectedRevision: 0,
        notes: 'Published after validation',
        steps: [
          { name: 'Supervisor', groups: [{ kind: 'supervisors' }], deadlineHours: 24 },
          finalStage,
        ],
      }
      assert.equal(
        (await f.post(`${f.base}/review-governance/routes`, rule, f.member.id)).statusCode,
        403,
      )
      const created = await f.post(`${f.base}/review-governance/routes`, rule)
      assert.equal(created.statusCode, 200, created.body)
      const preview = await f.post(`${f.base}/review-governance/simulate`, {
        contentType: 'paper',
        requestKind: 'submission',
        personIds: [student.id],
        nodeIds: [],
      })
      assert.equal(preview.statusCode, 200, preview.body)
      assert.equal(preview.json().data.routing.selected.key, 'doctoral')
      assert.equal(preview.json().data.stages[0].reviewers[0].personId, supervisor.id)
      assert.equal((await f.post(`${f.base}/review-governance/routes`, rule)).statusCode, 409)
      const other = await f.post(`${f.base}/review-governance/routes`, {
        ...rule,
        key: 'conflicting',
      })
      assert.equal(other.statusCode, 200, other.body)
      const conflict = await f.post(`${f.base}/review-governance/simulate`, {
        contentType: 'paper',
        requestKind: 'submission',
        personIds: [student.id],
        nodeIds: [],
      })
      assert.match(conflict.json().data.routing.error, /highest priority/)
      const paper = await prisma.papers.create({
        data: {
          title: 'Synthetic routing case',
          doi: `10.5555/${randomUUID()}`,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      })
      const submission = await prisma.paper_submissions.create({
        data: { paperId: paper.id, userId: f.member.id, institutionId: f.institution.id },
      })
      const review = await prisma.content_review_cases.create({
        data: {
          institutionId: f.institution.id,
          content_type: 'paper',
          subjectId: randomUUID(),
          currentVersionId: submission.id,
          submittedBy: f.member.id,
        },
      })
      await prisma.content_review_participant_scopes.create({
        data: {
          caseId: review.id,
          versionId: submission.id,
          personIds: [student.id],
          nodeIds: [],
          verifiedBy: f.owner.id,
          notes: 'Verified authors',
        },
      })
      await prisma.$transaction((tx) =>
        submitReviewCase(f.app, tx, {
          caseId: review.id,
          actorId: f.member.id,
          versionId: submission.id,
        }),
      )
      const blocked = await prisma.content_review_tasks.findFirstOrThrow({
        where: { step: { caseId: review.id }, kind: 'routing' },
      })
      assert.ok(blocked.exception)
      const reassign = await f.post(`${f.base}/review-governance/tasks/${blocked.id}/reassign`, {
        personId: final.id,
        notes: 'Cannot bypass conflict',
        expectedVersionId: submission.id,
      })
      assert.equal(reassign.statusCode, 409)
      assert.equal(
        (
          await f.post(`${f.base}/review-governance/routes`, {
            ...rule,
            key: 'conflicting',
            expectedRevision: 1,
            enabled: false,
          })
        ).statusCode,
        200,
      )
      const rerouted = await f.post(`${f.base}/review-governance/cases/${review.id}/reroute`, {
        versionId: submission.id,
        notes: 'Conflict resolved; repeat review with current rules',
      })
      assert.equal(rerouted.statusCode, 200, rerouted.body)
      assert.equal(await prisma.content_review_rounds.count({ where: { caseId: review.id } }), 2)
      const task = await prisma.content_review_tasks.findFirstOrThrow({
        where: { step: { caseId: review.id, roundNumber: 2 }, kind: 'relationship' },
      })
      assert.equal(await canActOnTask(prisma, f.institution.id, supervisorUser.id, task), true)
      await f.sync(
        [
          {
            kind: 'relationship',
            externalId: 'supervisor',
            personExternalId: 'STUDENT',
            relatedPersonExternalId: 'SUPERVISOR',
            relationship: 'supervisor',
            status: 'ended',
            startsAt: null,
            endsAt: null,
          },
        ],
        'incremental',
        2,
      )
      assert.equal(await canActOnTask(prisma, f.institution.id, supervisorUser.id, task), false)
      const first = await prisma.content_review_rounds.findFirstOrThrow({
        where: { caseId: review.id, number: 1 },
      })
      assert.ok(JSON.stringify(first.workflowSnapshot).includes('highest priority'))
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
      await prisma.users.update({
        where: { id: f.member.id },
        data: { platform_role: 'platform_admin' },
      })
      await prisma.institution_memberships.updateMany({
        where: { institutionId: f.institution.id, userId: f.member.id },
        data: { role: 'owner', can_review_content: true, can_import_data: true },
      })
      const lab = await prisma.labs.create({
        data: {
          institutionId: f.institution.id,
          name: 'Departing lab',
          slug: `departure-${randomUUID()}`,
        },
      })
      await prisma.lab_memberships.create({
        data: { labId: lab.id, userId: f.member.id, role: 'owner' },
      })
      const credential = await prisma.institution_api_credentials.create({
        data: {
          institutionId: f.institution.id,
          createdBy: f.member.id,
          name: 'Departing integration',
          clientId: randomUUID(),
          secretHash: 'private',
          scopes: ['papers:import'],
          expiresAt: new Date(Date.now() + 86400000),
        },
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
      assert.equal(
        (await prisma.users.findUniqueOrThrow({ where: { id: f.member.id } })).platform_role,
        'member',
      )
      assert.equal(
        (
          await prisma.lab_memberships.findFirstOrThrow({
            where: { labId: lab.id, userId: f.member.id },
          })
        ).role,
        'member',
      )
      assert.ok(
        (
          await prisma.institution_api_credentials.findUniqueOrThrow({
            where: { id: credential.id },
          })
        ).revokedAt,
      )
      await f.sync([personRow('A')])
      const returned = await prisma.institution_memberships.findFirstOrThrow({
        where: { institutionId: f.institution.id, userId: f.member.id },
      })
      assert.equal(returned.role, 'member')
      assert.equal(returned.can_review_content, false)
      assert.equal(returned.can_import_data, false)
      assert.equal(
        (await prisma.users.findUniqueOrThrow({ where: { id: f.member.id } })).platform_role,
        'member',
      )
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
      for (const suffix of ['progress', 'history', `stages/${randomUUID()}/tasks`])
        assert.equal(
          (await f.app.inject({ url: `/v1/reviews/cases/${randomUUID()}/${suffix}`, headers }))
            .statusCode,
          403,
        )
      for (const path of ['/directory/corrections', '/review-governance/routes'])
        assert.equal((await f.app.inject({ url: `${f.base}${path}`, headers })).statusCode, 403)
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
      const first = await createPaper(f.app, input, f.owner.id, 'same-paper-attempt')
      const retries = await Promise.all([
        createPaper(f.app, input, f.owner.id, 'same-paper-attempt'),
        createPaper(f.app, input, f.owner.id, 'same-paper-attempt'),
      ])
      assert.ok(retries.every((result) => result.submissionId === first.submissionId))
      assert.equal(await prisma.paper_submissions.count({ where: { paperId: first.id } }), 1)
      await assert.rejects(
        createPaper(
          f.app,
          { ...input, title: 'Different payload' },
          f.owner.id,
          'same-paper-attempt',
        ),
        /Idempotency/,
      )
      const preflight = await f.post(
        '/v1/papers/submission-check',
        { doi: input.doi, institutionId: f.institution.id },
        f.member.id,
      )
      assert.equal(preflight.statusCode, 200, preflight.body)
      assert.deepEqual(preflight.json().data, { action: 'pending', paperId: null })
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
      const publishedPreflight = await f.post('/v1/papers/submission-check', {
        doi: `https://doi.org/${input.doi}`,
        institutionId: f.institution.id,
      })
      assert.equal(publishedPreflight.json().data.action, 'change_request')
      await assert.rejects(
        updatePaper(f.app, first.id, { title: 'Bypass attempt' }, f.platform.id),
        /versioned change request/,
      )
      await assert.rejects(deletePaper(f.app, first.id, f.platform.id), /cannot be deleted/)
      await assert.rejects(
        reviewLegacyPaperImport(f.app, f.institution.id, randomUUID(), f.platform.id, {
          decision: 'approve',
          notes: 'Legacy bypass attempt',
        }),
        /Governed imports require/,
      )
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
