import type { FastifyInstance } from 'fastify'
import type { institution_identity_requests } from '../../prisma/generated/client'
import { lockMutationScope } from '../utils/advisory-lock'
import { readIdentityChallenge } from './challenges'
import { requireIdentityPerson, verifyIdentifier, type IdentityAdmin } from './service'
import type { Static } from 'typebox'
import type {
  AdminRequestSchema,
  ApplicantRequestSchema,
  ApplicantResponse,
  RequestStatus,
} from './schema'

const requestStatus = (status: string): Static<typeof RequestStatus> => {
  if (
    status === 'pending' ||
    status === 'needs_information' ||
    status === 'approved' ||
    status === 'rejected'
  )
    return status
  throw new Error('Invalid stored identity request status')
}

export const applicantRequest = (
  request: institution_identity_requests | null,
): Static<typeof ApplicantRequestSchema> | null =>
  request
    ? {
        id: request.id,
        status: requestStatus(request.status),
        previousInternalId: request.previousInternalId,
        explanation: request.explanation,
        applicantMessage: request.applicantMessage,
        createdAt: request.createdAt.toISOString(),
        updatedAt: request.updatedAt.toISOString(),
      }
    : null

export const adminRequest = (
  request: institution_identity_requests,
): Static<typeof AdminRequestSchema> => ({
  id: request.id,
  status: requestStatus(request.status),
  previousInternalId: request.previousInternalId,
  explanation: request.explanation,
  applicantMessage: request.applicantMessage,
  createdAt: request.createdAt.toISOString(),
  updatedAt: request.updatedAt.toISOString(),
  internalId: request.internalId,
  name: request.name,
  email: request.email,
  personId: request.personId,
  reviewedAt: request.reviewedAt?.toISOString() ?? null,
})

export const getApplicantRequest = async (
  fastify: FastifyInstance,
  proofToken: string,
): Promise<Static<typeof ApplicantResponse>> => {
  const proof = await readIdentityChallenge(fastify, proofToken)
  const request = await fastify.prisma.institution_identity_requests.findFirst({
    where: {
      institutionId: proof.institutionId,
      provider: proof.provider,
      normalizedId: proof.normalizedId,
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  })
  return {
    code: 0 as const,
    data: { request: applicantRequest(request), internalId: proof.internalId },
  }
}

export const submitIdentityRequest = async (
  fastify: FastifyInstance,
  body: {
    proofToken: string
    previousInternalId: string
    explanation: string
    confirmsOwnAccount: true
  },
): Promise<Static<typeof ApplicantResponse>> => {
  const proof = await readIdentityChallenge(fastify, body.proofToken)
  const request = await fastify.prisma.$transaction(async (tx) => {
    await lockMutationScope(tx, 'institution-identity', proof.institutionId)
    if (proof.expiresAt.getTime() <= Date.now())
      throw fastify.httpErrors.unauthorized('Verification session expired')
    const identifier = await tx.institution_person_identifiers.findUnique({
      where: {
        institutionId_normalizedValue: {
          institutionId: proof.institutionId,
          normalizedValue: proof.normalizedId,
        },
      },
      include: { person: { select: { is_active: true } } },
    })
    if (identifier?.revokedAt || identifier?.person.is_active === false)
      throw fastify.httpErrors.forbidden('Institution identity is inactive')
    const where = {
      institutionId: proof.institutionId,
      provider: proof.provider,
      normalizedId: proof.normalizedId,
    }
    const existing = await tx.institution_identity_requests.findFirst({
      where: { ...where, status: { in: ['pending', 'needs_information'] } },
    })
    if (existing?.status === 'pending') return existing
    if (existing?.status === 'needs_information') {
      const updated = await tx.institution_identity_requests.update({
        where: { id: existing.id },
        data: {
          explanation: body.explanation.trim(),
          previousInternalId: body.previousInternalId.trim(),
          status: 'pending',
          updatedAt: new Date(),
        },
      })
      await tx.institution_identity_events.create({
        data: {
          institutionId: proof.institutionId,
          requestId: existing.id,
          action: 'applicant_supplemented',
          notes: body.explanation.trim(),
        },
      })
      return updated
    }
    const resolved = await tx.institution_identity_requests.findFirst({
      where: { ...where, status: 'approved' },
    })
    if (resolved && identifier && identifier.personId === resolved.personId) return resolved
    const dailyCount = await tx.institution_identity_requests.count({
      where: {
        ...where,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    })
    if (dailyCount >= 3)
      throw fastify.httpErrors.tooManyRequests('Identity request limit reached; try again later')
    const created = await tx.institution_identity_requests.create({
      data: {
        ...where,
        internalId: proof.internalId,
        email: proof.email,
        name: proof.name,
        previousInternalId: body.previousInternalId.trim(),
        explanation: body.explanation.trim(),
      },
    })
    await tx.institution_identity_events.create({
      data: {
        institutionId: proof.institutionId,
        requestId: created.id,
        action: 'applicant_submitted',
        notes: body.explanation.trim(),
      },
    })
    return created
  })
  return {
    code: 0 as const,
    data: { request: applicantRequest(request), internalId: proof.internalId },
  }
}

export interface IdentityDecision {
  action: 'approve' | 'reject' | 'request_information'
  personId?: string
  notes: string
  applicantMessage?: string
}

export const decideIdentityRequest = async (
  fastify: FastifyInstance,
  admin: IdentityAdmin,
  requestId: string,
  decision: IdentityDecision,
): Promise<institution_identity_requests> => {
  return fastify.prisma.$transaction(async (tx) => {
    await lockMutationScope(tx, 'institution-identity', admin.institutionId)
    const request = await tx.institution_identity_requests.findFirst({
      where: { id: requestId, institutionId: admin.institutionId },
    })
    if (!request) throw fastify.httpErrors.notFound('Identity request not found')
    if (!['pending', 'needs_information'].includes(request.status))
      throw fastify.httpErrors.conflict('Identity request is already resolved')
    if (request.provider !== fastify.deployment.institutionSso.providerId)
      throw fastify.httpErrors.conflict(
        'The institution SSO provider has changed; a new verification is required',
      )
    let personId: string | undefined
    if (decision.action === 'approve') {
      if (!decision.personId)
        throw fastify.httpErrors.badRequest('Select the verified existing person')
      const person = await requireIdentityPerson(fastify, tx, admin, decision.personId)
      if (!person.userId)
        throw fastify.httpErrors.conflict('The selected person has no existing login account')
      if (person.userId === admin.userId)
        throw fastify.httpErrors.forbidden(
          'Another administrator must verify your own identity request',
        )
      await verifyIdentifier(fastify, tx, admin, {
        personId: person.id,
        value: request.internalId,
        notes: decision.notes,
        requestId,
      })
      personId = person.id
    } else if (!decision.applicantMessage?.trim()) {
      throw fastify.httpErrors.badRequest('A message to the applicant is required')
    }
    const status =
      decision.action === 'approve'
        ? 'approved'
        : decision.action === 'reject'
          ? 'rejected'
          : 'needs_information'
    const updated = await tx.institution_identity_requests.update({
      where: { id: request.id },
      data: {
        status,
        personId,
        applicantMessage: decision.applicantMessage?.trim() || null,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      },
    })
    await tx.institution_identity_events.create({
      data: {
        institutionId: admin.institutionId,
        requestId,
        personId,
        actorUserId: admin.userId,
        action: `request_${status}`,
        notes: decision.notes.trim(),
      },
    })
    return updated
  })
}
