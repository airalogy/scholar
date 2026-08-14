const DOI_URL_PREFIX = /^https?:\/\/(?:dx\.)?doi\.org\//iu
const DOI_LABEL_PREFIX = /^doi:\s*/iu

export const normalizeDoi = (value: string): string => {
  return value.trim().replace(DOI_URL_PREFIX, '').replace(DOI_LABEL_PREFIX, '').trim().toLowerCase()
}

export const requireNormalizedDoi = (value: string): string => {
  const normalized = normalizeDoi(value)
  if (!normalized) {
    throw new Error('DOI must not be empty')
  }
  return normalized
}
