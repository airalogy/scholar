import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import {
  AcademicSubjectCatalogQuerySchema,
  AcademicSubjectListResponseSchema,
  AcademicSubjectParamsSchema,
  AcademicSubjectResponseSchema,
  CreateAcademicSubjectBodySchema,
  UpdateAcademicSubjectBodySchema,
} from './schema'
import { createAcademicSubject, listAcademicSubjects, updateAcademicSubject } from './service'

const academicSubjectRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get(
    '/',
    {
      schema: {
        tags: ['academic-subjects-v1'],
        querystring: AcademicSubjectCatalogQuerySchema,
        response: { 200: AcademicSubjectListResponseSchema },
      },
    },
    async (request) => listAcademicSubjects(fastify, request.query, request.user.userId),
  )

  fastify.post(
    '/',
    {
      schema: {
        tags: ['academic-subjects-v1'],
        body: CreateAcademicSubjectBodySchema,
        response: { 200: AcademicSubjectResponseSchema },
      },
    },
    async (request) => createAcademicSubject(fastify, request.body, request.user.userId),
  )

  fastify.patch(
    '/:id',
    {
      schema: {
        tags: ['academic-subjects-v1'],
        params: AcademicSubjectParamsSchema,
        body: UpdateAcademicSubjectBodySchema,
        response: { 200: AcademicSubjectResponseSchema },
      },
    },
    async (request) =>
      updateAcademicSubject(fastify, request.params.id, request.body, request.user.userId),
  )
}

export default academicSubjectRoutes
