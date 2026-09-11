import type { Prisma } from '../../prisma/generated/client'

// Enqueue inside the same transaction that changes metadata or publication
// access. A process restart must not lose the pending search-index update.
export const enqueuePaperIndex = async (
  tx: Prisma.TransactionClient,
  paperId: string,
): Promise<void> => {
  const now = new Date()
  await tx.paper_index_jobs.upsert({
    where: { paperId },
    create: { paperId },
    update: {
      revision: { increment: 1 },
      status: 'queued',
      attempts: 0,
      availableAt: now,
      lastError: null,
      updatedAt: now,
    },
  })
}
