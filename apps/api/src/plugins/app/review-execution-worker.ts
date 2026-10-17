import fp from 'fastify-plugin'
import { executeNextReviewChange } from '../../review/execution'

export default fp(async (fastify) => {
  let stopped = false
  let timer: NodeJS.Timeout | undefined
  let active: Promise<void> | undefined
  const poll = async (): Promise<void> => {
    try {
      for (let count = 0; count < 10 && !stopped; count++)
        if (!(await executeNextReviewChange(fastify))) break
    } catch {
      fastify.log.error('Review effect worker could not complete its poll')
    } finally {
      active = undefined
      if (!stopped) {
        timer = setTimeout(() => {
          active = poll()
        }, 5000)
        timer.unref()
      }
    }
  }
  fastify.addHook('onListen', async () => {
    active = poll()
  })
  fastify.addHook('onClose', async () => {
    stopped = true
    if (timer) clearTimeout(timer)
    await active
  })
})
