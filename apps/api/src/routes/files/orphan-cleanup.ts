import type { FastifyInstance } from 'fastify'
import { buildObjectKey } from '../../utils/oss'

const ORPHAN_AGE_MS = 24 * 60 * 60 * 1000
const CLEANUP_BATCH_SIZE = 100

export const cleanupOrphanedPaperUploads = async (fastify: FastifyInstance): Promise<number> => {
  const files = await fastify.prisma.oss_files.findMany({
    where: {
      prefix: 'scholar/papers',
      createdAt: { lt: new Date(Date.now() - ORPHAN_AGE_MS) },
      submissions: { none: {} },
    },
    orderBy: { createdAt: 'asc' },
    take: CLEANUP_BATCH_SIZE,
  })

  let removed = 0
  for (const file of files) {
    const key = buildObjectKey(file.prefix ?? '', file.id, file.ext)
    const result = await fastify.prisma.oss_files.deleteMany({
      where: {
        id: file.id,
        submissions: { none: {} },
      },
    })
    if (result.count === 0) {
      continue
    }

    try {
      await fastify.oss.delete(key)
      removed += 1
    } catch (error) {
      await fastify.prisma.oss_files.create({ data: file }).catch((restoreError) => {
        fastify.log.error(
          { err: restoreError, fileId: file.id, key },
          'Failed to restore metadata after orphan storage cleanup failed',
        )
      })
      fastify.log.warn(
        { err: error, fileId: file.id, key },
        'Failed to remove orphaned paper upload from storage',
      )
    }
  }

  return removed
}
