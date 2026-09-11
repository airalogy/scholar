import assert from 'node:assert/strict'
import { test, type TestContext } from 'node:test'
import { randomUUID } from 'node:crypto'
import Fastify, { type FastifyInstance } from 'fastify'
import sensible from '@fastify/sensible'
import type { PrismaClient } from '../../prisma/generated/client'
import jwtPlugin from '../../src/plugins/global/jwt'
import routes from '../../src/routes/v2/institutions'
import bibliometricRoutes from '../../src/routes/v2/bibliometrics'
import paperBibliographyRoutes from '../../src/routes/v2/papers'
import { writePaperBibliography } from '../../src/bibliography/write'
import type { ImportView } from '../../src/routes/v2/institutions/schema'

interface Fixture {
  app: FastifyInstance
  institutionId: string
  memberId: string
  adminId: string
  url: string
  headers: Record<string, string>
  adminHeaders: Record<string, string>
}

export const createBibliographyFixture = async (
  prisma: PrismaClient,
  t: TestContext,
  managed = false,
): Promise<Fixture> => {
  const institution = await prisma.institutions.create({
    data: { name: 'Anonymous Institute', slug: randomUUID() },
  })
  const member = await prisma.users.create({
    data: {
      username: randomUUID(),
      name: 'Anonymous Importer',
      email: `${randomUUID()}@example.test`,
    },
  })
  const admin = await prisma.users.create({
    data: {
      username: randomUUID(),
      name: 'Anonymous Admin',
      email: `${randomUUID()}@example.test`,
      platform_role: 'platform_admin',
    },
  })
  await prisma.institution_memberships.create({
    data: { institutionId: institution.id, userId: member.id, can_import_data: true },
  })
  const app = Fastify({ logger: false })
  await app.register(sensible)
  app.decorate('config', {
    JWT_SECRET: 'anonymous-import-preview-test-secret-at-least-32',
  } as never)
  app.decorate('prisma', prisma)
  app.decorate('deployment', {
    managementMode: managed ? 'airalogy_managed' : 'self_hosted',
    institution: { slug: institution.slug },
    paperLibrary: { fixedInstitutionSlug: institution.slug },
  } as never)
  await app.register(jwtPlugin)
  await app.register(routes, { prefix: '/v2/institutions' })
  await app.register(bibliometricRoutes, { prefix: '/v2/bibliometrics' })
  await app.register(paperBibliographyRoutes, { prefix: '/v2/papers' })
  await app.ready()
  t.after(() => app.close())
  return {
    app,
    institutionId: institution.id,
    memberId: member.id,
    adminId: admin.id,
    url: `/v2/institutions/${institution.slug}/imports`,
    headers: {
      authorization: `Bearer ${app.jwt.sign({ userId: member.id })}`,
      'idempotency-key': randomUUID(),
    },
    adminHeaders: { authorization: `Bearer ${app.jwt.sign({ userId: admin.id })}` },
  }
}
export const registerBibliographyPreviewCases = (getClient: () => PrismaClient): void => {
  const fixture = (t: TestContext, managed = false): Promise<Fixture> =>
    createBibliographyFixture(getClient(), t, managed)
  const paper = (): { title: string; doi: string } => ({
    title: 'Anonymous fixture',
    doi: `10.1234/${randomUUID()}`,
  })
  const preview = async (f: Fixture, items: unknown[]): Promise<ImportView> => {
    const result = await f.app.inject({
      method: 'POST',
      url: `${f.url}/papers`,
      headers: f.headers,
      payload: { schema_version: 2, source: 'anonymous-test', items },
    })
    assert.equal(result.statusCode, 200, result.body)
    return result.json().data as ImportView
  }

  test('v2 preview leaves no canonical data, jobs or audit events and preserves row-level validation results', async (t) => {
    const f = await fixture(t)
    const prisma = getClient()
    const incoming = {
      titles: [
        { language: 'zh', title: '匿名论文', is_primary: true },
        { language: 'en', title: 'Anonymous paper' },
      ],
      identifiers: [{ scheme: 'cnki', value: randomUUID() }],
      authors: [{ name: 'Anonymous A', order: 1, corresponding: false }],
    }
    const before = await Promise.all([
      prisma.papers.count(),
      prisma.authors.count(),
      prisma.paper_metadata_events.count(),
      prisma.paper_index_jobs.count(),
    ])
    const record = await preview(f, [
      { source_row: 2, paper: incoming },
      { source_row: 3, paper: { title: 'Invalid missing identity' } },
    ])
    assert.equal(record.status, 'ready')
    assert.equal(record.summary.ready, 1)
    assert.equal(record.summary.errors, 1)
    assert.equal(record.items[0].source_row, 2)
    assert.equal(record.items[0].paper_id, null)
    assert.equal(record.items[1].issues[0]?.code, 'missing_identifier')
    assert.deepEqual(
      await Promise.all([
        prisma.papers.count(),
        prisma.authors.count(),
        prisma.paper_metadata_events.count(),
        prisma.paper_index_jobs.count(),
      ]),
      before,
    )
    const detail = await f.app.inject({
      method: 'GET',
      url: `${f.url}/${record.id}/items/${record.items[0].id}`,
      headers: f.headers,
    })
    assert.equal(detail.statusCode, 200, detail.body)
    assert.equal(detail.json().data.paper.authors[0].corresponding, false)
    assert.ok(
      detail.json().data.changes.some((change: { field: string }) => change.field === 'titles'),
    )
    const applied = await f.app.inject({
      method: 'POST',
      url: `${f.url}/${record.id}/apply`,
      headers: f.headers,
      payload: {},
    })
    assert.equal(applied.statusCode, 200, applied.body)
    assert.equal(applied.json().data.summary.completed, 1)
    assert.equal(applied.json().data.summary.errors, 1)
    const saved = await prisma.papers.findUniqueOrThrow({
      where: { id: applied.json().data.items[0].paper_id },
      include: { titles: true, author_links: true },
    })
    assert.equal(saved.doi, null)
    assert.equal(saved.titles.length, 2)
    assert.equal(saved.author_links[0]?.corresponding, false)
    assert.equal(await prisma.paper_metadata_events.count({ where: { paperId: saved.id } }), 1)
    const repeat = await f.app.inject({
      method: 'POST',
      url: `${f.url}/${record.id}/apply`,
      headers: f.headers,
      payload: {},
    })
    assert.equal(repeat.statusCode, 200, repeat.body)
    assert.equal(await prisma.paper_metadata_events.count({ where: { paperId: saved.id } }), 1)
  })

  test('v2 uses strict JSON types, authorization, bounded batches and idempotency', async (t) => {
    const f = await fixture(t)
    const item = paper()
    const body = { schema_version: 2, source: 'anonymous-test', items: [{ paper: item }] }
    assert.equal(
      (await f.app.inject({ method: 'POST', url: `${f.url}/papers`, payload: body })).statusCode,
      401,
    )
    for (const value of [0, 1, 'true', 'false']) {
      const result = await f.app.inject({
        method: 'POST',
        url: `${f.url}/papers`,
        headers: f.headers,
        payload: {
          ...body,
          items: [{ paper: { ...item, authors: [{ name: 'A', order: 1, corresponding: value }] } }],
        },
      })
      assert.equal(result.statusCode, 400, result.body)
    }
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: `${f.url}/papers`,
          headers: f.headers,
          payload: { ...body, items: Array.from({ length: 501 }, () => ({ paper: item })) },
        })
      ).statusCode,
      400,
    )
    const record = await preview(f, [{ paper: item }])
    assert.equal((await preview(f, [{ paper: item }])).id, record.id)
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: `${f.url}/papers`,
          headers: f.headers,
          payload: { ...body, source: 'different' },
        })
      ).statusCode,
      409,
    )
    const membership = await getClient().institution_memberships.findUniqueOrThrow({
      where: { institutionId_userId: { institutionId: f.institutionId, userId: f.memberId } },
    })
    await getClient().institution_memberships.update({
      where: { id: membership.id },
      data: { can_import_data: false },
    })
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: `${f.url}/${record.id}/apply`,
          headers: f.headers,
          payload: {},
        })
      ).statusCode,
      403,
    )
  })

  test('confirmation detects data changes after preview and rolls back the affected row', async (t) => {
    const f = await fixture(t)
    const item = paper()
    const context = {
      institutionId: f.institutionId,
      actorUserId: f.memberId,
      source: 'anonymous-test',
    }
    const saved = await getClient().$transaction((tx) => writePaperBibliography(tx, item, context))
    const record = await preview(f, [{ paper: { ...item, abstract: 'Previewed update' } }])
    await getClient().$transaction((tx) =>
      writePaperBibliography(tx, { ...item, abstract: 'Newer edit' }, context),
    )
    const result = await f.app.inject({
      method: 'POST',
      url: `${f.url}/${record.id}/apply`,
      headers: f.headers,
      payload: {},
    })
    assert.equal(result.statusCode, 200, result.body)
    assert.equal(result.json().data.items[0].issues[0].code, 'stale_preview')
    assert.equal(
      (await getClient().papers.findUniqueOrThrow({ where: { id: saved.paperId } })).abstract,
      'Newer edit',
    )
  })

  test('managed imports require platform review and new claims still enter the content review workflow', async (t) => {
    const f = await fixture(t, true)
    const item = paper()
    const record = await preview(f, [{ paper: item }])
    const submitted = await f.app.inject({
      method: 'POST',
      url: `${f.url}/${record.id}/apply`,
      headers: f.headers,
      payload: {},
    })
    assert.equal(submitted.statusCode, 200, submitted.body)
    assert.equal(submitted.json().data.summary.pending_review, 1)
    assert.equal(await getClient().papers.count({ where: { normalized_doi: item.doi } }), 0)
    const payload = { decision: 'approve', notes: 'Verified anonymous fixture' }
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: `${f.url}/${record.id}/review`,
          headers: f.headers,
          payload,
        })
      ).statusCode,
      403,
    )
    const approved = await f.app.inject({
      method: 'POST',
      url: `${f.url}/${record.id}/review`,
      headers: f.adminHeaders,
      payload,
    })
    assert.equal(approved.statusCode, 200, approved.body)
    assert.equal(approved.json().data.summary.completed, 1)
    const row = approved.json().data.items[0]
    assert.equal(row.decision, 'applied_pending_content_review')
    const claim = await getClient().paper_claims.findUniqueOrThrow({
      where: { id: row.target_id },
      include: { review_case: true },
    })
    assert.equal(claim.review_case.status, 'pending_review')
    assert.equal(claim.submittedBy, f.memberId)
    assert.equal(claim.review_case.submittedBy, f.memberId)
    assert.equal(
      (
        await getClient().paper_submissions.findUniqueOrThrow({
          where: { id: claim.submissionId! },
        })
      ).userId,
      f.memberId,
    )
    assert.equal(
      (
        await getClient().paper_metadata_events.findFirstOrThrow({
          where: { paperId: claim.paperId },
        })
      ).actorUserId,
      f.adminId,
    )
    const bibliographyUrl = `/v2/papers/${claim.paperId}/bibliography`
    const ownPaper = await f.app.inject({ method: 'GET', url: bibliographyUrl, headers: f.headers })
    assert.equal(ownPaper.statusCode, 200, ownPaper.body)
    assert.equal((await f.app.inject({ method: 'GET', url: bibliographyUrl })).statusCode, 403)
    const detail = await f.app.inject({
      method: 'GET',
      url: `${f.url}/${record.id}/items/${row.id}`,
      headers: f.headers,
    })
    assert.equal(detail.json().data.claim_review_status, 'pending_review')
    assert.equal(
      (await getClient().institution_data_imports.findUniqueOrThrow({ where: { id: record.id } }))
        .reviewedBy,
      f.adminId,
    )
  })

  test('managed review rejection and cross-institution item references cannot mutate canonical data', async (t) => {
    const f = await fixture(t, true)
    const other = await fixture(t)
    const item = paper()
    const record = await preview(f, [{ paper: item }])
    const otherRecord = await preview(other, [{ paper: paper() }])
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: `${f.url}/${record.id}/apply`,
          headers: f.headers,
          payload: { item_ids: [otherRecord.items[0].id] },
        })
      ).statusCode,
      404,
    )
    assert.equal(
      (
        await other.app.inject({
          method: 'GET',
          url: `${other.url}/${record.id}`,
          headers: other.headers,
        })
      ).statusCode,
      404,
    )
    await f.app.inject({
      method: 'POST',
      url: `${f.url}/${record.id}/apply`,
      headers: f.headers,
      payload: {},
    })
    const rejected = await f.app.inject({
      method: 'POST',
      url: `${f.url}/${record.id}/review`,
      headers: f.adminHeaders,
      payload: { decision: 'reject', notes: 'Not accepted' },
    })
    assert.equal(rejected.statusCode, 200, rejected.body)
    assert.equal(rejected.json().data.summary.rejected, 1)
    assert.equal(await getClient().papers.count({ where: { normalized_doi: item.doi } }), 0)
  })

  test('optional custom-field warnings require explicit acknowledgement and cannot clear stored data', async (t) => {
    const f = await fixture(t)
    await getClient().institution_paper_field_definitions.create({
      data: { institutionId: f.institutionId, key: 'flag', label: 'Flag', field_type: 'boolean' },
    })
    const item = { ...paper(), institution_metadata: { custom_fields: { flag: 1 } } }
    const record = await preview(f, [{ paper: item }])
    assert.equal(record.items[0].issues[0]?.code, 'invalid_custom_field')
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: `${f.url}/${record.id}/apply`,
          headers: f.headers,
          payload: {},
        })
      ).statusCode,
      409,
    )
    const accepted = await f.app.inject({
      method: 'POST',
      url: `${f.url}/${record.id}/apply`,
      headers: f.headers,
      payload: { acknowledge_warnings: true },
    })
    assert.equal(accepted.statusCode, 200, accepted.body)
    assert.equal(accepted.json().data.summary.completed, 1)
    const metadata = await getClient().institution_paper_metadata.findUniqueOrThrow({
      where: {
        institutionId_paperId: {
          institutionId: f.institutionId,
          paperId: accepted.json().data.items[0].paper_id,
        },
      },
    })
    assert.deepEqual(metadata.custom_fields, {})
  })

  test('duplicate identities are reported per row and interrupted previews resume without duplicate data', async (t) => {
    const f = await fixture(t)
    const item = paper()
    const record = await preview(f, [{ paper: item }, { paper: item }])
    assert.equal(record.summary.ready, 1)
    assert.equal(record.summary.errors, 1)
    assert.equal(record.items[1].issues[0]?.code, 'duplicate_batch_identity')
    await getClient().institution_data_imports.update({
      where: { id: record.id },
      data: { status: 'previewing', processingToken: randomUUID(), leaseExpiresAt: new Date(0) },
    })
    await getClient().institution_data_import_items.update({
      where: { id: record.items[1].id },
      data: { status: 'pending' },
    })
    const resumed = await preview(f, [{ paper: item }, { paper: item }])
    assert.equal(resumed.id, record.id)
    assert.equal(resumed.summary.errors, 1)
    assert.equal(await getClient().papers.count({ where: { normalized_doi: item.doi } }), 0)
    assert.equal(
      await getClient().institution_data_import_items.count({ where: { importId: record.id } }),
      2,
    )
  })
}
