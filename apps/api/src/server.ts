import { buildApp } from './app'

const app = buildApp()
let shuttingDown = false

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  if (shuttingDown) {
    return
  }

  shuttingDown = true
  app.log.info({ signal }, 'Shutdown requested')

  try {
    await app.close()
    app.log.info({ signal }, 'Server shut down gracefully')
  } catch (error) {
    app.log.error({ err: error, signal }, 'Server shutdown failed')
    process.exitCode = 1
  }
}

process.once('SIGTERM', () => {
  void shutdown('SIGTERM')
})
process.once('SIGINT', () => {
  void shutdown('SIGINT')
})

try {
  await app.ready()
  await app.listen({ port: app.config.PORT, host: app.config.HOST })
  app.log.info(
    {
      address: app.server.address(),
      docsPath: '/docs',
    },
    'Scholar API started',
  )
} catch (error) {
  app.log.fatal({ err: error }, 'Scholar API failed to start')
  process.exitCode = 1
  await app.close().catch(() => undefined)
}
