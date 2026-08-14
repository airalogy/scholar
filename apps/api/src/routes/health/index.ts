import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { Type } from 'typebox'

const HealthResponseSchema = Type.Object({
  code: Type.Literal(0),
  data: Type.Object({
    status: Type.Literal('ok'),
  }),
})

const NotReadyResponseSchema = Type.Object({
  code: Type.Literal(503),
  message: Type.String(),
})

const healthRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get(
    '/',
    {
      config: { publicRoute: true },
      schema: {
        tags: ['system'],
        security: [],
        response: {
          200: HealthResponseSchema,
        },
      },
    },
    async () => ({ code: 0 as const, data: { status: 'ok' as const } }),
  )

  fastify.get(
    '/ready',
    {
      config: { publicRoute: true },
      schema: {
        tags: ['system'],
        security: [],
        response: {
          200: HealthResponseSchema,
          503: NotReadyResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      try {
        await fastify.prisma.$queryRaw`SELECT 1`
        return { code: 0 as const, data: { status: 'ok' as const } }
      } catch (error) {
        fastify.log.warn({ err: error }, 'Readiness check failed')
        return reply.code(503).send({
          code: 503 as const,
          message: 'Service is not ready',
        })
      }
    },
  )
}

export default healthRoutes
