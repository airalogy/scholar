import type { FastifyInstance } from 'fastify'
import { Prisma } from '../../prisma/generated/client'
import { Check } from 'typebox/value'
import { lockMutationScope } from '../utils/advisory-lock'
import { writePaperBibliography } from '../bibliography/write'
import { enqueuePaperIndex } from '../bibliography/index-queue'
import { changeSubject, changeFingerprint } from './changes'
import {
  ApprovedReviewChangeSchema,
  type ApprovedReviewChange,
  type ReviewChange,
} from './changes-schema'

const applyPaperChange = async (
  tx: Prisma.TransactionClient,
  request: { institutionId: string; submittedBy: string; subjectId: string },
  current: Prisma.JsonObject,
  change: ApprovedReviewChange,
): Promise<void> => {
  const paperId = String(current.paperId)
  if (change.kind === 'bibliography') {
    await writePaperBibliography(
      tx,
      { ...change.metadata, paper_id: paperId },
      {
        institutionId: request.institutionId,
        actorUserId: request.submittedBy,
        source: 'approved_import_proposal',
        expectedFingerprint: change.expectedFingerprint,
      },
    )
  } else if (change.kind === 'metadata') {
    const { kind: _kind, ...patch } = change
    await writePaperBibliography(
      tx,
      { ...patch, paper_id: paperId, title: patch.title ?? current.title },
      {
        institutionId: request.institutionId,
        actorUserId: request.submittedBy,
        source: 'approved_change_request',
      },
    )
  } else if (change.kind === 'access') {
    await tx.paper_claims.update({
      where: { id: request.subjectId },
      data: { fullTextRestricted: change.restricted, updatedAt: new Date() },
    })
  } else if (change.kind === 'institutional_withdrawal') {
    await tx.content_review_cases.update({
      where: { id: String(current.reviewCaseId) },
      data: { status: change.withdrawn ? 'archived' : 'approved', updatedAt: new Date() },
    })
  } else {
    const key = { institutionId: request.institutionId, paperId, authorId: change.authorId }
    const prior = await tx.institution_paper_author_bindings.findUnique({
      where: { institutionId_paperId_authorId: key },
    })
    if (prior && prior.personId !== change.personId)
      throw new Error('Attribution changed; a new verification is required')
    if (change.action === 'bind')
      await tx.institution_paper_author_bindings.upsert({
        where: { institutionId_paperId_authorId: key },
        create: { ...key, personId: change.personId, boundBy: request.submittedBy },
        update: {},
      })
    else
      await tx.institution_paper_author_bindings.deleteMany({
        where: { ...key, personId: change.personId },
      })
  }
  await enqueuePaperIndex(tx, paperId)
}

const applyThesisChange = async (
  tx: Prisma.TransactionClient,
  subjectId: string,
  userId: string,
  change: ReviewChange,
  current: Prisma.JsonObject,
): Promise<void> => {
  const thesis = await tx.degree_theses.findUniqueOrThrow({
    where: { id: subjectId },
    include: { published_version: true, current_version: true },
  })
  const base = await tx.degree_thesis_versions.findFirst({
    where: { id: String(current.versionId), thesisId: subjectId },
  })
  if (!base) throw new Error('Thesis material is unavailable')
  if (change.kind === 'institutional_withdrawal') {
    await tx.degree_theses.update({
      where: { id: subjectId },
      data: { publishedVersionId: change.withdrawn ? null : base.id, updatedAt: new Date() },
    })
    await tx.content_review_cases.update({
      where: { id: thesis.reviewCaseId },
      data: { status: change.withdrawn ? 'archived' : 'approved', updatedAt: new Date() },
    })
    return
  }
  if (change.kind === 'attribution') throw new Error('Unsupported thesis identity change')
  const { id: _id, createdAt: _createdAt, version_number: _versionNumber, ...fields } = base
  const latest = await tx.degree_thesis_versions.aggregate({
    where: { thesisId: subjectId },
    _max: { version_number: true },
  })
  const patch =
    change.kind === 'access'
      ? { visibility: change.restricted ? 'restricted' : 'institution' }
      : {
          title: change.title ?? base.title,
          abstract: change.abstract === undefined ? base.abstract : change.abstract,
          keywords: change.keywords ?? base.keywords,
        }
  const version = await tx.degree_thesis_versions.create({
    data: {
      ...fields,
      ...patch,
      version_number: (latest._max.version_number ?? 0) + 1,
      createdBy: userId,
      submittedAt: new Date(),
    },
  })
  await tx.degree_theses.update({
    where: { id: subjectId },
    data: { currentVersionId: version.id, publishedVersionId: version.id, updatedAt: new Date() },
  })
  await tx.content_review_cases.update({
    where: { id: thesis.reviewCaseId },
    data: { currentVersionId: version.id, updatedAt: new Date() },
  })
}

// The row lock is the execution lease. All local effects and the applied marker
// commit together; a process crash rolls the transaction back for the next worker.
export const executeNextReviewChange = async (fastify: FastifyInstance): Promise<boolean> => {
  let claimed: { id: string; caseId: string } | undefined
  try {
    return await fastify.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<
          Array<{ id: string; caseId: string }>
        >`SELECT c.id, c."caseId" FROM content_review_changes c JOIN content_review_cases r ON r.id = c."caseId" WHERE c.status = 'pending' AND r.status = 'approved' ORDER BY c."createdAt" FOR UPDATE OF c SKIP LOCKED LIMIT 1`
        claimed = rows[0]
        if (!claimed) return false
        const request = await tx.content_review_changes.findUniqueOrThrow({
          where: { id: claimed.id },
        })
        await lockMutationScope(
          tx,
          request.subjectType === 'paper' ? 'paper-claim' : 'degree-thesis',
          request.subjectId,
        )
        if (request.subjectType === 'paper') {
          const claim = await tx.paper_claims.findUniqueOrThrow({
            where: { id: request.subjectId },
          })
          await tx.$queryRaw`SELECT id FROM papers WHERE id = ${claim.paperId}::uuid FOR UPDATE`
        }
        const current = await changeSubject(
          tx,
          request.institutionId,
          request.subjectType,
          request.subjectId,
        )
        if (changeFingerprint(current) !== request.baseFingerprint)
          throw new Error('Published data changed; submit a fresh proposal')
        if (!Check(ApprovedReviewChangeSchema, request.payload))
          throw new Error('Invalid approved change')
        const change = request.payload as ApprovedReviewChange
        if (request.subjectType === 'paper') await applyPaperChange(tx, request, current, change)
        else {
          if (change.kind === 'bibliography')
            throw new Error('Bibliography proposals apply only to papers')
          await applyThesisChange(tx, request.subjectId, request.submittedBy, change, current)
        }
        await tx.content_review_changes.update({
          where: { id: request.id },
          data: { status: 'applied', appliedAt: new Date(), error: null },
        })
        await tx.content_review_rounds.updateMany({
          where: { caseId: request.caseId, status: 'approved' },
          data: { executionStatus: 'applied', completedAt: new Date() },
        })
        const approval = await tx.content_review_cases.findUniqueOrThrow({
          where: { id: request.caseId },
        })
        if (!approval.decidedBy) throw new Error('A human final approval is required')
        await tx.content_review_actions.create({
          data: {
            caseId: request.caseId,
            institutionId: request.institutionId,
            actorId: approval.decidedBy,
            roundNumber: approval.currentRound,
            action: 'change_applied',
            versionId: request.id,
            from_status: 'approved',
            to_status: 'approved',
            notes:
              'Worker applied the exact human-approved effect atomically; notification delivery is independent.',
          },
        })
        return true
      },
      { timeout: 30000 },
    )
  } catch {
    if (!claimed) throw new Error('Review execution could not acquire a task')
    await fastify.prisma.$transaction(async (tx) => {
      const failed = await tx.content_review_changes.updateMany({
        where: { id: claimed!.id, status: 'pending' },
        data: {
          status: 'failed',
          error:
            'Execution failed. Check for newer data or conflicting bindings before retrying; no partial changes were applied.',
        },
      })
      if (failed.count)
        await tx.content_review_rounds.updateMany({
          where: { caseId: claimed!.caseId, status: 'approved', executionStatus: 'pending' },
          data: { executionStatus: 'failed' },
        })
    })
    fastify.log.warn(
      { changeId: claimed.id },
      'Approved change execution failed without partial effects',
    )
    return true
  }
}
