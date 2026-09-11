import { Prisma } from '../../prisma/generated/client'
import type { FastifyInstance } from 'fastify'
import { refreshPaperSearchIndex, type PaperIndexRefreshResult } from '../routes/papers/paper-index'

const MAX_ATTEMPTS = 3
const LEASE_MS = 5 * 60 * 1000

export interface PaperIndexJob {
  paperId: string
  revision: number
  attempts: number
}

export const claimPaperIndexJobs = async (
  prisma: FastifyInstance['prisma'],
  owner: string,
  limit = 2,
): Promise<PaperIndexJob[]> =>
  prisma.$transaction(async (tx) => {
    await tx.paper_index_jobs.updateMany({
      where: { status: 'running', attempts: { gte: MAX_ATTEMPTS }, leaseUntil: { lt: new Date() } },
      data: {
        status: 'failed',
        leaseOwner: null,
        leaseUntil: null,
        lastError: 'retry_limit',
        updatedAt: new Date(),
      },
    })
    return tx.$queryRaw<PaperIndexJob[]>(Prisma.sql`
    WITH candidates AS (
      SELECT "paperId" FROM paper_index_jobs
      WHERE status IN ('queued', 'running') AND attempts < ${MAX_ATTEMPTS}
        AND "availableAt" <= CURRENT_TIMESTAMP
        AND ("leaseUntil" IS NULL OR "leaseUntil" < CURRENT_TIMESTAMP)
      ORDER BY "availableAt", "paperId" FOR UPDATE SKIP LOCKED LIMIT ${limit}
    )
    UPDATE paper_index_jobs AS job SET status = 'running', attempts = attempts + 1,
      "leaseOwner" = ${owner}, "leaseUntil" = CURRENT_TIMESTAMP + INTERVAL '5 minutes',
      "updatedAt" = CURRENT_TIMESTAMP
    FROM candidates WHERE job."paperId" = candidates."paperId"
    RETURNING job."paperId", job.revision, job.attempts
  `)
  })

export const processPaperIndexJob = async (
  fastify: FastifyInstance,
  job: PaperIndexJob,
  owner: string,
  refresh: typeof refreshPaperSearchIndex = refreshPaperSearchIndex,
): Promise<void> => {
  let heartbeatBusy = false
  const heartbeat = setInterval(() => {
    if (heartbeatBusy) return
    heartbeatBusy = true
    void (async (): Promise<void> => {
      try {
        await fastify.prisma.paper_index_jobs.updateMany({
          where: { paperId: job.paperId, leaseOwner: owner },
          data: { leaseUntil: new Date(Date.now() + LEASE_MS) },
        })
      } catch (error) {
        fastify.log.error(
          { err: error, paperId: job.paperId },
          'Paper index lease heartbeat failed',
        )
      } finally {
        heartbeatBusy = false
      }
    })()
  }, 30000)
  heartbeat.unref()
  let result: PaperIndexRefreshResult | null = null
  let failure = false
  try {
    result = await refresh(fastify, job.paperId)
  } catch (error) {
    failure = true
    fastify.log.error({ err: error, paperId: job.paperId }, 'Paper index job failed')
  } finally {
    clearInterval(heartbeat)
  }
  const retry = failure || result?.status === 'stale'
  const terminal = failure && job.attempts >= MAX_ATTEMPTS
  await fastify.prisma.paper_index_jobs.updateMany({
    where: { paperId: job.paperId, revision: job.revision, leaseOwner: owner, status: 'running' },
    data: {
      status: terminal ? 'failed' : retry ? 'queued' : 'completed',
      attempts: result?.status === 'stale' ? 0 : undefined,
      availableAt: new Date(Date.now() + (retry ? Math.min(300000, 10000 * 2 ** job.attempts) : 0)),
      leaseOwner: null,
      leaseUntil: null,
      lastError: failure ? 'index_refresh_failed' : null,
      updatedAt: new Date(),
    },
  })
  // A newer metadata write can enqueue a new revision while this worker runs.
  // Release only our lease; do not mark that newer revision complete or failed.
  await fastify.prisma.paper_index_jobs.updateMany({
    where: { paperId: job.paperId, revision: { not: job.revision }, leaseOwner: owner },
    data: { status: 'queued', leaseOwner: null, leaseUntil: null, updatedAt: new Date() },
  })
}
