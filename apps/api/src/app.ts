import path from 'node:path'
import fastifyAutoload from '@fastify/autoload'
import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify'

export interface BuildAppOptions {
  logger?: FastifyServerOptions['logger']
  trustProxy?: FastifyServerOptions['trustProxy']
}

const redactSensitiveUrl = (value: string): string => {
  const sensitiveKeys = new Set([
    'token',
    'client_secret',
    'code',
    'state',
    'access_token',
    'id_token',
    'refresh_token',
  ])
  try {
    const url = new URL(value, 'http://scholar.local')
    for (const key of url.searchParams.keys()) {
      if (sensitiveKeys.has(key.toLowerCase())) {
        url.searchParams.set(key, '[REDACTED]')
      }
    }
    return `${url.pathname}${url.search}`
  } catch {
    return value.replace(
      /([?&](?:token|client_secret|code|state|access_token|id_token|refresh_token)=)[^&]*/giu,
      '$1[REDACTED]',
    )
  }
}

const resolveTrustProxy = (): FastifyServerOptions['trustProxy'] => {
  const value = process.env.TRUST_PROXY?.trim()
  if (!value || value === 'false') {
    return false
  }

  if (value === 'true') {
    return true
  }

  return value
}

const resolveLogger = (): FastifyServerOptions['logger'] => {
  const isProduction = process.env.NODE_ENV === 'production'
  const level = process.env.LOG_LEVEL?.trim() || (isProduction ? 'info' : 'debug')
  const redact = {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie'],
    censor: '[REDACTED]',
  }
  const serializers = {
    req: (request: {
      method?: string
      url?: string
      hostname?: string
      remoteAddress?: string
      remotePort?: number
    }) => ({
      method: request.method,
      url: redactSensitiveUrl(request.url ?? ''),
      hostname: request.hostname,
      remoteAddress: request.remoteAddress,
      remotePort: request.remotePort,
    }),
  }

  if (isProduction) {
    return { level, redact, serializers }
  }

  return {
    level,
    redact,
    serializers,
    transport: {
      target: 'pino-pretty',
      options: {
        ignore: 'pid,hostname,remotePort',
      },
    },
  }
}

const resolveErrorStatusCode = (error: FastifyError): number => {
  if (error.statusCode) {
    return error.statusCode
  }

  if ('code' in error && error.code === 'P2002') {
    return 409
  }

  if ('code' in error && error.code === 'P2025') {
    return 404
  }

  return 500
}

const registerApplication = (app: FastifyInstance): void => {
  app.register(fastifyAutoload, {
    dir: path.join(import.meta.dirname, 'plugins/global'),
  })

  app.register(fastifyAutoload, {
    dir: path.join(import.meta.dirname, 'plugins/app'),
  })

  app.register(fastifyAutoload, {
    dir: path.join(import.meta.dirname, 'routes'),
    scriptPattern: /^index(?:\.ts|\.js)$/iu,
    autoHooks: true,
    cascadeHooks: true,
  })

  app.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode = resolveErrorStatusCode(error)
    const message =
      statusCode >= 500
        ? 'Internal Server Error'
        : statusCode === 409 && error.code === 'P2002'
          ? 'A record with the same unique identity already exists'
          : error.message

    if (statusCode >= 500) {
      request.log.error(
        {
          err: error,
          request: {
            method: request.method,
            url: redactSensitiveUrl(request.url),
            params: request.params,
          },
        },
        'Unhandled error occurred',
      )
    }

    reply.code(statusCode).send({ code: statusCode, message })
  })
}

export const buildApp = (options: BuildAppOptions = {}): FastifyInstance => {
  const app = Fastify({
    logger: options.logger ?? resolveLogger(),
    trustProxy: options.trustProxy ?? resolveTrustProxy(),
  })

  registerApplication(app)
  return app
}
