import crypto from 'node:crypto'

const CROCKFORD_BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const INSTITUTION_PREFIX_LENGTH = 16
const RANDOM_BYTE_LENGTH = 12
const RANDOM_TOKEN_LENGTH = 20

const normalizeInstitutionPrefix = (slug: string): string => {
  const normalized = slug
    .normalize('NFKD')
    .toLocaleUpperCase('en-US')
    .replace(/[^A-Z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, INSTITUTION_PREFIX_LENGTH)
    .replace(/-+$/gu, '')
  return normalized || 'INST'
}

const encodeRandomToken = (bytes: Buffer): string => {
  if (bytes.length !== RANDOM_BYTE_LENGTH) {
    throw new Error(`Degree thesis record codes require exactly ${RANDOM_BYTE_LENGTH} random bytes`)
  }
  let value = BigInt(`0x${bytes.toString('hex')}`)
  let token = ''
  for (let index = 0; index < RANDOM_TOKEN_LENGTH; index += 1) {
    token = CROCKFORD_BASE32[Number(value & 31n)] + token
    value >>= 5n
  }
  return token
}

export const createDegreeThesisRecordCode = (
  institutionSlug: string,
  randomBytes: Buffer = crypto.randomBytes(RANDOM_BYTE_LENGTH),
): string => {
  return `${normalizeInstitutionPrefix(institutionSlug)}-THS-${encodeRandomToken(randomBytes)}`
}
