import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaPg } from '@prisma/adapter-pg'
import { Prisma, PrismaClient } from '../prisma/generated/client'
import { mergeCustomFieldPatch } from '../src/bibliography/custom-fields'
import { registerBibliographyWriteCases } from './helpers/bibliography-write-cases'
import { registerBibliographyIntegrationCases } from './helpers/bibliography-integration-cases'
import { registerBibliographyPreviewCases } from './helpers/bibliography-preview-cases'
import { registerBibliographyAccessCases } from './helpers/bibliography-access-cases'
import { registerBibliometricCases } from './helpers/bibliometrics-cases'
import { registerBibliographyLegacyCases } from './helpers/bibliography-legacy-cases'
import { registerBibliographyReadCases } from './helpers/bibliography-read-cases'

const databaseUrl = process.env.BIBLIOGRAPHY_TEST_DATABASE_URL
const schema = `scholar_bibliography_test_${randomBytes(8).toString('hex')}`
const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let prisma: PrismaClient

const executeSql = (sql: string): void => {
  execFileSync('pnpm', ['exec', 'prisma', 'db', 'execute', '--stdin'], {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    input: sql,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

const fixture = async (): Promise<{ institutionId: string; paperId: string }> => {
  const institution = await prisma.institutions.create({
    data: { name: 'Anonymous University', slug: `fixture-${randomUUID()}` },
  })
  const paper = await prisma.papers.create({
    data: { title: 'Anonymous bibliography fixture', createdAt: new Date(), updatedAt: new Date() },
  })
  return { institutionId: institution.id, paperId: paper.id }
}

const rejectConstraint = async (action: Promise<unknown>): Promise<void> => {
  await assert.rejects(action, (error: unknown): boolean => {
    assert.match(
      String(error),
      /23514|constraint|Invalid value|required|Required|archived|configured|choices|in use|immutable|constraints|Existing values/u,
    )
    return true
  })
}

describe(
  'PostgreSQL bibliographic field constraints',
  { skip: !databaseUrl, concurrency: false },
  () => {
    registerBibliographyWriteCases(() => prisma)
    registerBibliographyIntegrationCases(() => prisma)
    registerBibliographyPreviewCases(() => prisma)
    registerBibliographyAccessCases(() => prisma)
    registerBibliometricCases(() => prisma)
    registerBibliographyLegacyCases(() => prisma)
    registerBibliographyReadCases(() => prisma)
    before(async () => {
      assert.ok(databaseUrl)
      assert.ok(
        ['localhost', '127.0.0.1', '::1', '[::1]', 'postgres'].includes(
          new URL(databaseUrl).hostname,
        ),
        'Use a local test database',
      )
      const directory = path.join(apiRoot, 'prisma/migrations')
      const sql = readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
        .map((name) => {
          const sql = readFileSync(path.join(directory, name, 'migration.sql'), 'utf8')
          if (name !== '20260912000000_structured_bibliography') return sql
          return `
            INSERT INTO papers (id, title, doi, normalized_doi, language, "createdAt", "updatedAt")
            VALUES ('90000000-0000-4000-8000-000000000001', 'Legacy title', '10.1234/legacy', '10.1234/legacy', 1, now(), now());
            INSERT INTO authors (id, name, "createdAt", "updatedAt")
            VALUES ('90000000-0000-4000-8000-000000000002', 'Legacy Author', now(), now());
            INSERT INTO paper_authors ("paperId", "authorId", "order")
            VALUES ('90000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000002', 3);
            ${sql}`
        })
        .join('\n')
      executeSql(`CREATE SCHEMA "${schema}"; SET search_path TO "${schema}", public;\n${sql}`)
      // pg connection-string options override pool options; isolate raw SQL as well as Prisma.
      const isolatedDatabaseUrl = new URL(databaseUrl)
      isolatedDatabaseUrl.searchParams.set('schema', schema)
      isolatedDatabaseUrl.searchParams.set('options', `-c search_path=${schema},public`)
      prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: isolatedDatabaseUrl.toString() }, { schema }),
      })
      const [connection] = await prisma.$queryRaw<Array<{ schema: string }>>`
        SELECT current_schema() AS schema
      `
      assert.equal(connection.schema, schema, 'Raw SQL must use the isolated test schema')
    })
    after(async () => {
      await prisma?.$disconnect()
      if (databaseUrl && /^scholar_bibliography_test_[0-9a-f]{16}$/u.test(schema))
        executeSql(`DROP SCHEMA IF EXISTS "${schema}" CASCADE;`)
    })

    test('language tags default to an array and SQL cannot store a null array', async () => {
      const { paperId } = await fixture()
      const paper = await prisma.papers.findUniqueOrThrow({ where: { id: paperId } })
      assert.deepEqual(paper.language_tags, [])
      await assert.rejects(
        prisma.$executeRaw`UPDATE papers SET language_tags = NULL WHERE id = ${paperId}::uuid`,
        /23502|not-null|null value/u,
      )
    })

    test('false and JSON null remain distinct; numbers and strings cannot substitute for booleans', async () => {
      const scope = await fixture()
      await prisma.institution_paper_field_definitions.create({
        data: {
          institutionId: scope.institutionId,
          key: 'flag',
          label: 'Flag',
          field_type: 'boolean',
        },
      })
      const record = await prisma.institution_paper_metadata.create({
        data: { ...scope, source: 'fixture', custom_fields: { flag: false } },
      })
      assert.deepEqual(record.custom_fields, { flag: false })
      const cleared = await prisma.institution_paper_metadata.update({
        where: { id: record.id },
        data: { custom_fields: { flag: null } },
      })
      assert.deepEqual(cleared.custom_fields, { flag: null })
      const unchanged = await prisma.institution_paper_metadata.update({
        where: { id: record.id },
        data: { source: 'updated fixture' },
      })
      assert.deepEqual(unchanged.custom_fields, { flag: null })
      for (const flag of [0, 1, '0', '1', '', 'null'])
        await rejectConstraint(
          prisma.institution_paper_metadata.update({
            where: { id: record.id },
            data: { custom_fields: { flag } },
          }),
        )
      await rejectConstraint(
        prisma.institution_paper_metadata.update({
          where: { id: record.id },
          data: { custom_fields: Prisma.JsonNull },
        }),
      )
      await rejectConstraint(
        prisma.institution_paper_metadata.update({
          where: { id: record.id },
          data: { custom_fields: [] },
        }),
      )
      assert.deepEqual(
        (await prisma.institution_paper_metadata.findUniqueOrThrow({ where: { id: record.id } }))
          .custom_fields,
        { flag: null },
      )
    })

    test('required false and numeric zero are valid; null and omissions are rejected', async () => {
      const scope = await fixture()
      await prisma.institution_paper_field_definitions.create({
        data: {
          institutionId: scope.institutionId,
          key: 'flag',
          label: 'Flag',
          field_type: 'boolean',
          is_required: true,
        },
      })
      await prisma.institution_paper_field_definitions.create({
        data: {
          institutionId: scope.institutionId,
          key: 'count',
          label: 'Count',
          field_type: 'number',
          is_required: true,
          min_value: 0,
          max_value: 10,
        },
      })
      await rejectConstraint(
        prisma.institution_paper_metadata.create({
          data: { ...scope, source: 'fixture', custom_fields: { flag: null, count: 0 } },
        }),
      )
      await rejectConstraint(
        prisma.institution_paper_metadata.create({
          data: { ...scope, source: 'fixture', custom_fields: { flag: false } },
        }),
      )
      const record = await prisma.institution_paper_metadata.create({
        data: { ...scope, source: 'fixture', custom_fields: { flag: false, count: 0 } },
      })
      assert.deepEqual(record.custom_fields, { flag: false, count: 0 })
      await rejectConstraint(
        prisma.institution_paper_metadata.update({
          where: { id: record.id },
          data: { custom_fields: { flag: true, count: 11 } },
        }),
      )
    })

    test('dates, text lengths and enum membership are checked by PostgreSQL independently of the API', async () => {
      const scope = await fixture()
      for (const definition of [
        { key: 'note', label: 'Note', field_type: 'text', max_length: 2 },
        {
          key: 'day',
          label: 'Day',
          field_type: 'date',
          min_date: new Date('2026-01-01'),
          max_date: new Date('2026-12-31'),
        },
        { key: 'choice', label: 'Choice', field_type: 'single_select', options: ['a', 'b'] },
        { key: 'tags', label: 'Tags', field_type: 'multi_select', options: ['a', 'b'] },
      ])
        await prisma.institution_paper_field_definitions.create({
          data: { institutionId: scope.institutionId, ...definition },
        })
      const valid = { note: '🧪中', day: '2026-09-11', choice: 'a', tags: ['a', 'b'] }
      const record = await prisma.institution_paper_metadata.create({
        data: { ...scope, source: 'fixture', custom_fields: valid },
      })
      for (const patch of [
        { note: 'abc' },
        { note: '' },
        { note: '\t\n' },
        { day: '2026-02-30' },
        { day: '2027-01-01' },
        { choice: 'c' },
        { tags: ['a', 'c'] },
        { tags: ['a', 'a'] },
      ]) {
        await rejectConstraint(
          prisma.institution_paper_metadata.update({
            where: { id: record.id },
            data: { custom_fields: { ...valid, ...patch } },
          }),
        )
      }
      const cleared = await prisma.institution_paper_metadata.update({
        where: { id: record.id },
        data: { custom_fields: { note: null, day: null, choice: null, tags: null } },
      })
      assert.deepEqual(cleared.custom_fields, { note: null, day: null, choice: null, tags: null })
    })

    test('definitions cannot silently reinterpret existing data or leak across institutions', async () => {
      const scope = await fixture()
      const other = await fixture()
      const definition = await prisma.institution_paper_field_definitions.create({
        data: {
          institutionId: scope.institutionId,
          key: 'count',
          label: 'Count',
          field_type: 'number',
        },
      })
      const record = await prisma.institution_paper_metadata.create({
        data: { ...scope, source: 'fixture', custom_fields: { count: 5 } },
      })
      await rejectConstraint(
        prisma.institution_paper_metadata.create({
          data: { ...other, source: 'fixture', custom_fields: { count: 5 } },
        }),
      )
      await rejectConstraint(
        prisma.institution_paper_field_definitions.update({
          where: { id: definition.id },
          data: { field_type: 'text' },
        }),
      )
      await rejectConstraint(
        prisma.institution_paper_field_definitions.update({
          where: { id: definition.id },
          data: { max_value: 4 },
        }),
      )
      await rejectConstraint(
        prisma.institution_paper_field_definitions.update({
          where: { id: definition.id },
          data: { key: 'new_key' },
        }),
      )
      await rejectConstraint(
        prisma.institution_paper_field_definitions.delete({ where: { id: definition.id } }),
      )
      await prisma.institution_paper_field_definitions.update({
        where: { id: definition.id },
        data: { is_active: false },
      })
      await prisma.institution_paper_metadata.update({
        where: { id: record.id },
        data: { custom_fields: { count: 5 } },
      })
      await rejectConstraint(
        prisma.institution_paper_metadata.update({
          where: { id: record.id },
          data: { custom_fields: { count: null } },
        }),
      )
      assert.deepEqual(
        (await prisma.institution_paper_metadata.findUniqueOrThrow({ where: { id: record.id } }))
          .custom_fields,
        { count: 5 },
      )
    })

    test('the application patch and database agree on null clearing and unchanged required values', async () => {
      const scope = await fixture()
      const required = await prisma.institution_paper_field_definitions.create({
        data: {
          institutionId: scope.institutionId,
          key: 'flag',
          label: 'Flag',
          field_type: 'boolean',
          is_required: true,
        },
      })
      const optional = await prisma.institution_paper_field_definitions.create({
        data: {
          institutionId: scope.institutionId,
          key: 'note',
          label: 'Note',
          field_type: 'text',
        },
      })
      const initial = { flag: false, note: 'Keep' }
      const record = await prisma.institution_paper_metadata.create({
        data: { ...scope, source: 'fixture', custom_fields: initial },
      })
      const patch = mergeCustomFieldPatch(initial, { note: null }, [required, optional])
      assert.deepEqual(patch.issues, [])
      const updated = await prisma.institution_paper_metadata.update({
        where: { id: record.id },
        data: { custom_fields: patch.values },
      })
      assert.deepEqual(updated.custom_fields, { flag: false, note: null })
      await rejectConstraint(
        prisma.institution_paper_field_definitions.update({
          where: { id: optional.id },
          data: { is_required: true },
        }),
      )
    })

    test('concurrent definition changes cannot invalidate a newly committed value', async () => {
      const scope = await fixture()
      const definition = await prisma.institution_paper_field_definitions.create({
        data: {
          institutionId: scope.institutionId,
          key: 'count',
          label: 'Count',
          field_type: 'number',
        },
      })
      const record = await prisma.institution_paper_metadata.create({
        data: { ...scope, source: 'fixture', custom_fields: { count: 0 } },
      })
      let signalWritten: () => void = (): void => undefined
      let releaseWrite: () => void = (): void => undefined
      const written = new Promise<void>((resolve) => {
        signalWritten = resolve
      })
      const release = new Promise<void>((resolve) => {
        releaseWrite = resolve
      })
      const write = prisma.$transaction(async (tx): Promise<void> => {
        await tx.institution_paper_metadata.update({
          where: { id: record.id },
          data: { custom_fields: { count: 6 } },
        })
        signalWritten()
        await release
      })
      await Promise.race([written, write])
      const constraint = rejectConstraint(
        prisma.institution_paper_field_definitions.update({
          where: { id: definition.id },
          data: { max_value: 5 },
        }),
      )
      releaseWrite()
      await Promise.all([write, constraint])
      assert.deepEqual(
        (await prisma.institution_paper_metadata.findUniqueOrThrow({ where: { id: record.id } }))
          .custom_fields,
        { count: 6 },
      )
      assert.equal(
        (
          await prisma.institution_paper_field_definitions.findUniqueOrThrow({
            where: { id: definition.id },
          })
        ).max_value,
        null,
      )
    })
  },
)
