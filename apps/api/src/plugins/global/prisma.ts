import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { PrismaClient } from '../../../prisma/generated/client'
import { PrismaPg } from '@prisma/adapter-pg'

// 使用 declare 让 TypeScript 识别 fastify.prisma 属性
declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient
  }
}

export default fp(async (fastify: FastifyInstance) => {
  if (fastify.hasDecorator('prisma')) {
    throw new Error(
      'A `prisma` decorator has already been registered, please ensure you are not registering multiple instances of this plugin',
    )
  }

  const pool = new PrismaPg({ connectionString: fastify.config.DATABASE_URL })
  const prisma = new PrismaClient({
    adapter: pool,
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'info' },
      { emit: 'event', level: 'warn' },
      { emit: 'event', level: 'error' },
    ],
  })

  // 订阅 Prisma 日志事件并转发到 Fastify 日志流
  prisma.$on('query', (e) => {
    fastify.log.debug(
      {
        query: e.query,
        durationMs: e.duration,
        target: e.target,
      },
      'Prisma Query',
    )
  })

  prisma.$on('info', (e) => {
    fastify.log.info({ message: e.message, target: e.target }, 'Prisma Info')
  })

  prisma.$on('warn', (e) => {
    fastify.log.warn({ message: e.message, target: e.target }, 'Prisma Warning')
  })

  prisma.$on('error', (e) => {
    fastify.log.error({ message: e.message, target: e.target }, 'Prisma Error')
  })

  await prisma.$connect()

  // Decorate the fastify instance with the Prisma client
  fastify.decorate('prisma', prisma)

  // Add a hook to disconnect the Prisma client when the server closes
  fastify.addHook('onClose', async (instance: FastifyInstance) => {
    await instance.prisma.$disconnect()
  })
})
