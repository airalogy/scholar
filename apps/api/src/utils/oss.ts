/**
 * Build an OSS object key from prefix, id, and extension.
 * Prefix is optional; leading/trailing slashes are stripped.
 */
export function buildObjectKey(prefix: string, id: string, ext: string) {
  const trimmed = prefix?.trim() ?? ''
  const withoutSlashes = trimmed.replace(/^\/+|\/+$/g, '')
  const normalizedPrefix = withoutSlashes ? `${withoutSlashes}/` : ''
  const normalizedExt = ext ? (ext.startsWith('.') ? ext : `.${ext}`) : ''
  return `${normalizedPrefix}${id}${normalizedExt}`
}
