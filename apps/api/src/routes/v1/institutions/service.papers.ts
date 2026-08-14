import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { Prisma } from '../../../../prisma/generated/client'
import { ensureReviewCase, submitReviewCase } from '../../../review/service'
import { refreshPaperSearchIndex } from '../../papers/paper-index'
import { resolvePaperScope } from '../../papers/service.paper'
import { requireNormalizedDoi } from '../../../utils/doi'
import type { PaperImportItem } from './schema'
import type { ImportAction, ImportItemStatus } from './service.shared'
import type { PaperScope } from '../../papers/service.shared'
import type { ImportActor } from '../../../utils/integration-auth'

interface PaperImportResult {
  action: ImportAction
  status: ImportItemStatus
  targetId: string
  message: string | null
}

interface PaperRecord {
  id: string
  title: string
  abstract: string | null
  doi: string
  normalized_doi: string
  journal_name: string | null
  publish_year: number | null
  publish_date: Date | null
  paper_type: number | null
  language: number | null
  citation_count: number | null
  pages: string | null
  keywords: string[]
  link: string | null
}

export const resolvePaperImportScope = async (
  fastify: FastifyInstance,
  institutionId: string,
  actor: ImportActor,
): Promise<PaperScope> => {
  if (actor.type === 'integration') {
    return { institutionId, labId: null, reviewNodeId: null }
  }
  return resolvePaperScope(fastify, actor.userId, institutionId, undefined, undefined)
}

const toIsoDay = (value: Date | null): string | null => {
  return value?.toISOString().slice(0, 10) ?? null
}

const buildMergedPaper = (
  existing: PaperRecord | null,
  item: PaperImportItem,
  doi: string,
): Omit<PaperRecord, 'id'> => ({
  title: item.title.trim(),
  abstract: item.abstract ?? existing?.abstract ?? null,
  doi,
  normalized_doi: doi,
  journal_name: item.journal_name ?? existing?.journal_name ?? null,
  publish_year: item.publish_year ?? existing?.publish_year ?? null,
  publish_date: item.publish_date
    ? new Date(`${item.publish_date}T00:00:00.000Z`)
    : (existing?.publish_date ?? null),
  paper_type: item.paper_type ?? existing?.paper_type ?? null,
  language: item.language ?? existing?.language ?? null,
  citation_count: item.citation_count ?? existing?.citation_count ?? null,
  pages: item.pages ?? existing?.pages ?? null,
  keywords: item.keywords ?? existing?.keywords ?? [],
  link: item.link ?? existing?.link ?? null,
})

const hasPaperChanges = (existing: PaperRecord, merged: Omit<PaperRecord, 'id'>): boolean => {
  return (
    existing.title !== merged.title ||
    existing.abstract !== merged.abstract ||
    existing.journal_name !== merged.journal_name ||
    existing.publish_year !== merged.publish_year ||
    toIsoDay(existing.publish_date) !== toIsoDay(merged.publish_date) ||
    existing.paper_type !== merged.paper_type ||
    existing.language !== merged.language ||
    existing.citation_count !== merged.citation_count ||
    existing.pages !== merged.pages ||
    JSON.stringify(existing.keywords) !== JSON.stringify(merged.keywords) ||
    existing.link !== merged.link ||
    existing.normalized_doi !== merged.normalized_doi
  )
}

const buildPaperSnapshot = (
  paper: Omit<PaperRecord, 'id'>,
  reviewNodeId: string | null,
  canonicalUpdatePending: boolean,
): Prisma.InputJsonObject => ({
  title: paper.title,
  abstract: paper.abstract,
  doi: paper.doi,
  journal_name: paper.journal_name,
  publish_year: paper.publish_year,
  publish_date: toIsoDay(paper.publish_date),
  paper_type: paper.paper_type,
  language: paper.language,
  citation_count: paper.citation_count,
  pages: paper.pages,
  keywords: paper.keywords,
  link: paper.link,
  review_node_id: reviewNodeId,
  source: 'institution_json_import',
  canonical_update_pending: canonicalUpdatePending,
})

const buildPaperUpdate = (
  merged: Omit<PaperRecord, 'id'>,
  now: Date,
): Prisma.papersUpdateInput => ({
  title: merged.title,
  abstract: merged.abstract,
  doi: merged.doi,
  normalized_doi: merged.normalized_doi,
  journal_name: merged.journal_name,
  publish_year: merged.publish_year,
  publish_date: merged.publish_date,
  paper_type: merged.paper_type,
  language: merged.language,
  citation_count: merged.citation_count,
  pages: merged.pages,
  keywords: merged.keywords,
  link: merged.link,
  updatedAt: now,
})

export const syncPaperImportItem = async (
  fastify: FastifyInstance,
  institutionId: string,
  actor: ImportActor,
  item: PaperImportItem,
  isPrivateDeployment: boolean,
  importItemId?: string,
): Promise<PaperImportResult> => {
  const doi = requireNormalizedDoi(item.doi)
  const actorUserId = actor.userId

  const scope = await resolvePaperImportScope(fastify, institutionId, actor)
  const embeddingState: {
    paper: { id: string; title: string; abstract: string | null } | null
  } = {
    paper: null,
  }

  const result = await fastify.prisma.$transaction(async (tx) => {
    const now = new Date()
    const existingPaper = await tx.papers.findUnique({
      where: { normalized_doi: doi },
    })
    const merged = buildMergedPaper(existingPaper, item, doi)
    const changed = existingPaper ? hasPaperChanges(existingPaper, merged) : true
    let paper: PaperRecord

    if (!existingPaper) {
      paper = await tx.papers.create({
        data: {
          ...merged,
          createdAt: now,
          updatedAt: now,
        },
      })
      embeddingState.paper = {
        id: paper.id,
        title: paper.title,
        abstract: paper.abstract,
      }
    } else if (isPrivateDeployment && changed) {
      paper = await tx.papers.update({
        where: { id: existingPaper.id },
        data: buildPaperUpdate(merged, now),
      })
      if (existingPaper.title !== paper.title || existingPaper.abstract !== paper.abstract) {
        embeddingState.paper = {
          id: paper.id,
          title: paper.title,
          abstract: paper.abstract,
        }
      }
    } else {
      paper = existingPaper
    }

    const existingClaim = await tx.paper_claims.findFirst({
      where: {
        paperId: paper.id,
        institutionId,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    })
    const canonicalUpdatePending = !isPrivateDeployment && existingPaper !== null && changed
    const submission = await tx.paper_submissions.create({
      data: {
        paperId: paper.id,
        claimId: existingClaim?.id ?? null,
        userId: actorUserId,
        institutionId,
        labId: scope.labId,
        oss_file_id: null,
        metadata_snapshot: buildPaperSnapshot(
          canonicalUpdatePending ? merged : paper,
          scope.reviewNodeId,
          canonicalUpdatePending,
        ),
        notes: canonicalUpdatePending
          ? 'Canonical metadata changes require platform administrator approval'
          : null,
        createdAt: now,
        updatedAt: now,
      },
    })

    const claimId = existingClaim?.id ?? randomUUID()
    const reviewCase = await ensureReviewCase(tx, {
      institutionId,
      contentType: 'paper',
      subjectId: claimId,
      currentVersionId: submission.id,
      submittedBy: actorUserId,
      reviewNodeId: scope.reviewNodeId,
      initialStatus: isPrivateDeployment ? 'approved' : 'draft',
    })

    const claim = existingClaim
      ? await tx.paper_claims.update({
          where: { id: existingClaim.id },
          data: {
            institutionId,
            labId: scope.labId,
            reviewNodeId: scope.reviewNodeId,
            submittedBy: actorUserId,
            submissionId: submission.id,
            updatedAt: now,
          },
        })
      : await tx.paper_claims.create({
          data: {
            id: claimId,
            paperId: paper.id,
            institutionId,
            labId: scope.labId,
            reviewNodeId: scope.reviewNodeId,
            reviewCaseId: reviewCase.id,
            submittedBy: actorUserId,
            submissionId: submission.id,
            createdAt: now,
            updatedAt: now,
          },
        })

    await tx.paper_submissions.update({
      where: { id: submission.id },
      data: {
        claimId: claim.id,
        updatedAt: now,
      },
    })

    if (isPrivateDeployment) {
      await tx.content_review_step_instances.deleteMany({ where: { caseId: reviewCase.id } })
      await tx.content_review_cases.update({
        where: { id: reviewCase.id },
        data: {
          currentVersionId: submission.id,
          status: 'approved',
          currentStep: null,
          decision_notes: null,
          decidedBy: actorUserId,
          submittedAt: now,
          decidedAt: now,
          updatedAt: now,
        },
      })
      await tx.content_review_actions.create({
        data: {
          caseId: reviewCase.id,
          institutionId,
          actorId: actorUserId,
          action: 'auto_approved',
          from_status: reviewCase.status,
          to_status: 'approved',
          versionId: submission.id,
          notes: 'Automatically approved by private deployment import policy.',
          createdAt: now,
        },
      })
    } else {
      await submitReviewCase(fastify, tx, {
        caseId: reviewCase.id,
        actorId: actorUserId,
        versionId: submission.id,
        reviewNodeId: scope.reviewNodeId,
      })
    }

    const action: ImportAction = existingPaper ? (changed ? 'updated' : 'unchanged') : 'created'

    const importResult = {
      action,
      status: isPrivateDeployment ? ('completed' as const) : ('pending' as const),
      targetId: claim.id,
      message: canonicalUpdatePending
        ? 'Metadata differences were saved for platform administrator review'
        : null,
    }

    if (importItemId) {
      await tx.institution_data_import_items.update({
        where: { id: importItemId },
        data: {
          targetId: importResult.targetId,
          action: importResult.action,
          status: importResult.status,
          message: importResult.message,
          updatedAt: now,
        },
      })
    }

    return importResult
  })

  if (isPrivateDeployment && embeddingState.paper) {
    const embeddingPaper = embeddingState.paper
    refreshPaperSearchIndex(fastify, embeddingPaper.id).catch((error) => {
      fastify.log.error(
        { err: error, paperId: embeddingPaper?.id },
        'Failed to process imported paper embeddings',
      )
    })
  }

  return result
}
