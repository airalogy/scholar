import { randomUUID } from 'node:crypto'
import os from 'node:os'
import fp from 'fastify-plugin'
import { Prisma } from '../../../prisma/generated/client'
import { executeTimelineGeneration } from '../../ai/research-timeline/service'

interface ClaimedGeneration {
  id: string
}

const POLL_INTERVAL_MS = 1_500
export const TIMELINE_MAX_ATTEMPTS = 3

export const resolveTimelineFailureState = (
  attemptCount: number,
): { status: 'queued' | 'failed'; progressStage: 'queued' | 'failed' } => {
  const failed = attemptCount >= TIMELINE_MAX_ATTEMPTS
  return {
    status: failed ? 'failed' : 'queued',
    progressStage: failed ? 'failed' : 'queued',
  }
}

export default fp(async (fastify) => {
  if (fastify.deployment.scholarTimeline.generationMode === 'disabled') {
    return
  }

  const workerId = `${os.hostname()}:${process.pid}:${randomUUID()}`
  let stopped = false
  let polling = false
  let timer: NodeJS.Timeout | null = null
  let activePoll: Promise<void> | null = null

  const handleFailure = async (generationId: string, error: unknown): Promise<void> => {
    const generation = await fastify.prisma.scholar_research_timeline_generations.findUnique({
      where: { id: generationId },
      select: { attempt_count: true },
    })
    const failureState = resolveTimelineFailureState(
      generation?.attempt_count ?? TIMELINE_MAX_ATTEMPTS,
    )
    const errorMessage = error instanceof Error ? error.message : String(error)
    await fastify.prisma.scholar_research_timeline_generations.updateMany({
      where: { id: generationId, status: 'running', lease_owner: workerId },
      data: {
        status: failureState.status,
        progress_stage: failureState.progressStage,
        error_code: 'generation_failed',
        error_message: errorMessage.slice(0, 5000),
        lease_owner: null,
        lease_expires_at: null,
        completed_at: failureState.status === 'failed' ? new Date() : null,
        updatedAt: new Date(),
      },
    })
    fastify.log.error(
      { err: error, generationId, retrying: failureState.status === 'queued' },
      'Scholar timeline generation failed',
    )
  }

  const claimJobs = async (): Promise<ClaimedGeneration[]> => {
    return fastify.prisma.$queryRaw<ClaimedGeneration[]>(Prisma.sql`
      WITH candidates AS (
        SELECT "id"
        FROM "scholar_research_timeline_generations"
        WHERE (
          "status" = 'queued'
          OR (
            "status" = 'running'
            AND "lease_expires_at" IS NOT NULL
            AND "lease_expires_at" < CURRENT_TIMESTAMP
          )
        )
          AND "attempt_count" < ${TIMELINE_MAX_ATTEMPTS}
        ORDER BY "requested_at" ASC, "id" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${fastify.config.TIMELINE_CONCURRENCY}
      )
      UPDATE "scholar_research_timeline_generations" AS generation
      SET
        "status" = 'running',
        "progress_stage" = 'starting',
        "attempt_count" = generation."attempt_count" + 1,
        "lease_owner" = ${workerId},
        "lease_expires_at" = CURRENT_TIMESTAMP + INTERVAL '5 minutes',
        "started_at" = COALESCE(generation."started_at", CURRENT_TIMESTAMP),
        "updatedAt" = CURRENT_TIMESTAMP
      FROM candidates
      WHERE generation."id" = candidates."id"
      RETURNING generation."id"
    `)
  }

  const schedule = (): void => {
    if (stopped) {
      return
    }
    timer = setTimeout(() => {
      triggerPoll()
    }, POLL_INTERVAL_MS)
    timer.unref()
  }

  const poll = async (): Promise<void> => {
    if (stopped || polling) {
      return
    }
    polling = true
    try {
      const jobs = await claimJobs()
      await Promise.all(
        jobs.map(async (job) => {
          const heartbeat = setInterval(() => {
            void (async () => {
              try {
                await fastify.prisma.scholar_research_timeline_generations.updateMany({
                  where: { id: job.id, status: 'running', lease_owner: workerId },
                  data: {
                    lease_expires_at: new Date(Date.now() + 5 * 60 * 1000),
                    updatedAt: new Date(),
                  },
                })
              } catch (error) {
                fastify.log.error(
                  { err: error, generationId: job.id },
                  'Scholar timeline lease heartbeat failed',
                )
              }
            })()
          }, 60_000)
          heartbeat.unref()
          try {
            await executeTimelineGeneration(fastify, job.id, workerId)
          } catch (error) {
            await handleFailure(job.id, error)
          } finally {
            clearInterval(heartbeat)
          }
        }),
      )
    } catch (error) {
      fastify.log.error({ err: error }, 'Scholar timeline worker polling failed')
    } finally {
      polling = false
      schedule()
    }
  }

  const triggerPoll = (): void => {
    const promise = poll()
    activePoll = promise
    void (async () => {
      await promise
      if (activePoll === promise) {
        activePoll = null
      }
    })()
  }

  fastify.addHook('onReady', async () => {
    fastify.log.info(
      { workerId, concurrency: fastify.config.TIMELINE_CONCURRENCY },
      'Scholar timeline worker started',
    )
    triggerPoll()
  })

  fastify.addHook('onClose', async () => {
    stopped = true
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (activePoll) {
      await activePoll
    }
  })
})
