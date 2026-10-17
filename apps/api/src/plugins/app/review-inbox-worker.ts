import fp from 'fastify-plugin'
import { claimInboxEvents, deliverInboxEvent } from '../../integrations/task-inbox/outbox'

export default fp(async (fastify) => {
  if (!fastify.config.REVIEW_INBOX_URL) return
  const endpoint = new URL(fastify.config.REVIEW_INBOX_URL)
  const origin = new URL(fastify.config.REVIEW_PUBLIC_ORIGIN)
  if (
    endpoint.protocol !== 'https:' ||
    origin.protocol !== 'https:' ||
    fastify.config.REVIEW_INBOX_SECRET.length < 32
  )
    throw new Error(
      'Review inbox integration requires HTTPS URLs and a signing secret of at least 32 characters',
    )
  let stopped = false
  let timer: NodeJS.Timeout | null = null
  let active: Promise<void> | null = null
  const poll = async (): Promise<void> => {
    try {
      const events = await fastify.prisma.$transaction((tx) => claimInboxEvents(tx))
      await Promise.all(events.map((event) => deliverInboxEvent(fastify, event)))
    } catch (error) {
      fastify.log.error({ err: error }, 'Review inbox worker failed')
    } finally {
      active = null
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
    if (active) await active
  })
})
