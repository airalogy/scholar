import type { Prisma } from '../../prisma/generated/client'

export class InstitutionPersonInputError extends Error {
  readonly statusCode = 400
}

export class InstitutionPersonConflictError extends Error {
  readonly statusCode = 409
}

export const normalizeInstitutionInternalId = (value: string): string =>
  value.trim().toLocaleLowerCase('en-US')

export const assertInstitutionInternalId = (value: string): string => {
  const internalId = value.trim()
  if (!internalId || internalId.length > 100) {
    throw new InstitutionPersonInputError(
      'Institution internal ID must contain 1 to 100 characters',
    )
  }
  return internalId
}

export type IdentifierClient = Pick<Prisma.TransactionClient, 'institution_person_identifiers'>

export const resolveInstitutionIdentifier = async (
  prisma: IdentifierClient,
  institutionId: string,
  value: string,
): Promise<Prisma.institution_person_identifiersGetPayload<{
  include: { person: true }
}> | null> => {
  const identifier = await prisma.institution_person_identifiers.findUnique({
    where: {
      institutionId_normalizedValue: {
        institutionId,
        normalizedValue: normalizeInstitutionInternalId(value),
      },
    },
    include: { person: true },
  })
  if (identifier?.revokedAt || identifier?.person.is_active === false) {
    throw new InstitutionPersonConflictError('Institution identifier is no longer active')
  }
  return identifier
}

export interface InstitutionIdentityClaims {
  institutionIdentifierId?: string
  institutionIdentifierVersion?: number
}

export const assertInstitutionIdentitySession = async (
  prisma: IdentifierClient,
  userId: string,
  claims: InstitutionIdentityClaims,
): Promise<boolean> => {
  if (
    claims.institutionIdentifierId === undefined &&
    claims.institutionIdentifierVersion === undefined
  ) {
    return true
  }
  if (!claims.institutionIdentifierId || !Number.isInteger(claims.institutionIdentifierVersion))
    return false
  const identifier = await prisma.institution_person_identifiers.findUnique({
    where: { id: claims.institutionIdentifierId },
    include: { person: { select: { userId: true, is_active: true } } },
  })
  return Boolean(
    identifier &&
    !identifier.revokedAt &&
    identifier.version === claims.institutionIdentifierVersion &&
    identifier.person.is_active &&
    identifier.person.userId === userId,
  )
}
