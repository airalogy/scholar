import type { Prisma } from '../../prisma/generated/client'

export const lockMutationScope = async (
  tx: Prisma.TransactionClient,
  scope:
    | 'institution'
    | 'institution-identity'
    | 'lab'
    | 'credentials'
    | 'download'
    | 'upload'
    | 'paper-claim'
    | 'degree-thesis-create'
    | 'degree-thesis',
  id: string,
): Promise<void> => {
  await tx.$queryRawUnsafe(
    'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))::text',
    `${scope}:${id}`,
  )
}
