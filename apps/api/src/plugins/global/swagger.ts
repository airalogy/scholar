import fp from 'fastify-plugin'
import fastifySwaggerUi from '@fastify/swagger-ui'
import fastifySwagger from '@fastify/swagger'
import { resolveBuildInfo } from '../../utils/build-info'

export default fp(async function (fastify) {
  /**
   * A Fastify plugin for serving Swagger (OpenAPI v2) or OpenAPI v3 schemas
   *
   * @see {@link https://github.com/fastify/fastify-swagger}
   */
  await fastify.register(fastifySwagger, {
    // hideUntagged: true,
    openapi: {
      info: {
        title: 'Airalogy Scholar API',
        description: 'Airalogy Scholar application API',
        version: resolveBuildInfo().version,
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
      security: [
        {
          bearerAuth: [],
        },
      ],
    },
  })

  /**
   * A Fastify plugin for serving Swagger UI.
   *
   * @see {@link https://github.com/fastify/fastify-swagger-ui}
   */
  await fastify.register(fastifySwaggerUi, {
    routePrefix: '/docs',
  })
})
