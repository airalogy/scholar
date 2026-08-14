import assert from 'node:assert/strict'
import test from 'node:test'
import type { FastifyInstance } from 'fastify'
import { getMyProfile } from '../src/routes/users/service'
import { resolveAdminAccess } from '../src/utils/admin-access'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const INSTITUTION_ID = '22222222-2222-4222-8222-222222222222'

const resolve = (
  platformRole: unknown,
  institutionMemberships: Array<{
    role: unknown
    can_review_content: boolean
    can_import_data: boolean
  }> = [],
  labMemberships: Array<{ role: unknown }> = [],
) => {
  return resolveAdminAccess({
    platformRole,
    institutionMemberships,
    labMemberships,
  })
}

test('ordinary members without delegated permissions cannot access administration', () => {
  assert.deepEqual(
    resolve('member', [
      {
        role: 'member',
        can_review_content: false,
        can_import_data: false,
      },
    ]),
    {
      can_access: false,
      manage_platform: false,
      manage_institutions: false,
      manage_labs: false,
      review_content: false,
      import_data: false,
    },
  )
})

test('an import-only institution member can enter only import-capable administration', () => {
  assert.deepEqual(
    resolve('member', [
      {
        role: 'member',
        can_review_content: false,
        can_import_data: true,
      },
    ]),
    {
      can_access: true,
      manage_platform: false,
      manage_institutions: false,
      manage_labs: false,
      review_content: false,
      import_data: true,
    },
  )
})

test('institution and lab administrators receive their inherited capabilities', () => {
  const institutionAdmin = resolve('member', [
    {
      role: 'admin',
      can_review_content: false,
      can_import_data: false,
    },
  ])
  assert.equal(institutionAdmin.manage_institutions, true)
  assert.equal(institutionAdmin.manage_labs, true)
  assert.equal(institutionAdmin.review_content, true)
  assert.equal(institutionAdmin.import_data, true)

  const labAdmin = resolve('member', [], [{ role: 'admin' }])
  assert.equal(labAdmin.manage_institutions, false)
  assert.equal(labAdmin.manage_labs, true)
  assert.equal(labAdmin.review_content, true)
  assert.equal(labAdmin.import_data, false)
})

test('platform administrators receive every administration capability', () => {
  assert.deepEqual(resolve('platform_admin'), {
    can_access: true,
    manage_platform: true,
    manage_institutions: true,
    manage_labs: true,
    review_content: true,
    import_data: true,
  })
})

test('the current-user profile exposes import-only access from the server', async () => {
  const fastify = {
    prisma: {
      users: {
        findUnique: async () => ({
          id: USER_ID,
          username: 'importer',
          email: 'importer@example.edu',
          name: 'Import Operator',
          avatar: null,
          platform_role: 'member',
        }),
      },
      lab_memberships: {
        findMany: async () => [],
      },
      institution_memberships: {
        findMany: async () => [
          {
            institutionId: INSTITUTION_ID,
            role: 'member',
            can_review_content: false,
            can_import_data: true,
          },
        ],
      },
      institutions: {
        findMany: async () => [
          {
            id: INSTITUTION_ID,
            name: 'Example University',
            slug: 'example-university',
          },
        ],
      },
    },
  } as unknown as FastifyInstance

  const response = await getMyProfile(fastify, USER_ID)

  assert.equal(response.data.admin_access.can_access, true)
  assert.equal(response.data.admin_access.import_data, true)
  assert.equal(response.data.admin_access.review_content, false)
  assert.deepEqual(response.data.manageable_institutions, [
    {
      id: INSTITUTION_ID,
      name: 'Example University',
      slug: 'example-university',
      role: 'member',
    },
  ])
})
