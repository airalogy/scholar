import type { PrismaClient } from '../../prisma/generated/client'
import {
  writePaperBibliography,
  type BibliographyWriteContext,
  type BibliographyWriteResult,
} from './write'
import { stableStringify } from './normalize'

export interface BibliographyChange {
  field: string
  before: unknown
  after: unknown
}

class PreviewRollback extends Error {
  constructor(readonly result: BibliographyWriteResult) {
    super('Rollback bibliographic preview')
  }
}

export const bibliographyChanges = (result: BibliographyWriteResult): BibliographyChange[] => {
  return Object.keys(result.after)
    .filter((field) => field !== 'id')
    .flatMap((field) => {
      const before = result.before?.[field] ?? null
      const after = result.after[field]
      return stableStringify(before) === stableStringify(after) ? [] : [{ field, before, after }]
    })
}

// Exercise exactly the same writer and database constraints as apply, but always
// roll back. No canonical rows, audit events or jobs can escape this transaction.
// PostgreSQL sequences can have gaps after previews, as after any rolled-back write.
export const previewPaperBibliography = async (
  prisma: PrismaClient,
  input: unknown,
  context: BibliographyWriteContext,
): Promise<BibliographyWriteResult> => {
  try {
    await prisma.$transaction(
      async (tx) => {
        throw new PreviewRollback(await writePaperBibliography(tx, input, context))
      },
      { timeout: 30000 },
    )
  } catch (error) {
    if (error instanceof PreviewRollback) return error.result
    throw error
  }
  throw new Error('Preview transaction unexpectedly committed')
}
