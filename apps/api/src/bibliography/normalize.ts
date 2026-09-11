import { createHash } from 'node:crypto'
import { Check } from 'typebox/value'
import { normalizeDoi } from '../utils/doi'
import {
  PaperMetadataInputSchema,
  type IdentifierInput,
  type PaperMetadataInput,
  type TitleInput,
} from './schema'

export interface BibliographyIssue {
  code: string
  severity: 'error' | 'warning'
  field: string
  message: string
  incoming_value?: string
  existing_value?: string
}

export type NormalizedPaperMetadata = PaperMetadataInput & {
  title: string
  identifiers: IdentifierInput[]
}

export interface NormalizedPaperResult {
  item: NormalizedPaperMetadata | null
  issues: BibliographyIssue[]
}

export const stableStringify = (value: unknown): string => {
  if (value === undefined) return 'null'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (value instanceof Date) return JSON.stringify(value.toISOString())
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`
}

export const fingerprint = (value: unknown): string => {
  return createHash('sha256').update(stableStringify(value)).digest('hex')
}

export const normalizeLanguageTag = (value: string): string => {
  const trimmed = value.trim()
  if (!trimmed || trimmed.includes('_'))
    throw new Error('Use a BCP 47 language tag, such as zh or en')
  return Intl.getCanonicalLocales(trimmed)[0]
}

export const normalizeBibliographicName = (value: string): string => {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en')
}

export const normalizeIdentifier = (item: IdentifierInput): IdentifierInput => {
  const aliases: Record<string, string> = {
    'scopus eid': 'scopus',
    scopus_eid: 'scopus',
    cnki_articleid: 'cnki',
    'web of science': 'wos',
  }
  const rawScheme = item.scheme.trim().toLowerCase()
  const scheme = aliases[rawScheme] ?? rawScheme
  if (!/^[a-z][a-z0-9_.-]{0,63}$/u.test(scheme)) throw new Error('Invalid identifier namespace')
  let value = item.value.trim()
  if (scheme === 'doi') {
    value = normalizeDoi(value)
    if (!/^10\.\d{4,9}\/\S+$/u.test(value) || value.length > 200) throw new Error('Invalid DOI')
  } else if (scheme === 'scopus') {
    if (!/^2-s2\.0-\d+$/u.test(value)) throw new Error('Invalid Scopus EID')
  } else if (scheme === 'cnki') {
    value = value.toUpperCase()
  } else if (scheme === 'wos') {
    value = value.toUpperCase()
    if (!value.startsWith('WOS:')) value = `WOS:${value}`
  }
  if (!value || /\p{Cc}/u.test(value)) throw new Error('Invalid external identifier')
  return { scheme, value }
}

export const normalizeIssn = (value: string): string => {
  const compact = value.replace(/[\s-]/gu, '').toUpperCase()
  if (!/^\d{7}[\dX]$/u.test(compact)) throw new Error('Invalid ISSN format')
  const sum = [...compact].reduce(
    (total, character, index) => total + (character === 'X' ? 10 : Number(character)) * (8 - index),
    0,
  )
  if (sum % 11 !== 0) throw new Error('Invalid ISSN check digit')
  return `${compact.slice(0, 4)}-${compact.slice(4)}`
}

export const isIsoDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value) || value.startsWith('0000-')) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export const isSafeHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
  } catch {
    return false
  }
}

const normalizeTitles = (input: PaperMetadataInput): TitleInput[] | undefined => {
  if (!input.titles) return undefined
  const titles = input.titles.map((item) => ({
    ...item,
    language: normalizeLanguageTag(item.language),
    title: item.title.trim(),
    kind: item.kind ?? ('original' as const),
  }))
  const keys = new Set(titles.map((item) => `${item.language}:${item.kind}`))
  if (keys.size !== titles.length) throw new Error('Duplicate title language and kind')
  if (titles.some((item) => !item.title)) throw new Error('Title must not be blank')
  if (titles.filter((item) => item.is_primary).length > 1)
    throw new Error('Only one primary title is allowed')
  if (!titles.some((item) => item.is_primary)) titles[0].is_primary = true
  return titles
}

const legacyLanguages: Record<number, string> = { 0: 'zh', 1: 'en', 2: 'de', 3: 'fr', 4: 'ja' }

export const normalizePaperMetadata = (value: unknown): NormalizedPaperResult => {
  const issues: BibliographyIssue[] = []
  const fail = (field: string, message: string, code = 'invalid_metadata'): void => {
    issues.push({ code, field, severity: 'error', message })
  }
  if (!Check(PaperMetadataInputSchema, value)) {
    return {
      item: null,
      issues: [
        {
          code: 'invalid_schema',
          severity: 'error',
          field: '',
          message: 'The paper does not match the bibliographic input schema',
        },
      ],
    }
  }
  let titles: TitleInput[] | undefined
  let identifiers: IdentifierInput[] = []
  let languageTags: string[] | undefined
  try {
    titles = normalizeTitles(value)
  } catch (error) {
    fail('titles', String(error))
  }
  const title = titles?.find((item) => item.is_primary)?.title ?? value.title?.trim() ?? ''
  if (!title) fail('title', 'A title or primary multilingual title is required')
  try {
    const supplied = [
      ...(value.identifiers ?? []),
      ...(value.doi ? [{ scheme: 'doi', value: value.doi }] : []),
    ]
    const normalized = supplied.map(normalizeIdentifier)
    identifiers = [
      ...new Map(normalized.map((item) => [`${item.scheme}:${item.value}`, item])).values(),
    ]
    if (identifiers.filter((item) => item.scheme === 'doi').length > 1)
      fail('identifiers', 'One record cannot declare different DOIs', 'conflicting_identifiers')
  } catch (error) {
    fail('identifiers', String(error))
  }
  if (!identifiers.length && !value.paper_id)
    fail(
      'identifiers',
      'A stable external identifier or an existing Scholar paper ID is required',
      'missing_identifier',
    )
  try {
    languageTags = value.language_tags
      ? [...new Set(value.language_tags.map(normalizeLanguageTag))]
      : value.language !== undefined && legacyLanguages[value.language]
        ? [legacyLanguages[value.language]]
        : undefined
  } catch (error) {
    fail('language_tags', String(error))
  }
  if (value.publish_date && !isIsoDate(value.publish_date))
    fail('publish_date', 'Invalid calendar date')
  if (
    value.publish_date &&
    value.publish_year !== undefined &&
    Number(value.publish_date.slice(0, 4)) !== value.publish_year
  )
    fail('publish_date', 'Publication date and year disagree')
  if (value.link && !isSafeHttpUrl(value.link))
    fail('link', 'Only HTTP(S) links without credentials are accepted')
  const affiliationKeys = new Set(value.affiliations?.map((item) => item.source_key) ?? [])
  if (affiliationKeys.size !== (value.affiliations?.length ?? 0))
    fail('affiliations', 'Duplicate affiliation keys')
  if (value.authors) {
    if (new Set(value.authors.map((item) => item.order)).size !== value.authors.length)
      fail('authors', 'Author positions must be unique')
    const sourceKeys = value.authors.flatMap((item) => (item.source_key ? [item.source_key] : []))
    if (new Set(sourceKeys).size !== sourceKeys.length)
      fail('authors', 'Author source keys must be unique')
    for (const author of value.authors) {
      if (!author.name.trim()) fail('authors', 'Author name must not be blank')
      if (author.affiliation_keys?.some((key) => !affiliationKeys.has(key)))
        fail('authors', 'An author references an unknown affiliation key')
    }
  }
  for (const source of value.sources ?? []) {
    if (source.collected_on && !isIsoDate(source.collected_on))
      fail('sources', 'Invalid collection date')
  }
  if (
    new Set(value.sources?.map((source) => source.provider) ?? []).size !==
    (value.sources?.length ?? 0)
  )
    fail('sources', 'A provider can appear only once per paper import')
  const fundingKeys = (value.funding ?? []).flatMap((entry) =>
    entry.source_key ? [entry.source_key] : [],
  )
  if (new Set(fundingKeys).size !== fundingKeys.length)
    fail('funding', 'Funding source keys must be unique')
  if (value.journal && !value.journal.name.trim())
    fail('journal.name', 'Journal name must not be blank')
  if (value.title && titles && value.title.trim() !== title)
    fail('title', 'The display title must agree with the primary multilingual title')
  for (const ranking of value.rankings ?? []) {
    if (ranking.edition.system === 'esi')
      fail('rankings', 'ESI is a paper indicator, not a journal ranking')
    if (!ranking.category.trim()) fail('rankings.category', 'Category must not be blank')
    if (ranking.edition.system === 'institution' && ranking.metric !== 'institution')
      fail('rankings', 'Institution editions require an institution metric')
    if (
      ranking.edition.system === 'cas' &&
      (ranking.metric !== 'cas' || ranking.category_level === 'category')
    )
      fail('rankings', 'CAS requires broad/narrow category level and CAS metric')
    if (
      ranking.edition.system === 'jcr' &&
      (!['jif', 'jci'].includes(ranking.metric) || ranking.category_level !== 'category')
    )
      fail('rankings', 'JCR requires an explicit JIF/JCI metric and category')
  }
  for (const indicator of value.indicators ?? []) {
    if (indicator.edition.system !== 'esi' || !indicator.edition.observed_on)
      fail('indicators', 'ESI observations require an ESI edition and observation date')
  }
  for (const edition of [
    ...(value.rankings ?? []).map((item) => item.edition),
    ...(value.indicators ?? []).map((item) => item.edition),
  ]) {
    if (!edition.version.trim() || !edition.source.trim())
      fail('edition', 'Edition version and source must not be blank')
    if (edition.source_url && !isSafeHttpUrl(edition.source_url))
      fail('edition.source_url', 'Invalid source URL')
    if ([edition.released_on, edition.observed_on].some((date) => date && !isIsoDate(date)))
      fail('edition', 'Invalid edition date')
  }
  let journal = value.journal
  if (journal?.identifiers) {
    try {
      journal = {
        ...journal,
        identifiers: journal.identifiers.map((item) => {
          const scheme = item.scheme.toLowerCase()
          if (!['issn', 'eissn', 'issn_l'].includes(scheme))
            throw new Error('Unsupported journal identifier type')
          return { scheme, value: normalizeIssn(item.value) }
        }),
      }
    } catch (error) {
      fail('journal.identifiers', String(error))
    }
  }
  return {
    item: issues.some((issue) => issue.severity === 'error')
      ? null
      : {
          ...value,
          title,
          ...(titles ? { titles } : {}),
          identifiers,
          doi: identifiers.find((item) => item.scheme === 'doi')?.value,
          ...(languageTags ? { language_tags: languageTags } : {}),
          ...(journal ? { journal, journal_name: journal.name } : {}),
          ...(value.rankings
            ? {
                rankings: value.rankings.map((row) => ({
                  ...row,
                  category: row.category.trim(),
                  edition: {
                    ...row.edition,
                    version: row.edition.version.trim(),
                    source: row.edition.source.trim(),
                    source_url: row.edition.source_url?.trim(),
                  },
                })),
              }
            : {}),
          ...(value.indicators
            ? {
                indicators: value.indicators.map((row) => ({
                  ...row,
                  category: row.category?.trim(),
                  edition: {
                    ...row.edition,
                    version: row.edition.version.trim(),
                    source: row.edition.source.trim(),
                    source_url: row.edition.source_url?.trim(),
                  },
                })),
              }
            : {}),
          ...(value.publish_date
            ? { publish_year: value.publish_year ?? Number(value.publish_date.slice(0, 4)) }
            : {}),
        },
    issues,
  }
}
