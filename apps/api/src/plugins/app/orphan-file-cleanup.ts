import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { cleanupOrphanedPaperUploads } from '../../routes/files/orphan-cleanup'

const INITIAL_DELAY_MS = 60 * 1000
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000

export default fp(async (fastify: FastifyInstance) => {
  const runCleanup = (): void => {
    cleanupOrphanedPaperUploads(fastify)
      .then((removed) => {
        if (removed > 0) {
          fastify.log.info({ removed }, 'Cleaned orphaned paper uploads')
        }
      })
      .catch((error) => {
        fastify.log.warn({ err: error }, 'Orphaned paper upload cleanup failed')
      })
  }

  const initialTimer = setTimeout(runCleanup, INITIAL_DELAY_MS)
  initialTimer.unref()
  const interval = setInterval(runCleanup, CLEANUP_INTERVAL_MS)
  interval.unref()

  fastify.addHook('onClose', async () => {
    clearTimeout(initialTimer)
    clearInterval(interval)
  })
})
