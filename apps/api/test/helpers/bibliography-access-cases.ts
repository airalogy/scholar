import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '../../prisma/generated/client'
import { createBibliographyFixture } from './bibliography-preview-cases'
import { getImport } from '../../src/routes/v1/institutions/service'

export const registerBibliographyAccessCases = (getClient: () => PrismaClient): void => {
  test('a missing original submitter blocks approval but the reviewer can still reject the import', async (t) => {
    const prisma = getClient()
    const f = await createBibliographyFixture(prisma, t, true)
    const doi = `10.1234/${randomUUID()}`
    const preview = await f.app.inject({
      method: 'POST',
      url: `${f.url}/papers`,
      headers: f.headers,
      payload: {
        schema_version: 2,
        source: 'fixture',
        items: [{ paper: { title: 'Fixture', doi } }],
      },
    })
    assert.equal(preview.statusCode, 200, preview.body)
    const id = preview.json().data.id as string
    const submitted = await f.app.inject({
      method: 'POST',
      url: `${f.url}/${id}/apply`,
      headers: f.headers,
      payload: {},
    })
    assert.equal(submitted.statusCode, 200, submitted.body)
    await prisma.institution_data_imports.update({ where: { id }, data: { actorUserId: null } })
    const approved = await f.app.inject({
      method: 'POST',
      url: `${f.url}/${id}/review`,
      headers: f.adminHeaders,
      payload: { decision: 'approve', notes: 'Cannot substitute the reviewer' },
    })
    assert.equal(approved.statusCode, 409, approved.body)
    assert.equal(await prisma.papers.count({ where: { normalized_doi: doi } }), 0)
    const rejected = await f.app.inject({
      method: 'POST',
      url: `${f.url}/${id}/review`,
      headers: f.adminHeaders,
      payload: { decision: 'reject', notes: 'Original submitter no longer exists' },
    })
    assert.equal(rejected.statusCode, 200, rejected.body)
    assert.equal(rejected.json().data.summary.rejected, 1)
  })

  test('field definitions are manager-only, institution-scoped and checked against existing data', async (t) => {
    const prisma = getClient()
    const f = await createBibliographyFixture(prisma, t)
    const url = f.url.replace('/imports', '/paper-fields')
    const definition = { key: 'flag', label: 'Anonymous flag', field_type: 'boolean' }
    assert.equal(
      (await f.app.inject({ method: 'PUT', url, headers: f.headers, payload: definition }))
        .statusCode,
      403,
    )
    assert.equal((await f.app.inject({ method: 'GET', url, headers: f.headers })).statusCode, 200)
    for (const role of ['owner', 'admin']) {
      await prisma.institution_memberships.update({
        where: { institutionId_userId: { institutionId: f.institutionId, userId: f.memberId } },
        data: { role },
      })
      const response = await f.app.inject({
        method: 'PUT',
        url,
        headers: f.headers,
        payload: definition,
      })
      assert.equal(response.statusCode, 200, response.body)
      assert.equal(response.json().data.is_required, false)
    }
    const paper = await prisma.papers.create({
      data: { title: 'Fixture', createdAt: new Date(), updatedAt: new Date() },
    })
    await prisma.institution_paper_metadata.create({
      data: {
        institutionId: f.institutionId,
        paperId: paper.id,
        source: 'fixture',
        custom_fields: { flag: false },
      },
    })
    const changedType = await f.app.inject({
      method: 'PUT',
      url,
      headers: f.headers,
      payload: { ...definition, field_type: 'text' },
    })
    assert.equal(changedType.statusCode, 409, changedType.body)
    const nullability = await f.app.inject({
      method: 'PUT',
      url,
      headers: f.headers,
      payload: { ...definition, is_required: true },
    })
    assert.equal(nullability.statusCode, 200, nullability.body)
    for (const bad of [{ is_required: 1 }, { min_value: 0 }, { options: ['a'] }]) {
      const result = await f.app.inject({
        method: 'PUT',
        url,
        headers: f.adminHeaders,
        payload: { ...definition, ...bad },
      })
      assert.equal(result.statusCode, 400, result.body)
    }
    const archived = await f.app.inject({
      method: 'PUT',
      url,
      headers: f.headers,
      payload: { ...definition, is_active: false },
    })
    assert.equal(archived.statusCode, 200, archived.body)
    assert.equal(archived.json().data.is_active, false)
    assert.deepEqual(
      (await prisma.institution_paper_metadata.findFirstOrThrow({ where: { paperId: paper.id } }))
        .custom_fields,
      { flag: false },
    )
    const other = await createBibliographyFixture(prisma, t)
    assert.equal(
      (await other.app.inject({ method: 'PUT', url, headers: other.headers, payload: definition }))
        .statusCode,
      404,
    )
  })

  test('field rule changes invalidate previews, including previews of new papers', async (t) => {
    const f = await createBibliographyFixture(getClient(), t)
    const doi = `10.1234/${randomUUID()}`
    const request = {
      schema_version: 2,
      source: 'fixture',
      items: [{ paper: { title: 'Fixture', doi } }],
    }
    const preview = await f.app.inject({
      method: 'POST',
      url: `${f.url}/papers`,
      headers: f.headers,
      payload: request,
    })
    assert.equal(preview.statusCode, 200, preview.body)
    const field = await f.app.inject({
      method: 'PUT',
      url: f.url.replace('/imports', '/paper-fields'),
      headers: f.adminHeaders,
      payload: { key: 'flag', label: 'Flag', field_type: 'boolean' },
    })
    assert.equal(field.statusCode, 200, field.body)
    const applied = await f.app.inject({
      method: 'POST',
      url: `${f.url}/${preview.json().data.id}/apply`,
      headers: f.headers,
      payload: {},
    })
    assert.equal(applied.statusCode, 200, applied.body)
    assert.equal(applied.json().data.items[0].issues[0].code, 'stale_preview')
    assert.equal(await getClient().papers.count({ where: { doi } }), 0)
  })

  test('system JWTs require import scopes and cannot review or manage definitions; rotation and revocation act immediately', async (t) => {
    const prisma = getClient()
    const f = await createBibliographyFixture(prisma, t)
    const credential = await prisma.institution_api_credentials.create({
      data: {
        institutionId: f.institutionId,
        name: 'Anonymous system',
        clientId: randomUUID(),
        secretHash: 'not-a-real-secret-hash',
        scopes: ['papers:import', 'imports:read'],
        expiresAt: new Date(Date.now() + 3600000),
        createdBy: f.adminId,
      },
    })
    const token = (scopes: Array<'papers:import' | 'imports:read'>): string =>
      f.app.jwt.sign({
        userId: f.adminId,
        token_type: 'integration',
        credentialId: credential.id,
        institutionId: f.institutionId,
        credentialVersion: 1,
        scopes,
      })
    const headers = {
      ...f.headers,
      authorization: `Bearer ${token(['papers:import', 'imports:read'])}`,
    }
    const payload = {
      schema_version: 2,
      source: 'fixture',
      items: [{ paper: { title: 'Fixture', doi: `10.1234/${randomUUID()}` } }],
    }
    const preview = await f.app.inject({ method: 'POST', url: `${f.url}/papers`, headers, payload })
    assert.equal(preview.statusCode, 200, preview.body)
    const importId = preview.json().data.id
    const itemId = preview.json().data.items[0].id
    assert.equal(
      (await f.app.inject({ method: 'GET', url: `${f.url}/${importId}`, headers })).statusCode,
      200,
    )
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: `${f.url}/${importId}/review`,
          headers,
          payload: { decision: 'approve', notes: 'Not permitted' },
        })
      ).statusCode,
      403,
    )
    assert.equal(
      (
        await f.app.inject({
          method: 'PUT',
          url: f.url.replace('/imports', '/paper-fields'),
          headers,
          payload: { key: 'flag', label: 'Flag', field_type: 'boolean' },
        })
      ).statusCode,
      403,
    )
    const readonlyHeaders = { ...headers, authorization: `Bearer ${token(['imports:read'])}` }
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: `${f.url}/${importId}/apply`,
          headers: readonlyHeaders,
          payload: {},
        })
      ).statusCode,
      403,
    )
    const writeonlyHeaders = { ...headers, authorization: `Bearer ${token(['papers:import'])}` }
    assert.equal(
      (
        await f.app.inject({
          method: 'GET',
          url: `${f.url}/${importId}`,
          headers: writeonlyHeaders,
        })
      ).statusCode,
      403,
    )
    const other = await prisma.institutions.create({
      data: { name: 'Other anonymous institution', slug: randomUUID() },
    })
    assert.equal(
      (
        await f.app.inject({
          method: 'GET',
          url: `/v2/institutions/${other.slug}/imports`,
          headers,
        })
      ).statusCode,
      404,
    )
    const applied = await f.app.inject({
      method: 'POST',
      url: `${f.url}/${importId}/apply`,
      headers,
      payload: {},
    })
    assert.equal(applied.statusCode, 200, applied.body)
    const decision = await prisma.institution_data_import_decisions.findFirstOrThrow({
      where: { itemId },
    })
    assert.equal(decision.actorType, 'integration')
    assert.equal(decision.credentialId, credential.id)
    assert.deepEqual(decision.actorScopes, ['papers:import', 'imports:read'])
    await prisma.institution_api_credentials.update({
      where: { id: credential.id },
      data: { secretVersion: 2 },
    })
    assert.equal(
      (await f.app.inject({ method: 'GET', url: `${f.url}/${importId}`, headers })).statusCode,
      401,
    )
    await prisma.institution_api_credentials.update({
      where: { id: credential.id },
      data: { secretVersion: 1, expiresAt: new Date(0) },
    })
    assert.equal(
      (await f.app.inject({ method: 'GET', url: `${f.url}/${importId}`, headers })).statusCode,
      401,
    )
    await prisma.institution_api_credentials.update({
      where: { id: credential.id },
      data: { expiresAt: new Date(Date.now() + 3600000), revokedAt: new Date() },
    })
    assert.equal(
      (await f.app.inject({ method: 'GET', url: `${f.url}/${importId}`, headers })).statusCode,
      401,
    )
  })

  test('partial reviews retain each reviewer and each submission, and v1 cannot reinterpret a v2 import', async (t) => {
    const prisma = getClient()
    const f = await createBibliographyFixture(prisma, t, true)
    const payload = {
      schema_version: 2,
      source: 'fixture',
      items: [1, 2].map(() => ({ paper: { title: 'Fixture', doi: `10.1234/${randomUUID()}` } })),
    }
    const preview = await f.app.inject({
      method: 'POST',
      url: `${f.url}/papers`,
      headers: f.headers,
      payload,
    })
    assert.equal(preview.statusCode, 200, preview.body)
    const { id, items } = preview.json().data
    const submitted = await f.app.inject({
      method: 'POST',
      url: `${f.url}/${id}/apply`,
      headers: f.headers,
      payload: {},
    })
    assert.equal(submitted.statusCode, 200, submitted.body)
    const first = await f.app.inject({
      method: 'POST',
      url: `${f.url}/${id}/review`,
      headers: f.adminHeaders,
      payload: { item_ids: [items[0].id], decision: 'approve', notes: 'First reviewer' },
    })
    assert.equal(first.statusCode, 200, first.body)
    await prisma.users.update({
      where: { id: f.memberId },
      data: { platform_role: 'platform_admin' },
    })
    const second = await f.app.inject({
      method: 'POST',
      url: `${f.url}/${id}/review`,
      headers: f.headers,
      payload: { item_ids: [items[1].id], decision: 'reject', notes: 'Second reviewer' },
    })
    assert.equal(second.statusCode, 200, second.body)
    const decisions = await prisma.institution_data_import_decisions.findMany({
      where: { itemId: { in: items.map((item: { id: string }) => item.id) } },
    })
    assert.equal(decisions.length, 4)
    assert.equal(
      decisions.find((value) => value.decision === 'applied_pending_content_review')?.actorUserId,
      f.adminId,
    )
    assert.equal(decisions.find((value) => value.decision === 'rejected')?.actorUserId, f.memberId)
    await f.app.inject({
      method: 'POST',
      url: `${f.url}/${id}/review`,
      headers: f.headers,
      payload: { decision: 'reject', notes: 'Repeated request' },
    })
    assert.equal(
      await prisma.institution_data_import_decisions.count({
        where: { itemId: { in: items.map((item: { id: string }) => item.id) } },
      }),
      4,
    )
    const detail = await f.app.inject({
      method: 'GET',
      url: `${f.url}/${id}/items/${items[0].id}`,
      headers: f.headers,
    })
    assert.equal(detail.json().data.decisions.length, 2)
    assert.equal(detail.json().data.decisions[1].notes, 'First reviewer')
    assert.equal(detail.body.includes('sourceIp'), false)
    await assert.rejects(
      getImport(f.app, f.url.split('/')[3], id, {
        actor: {
          type: 'user',
          userId: f.memberId,
          institutionId: null,
          credentialId: null,
          scopes: [],
        },
        sourceIp: null,
        userAgent: null,
      }),
      { statusCode: 404 },
    )
  })
}
