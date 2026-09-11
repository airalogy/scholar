import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import Fastify, { type FastifyInstance } from 'fastify'
import sensible from '@fastify/sensible'
import type { PrismaClient } from '../../prisma/generated/client'
import jwtPlugin from '../../src/plugins/global/jwt'
import institutionImportRoutes from '../../src/routes/v1/institutions'
import { claimPaperIndexJobs, processPaperIndexJob } from '../../src/bibliography/index-jobs'
import { syncDirectPaperImportItem } from '../../src/bibliography/apply'

export const registerBibliographyIntegrationCases = (getClient: () => PrismaClient): void => {
  const appFor = async (slug: string, managed = false): Promise<FastifyInstance> => {
    const app = Fastify({ logger: false })
    await app.register(sensible)
    app.decorate('config', {
      JWT_SECRET: 'anonymous-bibliography-test-secret-longer-than-32',
    } as never)
    app.decorate('prisma', getClient())
    app.decorate('deployment', {
      managementMode: managed ? 'airalogy_managed' : 'self_hosted',
      institution: { slug },
      paperLibrary: { fixedInstitutionSlug: slug },
    } as never)
    await app.register(jwtPlugin)
    await app.register(institutionImportRoutes, { prefix: '/v1/institutions' })
    await app.ready()
    return app
  }

  test('managed v1 refreshes require independent metadata review without resetting an approved claim', async (t) => {
    const prisma = getClient()
    const institution = await prisma.institutions.create({
      data: { name: 'Anonymous Institute', slug: randomUUID() },
    })
    const user = await prisma.users.create({
      data: { username: randomUUID(), email: `${randomUUID()}@example.test`, name: 'Importer' },
    })
    const admin = await prisma.users.create({
      data: {
        username: randomUUID(),
        email: `${randomUUID()}@example.test`,
        name: 'Reviewer',
        platform_role: 'platform_admin',
      },
    })
    await prisma.institution_memberships.create({
      data: { institutionId: institution.id, userId: user.id, can_import_data: true },
    })
    const app = await appFor(institution.slug, true)
    t.after(() => app.close())
    const item = { title: 'Original title', doi: `10.1234/${randomUUID()}` }
    const original = await syncDirectPaperImportItem(
      app,
      institution.id,
      { type: 'user', userId: user.id, credentialId: null, institutionId: null, scopes: [] },
      item,
      { institutionId: institution.id, labId: null, reviewNodeId: null },
    )
    const claim = await prisma.paper_claims.findUniqueOrThrow({
      where: { id: original.targetId },
      include: { review_case: true },
    })
    const headers = {
      authorization: `Bearer ${app.jwt.sign({ userId: user.id })}`,
      'idempotency-key': randomUUID(),
    }
    const base = `/v1/institutions/${institution.slug}/imports`
    const response = await app.inject({
      method: 'POST',
      url: `${base}/papers`,
      headers,
      payload: { items: [{ ...item, title: 'Reviewed correction' }] },
    })
    assert.equal(response.statusCode, 200, response.body)
    const id = response.json().data.id as string
    assert.equal(response.json().data.status, 'pending_review')
    assert.equal(response.json().data.metadataReviewPending, true)
    const loaded = await app.inject({ method: 'GET', url: `${base}/${id}`, headers })
    assert.equal(loaded.json().data.items[0].status, 'pending')
    const history = await app.inject({ method: 'GET', url: base, headers })
    assert.equal(
      history.json().data.items.find((row: { id: string }) => row.id === id).metadataReviewPending,
      true,
    )
    assert.equal(
      (await prisma.papers.findUniqueOrThrow({ where: { id: original.paperId } })).title,
      'Original title',
    )
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: `${base}/${id}/review`,
          headers,
          payload: { status: 'approved', notes: 'Checked' },
        })
      ).statusCode,
      403,
    )
    const reviewed = await app.inject({
      method: 'POST',
      url: `${base}/${id}/review`,
      headers: { authorization: `Bearer ${app.jwt.sign({ userId: admin.id })}` },
      payload: { status: 'approved', notes: 'Checked against the source' },
    })
    assert.equal(reviewed.statusCode, 200, reviewed.body)
    assert.equal(reviewed.json().data.items[0].status, 'completed')
    assert.equal(reviewed.json().data.metadataReviewPending, false)
    assert.equal(
      (
        await prisma.paper_titles.findFirstOrThrow({
          where: { paperId: original.paperId, is_primary: true },
        })
      ).title,
      'Reviewed correction',
    )
    assert.deepEqual(
      await prisma.paper_claims.findUniqueOrThrow({
        where: { id: claim.id },
        include: { review_case: true },
      }),
      claim,
    )
    assert.equal(await prisma.paper_submissions.count({ where: { paperId: original.paperId } }), 1)
    assert.equal(
      await prisma.institution_data_import_decisions.count({ where: { item: { importId: id } } }),
      1,
    )
  })

  test('the JSON API applies partial batches idempotently and preserves existing review decisions', async (t) => {
    const prisma = getClient()
    const institution = await prisma.institutions.create({
      data: { name: 'Anonymous University', slug: randomUUID() },
    })
    const user = await prisma.users.create({
      data: {
        username: randomUUID(),
        email: `${randomUUID()}@example.test`,
        name: 'Anonymous Importer',
      },
    })
    const membership = await prisma.institution_memberships.create({
      data: {
        institutionId: institution.id,
        userId: user.id,
        role: 'member',
        can_import_data: false,
      },
    })
    const app = await appFor(institution.slug)
    t.after(() => app.close())
    const headers = {
      authorization: `Bearer ${app.jwt.sign({ userId: user.id })}`,
      'idempotency-key': randomUUID(),
    }
    const url = `/v1/institutions/${institution.slug}/imports/papers`
    const item = { title: 'Anonymous API fixture', doi: `10.1234/${randomUUID()}` }
    const payload = { items: [item, { title: 'Invalid DOI', doi: 'invalid' }] }
    assert.equal((await app.inject({ method: 'POST', url, headers, payload })).statusCode, 403)
    await prisma.institution_memberships.update({
      where: { id: membership.id },
      data: { can_import_data: true },
    })
    const first = await app.inject({ method: 'POST', url, headers, payload })
    assert.equal(first.statusCode, 200, first.body)
    assert.equal(first.json().data.summary.created, 1)
    assert.equal(first.json().data.summary.errors, 1)
    const repeat = await app.inject({ method: 'POST', url, headers, payload })
    assert.equal(repeat.json().data.id, first.json().data.id)
    const paper = await prisma.papers.findUniqueOrThrow({ where: { normalized_doi: item.doi } })
    const claim = await prisma.paper_claims.findFirstOrThrow({ where: { paperId: paper.id } })
    await prisma.content_review_cases.update({
      where: { id: claim.reviewCaseId },
      data: { status: 'changes_requested' },
    })
    const reviewBefore = await prisma.content_review_cases.findUniqueOrThrow({
      where: { id: claim.reviewCaseId },
    })
    const changed = await app.inject({
      method: 'POST',
      url,
      headers: { ...headers, 'idempotency-key': randomUUID() },
      payload: { items: [{ ...item, abstract: 'Updated metadata' }] },
    })
    assert.equal(changed.statusCode, 200, changed.body)
    assert.equal(changed.json().data.summary.updated, 1)
    assert.deepEqual(
      await prisma.content_review_cases.findUniqueOrThrow({ where: { id: claim.reviewCaseId } }),
      reviewBefore,
    )
    assert.deepEqual(
      await prisma.paper_claims.findUniqueOrThrow({ where: { id: claim.id } }),
      claim,
    )
    assert.equal(await prisma.paper_submissions.count({ where: { paperId: paper.id } }), 1)
    assert.equal(await prisma.paper_metadata_events.count({ where: { paperId: paper.id } }), 2)
    assert.equal(
      (await prisma.paper_index_jobs.findUniqueOrThrow({ where: { paperId: paper.id } })).status,
      'queued',
    )
  })

  test('concurrent workers claim disjoint jobs and recover only expired leases', async () => {
    const prisma = getClient()
    // Earlier cases may have queued jobs: mark them complete so this case has an
    // exact, isolated queue. All records live in this suite's disposable schema.
    await prisma.paper_index_jobs.updateMany({ data: { status: 'completed' } })
    const papers = await Promise.all(
      Array.from({ length: 3 }, () =>
        prisma.papers.create({
          data: { title: 'Queue fixture', createdAt: new Date(), updatedAt: new Date() },
        }),
      ),
    )
    await prisma.paper_index_jobs.createMany({
      data: papers.map((paper) => ({ paperId: paper.id, availableAt: new Date(0) })),
    })
    const [a, b] = await Promise.all([
      claimPaperIndexJobs(prisma, 'worker-a'),
      claimPaperIndexJobs(prisma, 'worker-b'),
    ])
    assert.equal(a.length + b.length, 3)
    assert.equal(new Set([...a, ...b].map((job) => job.paperId)).size, 3)
    assert.deepEqual(await claimPaperIndexJobs(prisma, 'worker-c'), [])
    const expired = [...a, ...b][0]
    await prisma.paper_index_jobs.update({
      where: { paperId: expired.paperId },
      data: { leaseUntil: new Date(0) },
    })
    const recovered = await claimPaperIndexJobs(prisma, 'worker-c')
    assert.equal(recovered.length, 1)
    assert.equal(recovered[0].paperId, expired.paperId)
    assert.equal(recovered[0].attempts, 2)
    await prisma.paper_index_jobs.update({
      where: { paperId: expired.paperId },
      data: { attempts: 3, leaseUntil: new Date(0) },
    })
    assert.deepEqual(await claimPaperIndexJobs(prisma, 'worker-d'), [])
    assert.equal(
      (await prisma.paper_index_jobs.findUniqueOrThrow({ where: { paperId: expired.paperId } }))
        .status,
      'failed',
    )
  })

  test('a finishing worker cannot complete a newer queued revision or leak failure details', async (t) => {
    const prisma = getClient()
    const app = Fastify({ logger: false })
    app.decorate('prisma', prisma)
    t.after(() => app.close())
    await prisma.paper_index_jobs.updateMany({ data: { status: 'completed' } })
    const paper = await prisma.papers.create({
      data: { title: 'Queue revision fixture', createdAt: new Date(), updatedAt: new Date() },
    })
    await prisma.paper_index_jobs.create({ data: { paperId: paper.id, availableAt: new Date(0) } })
    const [job] = await claimPaperIndexJobs(prisma, 'worker-a')
    await processPaperIndexJob(app, job, 'worker-a', async () => {
      await prisma.paper_index_jobs.update({
        where: { paperId: paper.id },
        data: { revision: { increment: 1 }, status: 'queued', attempts: 0 },
      })
      assert.deepEqual(await claimPaperIndexJobs(prisma, 'worker-b'), [])
      return { status: 'indexed', chunks: 1, fullTextIndexed: false }
    })
    const queued = await prisma.paper_index_jobs.findUniqueOrThrow({ where: { paperId: paper.id } })
    assert.equal(queued.revision, 2)
    assert.equal(queued.status, 'queued')
    assert.equal(queued.leaseOwner, null)
    for (let attempt = 1; attempt <= 3; attempt++) {
      const [next] = await claimPaperIndexJobs(prisma, 'worker-b')
      await processPaperIndexJob(app, next, 'worker-b', async () => {
        throw new Error('sensitive remote error text')
      })
      const state = await prisma.paper_index_jobs.findUniqueOrThrow({
        where: { paperId: paper.id },
      })
      assert.equal(state.attempts, attempt)
      assert.equal(state.status, attempt === 3 ? 'failed' : 'queued')
      assert.equal(state.lastError, 'index_refresh_failed')
      if (attempt < 3)
        await prisma.paper_index_jobs.update({
          where: { paperId: paper.id },
          data: { availableAt: new Date(0) },
        })
    }
  })
}
