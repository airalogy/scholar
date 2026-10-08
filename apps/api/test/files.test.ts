import assert from 'node:assert/strict'
import test from 'node:test'
import Fastify, { type FastifyInstance } from 'fastify'
import sensible from '@fastify/sensible'
import { PDFDocument } from 'pdf-lib'
import multipart, { autoConfig } from '../src/plugins/global/multipart'
import jwtPlugin from '../src/plugins/global/jwt'
import fileRoutes from '../src/routes/files'
import { createProtectedFileAccessToken } from '../src/utils/protected-files'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const INSTITUTION_ID = '22222222-2222-4222-8222-222222222222'
const FILE_ID = '33333333-3333-4333-8333-333333333333'
const OTHER_ID = '44444444-4444-4444-8444-444444444444'

const buildApp = async (
  contentAccess = 'public',
): Promise<{ app: FastifyInstance; uploads: Buffer[] }> => {
  const app = Fastify({ logger: false })
  await app.register(sensible)
  await app.register(multipart, autoConfig)
  app.decorate('config', {
    JWT_SECRET: 'a-file-test-secret-that-is-longer-than-thirty-two-characters',
  } as never)
  app.decorate('deployment', {
    contentAccess,
    institution: { slug: 'example' },
    features: { paperUpload: true, degreeTheses: true },
  } as never)
  const pdf = await PDFDocument.create()
  pdf.addPage()
  const buffer = Buffer.from(await pdf.save())
  const file = {
    id: FILE_ID,
    userId: USER_ID,
    institutionId: INSTITUTION_ID,
    prefix: 'scholar/papers',
    security_profile: 'institution_document',
    mime_type: 'application/pdf',
    ext: '.pdf',
    original_name: 'example.pdf',
  }
  const uploads: Buffer[] = []
  app.decorate('oss', {
    upload: async (_key: string, data: Buffer) => {
      uploads.push(data)
      return { key: 'key', url: 'url' }
    },
    download: async () => buffer,
    delete: async () => undefined,
    getSignedUrl: () => '/signed',
    buildKey: () => 'key',
  })
  const prisma = {
    users: {
      findUnique: async ({ where }: { where: { id: string } }) => ({
        id: where.id,
        email: 'reader@example.invalid',
        platform_role: 'member',
      }),
    },
    institutions: {
      findUnique: async () => ({ id: INSTITUTION_ID, slug: 'example', name: 'Example' }),
    },
    institution_memberships: { findUnique: async () => ({ role: 'member' }) },
    oss_files: {
      findUnique: async () => file,
      aggregate: async () => ({ _sum: { file_size: 0 } }),
      count: async () => 0,
      create: async ({ data }: { data: Record<string, unknown> }) => ({ ...data, id: FILE_ID }),
    },
    paper_submissions: { findFirst: async () => null },
    degree_thesis_versions: { findMany: async () => [] },
    file_access_audits: {
      count: async () => 0,
      create: async () => ({ id: 'audit' }),
      update: async () => ({}),
    },
    $queryRawUnsafe: async () => [],
    $transaction: async (operation: (client: unknown) => Promise<unknown>) => operation(prisma),
  }
  app.decorate('prisma', prisma as never)
  await app.register(jwtPlugin)
  await app.register(fileRoutes, { prefix: '/files' })
  await app.ready()
  return { app, uploads }
}

const formPayload = (
  fileFirst: boolean,
  purpose = 'paper',
  institutionId = INSTITUTION_ID,
  size = 2 * 1024 * 1024,
): Buffer => {
  const fields = `--boundary\r\nContent-Disposition: form-data; name="purpose"\r\n\r\n${purpose}\r\n--boundary\r\nContent-Disposition: form-data; name="institution_id"\r\n\r\n${institutionId}\r\n`
  const file = `--boundary\r\nContent-Disposition: form-data; name="file"; filename="paper.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.7\n${'x'.repeat(size)}\r\n`
  return Buffer.from((fileFirst ? file + fields : fields + file) + '--boundary--\r\n')
}

for (const fileFirst of [true, false]) {
  test(`multipart uploads accept metadata ${fileFirst ? 'after' : 'before'} a streamed large file`, async (t) => {
    const { app, uploads } = await buildApp()
    t.after(() => app.close())
    const result = await app.inject({
      method: 'POST',
      url: '/files/upload',
      headers: {
        authorization: `Bearer ${app.jwt.sign({ userId: USER_ID })}`,
        'content-type': 'multipart/form-data; boundary=boundary',
      },
      payload: formPayload(fileFirst),
    })
    assert.equal(result.statusCode, 200, result.body)
    assert.equal(uploads.length, 1)
    assert.equal(result.json().id, FILE_ID)
    assert.equal(result.json().file_size, 2 * 1024 * 1024 + 9)
  })
}

for (const [purpose, institutionId, status] of [
  ['unknown', INSTITUTION_ID, 400],
  ['paper', OTHER_ID, 404],
] as const) {
  test(`file-first uploads reject ${purpose === 'unknown' ? 'invalid purposes' : 'other institutions'} before storage`, async (t) => {
    const { app, uploads } = await buildApp()
    t.after(() => app.close())
    const result = await app.inject({
      method: 'POST',
      url: '/files/upload',
      headers: {
        authorization: `Bearer ${app.jwt.sign({ userId: USER_ID })}`,
        'content-type': 'multipart/form-data; boundary=boundary',
      },
      payload: formPayload(true, purpose, institutionId),
    })
    assert.equal(result.statusCode, status, result.body)
    assert.equal(uploads.length, 0)
  })
}

test('multipart upload size limits remain enforced', async (t) => {
  const { app, uploads } = await buildApp()
  t.after(() => app.close())
  const result = await app.inject({
    method: 'POST',
    url: '/files/upload',
    headers: {
      authorization: `Bearer ${app.jwt.sign({ userId: USER_ID })}`,
      'content-type': 'multipart/form-data; boundary=boundary',
    },
    payload: formPayload(true, 'paper', INSTITUTION_ID, 25 * 1024 * 1024),
  })
  assert.equal(result.statusCode, 413)
  assert.equal(uploads.length, 0)
})

test('authenticated deployments serve signed PDF bytes with a login session and retain authorization', async (t) => {
  const { app } = await buildApp('authenticated')
  t.after(() => app.close())
  const headers = { authorization: `Bearer ${app.jwt.sign({ userId: USER_ID })}` }
  const preview = await app.inject({ url: `/files/preview/${FILE_ID}`, headers })
  assert.equal(preview.statusCode, 200)
  const path = preview.json().signatureUrl.replace(/^\/api/u, '')
  assert.equal((await app.inject({ url: path })).statusCode, 401)
  const result = await app.inject({ url: path, headers })
  assert.equal(result.statusCode, 200, result.body)
  assert.match(result.headers['content-type'] ?? '', /application\/pdf/u)
  assert.equal(result.rawPayload.subarray(0, 5).toString(), '%PDF-')
  const invalidViewer = createProtectedFileAccessToken(app, {
    fileId: FILE_ID,
    userId: OTHER_ID,
    mode: 'preview',
  })
  assert.equal(
    (await app.inject({ url: `/files/access/${FILE_ID}?token=${invalidViewer}`, headers }))
      .statusCode,
    403,
  )
})

test('expired and malformed signed file links return 401 instead of server errors', async (t) => {
  const { app } = await buildApp()
  t.after(() => app.close())
  const expired = app.jwt.sign({
    userId: USER_ID,
    fileId: FILE_ID,
    token_type: 'file_access',
    mode: 'preview',
    iat: 1,
  })
  for (const token of ['invalid-file-token', expired, app.jwt.sign({ userId: USER_ID })]) {
    const result = await app.inject({ url: `/files/access/${FILE_ID}?token=${token}` })
    assert.equal(result.statusCode, 401, result.body)
    assert.ok(!result.body.includes(token))
  }
})
