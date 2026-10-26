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
    | 'paper-submission-request'
    | 'degree-thesis-create'
    | 'degree-thesis'
    | 'review-change',
  id: string,
): Promise<void> => {
  await tx.$queryRawUnsafe(
    'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))::text',
    `${scope}:${id}`,
  )
}
