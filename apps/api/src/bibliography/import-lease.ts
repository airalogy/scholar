import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { Prisma } from '../../prisma/generated/client'

export const acquireBibliographyLease = async (
  fastify: FastifyInstance,
  importId: string,
): Promise<string | null> => {
  const token = randomUUID()
  const result = await fastify.prisma.institution_data_imports.updateMany({
    where: {
      id: importId,
      schemaVersion: 2,
      OR: [{ processingToken: null }, { leaseExpiresAt: { lte: new Date() } }],
    },
    data: {
      processingToken: token,
      leaseExpiresAt: new Date(Date.now() + 90000),
      updatedAt: new Date(),
    },
  })
  return result.count ? token : null
}

export const assertBibliographyLease = async (
  tx: Prisma.TransactionClient,
  importId: string,
  token: string,
): Promise<void> => {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM institution_data_imports WHERE id = ${importId}::uuid
      AND "processingToken" = ${token}::uuid FOR UPDATE
  `)
  if (!rows.length) {
    const error = new Error('The import is being processed by another request') as Error & {
      statusCode: number
    }
    error.statusCode = 409
    throw error
  }
  await tx.institution_data_imports.update({
    where: { id: importId },
    data: { leaseExpiresAt: new Date(Date.now() + 90000), updatedAt: new Date() },
  })
}

export const releaseBibliographyLease = async (
  prisma: FastifyInstance['prisma'],
  importId: string,
  token: string,
): Promise<void> => {
  await prisma.institution_data_imports.updateMany({
    where: { id: importId, processingToken: token },
    data: { processingToken: null, leaseExpiresAt: null },
  })
}
