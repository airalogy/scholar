import assert from 'node:assert/strict'
import test from 'node:test'
import Fastify, { type FastifyInstance } from 'fastify'
import sensible from '@fastify/sensible'
import { Check } from 'typebox/value'
import { decideReviewCase, submitReviewCase } from '../src/review/service'
import {
  CreateDegreeThesisBodySchema,
  DegreeThesisReviewBodySchema,
} from '../src/routes/v1/theses/schema'
import { UpsertReviewWorkflowBodySchema } from '../src/routes/v1/institutions/schema'
import jwtPlugin from '../src/plugins/global/jwt'
import degreeThesisRoutes from '../src/routes/v1/theses'
import {
  createDegreeThesis,
  getDegreeThesis,
  submitDegreeThesis,
} from '../src/routes/v1/theses/service'
import { createDegreeThesisRecordCode } from '../src/routes/v1/theses/record-code'

const INSTITUTION_ID = '11111111-1111-4111-8111-111111111111'
const CASE_ID = '22222222-2222-4222-8222-222222222222'
const CLAIM_ID = '33333333-3333-4333-8333-333333333333'
const VERSION_ID = '44444444-4444-4444-8444-444444444444'
const SUBMITTER_ID = '55555555-5555-4555-8555-555555555555'
const FIRST_REVIEWER_ID = '66666666-6666-4666-8666-666666666666'
const FINAL_REVIEWER_ID = '77777777-7777-4777-8777-777777777777'
const WORKFLOW_ID = '88888888-8888-4888-8888-888888888888'
const JWT_SECRET = 'test-jwt-secret-that-is-longer-than-thirty-two-characters'

test('degree thesis inputs and shared review workflows enforce structured limits', () => {
  const thesis = {
    institution_id: INSTITUTION_ID,
    title: 'A structured degree thesis',
    author_name: 'Test Student',
    training_unit: 'School of Science',
    major: 'Biology',
    degree_category: 'doctoral',
    award_year: 2026,
    advisors: ['Advisor'],
    keywords: ['biology'],
    language: 'en-US',
    visibility: 'public',
  }
  assert.equal(Check(CreateDegreeThesisBodySchema, thesis), true)
  assert.equal(Check(CreateDegreeThesisBodySchema, { ...thesis, award_year: 1899 }), false)
  assert.equal(
    Check(DegreeThesisReviewBodySchema, { decision: 'request_changes', notes: 'Revise it' }),
    true,
  )

  const step = { name: 'Review', reviewer_roles: ['reviewer'] }
  assert.equal(
    Check(UpsertReviewWorkflowBodySchema, {
      name: 'Three-stage review',
      steps: [step, step, step],
    }),
    true,
  )
  assert.equal(
    Check(UpsertReviewWorkflowBodySchema, {
      name: 'Four-stage review',
      steps: [step, step, step, step],
    }),
    false,
  )
})

test('degree thesis record codes are opaque, institution-prefixed, and deterministic', () => {
  const first = createDegreeThesisRecordCode('example-university', Buffer.alloc(12, 0))
  const second = createDegreeThesisRecordCode('example-university', Buffer.alloc(12, 255))
  assert.match(first, /^EXAMPLE-UNIVERSI-THS-[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{20}$/u)
  assert.equal(first, 'EXAMPLE-UNIVERSI-THS-00000000000000000000')
  assert.notEqual(first, second)
  assert.equal(first.includes('doctoral'), false)
  assert.equal(first.includes(SUBMITTER_ID), false)
  assert.equal(
    createDegreeThesisRecordCode('abcdefghijklmno-rest', Buffer.alloc(12, 0)),
    'ABCDEFGHIJKLMNO-THS-00000000000000000000',
  )
  assert.throws(() => createDegreeThesisRecordCode('example', Buffer.alloc(16, 0)))
})

test('degree thesis creation rejects a review node from another institution', async (t) => {
  const app = Fastify({ logger: false })
  await app.register(sensible)
  t.after(async () => app.close())
  let transactionCalled = false
  app.decorate('prisma', {
    users: {
      findUnique: async () => ({ id: SUBMITTER_ID, platform_role: 'member' }),
    },
    institution_memberships: {
      findUnique: async () => ({
        role: 'member',
        can_review_content: false,
        can_import_data: false,
      }),
    },
    institutions: {
      findUnique: async () => ({ id: INSTITUTION_ID, slug: 'example-university' }),
    },
    institution_org_nodes: {
      findFirst: async () => null,
    },
    $transaction: async () => {
      transactionCalled = true
    },
  } as never)

  await assert.rejects(
    createDegreeThesis(
      app,
      {
        institution_id: INSTITUTION_ID,
        review_node_id: CASE_ID,
        title: 'Cross-institution review node',
        author_name: 'Test Student',
        training_unit: 'School of Science',
        major: 'Biology',
        degree_category: 'doctoral',
        award_year: 2026,
        advisors: [],
        keywords: [],
        language: 'en-US',
        visibility: 'public',
      },
      SUBMITTER_ID,
      {},
    ),
    (error: { statusCode?: number }) => error.statusCode === 400,
  )
  assert.equal(transactionCalled, false)
})

test('published thesis responses hide active draft state and private submitter metadata', async (t) => {
  const app = Fastify({ logger: false })
  await app.register(sensible)
  t.after(async () => app.close())
  const publishedAt = new Date('2026-08-01T00:00:00.000Z')
  const updatedAt = new Date('2026-08-13T00:00:00.000Z')
  const publishedVersion = {
    id: VERSION_ID,
    thesisId: CLAIM_ID,
    version_number: 1,
    title: 'Published version',
    title_en: null,
    author_name: 'Test Student',
    student_id: 'private-student-id',
    training_unit: 'School of Science',
    major: 'Biology',
    degree_category: 'doctoral',
    award_year: 2026,
    advisors: [],
    abstract: null,
    keywords: [],
    language: 'en-US',
    visibility: 'public',
    confidentiality_until: null,
    fileId: null,
    createdBy: SUBMITTER_ID,
    createdAt: publishedAt,
    submittedAt: publishedAt,
  }
  app.decorate('prisma', {
    degree_theses: {
      findUnique: async () => ({
        id: CLAIM_ID,
        institutionId: INSTITUTION_ID,
        record_code: 'EXAMPLE-THS-00000000000000000000',
        institution_reference: 'SOURCE-1',
        submittedBy: SUBMITTER_ID,
        reviewCaseId: CASE_ID,
        currentVersionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        publishedVersionId: VERSION_ID,
        publishedAt,
        createdAt: publishedAt,
        updatedAt,
        institution: { id: INSTITUTION_ID, name: 'Example University', slug: 'example' },
        review_case: {
          id: CASE_ID,
          status: 'pending_review',
          currentStep: 1,
          decision_notes: null,
          submittedAt: updatedAt,
          steps: [],
          actions: [],
        },
        current_version: { ...publishedVersion, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
        published_version: publishedVersion,
        versions: [publishedVersion],
      }),
    },
    users: {
      findUnique: async () => ({ id: FIRST_REVIEWER_ID, platform_role: 'member' }),
    },
    institution_memberships: {
      findUnique: async () => null,
    },
  } as never)

  const response = await getDegreeThesis(app, CLAIM_ID, FIRST_REVIEWER_ID)
  assert.equal(response.data.status, 'approved')
  assert.equal(response.data.institution_reference, null)
  assert.equal(response.data.submitted_by, null)
  assert.equal(response.data.current_step, null)
  assert.equal(response.data.current_version, null)
  assert.deepEqual(response.data.versions, [])
  assert.equal(response.data.published_version?.student_id, null)
  assert.equal(response.data.submitted_at, publishedAt.toISOString())
  assert.equal(response.data.updated_at, publishedAt.toISOString())
})

test('degree thesis routes honor the feature flag and reject integration JWTs', async (t) => {
  const buildRouteApp = async (enabled: boolean): Promise<FastifyInstance> => {
    const app = Fastify({ logger: false })
    await app.register(sensible)
    app.decorate('config', { JWT_SECRET } as never)
    app.decorate('deployment', {
      features: { degreeTheses: enabled },
    } as never)
    app.decorate('prisma', {
      users: {
        findUnique: async () => ({ id: SUBMITTER_ID, platform_role: 'member' }),
      },
    } as never)
    await app.register(jwtPlugin)
    await app.register(degreeThesisRoutes, { prefix: '/v1/theses' })
    await app.ready()
    return app
  }

  const disabledApp = await buildRouteApp(false)
  t.after(async () => disabledApp.close())
  const userToken = disabledApp.jwt.sign({ userId: SUBMITTER_ID, token_type: 'access' })
  const disabled = await disabledApp.inject({
    method: 'GET',
    url: '/v1/theses',
    headers: { authorization: `Bearer ${userToken}` },
  })
  assert.equal(disabled.statusCode, 404)

  const enabledApp = await buildRouteApp(true)
  t.after(async () => enabledApp.close())
  const integrationToken = enabledApp.jwt.sign({
    userId: 'integration:test',
    token_type: 'integration',
    credentialId: CASE_ID,
    institutionId: INSTITUTION_ID,
    credentialVersion: 1,
    scopes: ['imports:read'],
  })
  const denied = await enabledApp.inject({
    method: 'GET',
    url: '/v1/theses',
    headers: { authorization: `Bearer ${integrationToken}` },
  })
  assert.equal(denied.statusCode, 403)
})

test('an approved degree thesis requires a new draft before it can be resubmitted', async (t) => {
  const app = Fastify({ logger: false })
  await app.register(sensible)
  t.after(async () => app.close())
  let transactionCalled = false
  app.decorate('prisma', {
    degree_theses: {
      findUnique: async () => ({
        id: CLAIM_ID,
        institutionId: INSTITUTION_ID,
        submittedBy: SUBMITTER_ID,
        currentVersionId: VERSION_ID,
        review_case: {
          status: 'approved',
          currentStep: null,
          steps: [],
        },
      }),
    },
    users: {
      findUnique: async () => ({ id: SUBMITTER_ID, platform_role: 'member' }),
    },
    institution_memberships: {
      findUnique: async () => null,
    },
    $transaction: async () => {
      transactionCalled = true
    },
  } as never)

  await assert.rejects(
    submitDegreeThesis(app, CLAIM_ID, SUBMITTER_ID, {}),
    (error: { statusCode?: number }) => error.statusCode === 403,
  )
  assert.equal(transactionCalled, false)
})

interface StoredReviewCase {
  id: string
  institutionId: string
  content_type: string
  subjectId: string
  currentVersionId: string | null
  submittedBy: string
  reviewNodeId: string | null
  workflowId: string | null
  status: string
  currentStep: number | null
  decision_notes: string | null
  decidedBy: string | null
  submittedAt: Date | null
  decidedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

interface StoredStep {
  id: string
  caseId: string
  institutionId: string
  workflowId: string | null
  step_order: number
  step_name: string
  status: string
  resolver_type: string
  resolver_config: unknown
  eligible_reviewer_user_ids: string[]
  resolution_notes: string | null
  review_notes: string | null
  reviewedBy: string | null
  reviewedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

test('papers use the shared multi-stage review state machine and audit trail', async (t) => {
  const app = Fastify({ logger: false })
  await app.register(sensible)
  t.after(async () => app.close())

  const now = new Date('2026-08-13T00:00:00.000Z')
  const reviewCase: StoredReviewCase = {
    id: CASE_ID,
    institutionId: INSTITUTION_ID,
    content_type: 'paper',
    subjectId: CLAIM_ID,
    currentVersionId: null,
    submittedBy: SUBMITTER_ID,
    reviewNodeId: null,
    workflowId: null,
    status: 'draft',
    currentStep: null,
    decision_notes: null,
    decidedBy: null,
    submittedAt: null,
    decidedAt: null,
    createdAt: now,
    updatedAt: now,
  }
  const steps: StoredStep[] = []
  const actions: Array<Record<string, unknown>> = []
  const prisma = {
    users: {
      findUnique: async ({ where }: { where: { id: string } }) => ({
        id: where.id,
        platform_role: 'member',
      }),
    },
    institution_memberships: {
      findMany: async () => [
        { userId: FIRST_REVIEWER_ID, role: 'reviewer', can_review_content: true },
        { userId: FINAL_REVIEWER_ID, role: 'admin', can_review_content: true },
      ],
      findUnique: async () => null,
    },
    institution_org_nodes: { findMany: async () => [] },
    institution_org_edges: { findMany: async () => [] },
    institution_org_people: { findMany: async () => [] },
    institution_org_positions: { findMany: async () => [] },
    institution_org_appointments: { findMany: async () => [] },
    institution_review_workflows: {
      findMany: async () => [{ id: WORKFLOW_ID, key: 'paper-review', name: 'Paper Review' }],
    },
    institution_review_workflow_bindings: {
      findMany: async () => [
        {
          workflowId: WORKFLOW_ID,
          binding_type: 'institution_default',
          content_type: 'paper',
          nodeId: null,
          priority: 100,
        },
        {
          workflowId: '99999999-9999-4999-8999-999999999999',
          binding_type: 'institution_default',
          content_type: 'degree_thesis',
          nodeId: null,
          priority: 200,
        },
      ],
    },
    institution_review_workflow_steps: {
      findMany: async () => [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          institutionId: INSTITUTION_ID,
          workflowId: WORKFLOW_ID,
          step_order: 1,
          name: 'Metadata review',
          resolver_type: 'institution_role',
          resolver_config: { roles: ['reviewer'] },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          institutionId: INSTITUTION_ID,
          workflowId: WORKFLOW_ID,
          step_order: 2,
          name: 'Final review',
          resolver_type: 'institution_role',
          resolver_config: { roles: ['admin'] },
          createdAt: now,
          updatedAt: now,
        },
      ],
    },
    content_review_cases: {
      findUnique: async ({ include }: { include?: unknown }) => {
        return include
          ? { ...reviewCase, steps: steps.map((step) => ({ ...step })) }
          : { ...reviewCase }
      },
      update: async ({ data }: { data: Partial<StoredReviewCase> }) => {
        Object.assign(reviewCase, data)
        return { ...reviewCase }
      },
    },
    content_review_step_instances: {
      deleteMany: async () => {
        steps.splice(0)
        return { count: 0 }
      },
      createMany: async ({ data }: { data: Array<Omit<StoredStep, 'id'>> }) => {
        data.forEach((step, index) => {
          steps.push({ ...step, id: `00000000-0000-4000-8000-00000000000${index}` })
        })
        return { count: data.length }
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<StoredStep> }) => {
        const step = steps.find((item) => item.id === where.id)
        assert.ok(step)
        Object.assign(step, data)
        return { ...step }
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { status: string }
        data: Partial<StoredStep>
      }) => {
        steps
          .filter((step) => step.status === where.status)
          .forEach((step) => Object.assign(step, data))
        return { count: steps.length }
      },
    },
    content_review_actions: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        actions.push(data)
        return data
      },
    },
  }
  app.decorate('prisma', prisma as never)

  await submitReviewCase(app, prisma as never, {
    caseId: CASE_ID,
    actorId: SUBMITTER_ID,
    versionId: VERSION_ID,
    sourceIp: '127.0.0.1',
    userAgent: 'review-test',
  })
  assert.equal(reviewCase.status, 'pending_review')
  assert.equal(reviewCase.currentStep, 1)
  assert.equal(steps.length, 2)
  assert.deepEqual(steps[0]?.eligible_reviewer_user_ids, [FIRST_REVIEWER_ID, FINAL_REVIEWER_ID])
  assert.deepEqual(steps[1]?.eligible_reviewer_user_ids, [FINAL_REVIEWER_ID])

  await assert.rejects(
    decideReviewCase(app, prisma as never, {
      caseId: CASE_ID,
      actorId: FIRST_REVIEWER_ID,
      decision: 'request_changes',
    }),
    (error: { statusCode?: number }) => error.statusCode === 400,
  )

  await decideReviewCase(app, prisma as never, {
    caseId: CASE_ID,
    actorId: FIRST_REVIEWER_ID,
    decision: 'approve',
    notes: 'Metadata verified',
  })
  assert.equal(reviewCase.status, 'pending_review')
  assert.equal(reviewCase.currentStep, 2)
  assert.equal(steps[0]?.status, 'approved')
  assert.equal(steps[1]?.status, 'pending')

  await assert.rejects(
    decideReviewCase(app, prisma as never, {
      caseId: CASE_ID,
      actorId: FIRST_REVIEWER_ID,
      decision: 'approve',
      notes: 'Attempted reviewer escalation',
    }),
    (error: { statusCode?: number }) => error.statusCode === 403,
  )

  await decideReviewCase(app, prisma as never, {
    caseId: CASE_ID,
    actorId: FINAL_REVIEWER_ID,
    decision: 'approve',
    notes: 'Approved for publication',
  })
  assert.equal(reviewCase.status, 'approved')
  assert.equal(reviewCase.currentStep, null)
  assert.equal(reviewCase.status, 'approved')
  assert.deepEqual(
    actions.map((action) => action.action),
    ['submitted', 'step_approved', 'approved'],
  )
  assert.deepEqual(
    actions.slice(1).map((action) => [action.step_order, action.step_name]),
    [
      [1, 'Metadata review'],
      [2, 'Final review'],
    ],
  )
})
