import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import {
  FileAccessParamsSchema,
  FileAccessQuerySchema,
  OssPreviewParamsSchema,
  OssPreviewResponseSchema,
  OssUploadResponseSchema,
} from './schema'
import {
  getPreviewUrl,
  streamProtectedFileAccess,
  streamSignedStorageAccess,
  uploadOssFile,
} from './service'
import { assertFeatureEnabled } from '../../utils/deployment'

const ossRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.post(
    '/upload',
    {
      config: {
        rateLimit: { max: 10, timeWindow: '1 hour' },
      },
      schema: {
        tags: ['files'],
        consumes: ['multipart/form-data'],
        response: {
          200: OssUploadResponseSchema,
        },
      },
    },
    async (request) => {
      const data = await request.file()
      if (!data) {
        throw fastify.httpErrors.badRequest('No file uploaded')
      }

      const purposeField = data.fields.purpose
      const purpose =
        purposeField && typeof purposeField === 'object' && 'value' in purposeField
          ? String(purposeField.value).trim()
          : ''
      if (purpose !== 'paper' && purpose !== 'thesis' && purpose !== 'avatar') {
        throw fastify.httpErrors.badRequest('Upload purpose must be paper, thesis, or avatar')
      }
      if (purpose === 'paper' || purpose === 'thesis') {
        assertFeatureEnabled(
          fastify,
          purpose === 'thesis' ? 'degreeTheses' : 'paperUpload',
          purpose === 'thesis'
            ? 'Degree thesis upload is not available in this deployment'
            : 'Paper upload is not available in this deployment',
        )
      }

      const institutionIdField = data.fields.institution_id
      const institutionId =
        institutionIdField &&
        typeof institutionIdField === 'object' &&
        'value' in institutionIdField
          ? String(institutionIdField.value).trim() || undefined
          : undefined

      const fileBuffer = await data.toBuffer()

      return uploadOssFile(fastify, fileBuffer, data.filename, data.mimetype, request.user.userId, {
        purpose,
        institutionId,
      })
    },
  )

  fastify.get(
    '/preview/:id',
    {
      schema: {
        tags: ['files'],
        params: OssPreviewParamsSchema,
        response: {
          200: OssPreviewResponseSchema,
        },
      },
    },
    async (request) => {
      return getPreviewUrl(fastify, request.params.id, request.user.userId)
    },
  )

  fastify.get(
    '/access/storage',
    {
      config: { publicRoute: true },
      schema: {
        tags: ['files'],
        querystring: FileAccessQuerySchema,
        security: [],
      },
    },
    async (request, reply) => {
      return streamSignedStorageAccess(fastify, reply, request.query.token)
    },
  )

  fastify.get(
    '/access/:id',
    {
      config: { publicRoute: true },
      schema: {
        tags: ['files'],
        params: FileAccessParamsSchema,
        querystring: FileAccessQuerySchema,
      },
    },
    async (request, reply) => {
      return streamProtectedFileAccess(
        fastify,
        request,
        reply,
        request.params.id,
        request.query.token,
      )
    },
  )
}

export default ossRoutes
