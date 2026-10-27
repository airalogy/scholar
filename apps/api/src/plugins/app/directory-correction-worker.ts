import fp from 'fastify-plugin'
import { expireDirectoryCorrections } from '../../directory/corrections'

export default fp(
  async (fastify) => {
    let running: Promise<void> | null = null
    const tick = (): void => {
      if (running) return
      running = (async (): Promise<void> => {
        try {
          await expireDirectoryCorrections(fastify)
        } catch (error) {
          fastify.log.error({ err: error }, 'Directory correction reconciliation failed')
        } finally {
          running = null
        }
      })()
    }
    let timer: NodeJS.Timeout | undefined
    fastify.addHook('onListen', async () => {
      tick()
      timer = setInterval(tick, 30000)
      timer.unref()
    })
    fastify.addHook('onClose', async () => {
      clearInterval(timer)
      await running
    })
  },
  { name: 'directory-correction-worker' },
)
