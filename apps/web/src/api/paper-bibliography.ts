import { apiClient } from './client'

interface Identifier { scheme: string; value: string }
export interface PaperBibliography {
  paper_id: string
  titles: Array<{ language: string; kind: string; title: string; is_primary: boolean }>
  language_tags: string[]
  document_type: string | null
  publication_status: string | null
  identifiers: Identifier[]
  authors: Array<{
    id: number; author_id: string; name: string; order: number; order_verified: boolean
    corresponding: boolean | null; equal_contribution: boolean | null; contributor_type: string
    orcid: string | null; affiliation_ids: string[]
  }>
  affiliations: Array<{ id: string; raw_name: string; organization_name: string | null; department: string | null; country_code: string | null; ror_id: string | null }>
  funding: Array<{ id: string; funder_name: string | null; funder_identifier: string | null; award_number: string | null; raw_text: string }>
  sources: Array<{ provider: string; external_id: string | null; collected_on: string | null }>
  journal: { id: string; name: string; identifiers: Identifier[] } | null
  institution: {
    owning_units: string[]; secondary_units: string[]; signature_type: string | null
    reported_affiliation_count: number | null; cooperation_types: string[]; cooperation_description: string | null
    custom_fields: Array<{ key: string; label: string; label_en: string | null; field_type: string; value: null | string | number | boolean | string[] }>
  }
}
export interface PaperMetricEdition {
  id: string; system: string; version: string; revision: number; metric_year: number | null
  source: string; source_url: string | null; released_on: string | null; observed_on: string | null
}
export interface PaperMetrics {
  edition: PaperMetricEdition
  rankings: Array<{ id: string; category_level: string; category: string; metric: string; quartile: number | null; is_top: boolean | null }>
  indicators: Array<{ id: string; kind: string; category: string; value: boolean }>
  ranking_total: number; indicator_total: number
}
interface Envelope<T> { code: number; data: T }
const base = (id: string): string => `/v2/papers/${encodeURIComponent(id)}`
export const getPaperBibliography = async (id: string, signal?: AbortSignal): Promise<PaperBibliography> => (await apiClient.get<Envelope<PaperBibliography>>(`${base(id)}/bibliography`, { signal })).data.data
export const listPaperMetricEditions = async (id: string, offset = 0, signal?: AbortSignal): Promise<{ items: PaperMetricEdition[]; total: number }> => (await apiClient.get<Envelope<{ items: PaperMetricEdition[]; total: number }>>(`${base(id)}/bibliometric-editions`, { params: { offset, limit: 20 }, signal })).data.data
export const getPaperMetrics = async (id: string, editionId: string, offset = 0, signal?: AbortSignal): Promise<PaperMetrics> => (await apiClient.get<Envelope<PaperMetrics>>(`${base(id)}/bibliometric-editions/${encodeURIComponent(editionId)}`, { params: { offset, limit: 20 }, signal })).data.data
