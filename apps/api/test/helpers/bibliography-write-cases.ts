import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '../../prisma/generated/client'
import {
  writePaperBibliography,
  type BibliographyWriteContext,
  type BibliographyWriteResult,
} from '../../src/bibliography/write'
import { BibliographyConflict } from '../../src/bibliography/identity'
import { fingerprint } from '../../src/bibliography/normalize'

export const registerBibliographyWriteCases = (getClient: () => PrismaClient): void => {
  const scope = async (): Promise<BibliographyWriteContext> => {
    const institution = await getClient().institutions.create({
      data: { name: 'Anonymous Institute', slug: randomUUID() },
    })
    return { institutionId: institution.id, actorUserId: null, source: 'anonymous-test' }
  }
  const identity = (): { title: string; doi: string } => ({
    title: 'Anonymous paper',
    doi: `10.1234/${randomUUID()}`,
  })
  const write = async (
    item: unknown,
    context: BibliographyWriteContext,
  ): Promise<BibliographyWriteResult> =>
    getClient().$transaction((tx) => writePaperBibliography(tx, item, context), { timeout: 20000 })
  const conflict = async (action: Promise<unknown>, code: string): Promise<void> => {
    await assert.rejects(action, (error: unknown): boolean => {
      assert.ok(error instanceof BibliographyConflict, String(error))
      assert.equal(error.issues[0]?.code, code)
      return true
    })
  }

  test('legacy migration preserves display data and author identity without inventing a verified order', async () => {
    const paper = await getClient().papers.findUniqueOrThrow({
      where: { id: '90000000-0000-4000-8000-000000000001' },
      include: { titles: true, identifiers: true, author_links: true },
    })
    assert.equal(paper.titles[0]?.title, 'Legacy title')
    assert.equal(paper.titles[0]?.is_primary, true)
    assert.deepEqual(paper.language_tags, ['en'])
    assert.equal(paper.identifiers[0]?.normalized_value, '10.1234/legacy')
    assert.equal(paper.author_links[0]?.display_name, 'Legacy Author')
    assert.equal(paper.author_links[0]?.order, 3)
    assert.equal(paper.author_links[0]?.order_verified, false)
    assert.equal(paper.author_links[0]?.authorId, '90000000-0000-4000-8000-000000000002')
  })

  test('structured writes persist multilingual titles and bibliographic relations without fabricating a DOI', async () => {
    const context = await scope()
    const item = {
      identifiers: [{ scheme: 'cnki', value: randomUUID() }],
      language_tags: ['zh'],
      titles: [
        { language: 'zh', title: '匿名研究', is_primary: true },
        { language: 'en', title: 'Anonymous research', kind: 'translated' },
      ],
      journal: { name: 'Anonymous journal', identifiers: [{ scheme: 'issn', value: '0378-5955' }] },
      authors: [
        {
          source_key: 'a',
          name: 'Anonymous A',
          order: 1,
          corresponding: null,
          affiliation_keys: ['aff-a'],
        },
      ],
      affiliations: [{ source_key: 'aff-a', raw_name: 'Anonymous Institute', country_code: 'CN' }],
      funding: [
        { funder_name: 'Anonymous funder', award_number: 'DEMO-1', raw_text: 'Anonymous grant' },
      ],
      sources: [{ provider: 'cnki', collected_on: '2026-09-01' }],
      institution_metadata: {
        owning_units: ['Anonymous unit'],
        cooperation_types: ['international'],
      },
      rankings: [
        {
          edition: {
            system: 'jcr',
            version: randomUUID(),
            source: 'anonymous-test',
            metric_year: 2025,
          },
          category_level: 'category',
          category: 'Anonymous subject',
          metric: 'jif',
          quartile: 1,
        },
      ],
      indicators: [
        {
          edition: {
            system: 'esi',
            version: randomUUID(),
            source: 'anonymous-test',
            observed_on: '2026-09-01',
          },
          kind: 'hot',
          value: false,
        },
      ],
    }
    const first = await write(item, context)
    assert.equal(first.action, 'created')
    const second = await write(item, context)
    assert.equal(second.action, 'unchanged')
    assert.equal(first.fingerprint, second.fingerprint)
    const paper = await getClient().papers.findUniqueOrThrow({
      where: { id: first.paperId },
      include: {
        titles: true,
        author_links: { include: { affiliations: true } },
        funding: true,
        sources: true,
        institution_metadata: true,
        indicators: true,
        journal: { include: { rankings: true } },
      },
    })
    assert.equal(paper.doi, null)
    assert.equal(paper.normalized_doi, null)
    assert.equal(paper.titles.length, 2)
    assert.equal(paper.author_links[0]?.affiliations.length, 1)
    assert.equal(paper.author_links[0]?.corresponding, null)
    assert.equal(paper.funding.length, 1)
    assert.equal(paper.sources[0]?.collected_on?.toISOString().slice(0, 10), '2026-09-01')
    assert.deepEqual(paper.institution_metadata[0]?.owning_units, ['Anonymous unit'])
    assert.equal(paper.journal?.rankings.length, 1)
    assert.equal(paper.indicators[0]?.value, false)
    assert.equal(
      await getClient().paper_metadata_events.count({ where: { paperId: first.paperId } }),
      1,
    )
    assert.equal(
      (await getClient().paper_index_jobs.findUniqueOrThrow({ where: { paperId: first.paperId } }))
        .revision,
      1,
    )
  })

  test('concurrent identical imports create only one paper and audit event', async () => {
    const context = await scope()
    const item = identity()
    const results = await Promise.all(Array.from({ length: 4 }, () => write(item, context)))
    assert.equal(new Set(results.map((row) => row.paperId)).size, 1)
    assert.equal(results.filter((row) => row.action === 'created').length, 1)
    assert.equal(results.filter((row) => row.action === 'unchanged').length, 3)
    assert.equal(
      await getClient().paper_metadata_events.count({ where: { paperId: results[0].paperId } }),
      1,
    )
  })

  test('conflicting identities never merge papers or replace a DOI', async () => {
    const context = await scope()
    const item = identity()
    const first = await write(item, context)
    const second = await write(identity(), context)
    await conflict(write({ ...item, paper_id: second.paperId }, context), 'identifier_conflict')
    await conflict(write({ ...identity(), paper_id: first.paperId }, context), 'doi_conflict')
    assert.equal(
      (await getClient().papers.findUniqueOrThrow({ where: { id: first.paperId } })).doi,
      item.doi,
    )
  })

  test('stale previews cannot overwrite subsequent edits', async () => {
    const context = await scope()
    const item = identity()
    const first = await write(item, {
      ...context,
      expectedFingerprint: fingerprint({ paper: null, fieldDefinitions: [] }),
    })
    await write({ ...item, abstract: 'Updated independently' }, context)
    await conflict(
      write(
        { ...item, abstract: 'Stale value' },
        { ...context, expectedFingerprint: first.fingerprint },
      ),
      'stale_preview',
    )
    assert.equal(
      (await getClient().papers.findUniqueOrThrow({ where: { id: first.paperId } })).abstract,
      'Updated independently',
    )
  })

  test('author reordering preserves person bindings and never merges names across papers', async () => {
    const context = await scope()
    const item = {
      ...identity(),
      authors: [
        { name: 'Same Name', order: 1, source_key: 'a' },
        { name: 'Other Name', order: 2, source_key: 'b' },
      ],
    }
    const first = await write(item, context)
    const author = await getClient().paper_authors.findFirstOrThrow({
      where: { paperId: first.paperId, source_key: 'a' },
    })
    const user = await getClient().users.create({
      data: {
        name: 'Anonymous Admin',
        username: randomUUID(),
        email: `${randomUUID()}@example.test`,
      },
    })
    const person = await getClient().institution_people.create({
      data: {
        institutionId: context.institutionId,
        key: 'test-person',
        internalId: 'TEST-001',
        normalizedInternalId: 'test-001',
        name: 'Same Name',
      },
    })
    const binding = await getClient().institution_paper_author_bindings.create({
      data: {
        institutionId: context.institutionId,
        paperId: first.paperId,
        authorId: author.authorId,
        personId: person.id,
        boundBy: user.id,
      },
    })
    await write(
      {
        ...item,
        authors: [
          { ...item.authors[1], order: 1 },
          { ...item.authors[0], order: 2, corresponding: true },
        ],
      },
      context,
    )
    assert.equal(
      (await getClient().paper_authors.findUniqueOrThrow({ where: { id: author.id } })).order,
      2,
    )
    assert.deepEqual(
      await getClient().institution_paper_author_bindings.findUniqueOrThrow({
        where: { id: binding.id },
      }),
      binding,
    )
    const other = await write(
      { ...identity(), authors: [{ name: 'Same Name', order: 1 }] },
      context,
    )
    assert.notEqual(
      (await getClient().paper_authors.findFirstOrThrow({ where: { paperId: other.paperId } }))
        .authorId,
      author.authorId,
    )
    await conflict(
      write({ ...item, title: 'Must roll back', authors: [] }, context),
      'authorship_conflict',
    )
    assert.equal(
      (await getClient().papers.findUniqueOrThrow({ where: { id: first.paperId } })).title,
      item.title,
    )
    assert.equal(
      await getClient().institution_paper_author_bindings.count({ where: { id: binding.id } }),
      1,
    )
  })

  test('unknown, false and explicit null remain distinct for corresponding authors', async () => {
    const context = await scope()
    const item = { ...identity(), authors: [{ name: 'Anonymous A', order: 1 }] }
    const first = await write(item, context)
    const read = async (): Promise<boolean | null> =>
      (await getClient().paper_authors.findFirstOrThrow({ where: { paperId: first.paperId } }))
        .corresponding
    assert.equal(await read(), null)
    await write({ ...item, authors: [{ ...item.authors[0], corresponding: false }] }, context)
    assert.equal(await read(), false)
    await write(item, context)
    assert.equal(await read(), false)
    await write({ ...item, authors: [{ ...item.authors[0], corresponding: null }] }, context)
    assert.equal(await read(), null)
  })

  test('required custom fields roll back the whole row; invalid optional values warn without erasing data', async () => {
    const context = await scope()
    await getClient().institution_paper_field_definitions.create({
      data: {
        institutionId: context.institutionId,
        key: 'flag',
        label: 'Flag',
        field_type: 'boolean',
        is_required: true,
      },
    })
    await getClient().institution_paper_field_definitions.create({
      data: {
        institutionId: context.institutionId,
        key: 'note',
        label: 'Note',
        field_type: 'text',
      },
    })
    const item = identity()
    const count = await getClient().papers.count()
    await conflict(write(item, context), 'required_custom_field')
    assert.equal(await getClient().papers.count(), count)
    const first = await write(
      { ...item, institution_metadata: { custom_fields: { flag: false, note: 'Keep' } } },
      context,
    )
    const update = await write(
      { ...item, institution_metadata: { custom_fields: { note: false } } },
      context,
    )
    assert.equal(update.action, 'unchanged')
    assert.equal(update.issues[0]?.code, 'invalid_custom_field')
    assert.deepEqual(
      (
        await getClient().institution_paper_metadata.findUniqueOrThrow({
          where: {
            institutionId_paperId: { institutionId: context.institutionId, paperId: first.paperId },
          },
        })
      ).custom_fields,
      { flag: false, note: 'Keep' },
    )
  })

  test('journal edition conflicts roll back the paper update and published editions reject additions', async () => {
    const context = await scope()
    const item = {
      ...identity(),
      journal: { name: 'Anonymous journal', identifiers: [{ scheme: 'issn', value: '0378-5955' }] },
      rankings: [
        {
          edition: { system: 'jcr', version: randomUUID(), source: 'anonymous-test' },
          category_level: 'category',
          category: 'Test subject',
          metric: 'jif',
          quartile: 1,
        },
      ],
    }
    const first = await write(item, context)
    await conflict(
      write(
        { ...item, title: 'Rejected update', rankings: [{ ...item.rankings[0], quartile: 2 }] },
        context,
      ),
      'ranking_conflict',
    )
    assert.equal(
      (await getClient().papers.findUniqueOrThrow({ where: { id: first.paperId } })).title,
      item.title,
    )
    const edition = await getClient().bibliometric_editions.findFirstOrThrow({
      where: { version: item.rankings[0].edition.version },
    })
    await getClient().bibliometric_editions.update({
      where: { id: edition.id },
      data: { status: 'published', publishedAt: new Date() },
    })
    assert.equal((await write(item, context)).action, 'unchanged')
    await conflict(
      write(
        { ...item, rankings: [{ ...item.rankings[0], category: 'Additional category' }] },
        context,
      ),
      'edition_immutable',
    )
  })

  test('metadata writes leave existing files, submissions and review cases untouched', async () => {
    const context = await scope()
    const item = identity()
    const first = await write(item, context)
    const prisma = getClient()
    const user = await prisma.users.create({
      data: { name: 'Test Admin', username: randomUUID(), email: `${randomUUID()}@example.test` },
    })
    const file = await prisma.oss_files.create({
      data: {
        original_name: 'fixture.pdf',
        file_size: 1,
        mime_type: 'application/pdf',
        hash: 'fixture',
        createdAt: new Date(),
        institutionId: context.institutionId,
      },
    })
    const caseId = randomUUID()
    const claimId = randomUUID()
    await prisma.content_review_cases.create({
      data: {
        id: caseId,
        institutionId: context.institutionId,
        content_type: 'paper',
        subjectId: claimId,
        submittedBy: user.id,
        status: 'approved',
      },
    })
    await prisma.paper_claims.create({
      data: {
        id: claimId,
        paperId: first.paperId,
        institutionId: context.institutionId,
        submittedBy: user.id,
        reviewCaseId: caseId,
      },
    })
    const submission = await prisma.paper_submissions.create({
      data: {
        paperId: first.paperId,
        claimId,
        userId: user.id,
        institutionId: context.institutionId,
        oss_file_id: file.id,
      },
    })
    const claim = await prisma.paper_claims.update({
      where: { id: claimId },
      data: { submissionId: submission.id },
    })
    const review = await prisma.content_review_cases.update({
      where: { id: caseId },
      data: { currentVersionId: submission.id },
    })
    await write({ ...item, abstract: 'New abstract', citation_count: 10 }, context)
    assert.deepEqual(
      await prisma.paper_submissions.findUniqueOrThrow({ where: { id: submission.id } }),
      submission,
    )
    assert.deepEqual(await prisma.paper_claims.findUniqueOrThrow({ where: { id: claimId } }), claim)
    assert.deepEqual(
      await prisma.content_review_cases.findUniqueOrThrow({ where: { id: caseId } }),
      review,
    )
    assert.deepEqual(await prisma.oss_files.findUniqueOrThrow({ where: { id: file.id } }), file)
    assert.equal(await prisma.paper_submissions.count({ where: { paperId: first.paperId } }), 1)
  })
}
