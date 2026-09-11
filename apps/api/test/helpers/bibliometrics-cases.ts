import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import type { PrismaClient } from '../../prisma/generated/client'
import { createBibliographyFixture } from './bibliography-preview-cases'

const base = '/v2/bibliometrics'
export const registerBibliometricCases = (getClient: () => PrismaClient): void => {
  test('withdrawing a draft observation is audited and never removes a published original', async (t) => {
    const prisma = getClient()
    const f = await createBibliographyFixture(prisma, t)
    const edition = await prisma.bibliometric_editions.create({
      data: {
        system: 'esi',
        version: randomUUID(),
        source: 'Fixture',
        observed_on: new Date('2026-09-01'),
      },
    })
    const paper = await prisma.papers.create({
      data: { title: 'Anonymous paper', createdAt: new Date(), updatedAt: new Date() },
    })
    const observation = await prisma.paper_indicators.create({
      data: {
        paperId: paper.id,
        editionId: edition.id,
        kind: 'hot',
        value: false,
        source: 'Fixture',
      },
    })
    await prisma.bibliometric_editions.update({
      where: { id: edition.id },
      data: { status: 'published', publishedAt: new Date() },
    })
    const payload = {
      expected_revision: 1,
      notes: 'Remove invalid observation',
      observation_type: 'indicator',
      observation_id: observation.id,
    }
    const original = await f.app.inject({
      method: 'POST',
      url: `${base}/editions/${edition.id}/withdraw`,
      headers: f.adminHeaders,
      payload,
    })
    assert.equal(original.statusCode, 409, original.body)
    const revision = await f.app.inject({
      method: 'POST',
      url: `${base}/editions/${edition.id}/revisions`,
      headers: f.adminHeaders,
      payload: { expected_revision: 1, notes: 'Correction' },
    })
    assert.equal(revision.statusCode, 200, revision.body)
    const copyId = revision.json().data.id
    const copy = await prisma.paper_indicators.findFirstOrThrow({ where: { editionId: copyId } })
    const foreign = await f.app.inject({
      method: 'POST',
      url: `${base}/editions/${copyId}/withdraw`,
      headers: f.adminHeaders,
      payload,
    })
    assert.equal(foreign.statusCode, 404, foreign.body)
    const removed = await f.app.inject({
      method: 'POST',
      url: `${base}/editions/${copyId}/withdraw`,
      headers: f.adminHeaders,
      payload: { ...payload, observation_id: copy.id },
    })
    assert.equal(removed.statusCode, 200, removed.body)
    assert.equal(removed.json().data.indicator_count, 0)
    assert.equal(removed.json().data.content_revision, 2)
    assert.equal(await prisma.paper_indicators.count({ where: { editionId: edition.id } }), 1)
    const event = await prisma.bibliometric_edition_events.findFirstOrThrow({
      where: { editionId: copyId, action: 'withdrawn' },
    })
    assert.equal(event.actorUserId, f.adminId)
    assert.equal((event.changes as { before: { value: boolean } }).before.value, false)
  })
  test('journal editions can be curated, published and revised without changing historical rankings', async (t) => {
    const prisma = getClient()
    const f = await createBibliographyFixture(prisma, t)
    const journal = await prisma.journals.create({
      data: { name: `Anonymous journal ${randomUUID()}` },
    })
    const create = await f.app.inject({
      method: 'POST',
      url: `${base}/editions`,
      headers: f.adminHeaders,
      payload: {
        system: 'jcr',
        version: randomUUID(),
        metric_year: 2025,
        released_on: '2026-06-01',
        source: 'Anonymous catalog',
        notes: 'Initialize',
      },
    })
    assert.equal(create.statusCode, 200, create.body)
    const edition = create.json().data
    assert.equal(edition.status, 'draft')
    const payload = {
      journal_id: journal.id,
      expected_revision: 0,
      category_level: 'category',
      category: 'Anonymous category',
      metric: 'jif',
      quartile: 1,
      is_top: false,
      notes: 'Verified category',
    }
    const ranking = await f.app.inject({
      method: 'PUT',
      url: `${base}/editions/${edition.id}/rankings`,
      headers: f.adminHeaders,
      payload,
    })
    assert.equal(ranking.statusCode, 200, ranking.body)
    assert.equal(ranking.json().data.content_revision, 1)
    const publish = await f.app.inject({
      method: 'POST',
      url: `${base}/editions/${edition.id}/publish`,
      headers: f.adminHeaders,
      payload: { expected_revision: 1, notes: 'Verified release' },
    })
    assert.equal(publish.statusCode, 200, publish.body)
    assert.equal(publish.json().data.status, 'published')
    const immutable = await f.app.inject({
      method: 'PUT',
      url: `${base}/editions/${edition.id}/rankings`,
      headers: f.adminHeaders,
      payload: { ...payload, expected_revision: 1, quartile: 2 },
    })
    assert.equal(immutable.statusCode, 409, immutable.body)
    await assert.rejects(
      prisma.journal_rankings.updateMany({
        where: { editionId: edition.id },
        data: { quartile: 3 },
      }),
      /immutable/u,
    )
    await assert.rejects(
      prisma.journal_rankings.deleteMany({ where: { editionId: edition.id } }),
      /immutable/u,
    )
    await assert.rejects(
      prisma.bibliometric_editions.update({
        where: { id: edition.id },
        data: { source: 'Tampered' },
      }),
      /immutable/u,
    )
    const revised = await f.app.inject({
      method: 'POST',
      url: `${base}/editions/${edition.id}/revisions`,
      headers: f.adminHeaders,
      payload: { expected_revision: 1, notes: 'Prepare correction' },
    })
    assert.equal(revised.statusCode, 200, revised.body)
    const copy = revised.json().data
    assert.equal(copy.revision, 2)
    assert.equal(copy.ranking_count, 1)
    assert.equal(copy.status, 'draft')
    const corrected = await f.app.inject({
      method: 'PUT',
      url: `${base}/editions/${copy.id}/rankings`,
      headers: f.adminHeaders,
      payload: { ...payload, expected_revision: copy.content_revision, quartile: 2, is_top: null },
    })
    assert.equal(corrected.statusCode, 200, corrected.body)
    assert.equal(
      (await prisma.journal_rankings.findFirstOrThrow({ where: { editionId: edition.id } }))
        .quartile,
      1,
    )
    assert.equal(
      (await prisma.journal_rankings.findFirstOrThrow({ where: { editionId: copy.id } })).quartile,
      2,
    )
    const oldDetail = await f.app.inject({
      method: 'GET',
      url: `${base}/editions/${edition.id}`,
      headers: f.adminHeaders,
    })
    assert.equal(oldDetail.json().data.rankings[0].is_top, false)
    assert.equal(oldDetail.json().data.events[0].action, 'published')
    const list = await f.app.inject({
      method: 'GET',
      url: `${base}/editions?status=published&q=${edition.version}&limit=1`,
      headers: f.adminHeaders,
    })
    assert.equal(list.json().data.total, 1)
    assert.equal(list.json().data.items[0].id, edition.id)
  })

  test('concurrent curators cannot overwrite each other and strict values are checked', async (t) => {
    const prisma = getClient()
    const f = await createBibliographyFixture(prisma, t)
    const edition = await prisma.bibliometric_editions.create({
      data: { system: 'cas', version: randomUUID(), source: 'Fixture' },
    })
    const journal = await prisma.journals.create({ data: { name: 'Anonymous journal' } })
    const payload = {
      expected_revision: 0,
      journal_id: journal.id,
      category_level: 'broad',
      category: 'Science',
      metric: 'cas',
      quartile: 1,
      notes: 'Verified',
    }
    const results = await Promise.all(
      [1, 2].map((quartile) =>
        f.app.inject({
          method: 'PUT',
          url: `${base}/editions/${edition.id}/rankings`,
          headers: f.adminHeaders,
          payload: { ...payload, quartile },
        }),
      ),
    )
    assert.deepEqual(results.map((row) => row.statusCode).sort(), [200, 409])
    assert.equal(
      await prisma.bibliometric_edition_events.count({ where: { editionId: edition.id } }),
      1,
    )
    for (const invalid of [
      { metric: 'jif' },
      { category_level: 'category' },
      { quartile: 5 },
      { is_top: 0 },
      { notes: ' ' },
    ]) {
      const result = await f.app.inject({
        method: 'PUT',
        url: `${base}/editions/${edition.id}/rankings`,
        headers: f.adminHeaders,
        payload: { ...payload, expected_revision: 1, ...invalid },
      })
      assert.equal(result.statusCode, 400, result.body)
    }
    await assert.rejects(
      prisma.journal_rankings.create({
        data: {
          editionId: edition.id,
          journalId: journal.id,
          category: 'Invalid category',
          category_level: 'category',
          metric: 'jif',
          quartile: 1,
          source: 'Fixture',
        },
      }),
      /does not match/u,
    )
    assert.equal(
      (await prisma.bibliometric_editions.findUniqueOrThrow({ where: { id: edition.id } }))
        .content_revision,
      1,
    )
  })

  test('ESI observations remain paper-level and dated; empty editions cannot be published', async (t) => {
    const prisma = getClient()
    const f = await createBibliographyFixture(prisma, t)
    const payload = { system: 'esi', version: randomUUID(), source: 'Fixture', notes: 'Initialize' }
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: `${base}/editions`,
          headers: f.adminHeaders,
          payload,
        })
      ).statusCode,
      400,
    )
    const created = await f.app.inject({
      method: 'POST',
      url: `${base}/editions`,
      headers: f.adminHeaders,
      payload: { ...payload, observed_on: '2026-09-01' },
    })
    assert.equal(created.statusCode, 200, created.body)
    const id = created.json().data.id
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: `${base}/editions/${id}/publish`,
          headers: f.adminHeaders,
          payload: { expected_revision: 0, notes: 'Empty' },
        })
      ).statusCode,
      409,
    )
    const paper = await prisma.papers.create({
      data: { title: 'Anonymous ESI paper', createdAt: new Date(), updatedAt: new Date() },
    })
    const value = {
      expected_revision: 0,
      paper_id: paper.id,
      kind: 'hot',
      category: '',
      value: false,
      notes: 'Explicit negative observation',
    }
    const updated = await f.app.inject({
      method: 'PUT',
      url: `${base}/editions/${id}/indicators`,
      headers: f.adminHeaders,
      payload: value,
    })
    assert.equal(updated.statusCode, 200, updated.body)
    const detail = await f.app.inject({
      method: 'GET',
      url: `${base}/editions/${id}`,
      headers: f.adminHeaders,
    })
    assert.equal(detail.json().data.indicators[0].value, false)
    assert.equal(detail.json().data.edition.observed_on, '2026-09-01')
  })

  test('journal management requires a platform admin or the fixed self-hosted institution manager', async (t) => {
    const prisma = getClient()
    for (const managed of [false, true]) {
      const f = await createBibliographyFixture(prisma, t, managed)
      assert.equal((await f.app.inject({ method: 'GET', url: `${base}/editions` })).statusCode, 401)
      assert.equal(
        (await f.app.inject({ method: 'GET', url: `${base}/editions`, headers: f.headers }))
          .statusCode,
        403,
      )
      await prisma.institution_memberships.update({
        where: { institutionId_userId: { userId: f.memberId, institutionId: f.institutionId } },
        data: { role: 'admin' },
      })
      assert.equal(
        (await f.app.inject({ method: 'GET', url: `${base}/editions`, headers: f.headers }))
          .statusCode,
        managed ? 403 : 200,
      )
      assert.equal(
        (await f.app.inject({ method: 'GET', url: `${base}/editions`, headers: f.adminHeaders }))
          .statusCode,
        200,
      )
      const token = f.app.jwt.sign({
        token_type: 'integration',
        userId: f.adminId,
        institutionId: f.institutionId,
        credentialId: randomUUID(),
        credentialVersion: 1,
        scopes: ['papers:import', 'imports:read'],
      })
      assert.equal(
        (
          await f.app.inject({
            method: 'GET',
            url: `${base}/editions`,
            headers: { authorization: `Bearer ${token}` },
          })
        ).statusCode,
        403,
      )
    }
  })
}
