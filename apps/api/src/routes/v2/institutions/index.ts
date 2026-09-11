import {
  TypeBoxValidatorCompiler,
  type FastifyPluginAsyncTypebox,
} from '@fastify/type-provider-typebox'
import type { Prisma } from '../../../../prisma/generated/client'
import { createBibliographyPreview } from '../../../bibliography/import-preview'
import { applyBibliographyImport } from '../../../bibliography/import-apply'
import {
  loadBibliographyImport,
  formatBibliographyImport,
  summarizeBibliographyImport,
} from '../../../bibliography/import-records'
import {
  loadImportInstitution,
  assertImportAccess,
  type ImportRequestContext,
} from '../../v1/institutions/service.shared'
import { resolveImportActor } from '../../../utils/integration-auth'
import {
  PreviewBody,
  ApplyBody,
  ReviewBody,
  SlugParams,
  ImportParams,
  ItemParams,
  ImportHeaders,
  ImportResponse,
  ListQuery,
  ListResponse,
  ItemResponse,
} from './schema'
import type { PaperMetadataInput } from '../../../bibliography/schema'
import { bibliographyFieldRoutes } from './fields'

const routes: FastifyPluginAsyncTypebox = async (fastify) => {
  // JSON booleans and numbers must retain their declared types. Coercion is
  // appropriate for URL query strings, never for standard import JSON bodies.
  fastify.setValidatorCompiler(TypeBoxValidatorCompiler)
  await bibliographyFieldRoutes(fastify, {})
  const writeConfig = {
    allowIntegrationAuth: true,
    integrationScopes: ['papers:import'] as Array<'papers:import'>,
  }
  const readConfig = {
    allowIntegrationAuth: true,
    integrationScopes: ['imports:read'] as Array<'imports:read'>,
  }
  const tags = ['bibliography-imports-v2']
  fastify.post(
    '/:slug/imports/papers',
    {
      bodyLimit: 10 * 1024 * 1024,
      config: writeConfig,
      schema: {
        tags,
        params: SlugParams,
        headers: ImportHeaders,
        body: PreviewBody,
        response: { 200: ImportResponse },
      },
    },
    async (request) => ({
      code: 0 as const,
      data: await createBibliographyPreview(
        fastify,
        request.params.slug,
        request.headers['idempotency-key'],
        request.body,
        {
          actor: resolveImportActor(request),
          sourceIp: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        },
      ),
    }),
  )

  fastify.post(
    '/:slug/imports/:importId/apply',
    {
      config: writeConfig,
      schema: { tags, params: ImportParams, body: ApplyBody, response: { 200: ImportResponse } },
    },
    async (request) => ({
      code: 0 as const,
      data: await applyBibliographyImport(
        fastify,
        request.params.slug,
        request.params.importId,
        request.body,
        {
          actor: resolveImportActor(request),
          sourceIp: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        },
      ),
    }),
  )

  fastify.post(
    '/:slug/imports/:importId/review',
    {
      schema: { tags, params: ImportParams, body: ReviewBody, response: { 200: ImportResponse } },
    },
    async (request) => ({
      code: 0 as const,
      data: await applyBibliographyImport(
        fastify,
        request.params.slug,
        request.params.importId,
        request.body,
        {
          actor: resolveImportActor(request),
          sourceIp: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        },
        true,
      ),
    }),
  )

  fastify.get(
    '/:slug/imports/:importId',
    {
      config: readConfig,
      schema: { tags, params: ImportParams, response: { 200: ImportResponse } },
    },
    async (request) => {
      const record = await loadBibliographyImport(
        fastify,
        request.params.slug,
        request.params.importId,
        {
          actor: resolveImportActor(request),
          sourceIp: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        },
      )
      return { code: 0 as const, data: await formatBibliographyImport(fastify.prisma, record) }
    },
  )

  fastify.get(
    '/:slug/imports',
    {
      config: readConfig,
      schema: { tags, params: SlugParams, querystring: ListQuery, response: { 200: ListResponse } },
    },
    async (request) => {
      const institution = await loadImportInstitution(fastify, request.params.slug)
      const context: ImportRequestContext = {
        actor: resolveImportActor(request),
        sourceIp: request.ip,
        userAgent: request.headers['user-agent'] ?? null,
      }
      await assertImportAccess(fastify, context, institution.id, 'imports:read')
      const where = { institutionId: institution.id, kind: 'papers', schemaVersion: 2 }
      const [records, total] = await Promise.all([
        fastify.prisma.institution_data_imports.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: request.query.limit ?? 20,
          skip: request.query.offset ?? 0,
          include: { items: { select: { status: true } } },
        }),
        fastify.prisma.institution_data_imports.count({ where }),
      ])
      return {
        code: 0 as const,
        data: {
          items: records.map((record) => summarizeBibliographyImport(record, record.items)),
          total,
        },
      }
    },
  )

  fastify.get(
    '/:slug/imports/:importId/items/:itemId',
    {
      config: readConfig,
      schema: { tags, params: ItemParams, response: { 200: ItemResponse } },
    },
    async (request) => {
      const record = await loadBibliographyImport(
        fastify,
        request.params.slug,
        request.params.importId,
        {
          actor: resolveImportActor(request),
          sourceIp: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        },
      )
      const item = await fastify.prisma.institution_data_import_items.findFirst({
        where: { id: request.params.itemId, importId: record.id },
        include: {
          issues: true,
          decisions: {
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            include: { actor: { select: { name: true } }, credential: { select: { name: true } } },
          },
        },
      })
      if (!item) throw fastify.httpErrors.notFound('Import item not found')
      const view = await formatBibliographyImport(fastify.prisma, record)
      const claim = item.targetId
        ? await fastify.prisma.paper_claims.findFirst({
            where: { id: item.targetId, institutionId: record.institutionId },
            select: { review_case: { select: { status: true } } },
          })
        : null
      const changes = Array.isArray(item.previewChanges)
        ? (item.previewChanges as Prisma.JsonObject[])
        : []
      return {
        code: 0 as const,
        data: {
          ...view.items.find((row) => row.id === item.id)!,
          paper: item.payload as PaperMetadataInput,
          changes: changes.map((change) => ({
            field: String(change.field),
            before: change.before,
            after: change.after,
          })),
          claim_review_status: claim?.review_case.status ?? null,
          decisions: item.decisions.map((decision) => ({
            id: decision.id,
            decision: decision.decision,
            notes: decision.notes,
            actor_type: decision.actorType,
            actor_name:
              decision.actorType === 'integration'
                ? (decision.credential?.name ?? null)
                : (decision.actor?.name ?? null),
            created_at: decision.createdAt.toISOString(),
          })),
        },
      }
    },
  )
}

export default routes
