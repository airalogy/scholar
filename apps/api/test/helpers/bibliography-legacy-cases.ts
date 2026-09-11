import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '../../prisma/generated/client'
import { createBibliographyFixture } from './bibliography-preview-cases'
import { ensureSubmittedPaper, updateLegacyPaperMetadata } from '../../src/bibliography/legacy'
import { syncDirectPaperImportItem } from '../../src/bibliography/apply'
import { reviewPaper } from '../../src/routes/papers/service.claim-review'
import { deletePaper, updatePaper } from '../../src/routes/papers/service.paper'
import { refreshPaperSearchIndex } from '../../src/routes/papers/paper-index'

export const registerBibliographyLegacyCases = (getClient: () => PrismaClient): void => {
  test('legacy submissions and global edits use structured metadata without changing author or review identities', async (t) => {
    const prisma = getClient()
    const f = await createBibliographyFixture(prisma, t)
    const item = {
      title: 'Original title',
      doi: `10.1234/${randomUUID()}`,
      publish_year: 2026,
      authors: [{ name: 'Anonymous author', order: 1, corresponding: false }],
    }
    const result = await syncDirectPaperImportItem(
      f.app,
      f.institutionId,
      {
        type: 'user',
        userId: f.memberId,
        credentialId: null,
        institutionId: null,
        scopes: [],
      },
      item,
      { institutionId: f.institutionId, labId: null, reviewNodeId: null },
    )
    const claims = await prisma.paper_claims.findMany({
      where: { paperId: result.paperId },
      include: { review_case: true },
    })
    const authors = await prisma.paper_authors.findMany({ where: { paperId: result.paperId } })
    const context = { institutionId: f.institutionId, actorUserId: f.adminId, source: 'fixture' }
    const existing = await prisma.$transaction((tx) =>
      ensureSubmittedPaper(tx, { ...item, title: 'Unapproved change' }, context),
    )
    assert.equal(existing.title, 'Original title')
    await updatePaper(f.app, result.paperId, { title: 'Corrected title' }, f.adminId)
    const updated = await prisma.papers.findUniqueOrThrow({
      where: { id: result.paperId },
      include: { titles: true, identifiers: true },
    })
    assert.equal(updated.titles.find((title) => title.is_primary)?.title, 'Corrected title')
    assert.equal(updated.identifiers[0].value, item.doi)
    assert.equal(updated.publish_year, 2026)
    assert.deepEqual(
      await prisma.paper_claims.findMany({
        where: { paperId: result.paperId },
        include: { review_case: true },
      }),
      claims,
    )
    assert.deepEqual(
      await prisma.paper_authors.findMany({ where: { paperId: result.paperId } }),
      authors,
    )
    assert.equal(
      await prisma.paper_metadata_events.count({ where: { paperId: result.paperId } }),
      2,
    )
    await prisma.$transaction((tx) =>
      updateLegacyPaperMetadata(
        tx,
        result.paperId,
        { abstract: 'Added later', publish_year: null },
        context,
      ),
    )
    assert.equal(
      (await prisma.papers.findUniqueOrThrow({ where: { id: result.paperId } })).publish_year,
      2026,
    )
    assert.equal(
      (await prisma.paper_index_jobs.findUniqueOrThrow({ where: { paperId: result.paperId } }))
        .status,
      'queued',
    )
  })

  test('a failed legacy metadata promotion rolls back its review decision and audit action', async (t) => {
    const prisma = getClient()
    const f = await createBibliographyFixture(prisma, t)
    const result = await syncDirectPaperImportItem(
      f.app,
      f.institutionId,
      {
        type: 'user',
        userId: f.memberId,
        credentialId: null,
        institutionId: null,
        scopes: [],
      },
      { title: 'Retained title', doi: `10.1234/${randomUUID()}`, publish_date: '2026-05-01' },
      { institutionId: f.institutionId, labId: null, reviewNodeId: null },
    )
    const claim = await prisma.paper_claims.findUniqueOrThrow({ where: { id: result.targetId } })
    await prisma.content_review_cases.update({
      where: { id: claim.reviewCaseId },
      data: { status: 'pending_review' },
    })
    await prisma.paper_submissions.update({
      where: { id: claim.submissionId! },
      data: {
        metadata_snapshot: {
          source: 'institution_json_import',
          canonical_update_pending: true,
          title: 'Conflicting year',
          publish_year: 2025,
        },
      },
    })
    const actions = await prisma.content_review_actions.count({
      where: { caseId: claim.reviewCaseId },
    })
    await assert.rejects(
      reviewPaper(f.app, claim.id, { decision: 'approve' }, f.adminId),
      /conflicts with the stored publication date/u,
    )
    assert.equal(
      (await prisma.content_review_cases.findUniqueOrThrow({ where: { id: claim.reviewCaseId } }))
        .status,
      'pending_review',
    )
    assert.equal(
      await prisma.content_review_actions.count({ where: { caseId: claim.reviewCaseId } }),
      actions,
    )
    assert.equal(
      (await prisma.papers.findUniqueOrThrow({ where: { id: result.paperId } })).title,
      'Retained title',
    )
    await prisma.paper_submissions.update({
      where: { id: claim.submissionId! },
      data: {
        metadata_snapshot: {
          source: 'institution_json_import',
          canonical_update_pending: true,
          title: 'Approved title',
        },
      },
    })
    await reviewPaper(f.app, claim.id, { decision: 'approve' }, f.adminId)
    assert.equal(
      (await prisma.content_review_cases.findUniqueOrThrow({ where: { id: claim.reviewCaseId } }))
        .status,
      'approved',
    )
    assert.equal(
      (
        await prisma.paper_titles.findFirstOrThrow({
          where: { paperId: result.paperId, is_primary: true },
        })
      ).title,
      'Approved title',
    )
  })

  test('real PostgreSQL indexing includes translated titles and removes content after approval is withdrawn', async (t) => {
    const prisma = getClient()
    const f = await createBibliographyFixture(prisma, t)
    const result = await syncDirectPaperImportItem(
      f.app,
      f.institutionId,
      {
        type: 'user',
        userId: f.memberId,
        credentialId: null,
        institutionId: null,
        scopes: [],
      },
      {
        doi: `10.1234/${randomUUID()}`,
        titles: [
          { language: 'en', title: 'Searchable original', is_primary: true },
          { language: 'zh', title: '可检索译名', kind: 'translated' },
        ],
      },
      { institutionId: f.institutionId, labId: null, reviewNodeId: null },
    )
    assert.equal((await refreshPaperSearchIndex(f.app, result.paperId)).status, 'indexed')
    const rows = await prisma.$queryRawUnsafe<Array<{ text: string }>>(
      'SELECT text FROM embeddings WHERE "paperId" = $1',
      result.paperId,
    )
    assert.match(rows.map((row) => row.text).join('\n'), /可检索译名/u)
    const claim = await prisma.paper_claims.findUniqueOrThrow({ where: { id: result.targetId } })
    await prisma.content_review_cases.update({
      where: { id: claim.reviewCaseId },
      data: { status: 'archived' },
    })
    assert.equal((await refreshPaperSearchIndex(f.app, result.paperId)).status, 'removed')
    assert.deepEqual(
      await prisma.$queryRawUnsafe(
        'SELECT text FROM embeddings WHERE "paperId" = $1',
        result.paperId,
      ),
      [],
    )
  })

  test('deleting a paper referenced by a published indicator returns a recoverable conflict without deleting related data', async (t) => {
    const prisma = getClient()
    const f = await createBibliographyFixture(prisma, t)
    const result = await syncDirectPaperImportItem(
      f.app,
      f.institutionId,
      {
        type: 'user',
        userId: f.memberId,
        credentialId: null,
        institutionId: null,
        scopes: [],
      },
      {
        title: 'Edition reference',
        doi: `10.1234/${randomUUID()}`,
        indicators: [
          {
            kind: 'hot',
            value: false,
            edition: {
              system: 'esi',
              version: randomUUID(),
              source: 'fixture',
              observed_on: '2026-09-01',
            },
          },
        ],
      },
      { institutionId: f.institutionId, labId: null, reviewNodeId: null },
    )
    const indicator = await prisma.paper_indicators.findFirstOrThrow({
      where: { paperId: result.paperId },
    })
    await prisma.bibliometric_editions.update({
      where: { id: indicator.editionId },
      data: { status: 'published', publishedAt: new Date() },
    })
    await assert.rejects(deletePaper(f.app, result.paperId, f.adminId), (error: unknown) => {
      assert.equal((error as { statusCode: number }).statusCode, 409)
      return true
    })
    assert.ok(await prisma.paper_claims.findUnique({ where: { id: result.targetId } }))
    assert.ok(await prisma.papers.findUnique({ where: { id: result.paperId } }))
    assert.equal(
      (await prisma.paper_indicators.findUniqueOrThrow({ where: { id: indicator.id } })).value,
      false,
    )
  })
}
