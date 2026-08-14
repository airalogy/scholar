import assert from 'node:assert/strict'
import test from 'node:test'
import Fastify from 'fastify'
import sensible from '@fastify/sensible'
import { Check } from 'typebox/value'
import type { PrismaClient } from '../prisma/generated/client'
import jwtPlugin from '../src/plugins/global/jwt'
import academicSubjectRoutes from '../src/routes/v1/academic-subjects'
import {
  normalizeAcademicSubjectName,
  resolveAcademicSubjects,
} from '../src/utils/academic-subjects'
import {
  CreateAcademicSubjectBodySchema,
  UpdateAcademicSubjectBodySchema,
} from '../src/routes/v1/academic-subjects/schema'
import { ScholarFacetsResponseSchema } from '../src/routes/v1/scholars/schema'

const GLOBAL_SUBJECT = {
  id: '11111111-1111-4111-8111-111111111111',
  code: 'computer-science',
  parentId: null,
  nameZh: '计算机科学',
  nameEn: 'Computer Science',
}

const INSTITUTION_SUBJECT = {
  id: '22222222-2222-4222-8222-222222222222',
  code: 'inst-subject',
  parentId: null,
  nameZh: '计算学',
  nameEn: 'Computing',
}

const TEST_USER_ID = '44444444-4444-4444-8444-444444444444'
const TEST_INSTITUTION_ID = '55555555-5555-4555-8555-555555555555'
const TEST_JWT_SECRET = 'academic-subject-test-secret-longer-than-thirty-two-characters'

test('academic subject names normalize Unicode width, case, and whitespace', () => {
  assert.equal(normalizeAcademicSubjectName('  ＡＩ   Research  '), 'ai research')
  assert.equal(normalizeAcademicSubjectName(' 人工智能 '), '人工智能')
})

test('institution local codes resolve to their mapped subject', async () => {
  const institutionId = '33333333-3333-4333-8333-333333333333'
  const prisma = {
    institution_subject_mappings: {
      findMany: async () => [
        {
          localCode: 'CS.08',
          subject: INSTITUTION_SUBJECT,
        },
      ],
    },
    academic_subjects: {
      findMany: async () => [],
    },
  } as unknown as PrismaClient

  const result = await resolveAcademicSubjects(prisma, {
    codes: ['CS.08'],
    institutionId,
  })

  assert.deepEqual(result, [INSTITUTION_SUBJECT])
})

test('subject resolution rejects unknown codes', async () => {
  const prisma = {
    institution_subject_mappings: {
      findMany: async () => [],
    },
    academic_subjects: {
      findMany: async () => [],
    },
  } as unknown as PrismaClient

  await assert.rejects(
    resolveAcademicSubjects(prisma, { codes: ['unknown-subject'] }),
    /Unknown subject code "unknown-subject"/u,
  )
})

test('catalog write schemas distinguish stable platform codes from local codes', () => {
  assert.equal(
    Check(CreateAcademicSubjectBodySchema, {
      code: 'cognitive-science',
      name_zh: '认知科学',
      name_en: 'Cognitive Science',
    }),
    true,
  )
  assert.equal(
    Check(CreateAcademicSubjectBodySchema, {
      institution_slug: 'example-university',
      local_code: 'CS.08',
      name_zh: '认知科学',
    }),
    true,
  )
  assert.equal(
    Check(CreateAcademicSubjectBodySchema, {
      code: 'Cognitive Science',
      name_zh: '认知科学',
    }),
    false,
  )
  assert.equal(Check(UpdateAcademicSubjectBodySchema, { is_active: false }), true)
})

test('scholar facet schema accepts database-backed subject identifiers and counts', () => {
  assert.equal(
    Check(ScholarFacetsResponseSchema, {
      code: 0,
      data: {
        subjects: [
          {
            ...GLOBAL_SUBJECT,
            count: 3,
          },
        ],
        colleges: ['工学院'],
        letters: ['Z'],
      },
    }),
    true,
  )
})

test('subject catalog routes separate platform and institution administration', async (t) => {
  const app = Fastify({ logger: false })
  await app.register(sensible)
  app.decorate('config', { JWT_SECRET: TEST_JWT_SECRET } as never)
  app.decorate('deployment', {
    paperLibrary: { fixedInstitutionSlug: null },
  } as never)
  app.decorate('prisma', {
    users: {
      findUnique: async () => ({ id: TEST_USER_ID, platform_role: 'member' }),
    },
    institutions: {
      findUnique: async ({ where }: { where: { slug?: string } }) =>
        where.slug === 'example-university'
          ? { id: TEST_INSTITUTION_ID, slug: 'example-university' }
          : null,
    },
    institution_memberships: {
      findUnique: async () => ({
        role: 'owner',
        can_review_content: false,
        can_import_data: false,
      }),
    },
    academic_subjects: {
      findMany: async () => [],
    },
  } as never)
  await app.register(jwtPlugin)
  await app.register(academicSubjectRoutes, { prefix: '/v1/academic-subjects' })
  await app.ready()
  t.after(async () => app.close())

  const accessToken = app.jwt.sign({ userId: TEST_USER_ID, token_type: 'access' })
  const headers = { authorization: `Bearer ${accessToken}` }
  const globalResponse = await app.inject({
    method: 'GET',
    url: '/v1/academic-subjects',
    headers,
  })
  assert.equal(globalResponse.statusCode, 403)

  const institutionResponse = await app.inject({
    method: 'GET',
    url: '/v1/academic-subjects?institution_slug=example-university',
    headers,
  })
  assert.equal(institutionResponse.statusCode, 200)
  assert.deepEqual(institutionResponse.json(), { code: 0, data: { items: [] } })

  const integrationToken = app.jwt.sign({
    userId: 'integration:test',
    token_type: 'integration',
    credentialId: '66666666-6666-4666-8666-666666666666',
    institutionId: TEST_INSTITUTION_ID,
    credentialVersion: 1,
    scopes: ['scholars:import'],
  })
  const integrationResponse = await app.inject({
    method: 'GET',
    url: '/v1/academic-subjects?institution_slug=example-university',
    headers: { authorization: `Bearer ${integrationToken}` },
  })
  assert.equal(integrationResponse.statusCode, 403)
})
