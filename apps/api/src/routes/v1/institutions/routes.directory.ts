import { Type } from 'typebox'
import {
  TypeBoxValidatorCompiler,
  type FastifyPluginAsyncTypebox,
} from '@fastify/type-provider-typebox'
import { requireIdentityAdmin } from '../../../identity/service'
import { getConfiguredInstitution } from '../../../utils/institution-scope'
import { lockMutationScope } from '../../../utils/advisory-lock'
import {
  beginDirectoryRun,
  stageDirectoryPage,
  finishDirectoryRun,
  type DirectoryActor,
} from '../../../directory/sync'
import * as schema from '../../../directory/schema'
import { suspendPersonPrivileges } from '../../../directory/records'
import { assertPermissionManager, permissionContext } from '../../../administrators/access'
import { activeAppointmentWhere } from '../../../directory/policy'
import { eligibleGrantPeople } from '../../../review/authorization'
import { GovernedStepSchema } from '../../../review/governance-schema'
import { Check } from 'typebox/value'

const params = Type.Object({ slug: Type.String() })
const sourceParams = Type.Object({ slug: Type.String(), sourceId: Type.String({ format: 'uuid' }) })
const runParams = Type.Object({
  ...sourceParams.properties,
  runId: Type.String({ format: 'uuid' }),
})
const response = { 200: schema.DirectoryResponseSchema }

export const directoryRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  // Validate discriminated bodies without AJV stripping fields while trying union branches.
  fastify.setValidatorCompiler(TypeBoxValidatorCompiler)
  const authorize = async (
    slug: string,
    sourceId: string,
    actor: DirectoryActor,
  ): Promise<string> => {
    const institution = await getConfiguredInstitution(fastify)
    if (institution.slug !== slug) throw fastify.httpErrors.notFound('Institution not found')
    const source = await fastify.prisma.institution_directory_sources.findFirst({
      where: { id: sourceId, institutionId: institution.id },
    })
    if (!source) throw fastify.httpErrors.notFound('Directory source not found')
    if (actor.credentialId) {
      const credential = await fastify.prisma.institution_api_credentials.findFirst({
        where: {
          id: actor.credentialId,
          institutionId: institution.id,
          directorySourceId: sourceId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          scopes: { has: 'directory:sync' },
        },
      })
      if (!credential)
        throw fastify.httpErrors.forbidden('Credential is not bound to this directory source')
    } else await requireIdentityAdmin(fastify, slug, actor.userId)
    return institution.id
  }
  fastify.get('/:slug/directory', { schema: { params, response } }, async (request) => {
    const admin = await requireIdentityAdmin(fastify, request.params.slug, request.user.userId)
    const [policy, sources, runs] = await Promise.all([
      fastify.prisma.institution_directory_policies.findUnique({
        where: { institutionId: admin.institutionId },
      }),
      fastify.prisma.institution_directory_sources.findMany({
        where: { institutionId: admin.institutionId },
        orderBy: { createdAt: 'asc' },
      }),
      fastify.prisma.institution_directory_runs.findMany({
        where: { institutionId: admin.institutionId },
        take: 50,
        orderBy: { createdAt: 'desc' },
      }),
    ])
    return {
      code: 0 as const,
      data: {
        policy: policy ?? { admissionMode: 'sso', requireAppointment: false },
        sources: sources.map((source) => ({
          ...source,
          overdue:
            !source.lastAppliedAt ||
            Date.now() - source.lastAppliedAt.getTime() > source.expectedIntervalHours * 3600000,
        })),
        runs,
      },
    }
  })
  fastify.put(
    '/:slug/directory/policy',
    { schema: { params, body: schema.DirectoryPolicySchema, response } },
    async (request) => {
      const admin = await requireIdentityAdmin(fastify, request.params.slug, request.user.userId)
      const data = await fastify.prisma.$transaction(async (tx) => {
        await lockMutationScope(tx, 'institution-identity', admin.institutionId)
        if (request.body.admissionMode === 'directory') {
          const ready = await tx.institution_directory_sources.count({
            where: {
              institutionId: admin.institutionId,
              enabled: true,
              authoritative: true,
              lastAppliedAt: { not: null },
              runs: { some: { mode: 'full', status: 'applied' } },
            },
          })
          if (!ready)
            throw fastify.httpErrors.conflict(
              'Apply and verify an authoritative full snapshot before enabling directory admission',
            )
          if (!(await tx.users.count({ where: { platform_role: 'platform_admin' } })))
            throw fastify.httpErrors.conflict(
              'Configure an independent platform recovery administrator before enabling directory admission',
            )
          const admitted = await tx.institution_people.count({
            where: {
              institutionId: admin.institutionId,
              is_active: true,
              lifecycle_status: 'active',
              manually_suspended: false,
              directory_record: { isNot: null },
              ...(request.body.requireAppointment
                ? { appointments: { some: activeAppointmentWhere() } }
                : {}),
            },
          })
          if (!admitted)
            throw fastify.httpErrors.conflict('The admitted personnel directory is empty')
        }
        const { notes, ...policy } = request.body
        const result = await tx.institution_directory_policies.upsert({
          where: { institutionId: admin.institutionId },
          create: { institutionId: admin.institutionId, ...policy, updatedBy: admin.userId },
          update: { ...policy, updatedBy: admin.userId, updatedAt: new Date() },
        })
        // Check against the proposed policy inside the same transaction. A
        // stricter admission switch must not silently strand every final reviewer.
        if (policy.admissionMode === 'directory' || policy.requireAppointment) {
          const steps = await tx.institution_review_workflow_steps.findMany({
            where: {
              institutionId: admin.institutionId,
              resolver_type: 'governance',
              workflow: { is_active: true },
            },
          })
          for (const step of steps) {
            if (!Check(GovernedStepSchema, step.resolver_config))
              throw fastify.httpErrors.conflict(
                'Repair invalid review configuration before changing admission',
              )
            for (const group of step.resolver_config.groups) {
              if (
                group.kind === 'role' &&
                !(
                  await eligibleGrantPeople(
                    tx,
                    admin.institutionId,
                    group.role,
                    group.nodeId ?? null,
                  )
                ).length
              )
                throw fastify.httpErrors.conflict(
                  'Configure reviewers admitted by the new policy before changing admission',
                )
            }
          }
        }
        await tx.institution_identity_events.create({
          data: {
            institutionId: admin.institutionId,
            actorUserId: admin.userId,
            action: 'directory_policy_changed',
            notes,
          },
        })
        return result
      })
      return { code: 0 as const, data }
    },
  )
  fastify.post(
    '/:slug/directory/sources',
    { schema: { params, body: schema.DirectorySourceSchema, response } },
    async (request) => {
      const admin = await requireIdentityAdmin(fastify, request.params.slug, request.user.userId)
      if (request.body.deactivateMissing && !request.body.authoritative)
        throw fastify.httpErrors.badRequest(
          'Missing-row deactivation requires an authoritative source',
        )
      const data = await fastify.prisma.$transaction(async (tx) => {
        await lockMutationScope(tx, 'institution-identity', admin.institutionId)
        const result = await tx.institution_directory_sources.upsert({
          where: {
            institutionId_key: { institutionId: admin.institutionId, key: request.body.key },
          },
          create: { ...request.body, institutionId: admin.institutionId },
          update: { ...request.body, updatedAt: new Date() },
        })
        await tx.institution_identity_events.create({
          data: {
            institutionId: admin.institutionId,
            actorUserId: admin.userId,
            action: 'directory_source_changed',
            notes: `Source ${result.id}: ${JSON.stringify(request.body)}`,
          },
        })
        return result
      })
      return { code: 0 as const, data }
    },
  )
  const config = { allowIntegrationAuth: true, integrationScopes: ['directory:sync' as const] }
  fastify.post(
    '/:slug/directory/sources/:sourceId/runs',
    {
      config,
      schema: {
        params: sourceParams,
        body: schema.DirectoryRunSchema,
        headers: Type.Object({ 'idempotency-key': Type.String({ minLength: 1, maxLength: 128 }) }),
        response,
      },
    },
    async (request) => {
      const actor = {
        userId: request.user.userId,
        credentialId: request.user.token_type === 'integration' ? request.user.credentialId! : null,
      }
      await authorize(request.params.slug, request.params.sourceId, actor)
      return {
        code: 0 as const,
        data: await beginDirectoryRun(
          fastify,
          request.params.sourceId,
          request.headers['idempotency-key'],
          request.body,
          actor,
        ),
      }
    },
  )
  fastify.put(
    '/:slug/directory/sources/:sourceId/runs/:runId/pages/:page',
    {
      config,
      bodyLimit: 4 * 1024 * 1024,
      schema: {
        params: Type.Object({
          ...runParams.properties,
          page: Type.Integer({ minimum: 1, maximum: 1000 }),
        }),
        body: schema.DirectoryPageSchema,
        response,
      },
    },
    async (request) => {
      const actor = {
        userId: request.user.userId,
        credentialId: request.user.token_type === 'integration' ? request.user.credentialId! : null,
      }
      await authorize(request.params.slug, request.params.sourceId, actor)
      await stageDirectoryPage(
        fastify,
        request.params.sourceId,
        request.params.runId,
        request.params.page,
        request.body.rows,
      )
      return { code: 0 as const, data: null }
    },
  )
  for (const operation of ['validate', 'apply'] as const)
    fastify.post(
      `/:slug/directory/sources/:sourceId/runs/:runId/${operation}`,
      { config, schema: { params: runParams, body: schema.DirectoryApplySchema, response } },
      async (request) => {
        const actor = {
          userId: request.user.userId,
          sourceIp: request.ip,
          userAgent: request.headers['user-agent'],
          credentialId:
            request.user.token_type === 'integration' ? request.user.credentialId! : null,
        }
        await authorize(request.params.slug, request.params.sourceId, actor)
        return {
          code: 0 as const,
          data: await finishDirectoryRun(fastify, request.params.sourceId, request.params.runId, {
            ...request.body,
            actor,
            preview: operation === 'validate',
          }),
        }
      },
    )
  fastify.get(
    '/:slug/directory/sources/:sourceId/runs/:runId',
    {
      config,
      schema: {
        params: runParams,
        querystring: Type.Object({
          offset: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
        }),
        response,
      },
    },
    async (request) => {
      const actor = {
        userId: request.user.userId,
        credentialId: request.user.token_type === 'integration' ? request.user.credentialId! : null,
      }
      await authorize(request.params.slug, request.params.sourceId, actor)
      const run = await fastify.prisma.institution_directory_runs.findFirst({
        where: { id: request.params.runId, sourceId: request.params.sourceId },
      })
      if (!run) throw fastify.httpErrors.notFound('Directory run not found')
      const rows = await fastify.prisma.institution_directory_rows.findMany({
        where: { runId: run.id },
        take: 100,
        skip: request.query.offset ?? 0,
        orderBy: { id: 'asc' },
      })
      return { code: 0 as const, data: { run, rows } }
    },
  )
  fastify.post(
    '/:slug/directory/people/:personId/suspension',
    {
      schema: {
        params: Type.Object({ ...params.properties, personId: Type.String({ format: 'uuid' }) }),
        body: Type.Object({
          suspended: Type.Boolean(),
          notes: Type.String({ minLength: 1, maxLength: 2000 }),
        }),
        response,
      },
    },
    async (request) => {
      const admin = await requireIdentityAdmin(fastify, request.params.slug, request.user.userId)
      await fastify.prisma.$transaction(async (tx) => {
        await lockMutationScope(tx, 'institution-identity', admin.institutionId)
        const person = await tx.institution_people.findFirst({
          where: { id: request.params.personId, institutionId: admin.institutionId },
          include: { user: true },
        })
        if (!person) throw fastify.httpErrors.notFound('Person not found')
        await assertPermissionManager(fastify, tx, admin.institutionId, admin.userId)
        await permissionContext(tx, {
          institutionId: admin.institutionId,
          actorUserId: admin.userId,
          source: 'person_suspension',
          reason: request.body.notes.slice(0, 1000),
        })
        if (!admin.isPlatformAdmin && person.user?.platform_role === 'platform_admin')
          throw fastify.httpErrors.forbidden(
            'Platform administrator recovery requires a platform administrator',
          )
        await tx.institution_people.update({
          where: { id: person.id },
          data: { manually_suspended: request.body.suspended, updatedAt: new Date() },
        })
        if (request.body.suspended)
          await suspendPersonPrivileges(tx, admin.institutionId, person.id)
        await tx.institution_identity_events.create({
          data: {
            institutionId: admin.institutionId,
            personId: person.id,
            actorUserId: admin.userId,
            action: request.body.suspended ? 'person_suspended' : 'person_unsuspended',
            notes: request.body.notes,
          },
        })
      })
      return { code: 0 as const, data: null }
    },
  )
}
