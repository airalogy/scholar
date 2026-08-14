import assert from 'node:assert/strict'
import test from 'node:test'
import bcrypt from 'bcrypt'
import Fastify, { type FastifyInstance } from 'fastify'
import sensible from '@fastify/sensible'
import { updatePaper, deletePaper } from '../src/routes/papers/service.paper'
import { createPaper } from '../src/routes/papers/service.create'
import { refreshPaperSearchIndex } from '../src/routes/papers/paper-index'
import { uploadOssFile } from '../src/routes/files/service'
import { activateInstitutionProvision } from '../src/routes/auth/service'
import { assertValidScholarResearchTimeline } from '../src/utils/scholarResearchPeriod'
import { updateMyProfile } from '../src/routes/users/service'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const INSTITUTION_ID = '22222222-2222-4222-8222-222222222222'
const PAPER_ID = '33333333-3333-4333-8333-333333333333'
const FILE_ID = '44444444-4444-4444-8444-444444444444'

const createSensibleApp = async (): Promise<FastifyInstance> => {
  const app = Fastify({ logger: false })
  await app.register(sensible)
  return app
}

test('ordinary users cannot update or delete global paper records', async (t) => {
  const app = await createSensibleApp()
  t.after(async () => app.close())
  app.decorate('prisma', {
    users: {
      findUnique: async () => ({ id: USER_ID, platform_role: 'member' }),
    },
    papers: {
      findUnique: async () => ({ id: PAPER_ID, title: 'Paper', abstract: null }),
    },
    paper_claims: {
      findMany: async () => [],
    },
  } as never)

  await assert.rejects(
    updatePaper(app, PAPER_ID, { title: 'Mutated' }, USER_ID),
    (error: { statusCode?: number }) => error.statusCode === 403,
  )
  await assert.rejects(
    deletePaper(app, PAPER_ID, USER_ID),
    (error: { statusCode?: number }) => error.statusCode === 403,
  )
})

test('paper search indexing retains full-text rows without an embedding provider', async () => {
  const calls: unknown[][] = []
  const fastify = {
    config: {
      OPENAI_BASE_URL: '',
      OPENAI_API_KEY: '',
    },
    prisma: {
      papers: {
        findUnique: async () => ({
          title: 'Searchable title',
          abstract: 'Searchable abstract',
          updatedAt: new Date('2026-08-11T00:00:00.000Z'),
        }),
      },
      paper_claims: {
        findFirst: async () => ({ id: 'approved-claim' }),
      },
      $executeRawUnsafe: async (...args: unknown[]) => {
        calls.push(args)
        return 1
      },
    },
    log: {
      info: () => undefined,
      warn: () => undefined,
    },
  } as unknown as FastifyInstance

  await refreshPaperSearchIndex(fastify, PAPER_ID)

  assert.equal(calls.length, 2)
  assert.match(String(calls[0][0]), /to_tsvector/u)
  assert.equal(calls[0][4], null)
  assert.match(String(calls[1][0]), /"segmentIndex" >=/u)
})

test('paper uploads use a server-selected protected policy and avatar files cannot be attached', async (t) => {
  const app = await createSensibleApp()
  t.after(async () => app.close())
  let storedFile: Record<string, unknown> | null = null
  app.decorate('config', {} as never)
  app.decorate('jwt', { sign: () => 'short-lived-file-token' } as never)
  app.decorate('oss', {
    upload: async () => ({ key: 'key', url: 'url' }),
    download: async () => Buffer.alloc(0),
    delete: async () => undefined,
    getSignedUrl: () => '/signed',
    buildKey: () => 'key',
  })
  const prisma = {
    users: {
      findUnique: async () => ({ id: USER_ID, platform_role: 'member' }),
    },
    institution_memberships: {
      findUnique: async () => ({
        role: 'member',
        can_review_content: false,
        can_import_data: false,
      }),
    },
    institutions: {
      findUnique: async () => ({ id: INSTITUTION_ID }),
    },
    oss_files: {
      aggregate: async () => ({ _sum: { file_size: 0 } }),
      count: async () => 0,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        storedFile = data
        return { ...data, id: FILE_ID, createdAt: new Date() }
      },
      findUnique: async () => ({
        id: FILE_ID,
        userId: USER_ID,
        institutionId: null,
        security_profile: 'standard',
      }),
    },
    $queryRawUnsafe: async () => [],
    $transaction: async (operation: (client: unknown) => Promise<unknown>) => operation(prisma),
  }
  app.decorate('prisma', prisma as never)

  await uploadOssFile(app, Buffer.from('%PDF-1.7\n'), 'paper.pdf', 'application/pdf', USER_ID, {
    purpose: 'paper',
    institutionId: INSTITUTION_ID,
  })
  assert.equal(storedFile?.security_profile, 'institution_document')
  assert.equal(storedFile?.institutionId, INSTITUTION_ID)
  assert.equal(storedFile?.prefix, 'scholar/papers')

  await assert.rejects(
    createPaper(
      app,
      {
        title: 'Paper',
        doi: '10.1000/security',
        publish_year: 2026,
        paper_type: 1,
        language: 1,
        institution_id: INSTITUTION_ID,
        oss_file_id: FILE_ID,
      },
      USER_ID,
    ),
    (error: { statusCode?: number }) => error.statusCode === 400,
  )
})

test('profile avatars cannot reference protected paper files', async (t) => {
  const app = await createSensibleApp()
  t.after(async () => app.close())
  let updateCalled = false
  app.decorate('prisma', {
    users: {
      findUnique: async () => ({ id: USER_ID, avatar: null }),
      update: async () => {
        updateCalled = true
        return { id: USER_ID }
      },
    },
    oss_files: {
      findUnique: async () => ({
        id: FILE_ID,
        userId: USER_ID,
        prefix: 'scholar/papers',
        ext: '.pdf',
        mime_type: 'application/pdf',
        security_profile: 'institution_document',
      }),
    },
  } as never)

  await assert.rejects(
    updateMyProfile(app, USER_ID, { avatar: FILE_ID }),
    (error: { statusCode?: number }) => error.statusCode === 403,
  )
  assert.equal(updateCalled, false)
})

test('existing accounts must confirm their password before institution activation', async (t) => {
  const app = await createSensibleApp()
  t.after(async () => app.close())
  const passwordHash = await bcrypt.hash('correct-password', 4)
  app.decorate('prisma', {
    institution_user_provisions: {
      findUnique: async () => ({
        id: FILE_ID,
        institutionId: INSTITUTION_ID,
        inviteToken: 'activation-token-long-enough',
        status: 'pending_activation',
        email: 'member@example.edu',
        name: 'Member',
        role: 'member',
        externalId: null,
        college: null,
        major: null,
        laboratory: null,
        can_review_content: false,
        can_import_data: false,
        expiresAt: new Date(Date.now() + 60_000),
      }),
    },
    institutions: {
      findUnique: async () => ({ id: INSTITUTION_ID, slug: 'example', name: 'Example' }),
    },
    users: {
      findUnique: async () => ({
        id: USER_ID,
        email: 'member@example.edu',
        username: 'member',
        name: 'Member',
        password_hash: passwordHash,
      }),
    },
  } as never)

  await assert.rejects(
    activateInstitutionProvision(app, {
      token: 'activation-token-long-enough',
      institutionSlug: 'example',
      password: 'wrong-password',
    }),
    (error: { statusCode?: number }) => error.statusCode === 401,
  )
})

test('timeline imports reject overlapping periods and inconsistent paper counts', () => {
  assert.throws(
    () =>
      assertValidScholarResearchTimeline([
        {
          period_start_year: 2020,
          period_end_year: 2024,
          paper_count: 1,
          papers_with_abstract: 0,
          papers_without_abstract: 0,
          focus_summary: 'Summary',
          focus_tags: [],
          source_papers: [],
        },
      ]),
    /paper_count/u,
  )

  assert.throws(
    () =>
      assertValidScholarResearchTimeline([
        {
          period_start_year: 2020,
          period_end_year: 2024,
          paper_count: 0,
          papers_with_abstract: 0,
          papers_without_abstract: 0,
          focus_summary: 'First',
          focus_tags: [],
          source_papers: [],
        },
        {
          period_start_year: 2024,
          period_end_year: 2028,
          paper_count: 0,
          papers_with_abstract: 0,
          papers_without_abstract: 0,
          focus_summary: 'Second',
          focus_tags: [],
          source_papers: [],
        },
      ]),
    /must not overlap/u,
  )
})
