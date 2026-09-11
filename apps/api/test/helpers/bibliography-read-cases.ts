import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import type { PrismaClient } from '../../prisma/generated/client'
import { createBibliographyFixture } from './bibliography-preview-cases'
import { syncDirectPaperImportItem } from '../../src/bibliography/apply'
import { writePaperBibliography } from '../../src/bibliography/write'
import type { BibliographyOutput } from '../../src/routes/v2/papers/schema'

export const registerBibliographyReadCases = (getClient: () => PrismaClient): void => {
  test('paper details filter custom field labels and values by membership and never expose private provenance to guests', async (t) => {
    const prisma = getClient()
    const f = await createBibliographyFixture(prisma, t)
    for (const [key, visibility] of [
      ['public_flag', 'public'],
      ['member_flag', 'institution'],
      ['secret_flag', 'admin'],
    ] as const) {
      await prisma.institution_paper_field_definitions.create({
        data: {
          institutionId: f.institutionId,
          key,
          label: key,
          field_type: 'boolean',
          visibility,
        },
      })
    }
    const paper = await syncDirectPaperImportItem(
      f.app,
      f.institutionId,
      { type: 'user', userId: f.memberId, credentialId: null, institutionId: null, scopes: [] },
      {
        titles: [
          { title: 'Anonymous title', language: 'en', is_primary: true },
          { title: '匿名题名', language: 'zh', kind: 'translated' },
        ],
        doi: `10.1234/${randomUUID()}`,
        language_tags: ['en'],
        document_type: 'article',
        authors: [
          {
            source_key: 'one',
            name: 'Same name',
            order: 1,
            corresponding: true,
            affiliation_keys: ['lab'],
          },
          { source_key: 'two', name: 'Same name', order: 2, corresponding: false },
        ],
        affiliations: [{ source_key: 'lab', raw_name: 'Anonymous institute' }],
        funding: [{ raw_text: 'Anonymous grant', award_number: 'G-1' }],
        institution_metadata: {
          custom_fields: { public_flag: false, member_flag: null, secret_flag: true },
          cooperation_types: ['international'],
        },
        sources: [
          {
            provider: 'private_catalog',
            external_id: 'private-fixture-id',
            collected_on: '2026-09-01',
          },
        ],
      },
      { institutionId: f.institutionId, labId: null, reviewNodeId: null },
    )
    const url = `/v2/papers/${paper.paperId}/bibliography`
    const guest = await f.app.inject({ method: 'GET', url })
    assert.equal(guest.statusCode, 200, guest.body)
    assert.equal(guest.headers['cache-control'], 'private, no-store')
    const detail = guest.json().data as BibliographyOutput
    assert.equal(detail.titles[1].title, '匿名题名')
    assert.equal(detail.authors.length, 2)
    assert.notEqual(detail.authors[0].author_id, detail.authors[1].author_id)
    assert.equal(detail.authors[0].corresponding, true)
    assert.equal(detail.authors[1].corresponding, false)
    assert.equal(detail.authors[0].affiliation_ids[0], detail.affiliations[0].id)
    assert.deepEqual(
      detail.institution.custom_fields.map((row) => [row.key, row.value]),
      [['public_flag', false]],
    )
    assert.deepEqual(detail.sources, [])
    assert.doesNotMatch(
      guest.body,
      /secret_flag|member_flag|private-fixture-id|actorUserId|internalId|metadata_snapshot/u,
    )
    const member = await f.app.inject({ method: 'GET', url, headers: f.headers })
    assert.deepEqual(
      member
        .json()
        .data.institution.custom_fields.map((row: { key: string; value: unknown }) => [
          row.key,
          row.value,
        ]),
      [
        ['member_flag', null],
        ['public_flag', false],
      ],
    )
    assert.equal(member.json().data.sources[0].collected_on, '2026-09-01')
    const admin = await f.app.inject({ method: 'GET', url, headers: f.adminHeaders })
    assert.equal(admin.json().data.institution.custom_fields.length, 3)
    const outsider = await prisma.users.create({
      data: { username: randomUUID(), name: 'Outsider', email: `${randomUUID()}@example.test` },
    })
    const outside = await f.app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${f.app.jwt.sign({ userId: outsider.id })}` },
    })
    assert.equal(outside.statusCode, 200)
    assert.equal(outside.json().data.institution.custom_fields.length, 1)
    const integration = {
      authorization: `Bearer ${f.app.jwt.sign({ userId: '', token_type: 'integration' })}`,
    }
    for (const path of [url, `/v2/papers/${paper.paperId}/bibliometric-editions`]) {
      assert.equal(
        (await f.app.inject({ method: 'GET', url: path, headers: integration })).statusCode,
        403,
      )
    }
    f.app.deployment.contentAccess = 'authenticated'
    assert.equal((await f.app.inject({ method: 'GET', url })).statusCode, 401)
    f.app.deployment.contentAccess = 'public'
    const foreign = await prisma.papers.create({
      data: {
        title: 'No claim for this institution',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    })
    assert.notEqual(
      (
        await f.app.inject({
          method: 'GET',
          url: `/v2/papers/${foreign.id}/bibliography`,
          headers: f.adminHeaders,
        })
      ).statusCode,
      200,
    )
    const claim = await prisma.paper_claims.findUniqueOrThrow({ where: { id: paper.targetId } })
    await prisma.content_review_cases.update({
      where: { id: claim.reviewCaseId },
      data: { status: 'pending_review' },
    })
    assert.notEqual((await f.app.inject({ method: 'GET', url })).statusCode, 200)
    assert.equal((await f.app.inject({ method: 'GET', url, headers: f.headers })).statusCode, 200)
  })

  test('paper metric reads show only related published editions and preserve historical and false observations', async (t) => {
    const prisma = getClient()
    const f = await createBibliographyFixture(prisma, t)
    const journal = await prisma.journals.create({ data: { name: `Journal ${randomUUID()}` } })
    const paper = await syncDirectPaperImportItem(
      f.app,
      f.institutionId,
      { type: 'user', userId: f.memberId, credentialId: null, institutionId: null, scopes: [] },
      {
        title: 'Paper',
        doi: `10.1234/${randomUUID()}`,
        journal: { id: journal.id, name: journal.name },
      },
      { institutionId: f.institutionId, labId: null, reviewNodeId: null },
    )
    const ids: string[] = []
    for (let index = 0; index < 3; index++) {
      const edition = await prisma.bibliometric_editions.create({
        data: {
          system: 'jcr',
          version: `${randomUUID()}`,
          source: 'Anonymous fixture',
          metric_year: 2025 - index,
        },
      })
      await prisma.journal_rankings.create({
        data: {
          journalId: journal.id,
          editionId: edition.id,
          category_level: 'category',
          category: 'Science',
          metric: 'jif',
          quartile: index + 1,
          is_top: index === 0 ? false : null,
          source: 'Anonymous fixture',
        },
      })
      if (index < 2)
        await prisma.bibliometric_editions.update({
          where: { id: edition.id },
          data: { status: 'published', publishedAt: new Date() },
        })
      ids.push(edition.id)
    }
    const base = `/v2/papers/${paper.paperId}/bibliometric-editions`
    const list = await f.app.inject({ method: 'GET', url: `${base}?limit=1&offset=0` })
    assert.equal(list.statusCode, 200, list.body)
    assert.equal(list.json().data.total, 2)
    assert.equal(list.json().data.items.length, 1)
    const second = await f.app.inject({ method: 'GET', url: `${base}?limit=1&offset=1` })
    assert.notEqual(second.json().data.items[0].id, list.json().data.items[0].id)
    for (let index = 0; index < 2; index++) {
      const read = await f.app.inject({ method: 'GET', url: `${base}/${ids[index]}` })
      assert.equal(read.statusCode, 200, read.body)
      assert.equal(read.json().data.rankings[0].quartile, index + 1)
      assert.equal(read.json().data.rankings[0].is_top, index === 0 ? false : null)
      assert.equal(read.json().data.indicator_total, 0)
      assert.deepEqual(read.json().data.indicators, [])
    }
    for (const headers of [{}, f.adminHeaders])
      assert.equal(
        (await f.app.inject({ method: 'GET', url: `${base}/${ids[2]}`, headers })).statusCode,
        404,
      )
    const esi = await prisma.bibliometric_editions.create({
      data: {
        system: 'esi',
        version: randomUUID(),
        source: 'Anonymous fixture',
        observed_on: new Date('2026-09-01'),
      },
    })
    await prisma.paper_indicators.create({
      data: {
        paperId: paper.paperId,
        editionId: esi.id,
        kind: 'hot',
        value: false,
        source: 'Anonymous fixture',
      },
    })
    await prisma.bibliometric_editions.update({
      where: { id: esi.id },
      data: { status: 'published', publishedAt: new Date() },
    })
    const indicator = await f.app.inject({ method: 'GET', url: `${base}/${esi.id}` })
    assert.equal(indicator.statusCode, 200, indicator.body)
    assert.equal(indicator.json().data.indicators[0].value, false)
    assert.deepEqual(indicator.json().data.rankings, [])
  })

  test('ranking-only imports produce a metadata change and an identical retry is unchanged', async (t) => {
    const prisma = getClient()
    const f = await createBibliographyFixture(prisma, t)
    const journal = await prisma.journals.create({ data: { name: `Journal ${randomUUID()}` } })
    const context = { institutionId: f.institutionId, actorUserId: f.adminId, source: 'test' }
    const original = {
      title: 'Paper',
      doi: `10.1234/${randomUUID()}`,
      journal: { id: journal.id, name: journal.name },
    }
    await prisma.$transaction((tx) => writePaperBibliography(tx, original, context))
    const updated = {
      ...original,
      rankings: [
        {
          edition: { system: 'jcr', version: randomUUID(), source: 'Anonymous fixture' },
          category_level: 'category',
          category: 'Science',
          metric: 'jif',
          quartile: 2,
        },
      ],
    }
    assert.equal(
      (await prisma.$transaction((tx) => writePaperBibliography(tx, updated, context))).action,
      'updated',
    )
    assert.equal(
      (await prisma.$transaction((tx) => writePaperBibliography(tx, updated, context))).action,
      'unchanged',
    )
  })
}
