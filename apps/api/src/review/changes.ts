import { createHash, randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { Static } from 'typebox'
import type { Prisma } from '../../prisma/generated/client'
import { lockMutationScope } from '../utils/advisory-lock'
import { getInstitutionAccessById } from '../utils/permissions'
import { userAdmitted } from '../directory/policy'
import { submitReviewCase } from './service'
import { snapshotJson } from './rounds'
import { participantCandidates } from './participants'
import { stableStringify } from '../bibliography/normalize'
import type { CreateReviewChangeSchema } from './changes-schema'

export const changeFingerprint = (snapshot: unknown): string =>
  createHash('sha256').update(stableStringify(snapshot)).digest('hex')

export const changeSubject = async (
  tx: Prisma.TransactionClient,
  institutionId: string,
  subjectType: string,
  subjectId: string,
): Promise<Prisma.JsonObject> => {
  if (subjectType === 'paper') {
    const claim = await tx.paper_claims.findFirst({
      where: { id: subjectId, institutionId },
      include: { paper: true, review_case: true },
    })
    if (!claim) throw new Error('Institution paper not found')
    const bindings = await tx.institution_paper_author_bindings.findMany({
      where: { institutionId, paperId: claim.paperId },
      orderBy: { id: 'asc' },
      select: { authorId: true, personId: true },
    })
    return snapshotJson({
      title: claim.paper.title,
      abstract: claim.paper.abstract,
      keywords: claim.paper.keywords,
      paperId: claim.paperId,
      updatedAt: claim.paper.updatedAt,
      bibliographyRevision: claim.paper.bibliography_revision,
      reviewCaseId: claim.reviewCaseId,
      status: claim.review_case.status,
      currentVersionId: claim.review_case.currentVersionId,
      fullTextRestricted: claim.fullTextRestricted,
      fileId: null,
      bindings,
    }) as Prisma.JsonObject
  }
  const thesis = await tx.degree_theses.findFirst({
    where: { id: subjectId, institutionId },
    include: { published_version: true, current_version: true, review_case: true },
  })
  if (!thesis) throw new Error('Institution thesis not found')
  const withdrawn = !thesis.publishedVersionId
    ? await tx.content_review_changes.findFirst({
        where: {
          institutionId,
          subjectType,
          subjectId,
          kind: 'institutional_withdrawal',
          status: 'applied',
        },
        orderBy: { appliedAt: 'desc' },
      })
    : null
  const withdrawnSnapshot = withdrawn?.beforeSnapshot as Prisma.JsonObject | undefined
  const withdrawnVersion =
    typeof withdrawnSnapshot?.versionId === 'string'
      ? await tx.degree_thesis_versions.findFirst({
          where: { id: withdrawnSnapshot.versionId, thesisId: subjectId },
        })
      : null
  const version = thesis.published_version ?? withdrawnVersion ?? thesis.current_version
  if (!version) throw new Error('No thesis material is available')
  return snapshotJson({
    title: version.title,
    abstract: version.abstract,
    keywords: version.keywords,
    fileId: version.fileId,
    versionId: version.id,
    visibility: version.visibility,
    publishedVersionId: thesis.publishedVersionId,
    reviewCaseId: thesis.reviewCaseId,
    status: thesis.review_case.status,
    currentVersionId: thesis.currentVersionId,
    updatedAt: thesis.updatedAt,
  }) as Prisma.JsonObject
}

const requirePublishedHistory = async (
  tx: Prisma.TransactionClient,
  institutionId: string,
  subjectType: string,
  subjectId: string,
  status: string,
): Promise<boolean> => {
  if (status === 'approved') return true
  if (status !== 'archived') return false
  // A rejected/withdrawn application is not a previously published record.
  return Boolean(
    await tx.content_review_changes.findFirst({
      where: {
        institutionId,
        subjectType,
        subjectId,
        kind: 'institutional_withdrawal',
        status: 'applied',
        payload: { path: ['withdrawn'], equals: true },
      },
    }),
  )
}

export const changeContext = async (
  fastify: FastifyInstance,
  institutionId: string,
  userId: string,
  subjectType: string,
  subjectId: string,
) => {
  const configured = await fastify.prisma.institution_review_workflows.findFirst({
    where: { institutionId, key: `governed-${subjectType}`, is_active: true },
  })
  if (!configured) throw fastify.httpErrors.notFound('Change requests are not enabled')
  const before = await changeSubject(fastify.prisma, institutionId, subjectType, subjectId)
  if (
    !(await requirePublishedHistory(
      fastify.prisma,
      institutionId,
      subjectType,
      subjectId,
      String(before.status),
    ))
  )
    throw fastify.httpErrors.notFound('No published record is available for a change request')
  const person = await fastify.prisma.institution_people.findUnique({
    where: { institutionId_userId: { institutionId, userId } },
  })
  const access = await getInstitutionAccessById(fastify, userId, institutionId)
  const candidates = await participantCandidates(fastify.prisma, {
    content_type: subjectType,
    subjectId,
    institutionId,
    currentVersionId: String(before.currentVersionId),
  })
  const canPropose =
    access.platform_role === 'platform_admin' ||
    access.institution_role === 'owner' ||
    candidates.some((candidate) => candidate.id === person?.id)
  const authors =
    subjectType === 'paper'
      ? await fastify.prisma.paper_authors.findMany({
          where: { paperId: String(before.paperId) },
          orderBy: { order: 'asc' },
          select: { authorId: true, display_name: true, author: { select: { name: true } } },
        })
      : []
  return {
    ownPersonId: person?.id ?? null,
    canPropose,
    canClaim: subjectType === 'paper' && Boolean(person),
    title: String(before.title),
    abstract: typeof before.abstract === 'string' ? before.abstract : '',
    keywords: before.keywords ?? [],
    authors: authors.map((author) => ({
      id: author.authorId,
      name: author.display_name ?? author.author.name,
    })),
  }
}

export const createReviewChange = async (
  fastify: FastifyInstance,
  institutionId: string,
  userId: string,
  key: string,
  input: Static<typeof CreateReviewChangeSchema>,
): Promise<{ id: string; caseId: string }> => {
  const access = await getInstitutionAccessById(fastify, userId, institutionId)
  const admin = access.platform_role === 'platform_admin' || access.institution_role === 'owner'
  return fastify.prisma.$transaction(
    async (tx) => {
      await lockMutationScope(
        tx,
        input.subjectType === 'paper' ? 'paper-claim' : 'degree-thesis',
        input.subjectId,
      )
      await lockMutationScope(tx, 'institution-identity', institutionId)
      const previous = await tx.content_review_changes.findUnique({
        where: {
          institutionId_submittedBy_idempotencyKey: {
            institutionId,
            submittedBy: userId,
            idempotencyKey: key,
          },
        },
      })
      if (previous) {
        if (
          previous.subjectId !== input.subjectId ||
          previous.subjectType !== input.subjectType ||
          changeFingerprint(previous.payload) !== changeFingerprint(input.change)
        )
          throw fastify.httpErrors.conflict('Idempotency key already used for another proposal')
        return { id: previous.id, caseId: previous.caseId }
      }
      if (!admin && !(await userAdmitted(tx, institutionId, userId)))
        throw fastify.httpErrors.forbidden('Current personnel admission is required')
      const before = await changeSubject(tx, institutionId, input.subjectType, input.subjectId)
      if (
        !(await requirePublishedHistory(
          tx,
          institutionId,
          input.subjectType,
          input.subjectId,
          String(before.status),
        ))
      )
        throw fastify.httpErrors.conflict(
          'Submit changes only against a published or institutionally withdrawn record',
        )
      if (
        before.status === 'archived' &&
        (input.change.kind !== 'institutional_withdrawal' || input.change.withdrawn)
      )
        throw fastify.httpErrors.conflict(
          'Restore the previously published record before proposing other changes',
        )
      const person = await tx.institution_people.findUnique({
        where: { institutionId_userId: { institutionId, userId } },
      })
      const candidates = await participantCandidates(tx, {
        content_type: input.subjectType,
        subjectId: input.subjectId,
        institutionId,
        currentVersionId: String(before.currentVersionId),
      })
      if (
        !admin &&
        !candidates.some((candidate) => candidate.id === person?.id) &&
        !(
          input.change.kind === 'attribution' &&
          input.change.action === 'bind' &&
          input.change.personId === person?.id
        )
      )
        throw fastify.httpErrors.forbidden(
          'Only a verified author may propose changes to this record',
        )
      let attributionTarget: Prisma.InputJsonObject | null = null
      if (input.change.kind === 'attribution') {
        if (input.subjectType !== 'paper')
          throw fastify.httpErrors.badRequest(
            'Thesis identity corrections require a revised thesis submission',
          )
        if (!admin && input.change.personId !== person?.id)
          throw fastify.httpErrors.forbidden(
            'Authors may propose only their own attribution changes',
          )
        if (
          !(await tx.institution_people.findFirst({
            where: { id: input.change.personId, institutionId },
          }))
        )
          throw fastify.httpErrors.badRequest('Person is outside this institution')
        if (
          !(await tx.paper_authors.findFirst({
            where: { paperId: String(before.paperId), authorId: input.change.authorId },
          }))
        )
          throw fastify.httpErrors.badRequest('Select an author in the paper byline')
        const target = await tx.institution_people.findUniqueOrThrow({
          where: { id: input.change.personId },
          select: { id: true, name: true },
        })
        const author = await tx.authors.findUniqueOrThrow({
          where: { id: input.change.authorId },
          select: { id: true, name: true },
        })
        attributionTarget = { person: target, author }
      }
      if (input.change.kind === 'metadata' && Object.keys(input.change).length === 1)
        throw fastify.httpErrors.badRequest('Provide at least one metadata change')
      const workflow = await tx.institution_review_workflows.findFirst({
        where: { institutionId, key: `governed-${input.subjectType}`, is_active: true },
      })
      if (!workflow)
        throw fastify.httpErrors.conflict(
          'Configure an explicit review workflow before accepting change proposals',
        )
      const id = randomUUID()
      const reviewCase = await tx.content_review_cases.create({
        data: {
          institutionId,
          content_type: 'change_request',
          subjectId: id,
          currentVersionId: id,
          submittedBy: userId,
        },
      })
      await tx.content_review_changes.create({
        data: {
          id,
          caseId: reviewCase.id,
          institutionId,
          submittedBy: userId,
          idempotencyKey: key,
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          kind: input.change.kind,
          payload: snapshotJson(input.change),
          beforeSnapshot: snapshotJson({
            ...before,
            ...(attributionTarget ? { attributionTarget } : {}),
          }),
          baseFingerprint: changeFingerprint(before),
        },
      })
      await submitReviewCase(fastify, tx, { caseId: reviewCase.id, actorId: userId, versionId: id })
      await tx.content_review_actions.create({
        data: {
          caseId: reviewCase.id,
          institutionId,
          actorId: userId,
          action: 'change_proposed',
          versionId: id,
          roundNumber: 1,
          to_status: 'pending_review',
          notes: input.notes,
        },
      })
      return { id, caseId: reviewCase.id }
    },
    { timeout: 30000 },
  )
}
