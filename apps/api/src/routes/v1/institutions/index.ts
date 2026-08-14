import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import {
  IdempotencyHeadersSchema,
  ImportListQuerySchema,
  ImportListResponseSchema,
  ImportParamsSchema,
  ImportResponseSchema,
  InstitutionParamsSchema,
  PaperImportBodySchema,
  ScholarImportBodySchema,
  ReviewImportBodySchema,
  ReviewWorkflowParamsSchema,
  ReviewWorkflowResponseSchema,
  UpsertReviewWorkflowBodySchema,
} from './schema'
import {
  getImport,
  importPapers,
  importScholars,
  listImports,
  reviewScholarImport,
} from './service'
import { resolveImportActor } from '../../../utils/integration-auth'
import { getDefaultReviewWorkflow, upsertDefaultReviewWorkflow } from './service.review-workflows'

const IMPORT_BODY_LIMIT = 10 * 1024 * 1024

const institutionImportRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get(
    '/:slug/review-workflows/:contentType',
    {
      schema: {
        tags: ['content-review-v1'],
        params: ReviewWorkflowParamsSchema,
        response: { 200: ReviewWorkflowResponseSchema },
      },
    },
    async (request) =>
      getDefaultReviewWorkflow(
        fastify,
        request.params.slug,
        request.params.contentType,
        request.user.userId,
      ),
  )

  fastify.put(
    '/:slug/review-workflows/:contentType',
    {
      schema: {
        tags: ['content-review-v1'],
        params: ReviewWorkflowParamsSchema,
        body: UpsertReviewWorkflowBodySchema,
        response: { 200: ReviewWorkflowResponseSchema },
      },
    },
    async (request) =>
      upsertDefaultReviewWorkflow(
        fastify,
        request.params.slug,
        request.params.contentType,
        request.body,
        request.user.userId,
      ),
  )

  fastify.post(
    '/:slug/imports/papers',
    {
      bodyLimit: IMPORT_BODY_LIMIT,
      config: {
        allowIntegrationAuth: true,
        integrationScopes: ['papers:import'],
      },
      schema: {
        tags: ['institution-imports-v1'],
        params: InstitutionParamsSchema,
        headers: IdempotencyHeadersSchema,
        body: PaperImportBodySchema,
        response: {
          200: ImportResponseSchema,
        },
      },
    },
    async (request) => {
      return importPapers(
        fastify,
        request.params.slug,
        request.headers['idempotency-key'],
        request.body,
        {
          actor: resolveImportActor(request),
          sourceIp: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        },
      )
    },
  )

  fastify.post(
    '/:slug/imports/scholars',
    {
      bodyLimit: IMPORT_BODY_LIMIT,
      config: {
        allowIntegrationAuth: true,
        integrationScopes: ['scholars:import'],
      },
      schema: {
        tags: ['institution-imports-v1'],
        params: InstitutionParamsSchema,
        headers: IdempotencyHeadersSchema,
        body: ScholarImportBodySchema,
        response: {
          200: ImportResponseSchema,
        },
      },
    },
    async (request) => {
      return importScholars(
        fastify,
        request.params.slug,
        request.headers['idempotency-key'],
        request.body,
        {
          actor: resolveImportActor(request),
          sourceIp: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        },
      )
    },
  )

  fastify.get(
    '/:slug/imports',
    {
      config: {
        allowIntegrationAuth: true,
        integrationScopes: ['imports:read'],
      },
      schema: {
        tags: ['institution-imports-v1'],
        params: InstitutionParamsSchema,
        querystring: ImportListQuerySchema,
        response: {
          200: ImportListResponseSchema,
        },
      },
    },
    async (request) => {
      return listImports(fastify, request.params.slug, request.query, {
        actor: resolveImportActor(request),
        sourceIp: request.ip,
        userAgent: request.headers['user-agent'] ?? null,
      })
    },
  )

  fastify.get(
    '/:slug/imports/:importId',
    {
      config: {
        allowIntegrationAuth: true,
        integrationScopes: ['imports:read'],
      },
      schema: {
        tags: ['institution-imports-v1'],
        params: ImportParamsSchema,
        response: {
          200: ImportResponseSchema,
        },
      },
    },
    async (request) => {
      return getImport(fastify, request.params.slug, request.params.importId, {
        actor: resolveImportActor(request),
        sourceIp: request.ip,
        userAgent: request.headers['user-agent'] ?? null,
      })
    },
  )

  fastify.post(
    '/:slug/imports/:importId/review',
    {
      schema: {
        tags: ['institution-imports-v1'],
        params: ImportParamsSchema,
        body: ReviewImportBodySchema,
        response: {
          200: ImportResponseSchema,
        },
      },
    },
    async (request) => {
      return reviewScholarImport(
        fastify,
        request.params.slug,
        request.params.importId,
        request.user.userId,
        request.body,
      )
    },
  )
}

export default institutionImportRoutes
