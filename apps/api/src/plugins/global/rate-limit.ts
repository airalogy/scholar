import rateLimit from '@fastify/rate-limit'
import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'

export default fp(async (fastify: FastifyInstance) => {
  await fastify.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    hook: 'onRequest',
    keyGenerator: (request) => request.ip,
    errorResponseBuilder: (_request, context) => ({
      code: 429,
      message: `Too many requests. Retry in ${context.after}.`,
    }),
  })
})
