import { Type, type Static } from 'typebox'
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { CustomFieldDefinitionInputSchema } from '../../../bibliography/schema'
import {
  saveCustomFieldDefinition,
  type CustomFieldDefinition,
} from '../../../bibliography/custom-fields'
import { resolveImportActor } from '../../../utils/integration-auth'
import { loadImportInstitution, assertImportAccess } from '../../v1/institutions/service.shared'
import { SlugParams } from './schema'

const Output = Type.Object({
  ...CustomFieldDefinitionInputSchema.properties,
  key: Type.String(),
  label: Type.String(),
  label_en: Type.Union([Type.String(), Type.Null()]),
  field_type: Type.String(),
  options: Type.Array(Type.String()),
  visibility: Type.String(),
  is_active: Type.Boolean(),
  display_order: Type.Integer(),
  is_required: Type.Boolean(),
})
const format = (field: CustomFieldDefinition): Static<typeof Output> => ({
  ...field,
  is_required: field.is_required ?? false,
  min_date:
    field.min_date instanceof Date
      ? field.min_date.toISOString().slice(0, 10)
      : (field.min_date ?? null),
  max_date:
    field.max_date instanceof Date
      ? field.max_date.toISOString().slice(0, 10)
      : (field.max_date ?? null),
})

export const bibliographyFieldRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get(
    '/:slug/paper-fields',
    {
      config: { allowIntegrationAuth: true, integrationScopes: ['papers:import'] },
      schema: {
        tags: ['bibliography-imports-v2'],
        params: SlugParams,
        response: { 200: Type.Object({ code: Type.Literal(0), data: Type.Array(Output) }) },
      },
    },
    async (request) => {
      const institution = await loadImportInstitution(fastify, request.params.slug)
      await assertImportAccess(
        fastify,
        {
          actor: resolveImportActor(request),
          sourceIp: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        },
        institution.id,
        'papers:import',
      )
      const fields = await fastify.prisma.institution_paper_field_definitions.findMany({
        where: { institutionId: institution.id },
        orderBy: [{ display_order: 'asc' }, { key: 'asc' }],
      })
      return { code: 0 as const, data: fields.map(format) }
    },
  )
  fastify.put(
    '/:slug/paper-fields',
    {
      schema: {
        tags: ['bibliography-imports-v2'],
        params: SlugParams,
        body: CustomFieldDefinitionInputSchema,
        response: { 200: Type.Object({ code: Type.Literal(0), data: Output }) },
      },
    },
    async (request) => ({
      code: 0 as const,
      data: format(
        await saveCustomFieldDefinition(
          fastify,
          request.params.slug,
          request.user.userId,
          request.body,
        ),
      ),
    }),
  )
}
