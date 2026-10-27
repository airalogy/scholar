import type { RecoveryInput } from './deployment'

export const parseRecoveryInput = (
  raw: string,
  deploymentSlug: string | undefined,
): RecoveryInput => {
  if (Buffer.byteLength(raw, 'utf8') > 16000) throw new Error('Recovery input is too large')
  const fields = raw.split('\0')
  const [
    institutionSlug,
    action,
    operator,
    reason,
    confirmation,
    name,
    email,
    username,
    password,
    userId,
  ] = fields
  if (
    fields.length !== 11 ||
    fields[10] !== '' ||
    !institutionSlug ||
    (action !== 'create' && action !== 'revoke-platform') ||
    institutionSlug !== deploymentSlug ||
    !operator ||
    !reason ||
    !confirmation
  )
    throw new Error('Recovery action, input or deployment institution does not match')
  return {
    institutionSlug,
    action,
    operator,
    reason,
    confirmation,
    name,
    email,
    username,
    password,
    userId,
  }
}
