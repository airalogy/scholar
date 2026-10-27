import type { Prisma } from '../../prisma/generated/client'

export const hasGovernedReview = async (
  tx: Prisma.TransactionClient,
  institutionId: string,
  contentType: 'paper' | 'degree_thesis',
): Promise<boolean> =>
  (await tx.institution_review_workflows.count({
    where: {
      institutionId,
      key: `governed-${contentType}`,
      is_active: true,
      steps: { some: { resolver_type: 'governance' } },
    },
  })) > 0
