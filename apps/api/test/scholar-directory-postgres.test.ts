import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Fastify, { type FastifyInstance } from 'fastify'
import sensible from '@fastify/sensible'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient, type Prisma } from '../prisma/generated/client'
import directoryRoutes from '../src/routes/v1/scholars'
import type { ScholarDirectoryData } from '../src/routes/v1/scholars/schema.directory'
import type { DeploymentRuntimeConfig } from '../src/utils/deployment'

const databaseUrl = process.env.SCHOLAR_DIRECTORY_TEST_DATABASE_URL
const schema = `scholar_directory_test_${randomBytes(8).toString('hex')}`
const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let prisma: PrismaClient
let app: FastifyInstance
let institutionId: string
let collegeId: string
let departmentId: string
let legacyId: string
let subjectId: string
let childSubjectId: string
let foreignSubjectId: string
let aliceId: string
let privateNodeId: string
const ids: string[] = []
let initialSnapshot: string

const executeSql = (sql: string): void => {
  execFileSync('pnpm', ['exec', 'prisma', 'db', 'execute', '--stdin'], {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    input: sql,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}
const snapshot = async (): Promise<string> =>
  JSON.stringify(
    await prisma.$queryRaw`
  SELECT jsonb_build_object(
    'scholars', (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM scholars t),
    'people', (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM institution_people t),
    'identifiers', (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM institution_person_identifiers t),
    'appointments', (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM institution_org_appointments t),
    'memberships', (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM institution_memberships t),
    'users', (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM users t),
    'nodes', (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM institution_org_nodes t),
    'edges', (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM institution_org_edges t)
  ) AS data
`,
  )
const directory = async (
  query: Record<string, string | number> = {},
): Promise<ScholarDirectoryData> => {
  const params = new URLSearchParams(
    Object.entries(query).map(([key, value]) => [key, String(value)]),
  )
  const response = await app.inject(`/v1/scholars/directory?${params}`)
  assert.equal(response.statusCode, 200, response.body)
  return response.json().data as ScholarDirectoryData
}

describe('scholar directory isolated PostgreSQL integration', { skip: !databaseUrl }, () => {
  before(async () => {
    assert.ok(databaseUrl)
    assert.ok(
      ['localhost', '127.0.0.1', '::1', '[::1]', 'postgres'].includes(
        new URL(databaseUrl).hostname,
      ),
      'Use a local test database only',
    )
    const migrations = path.join(apiRoot, 'prisma/migrations')
    const sql = readdirSync(migrations, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .map((name) => readFileSync(path.join(migrations, name, 'migration.sql'), 'utf8'))
      .join('\n')
    executeSql(`CREATE SCHEMA "${schema}"; SET search_path TO "${schema}", public;\n${sql}`)
    const url = new URL(databaseUrl)
    url.searchParams.set('schema', schema)
    url.searchParams.set('options', `-c search_path=${schema},public`)
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url.toString() }, { schema }),
    })
    const [connection] = await prisma.$queryRaw<
      Array<{ schema: string }>
    >`SELECT current_schema() AS schema`
    assert.equal(connection.schema, schema)
    const institution = await prisma.institutions.create({
      data: { name: '示例研究大学', slug: 'directory-example' },
    })
    institutionId = institution.id
    const foreign = await prisma.institutions.create({
      data: { name: '另一示例大学', slug: 'directory-other' },
    })
    const source = await prisma.institution_directory_sources.create({
      data: { institutionId, key: 'example', name: 'Fictional source' },
    })
    const createNode = async (
      key: string,
      name: string,
      node_type: string,
      synced = true,
    ): Promise<string> =>
      (
        await prisma.institution_org_nodes.create({
          data: {
            institutionId,
            key,
            name,
            node_type,
            directorySourceId: synced ? source.id : null,
          },
        })
      ).id
    collegeId = await createNode('college', '示例理学院', 'college')
    departmentId = await createNode('department', '示例物理系', 'department')
    await createNode('music', '示例音乐系', 'department')
    legacyId = await createNode('legacy', '示例研究院', 'institute', false)
    const legacyChild = await createNode('legacy-child', '示例研究中心', 'center', false)
    await createNode('duplicate-a', '同名单位', 'college')
    await createNode('duplicate-b', '同名单位', 'department')
    await createNode('custom', '示例自定义单位', 'custom')
    privateNodeId = await createNode('internal', 'PRIVATE-COMMITTEE', 'unit')
    await prisma.institution_org_edges.createMany({
      data: [
        { institutionId, fromNodeId: collegeId, toNodeId: departmentId, edge_type: 'hierarchy' },
        { institutionId, fromNodeId: legacyChild, toNodeId: legacyId, edge_type: 'hierarchy' },
      ],
    })
    subjectId = (
      await prisma.academic_subjects.create({
        data: {
          code: 'fixture-science',
          nameZh: '示例科学',
          nameEn: 'Example science',
          institutionId,
        },
      })
    ).id
    childSubjectId = (
      await prisma.academic_subjects.create({
        data: {
          code: 'fixture-physics',
          nameZh: '示例物理学',
          nameEn: 'Example physics',
          parentId: subjectId,
          institutionId,
        },
      })
    ).id
    foreignSubjectId = (
      await prisma.academic_subjects.create({
        data: { code: 'fixture-private', nameZh: 'PRIVATE-SUBJECT', institutionId: foreign.id },
      })
    ).id
    await prisma.academic_subject_aliases.create({
      data: {
        subjectId: childSubjectId,
        alias: 'Quantum fixture',
        normalizedAlias: 'quantum fixture',
        scopeKey: institutionId,
      },
    })
    const scholar = async (
      name: string,
      college: string[],
      letter_index: string | null = null,
      research_directions: Prisma.InputJsonValue = [],
    ): Promise<string> => {
      const id = randomUUID()
      ids.push(id)
      await prisma.scholars.create({
        data: {
          id,
          name,
          college,
          letter_index,
          title: 'Professor',
          bio: 'Fictional public profile',
          research_directions,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      })
      await prisma.institution_people.create({
        data: {
          institutionId,
          key: id,
          internalId: `DEMO-${id}`,
          normalizedInternalId: `demo-${id}`,
          name,
          scholarId: id,
        },
      })
      return id
    }
    for (let i = 0; i < 130; i++)
      await scholar(`Member ${String(i).padStart(3, '0')}`, ['示例理学院'])
    aliceId = await scholar('Alice', ['示例物理系', '示例理学院', '示例物理系'], 'a', [
      { name: '光学', description: 'Photon research' },
    ])
    await scholar('Alice Zhang', ['示例物理系'], 'A')
    await scholar('Bob', ['示例音乐系'], 'B', [{ name: 'Music', description: 'Works with Alice' }])
    await scholar('安宁', ['示例研究中心'], 'A')
    await scholar('张宁', ['示例物理系'], 'Z', { unexpected: 'legacy JSON shape' })
    await scholar('Émile', ['同名单位'])
    await scholar("O'Neil", [])
    await scholar('100%_Lab', ['示例自定义单位'])
    await scholar('赵明', ['未知旧单位'])
    await scholar('王琳', [], 'W')
    await scholar('王琳', ['示例理学院'], 'W')
    await prisma.scholar_subjects.createMany({
      data: [
        { scholarId: aliceId, subjectId },
        { scholarId: aliceId, subjectId: childSubjectId },
        { scholarId: aliceId, subjectId: foreignSubjectId },
      ],
    })
    const person = await prisma.institution_people.findFirstOrThrow({
      where: { scholarId: aliceId },
    })
    for (const key of ['a', 'b']) {
      const position = await prisma.institution_org_positions.create({
        data: {
          institutionId,
          nodeId: privateNodeId,
          key,
          name: `PRIVATE-POSITION-${key}`,
          can_review_content: true,
        },
      })
      await prisma.institution_org_appointments.create({
        data: { institutionId, personId: person.id, positionId: position.id, key },
      })
    }
    const outside = await prisma.scholars.create({
      data: {
        name: 'FOREIGN-SCHOLAR',
        college: ['FOREIGN-UNIT'],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    })
    await prisma.institution_people.create({
      data: {
        institutionId: foreign.id,
        key: 'foreign',
        internalId: 'DEMO-FOREIGN',
        normalizedInternalId: 'demo-foreign',
        name: outside.name,
        scholarId: outside.id,
      },
    })
    app = Fastify()
    await app.register(sensible)
    app.decorate('prisma', prisma)
    app.decorate('deployment', {
      institution: { slug: institution.slug },
      contentAccess: 'public',
    } as DeploymentRuntimeConfig)
    await app.register(directoryRoutes, { prefix: '/v1/scholars' })
    await app.ready()
    initialSnapshot = await snapshot()
  })
  after(async () => {
    await app?.close()
    await prisma?.$disconnect()
    if (databaseUrl && /^scholar_directory_test_[0-9a-f]{16}$/u.test(schema))
      executeSql(`DROP SCHEMA IF EXISTS "${schema}" CASCADE;`)
  })

  test('pages all scholars past the old 100 limit with stable ordering and no duplicates', async () => {
    const first = await directory({ sort: 'name', limit: 24 })
    assert.equal(first.total, ids.length)
    const found: string[] = []
    for (let page = 1; page <= Math.ceil(first.total / 24); page++) {
      const result = await directory({ page, sort: 'name' })
      found.push(...result.items.map((item) => item.id))
    }
    assert.deepEqual([...found].sort(), [...ids].sort())
    assert.equal(new Set(found).size, ids.length)
    assert.deepEqual((await directory({ sort: 'name' })).items, first.items)
    const last = await directory({ page: 100000 })
    assert.equal(last.page, Math.ceil(ids.length / 24))
    assert.ok(last.items.length > 0)
    assert.equal((await directory({ q: 'Member 129' })).items[0].name, 'Member 129')
  })

  test('search handles exact names, prefixes, research, bilingual subjects and literal wildcards', async () => {
    assert.deepEqual(
      (await directory({ q: 'alice' })).items.map((item) => item.name),
      ['Alice', 'Alice Zhang', 'Bob'],
    )
    for (const q of ['Photon', '光学', 'Quantum fixture', 'Example physics', '示例科学'])
      assert.equal((await directory({ q })).items[0].id, aliceId, q)
    assert.deepEqual(
      (await directory({ q: '%_' })).items.map((item) => item.name),
      ['100%_Lab'],
    )
    assert.equal((await directory({ q: "O'Neil" })).total, 1)
    assert.equal((await directory({ q: "' OR 1=1 --" })).total, 0)
    assert.equal((await directory({ q: '\\' })).total, 0)
    assert.equal((await directory({ q: 'PRIVATE-SUBJECT' })).total, 0)
  })

  test('unit navigation uses known types and both hierarchy conventions without exposing positions', async () => {
    const all = await directory()
    const college = all.facets.units.find((unit) => unit.id === `org:${collegeId}`)!
    const department = all.facets.units.find((unit) => unit.id === `org:${departmentId}`)!
    assert.equal(college.kind, 'college')
    assert.equal(department.parentId, college.id)
    assert.equal(department.kind, 'department')
    assert.equal((await directory({ unit: department.id })).total, 3)
    assert.equal((await directory({ unit: college.id })).total, 134)
    assert.equal((await directory({ unit: `org:${legacyId}` })).items[0].name, '安宁')
    for (const label of ['同名单位', '示例自定义单位', '未知旧单位']) {
      const unit = all.facets.units.find((item) => item.name === label)!
      assert.equal(unit.id, `legacy:${label}`)
      assert.equal(unit.kind, 'unit')
    }
    assert.equal((await directory({ unit: 'unassigned' })).total, 2)
    assert.equal(
      all.facets.units.some((unit) => unit.id === `org:${privateNodeId}`),
      false,
    )
    const alice = await directory({ q: 'Alice', unit: department.id, subject_id: subjectId })
    assert.equal(alice.total, 1)
    assert.equal(alice.items[0].units.length, 2)
    assert.equal(alice.facets.units.find((unit) => unit.id === college.id)?.count, 1)
    assert.equal(alice.facets.subjects.find((subject) => subject.id === subjectId)?.count, 1)
  })

  test('initials, empty results and contextual counts remain consistent', async () => {
    assert.equal((await directory({ letter: 'a' })).total, 3)
    assert.equal((await directory({ letter: '#' })).total, 3)
    const empty = await directory({ q: 'not-a-real-person', page: 9 })
    assert.equal(empty.total, 0)
    assert.equal(empty.page, 1)
    assert.deepEqual(empty.items, [])
    assert.ok(empty.facets.units.every((unit) => unit.count === 0))
    const music = (await directory()).facets.units.find((unit) => unit.name === '示例音乐系')!
    const result = await directory({ unit: music.id, letter: 'A' })
    assert.equal(result.total, 0)
    assert.deepEqual(result.facets.letters, [{ letter: 'B', count: 1 }])
    assert.equal((await directory({ unit: 'missing-unit' })).total, 0)
    assert.equal((await directory({ subject_id: foreignSubjectId })).total, 0)
  })

  test('name sorting uses ICU when available and duplicate names have an ID tie-break', async () => {
    const result = await directory({ sort: 'name', limit: 60, letter: 'W' })
    assert.equal(result.total, 2)
    assert.deepEqual(
      result.items.map((item) => item.id),
      result.items.map((item) => item.id).sort(),
    )
    const icu = await prisma.$queryRaw<
      Array<{ collname: string }>
    >`SELECT collname FROM pg_collation WHERE collname IN ('zh-Hans-CN-x-icu', 'zh-x-icu') AND collprovider = 'i' AND collnamespace = 'pg_catalog'::regnamespace`
    assert.equal(result.nameOrder, icu.length ? 'pinyin' : 'unicode')
  })

  test('directory remains institution-scoped, lightweight and read-only', async () => {
    const result = await directory({ q: 'Alice' })
    const serialized = JSON.stringify(result)
    for (const value of [
      'FOREIGN-',
      'PRIVATE-',
      'internalId',
      'normalizedInternalId',
      'userId',
      'positionId',
      'appointments',
      'timeline',
      'DEMO-',
    ])
      assert.equal(serialized.includes(value), false, value)
    assert.deepEqual(Object.keys(result.items[0]).sort(), [
      'avatar',
      'id',
      'letter',
      'name',
      'research',
      'summary',
      'title',
      'units',
    ])
    assert.equal(
      (await app.inject('/v1/scholars/directory?institution_slug=directory-other')).statusCode,
      403,
    )
    assert.equal(
      await snapshot(),
      initialSnapshot,
      'Directory reads must not change existing data or authority records',
    )
  })
})
