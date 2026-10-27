import { createHmac, randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { Prisma } from '../../../prisma/generated/client'
import { eligibleGrantPeople } from '../../review/authorization'

export const claimInboxEvents = async (
  tx: Prisma.TransactionClient,
): Promise<Array<{ id: string; leaseToken: string }>> => {
  const token = randomUUID()
  await tx.review_inbox_events.updateMany({
    where: { status: 'sending', leaseUntil: { lt: new Date() }, attempts: { gte: 8 } },
    data: {
      status: 'failed',
      leaseUntil: null,
      leaseToken: null,
      error: 'Delivery lease expired after the retry limit',
    },
  })
  return tx.$queryRaw<Array<{ id: string; leaseToken: string }>>`
    WITH candidates AS (
      SELECT e.id FROM review_inbox_events e
      WHERE e.attempts < 8 AND ((e.status = 'pending' AND e."availableAt" <= now()) OR (e.status = 'sending' AND e."leaseUntil" < now()))
      AND NOT EXISTS (SELECT 1 FROM review_inbox_events earlier WHERE earlier."taskId" = e."taskId" AND earlier.sequence < e.sequence AND earlier.status <> 'delivered')
      ORDER BY e."createdAt" FOR UPDATE SKIP LOCKED LIMIT 10
    ) UPDATE review_inbox_events e SET status = 'sending', "leaseToken" = ${token}::uuid,
      "leaseUntil" = now() + interval '60 seconds', attempts = attempts + 1
      FROM candidates c WHERE e.id = c.id RETURNING e.id, e."leaseToken"`
}

export const deliverInboxEvent = async (
  fastify: FastifyInstance,
  claim: { id: string; leaseToken: string },
  fetcher: typeof fetch = fetch,
): Promise<void> => {
  const event = await fastify.prisma.review_inbox_events.findFirst({
    where: { id: claim.id, leaseToken: claim.leaseToken, status: 'sending' },
    include: { task: { include: { step: true } } },
  })
  if (!event) return
  const timestamp = new Date().toISOString()
  const recipients = event.task.assignedPersonId
    ? [event.task.assignedPersonId]
    : event.task.personId
      ? [event.task.personId]
      : event.task.role
        ? (
            await eligibleGrantPeople(
              fastify.prisma,
              event.task.step.institutionId,
              event.task.role,
              event.task.nodeId,
            )
          ).map((person) => person.id)
        : []
  // No email, institutional identifiers, document metadata or signed file URLs
  // leave Scholar. The private adapter maps opaque task/person IDs to its inbox.
  const payload = JSON.stringify({
    eventId: event.id,
    taskId: event.taskId,
    sequence: event.sequence,
    eventType: event.eventType,
    currentStatus: event.task.status,
    institutionId: event.task.step.institutionId,
    timestamp,
    recipientPersonIds: recipients,
    url: new URL(`/reviews/tasks/${event.taskId}`, fastify.config.REVIEW_PUBLIC_ORIGIN).toString(),
  })
  try {
    const response = await fetcher(fastify.config.REVIEW_INBOX_URL, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': event.id,
        'X-Scholar-Signature': `sha256=${createHmac('sha256', fastify.config.REVIEW_INBOX_SECRET).update(payload).digest('hex')}`,
      },
      body: payload,
    })
    await response.body?.cancel()
    if (!response.ok) throw new Error('Inbox rejected the notification')
    await fastify.prisma.review_inbox_events.updateMany({
      where: { id: event.id, leaseToken: claim.leaseToken, status: 'sending' },
      data: {
        status: 'delivered',
        deliveredAt: new Date(),
        leaseToken: null,
        leaseUntil: null,
        error: null,
      },
    })
  } catch {
    await fastify.prisma.review_inbox_events.updateMany({
      where: { id: event.id, leaseToken: claim.leaseToken, status: 'sending' },
      data: {
        status: event.attempts >= 8 ? 'failed' : 'pending',
        availableAt: new Date(Date.now() + Math.min(3600, 2 ** event.attempts * 15) * 1000),
        leaseToken: null,
        leaseUntil: null,
        error: 'Notification delivery failed; no review decision was changed',
      },
    })
    fastify.log.warn(
      { eventId: event.id, attempt: event.attempts },
      'Review inbox notification delivery failed',
    )
  }
}
