import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { Type } from 'typebox'
import { resolveBuildInfo } from '../../utils/build-info'

const VersionResponseSchema = Type.Object({
  code: Type.Literal(0),
  data: Type.Object({
    version: Type.String(),
    tag: Type.Union([Type.String(), Type.Null()]),
    commit: Type.String(),
    buildTime: Type.Union([Type.String(), Type.Null()]),
    dirty: Type.Boolean(),
  }),
})

const versionRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get(
    '/',
    {
      config: { publicRoute: true },
      schema: {
        tags: ['system'],
        security: [],
        response: {
          200: VersionResponseSchema,
        },
      },
    },
    async () => {
      return {
        code: 0 as const,
        data: resolveBuildInfo(),
      }
    },
  )
}

export default versionRoutes
