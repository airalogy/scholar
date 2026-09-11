import { randomUUID } from 'node:crypto'
import fp from 'fastify-plugin'
import { claimPaperIndexJobs, processPaperIndexJob } from '../../bibliography/index-jobs'

export default fp(async (fastify) => {
  const owner = randomUUID()
  let stopped = false
  let timer: NodeJS.Timeout | null = null
  let active: Promise<void> | null = null
  const poll = async (): Promise<void> => {
    try {
      const jobs = await claimPaperIndexJobs(fastify.prisma, owner)
      await Promise.all(jobs.map((job) => processPaperIndexJob(fastify, job, owner)))
    } catch (error) {
      fastify.log.error({ err: error }, 'Paper index worker poll failed')
    } finally {
      active = null
      if (!stopped) {
        timer = setTimeout(() => {
          active = poll()
        }, 2000)
        timer.unref()
      }
    }
  }
  // Injection tests and build smoke checks do not start background work.
  fastify.addHook('onListen', async () => {
    active = poll()
  })
  fastify.addHook('onClose', async () => {
    stopped = true
    if (timer) clearTimeout(timer)
    if (active) await active
  })
})
