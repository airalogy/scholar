import { normalizeDoi } from '../../utils/doi'
import type { PublicationMetadataCandidate } from './types'

interface PublicationMetadataOptions {
  mailto?: string
  fetchImpl?: typeof fetch
  onWarning?: (message: string) => void
}

const delay = async (milliseconds: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, milliseconds))
}

const fetchJson = async (
  fetchImpl: typeof fetch,
  url: string,
  options: { attempts?: number; timeoutMs?: number; headers?: Record<string, string> } = {},
): Promise<unknown> => {
  const attempts = options.attempts ?? 3
  const timeoutMs = options.timeoutMs ?? 25_000
  let lastError: unknown = new Error('Publication metadata request failed')

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchImpl(url, {
        headers: options.headers,
        signal: controller.signal,
      })
      if (response.ok) {
        return (await response.json()) as unknown
      }
      if (response.status === 404) {
        return null
      }
      const error = new Error(`${response.status} ${response.statusText}`)
      if (response.status !== 429 && response.status < 500) {
        throw error
      }
      lastError = error
    } catch (error) {
      lastError = error
    } finally {
      clearTimeout(timer)
    }
    await delay(500 * 2 ** (attempt - 1))
  }

  throw lastError
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

const readInteger = (value: unknown): number | null => {
  return Number.isInteger(value) ? (value as number) : null
}

const readString = (value: unknown): string | null => {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

const readDateParts = (value: unknown): number[] | null => {
  if (!isRecord(value)) {
    return null
  }
  const dateParts = value['date-parts']
  if (!Array.isArray(dateParts) || !Array.isArray(dateParts[0])) {
    return null
  }
  return dateParts[0].filter((item): item is number => Number.isInteger(item))
}

const crossrefDateParts = (message: Record<string, unknown>): number[] | null => {
  for (const field of ['published-print', 'published-online', 'published', 'issued', 'created']) {
    const parts = readDateParts(message[field])
    if (parts?.[0]) {
      return parts
    }
  }
  return null
}

const formatDateParts = (parts: number[] | null): string | null => {
  if (!parts?.[0] || parts.length < 3) {
    return null
  }
  const [year, month = 1, day = 1] = parts
  return [year, String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-')
}

const fetchOpenAlexBatch = async (
  fetchImpl: typeof fetch,
  dois: string[],
  mailto: string,
): Promise<Map<string, PublicationMetadataCandidate>> => {
  const params = new URLSearchParams({
    filter: `doi:${dois.join('|')}`,
    'per-page': '100',
    select: 'doi,publication_year,publication_date,title',
  })
  if (mailto) {
    params.set('mailto', mailto)
  }
  const payload = await fetchJson(fetchImpl, `https://api.openalex.org/works?${params}`)
  const results = isRecord(payload) && Array.isArray(payload.results) ? payload.results : []
  const candidates = new Map<string, PublicationMetadataCandidate>()

  for (const item of results) {
    if (!isRecord(item)) {
      continue
    }
    const doi = normalizeDoi(readString(item.doi) ?? '')
    if (!doi) {
      continue
    }
    candidates.set(doi, {
      doi,
      year: readInteger(item.publication_year),
      publicationDate: readString(item.publication_date),
      title: readString(item.title),
      source: 'openalex',
    })
  }
  return candidates
}

const fetchCrossref = async (
  fetchImpl: typeof fetch,
  doi: string,
  mailto: string,
): Promise<PublicationMetadataCandidate | null> => {
  const url = new URL(`https://api.crossref.org/works/${encodeURIComponent(doi)}`)
  if (mailto) {
    url.searchParams.set('mailto', mailto)
  }
  const payload = await fetchJson(fetchImpl, url.toString(), {
    headers: {
      'User-Agent': `airalogy-scholar/2.0${mailto ? ` (mailto:${mailto})` : ''}`,
    },
  })
  if (!isRecord(payload) || !isRecord(payload.message)) {
    return null
  }
  const parts = crossrefDateParts(payload.message)
  const titleValue = payload.message.title
  const title = Array.isArray(titleValue) ? readString(titleValue[0]) : null
  return {
    doi,
    year: parts?.[0] ?? null,
    publicationDate: formatDateParts(parts),
    title,
    source: 'crossref',
  }
}

const mapWithConcurrency = async <TInput, TOutput>(
  items: TInput[],
  concurrency: number,
  task: (item: TInput) => Promise<TOutput>,
): Promise<TOutput[]> => {
  const results: TOutput[] = []
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await task(items[index])
    }
  })
  await Promise.all(workers)
  return results
}

export const resolvePublicationMetadata = async (
  dois: string[],
  options: PublicationMetadataOptions = {},
): Promise<Map<string, PublicationMetadataCandidate>> => {
  const fetchImpl = options.fetchImpl ?? fetch
  const mailto = options.mailto?.trim() ?? ''
  const normalizedDois = [...new Set(dois.map(normalizeDoi).filter(Boolean))]
  const openAlexCandidates = new Map<string, PublicationMetadataCandidate>()

  for (let offset = 0; offset < normalizedDois.length; offset += 50) {
    const batch = normalizedDois.slice(offset, offset + 50)
    try {
      const candidates = await fetchOpenAlexBatch(fetchImpl, batch, mailto)
      for (const [doi, candidate] of candidates) {
        openAlexCandidates.set(doi, candidate)
      }
    } catch (error) {
      options.onWarning?.(
        `OpenAlex metadata lookup failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  const resolved = new Map(openAlexCandidates)
  await mapWithConcurrency(normalizedDois, 6, async (doi) => {
    try {
      const candidate = await fetchCrossref(fetchImpl, doi, mailto)
      if (candidate?.year) {
        resolved.set(doi, candidate)
      }
    } catch (error) {
      options.onWarning?.(
        `Crossref metadata lookup failed for ${doi}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  })
  return resolved
}
