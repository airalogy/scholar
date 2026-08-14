const ABSOLUTE_HTTP_URL_PATTERN = /^https?:\/\//iu
const RELATIVE_PATH_PATTERN = /^\/(?!\/)/u

export const resolveSafeHttpUrl = (value?: string | null): string | undefined => {
  const candidate = value?.trim()
  if (!candidate) {
    return undefined
  }

  if (RELATIVE_PATH_PATTERN.test(candidate)) {
    return candidate
  }

  if (!ABSOLUTE_HTTP_URL_PATTERN.test(candidate)) {
    return undefined
  }

  try {
    const parsed = new URL(candidate)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? parsed.toString()
      : undefined
  } catch {
    return undefined
  }
}
