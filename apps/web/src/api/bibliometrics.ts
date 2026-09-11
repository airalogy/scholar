import { apiClient } from './client'

export type BibliometricSystem = 'jcr' | 'cas' | 'esi' | 'institution'
export interface BibliometricEdition {
  id: string; system: BibliometricSystem; version: string; revision: number; content_revision: number
  metric_year: number | null; released_on: string | null; observed_on: string | null
  source: string; source_url: string | null; status: 'draft' | 'published'
  createdAt: string; publishedAt: string | null; ranking_count: number; indicator_count: number
}
export interface BibliometricEditionInput {
  system: BibliometricSystem; version: string; metric_year?: number; released_on?: string
  observed_on?: string; source: string; source_url?: string; notes: string
}
export interface JournalItem { id: string; name: string; publisher: string | null; identifiers: Array<{ scheme: string; value: string }> }
export interface JournalRanking {
  id: string; journalId: string; journal_name: string; category_level: 'category' | 'broad' | 'narrow'
  category: string; metric: 'jif' | 'jci' | 'cas' | 'institution'; quartile: number | null; is_top: boolean | null; source: string
}
export interface PaperIndicator { id: string; paperId: string; paper_title: string; kind: 'hot' | 'highly_cited'; category: string; value: boolean; source: string }
export interface EditionDetail {
  edition: BibliometricEdition; rankings: JournalRanking[]; indicators: PaperIndicator[]
  events: Array<{ id: string; action: string; notes: string; actor_name: string | null; created_at: string }>
}
export interface EditionChange { expected_revision: number; notes: string }
export interface RankingChange extends EditionChange {
  journal_id: string; category_level: JournalRanking['category_level']; category: string
  metric: JournalRanking['metric']; quartile: number | null; is_top: boolean | null
}
export interface IndicatorChange extends EditionChange { paper_id: string; kind: PaperIndicator['kind']; category: string; value: boolean }
interface Envelope<T> { code: number; data: T }
interface Page<T> { items: T[]; total: number }
const base = '/v2/bibliometrics'
const editionUrl = (id: string): string => `${base}/editions/${encodeURIComponent(id)}`
export const listBibliometricEditions = async (params: { q?: string; system?: BibliometricSystem; status?: 'draft' | 'published'; offset?: number }, signal?: AbortSignal): Promise<Page<BibliometricEdition>> => (await apiClient.get<Envelope<Page<BibliometricEdition>>>(`${base}/editions`, { params: { ...params, limit: 20 }, signal })).data.data
export const getBibliometricEdition = async (id: string, offset = 0, signal?: AbortSignal): Promise<EditionDetail> => (await apiClient.get<Envelope<EditionDetail>>(editionUrl(id), { params: { offset, limit: 20 }, signal })).data.data
export const listBibliometricJournals = async (q: string, signal?: AbortSignal): Promise<Page<JournalItem>> => (await apiClient.get<Envelope<Page<JournalItem>>>(`${base}/journals`, { params: { q, limit: 20 }, signal })).data.data
export const createBibliometricEdition = async (body: BibliometricEditionInput, signal?: AbortSignal): Promise<BibliometricEdition> => (await apiClient.post<Envelope<BibliometricEdition>>(`${base}/editions`, body, { signal })).data.data
export const saveJournalRanking = async (id: string, body: RankingChange, signal?: AbortSignal): Promise<BibliometricEdition> => (await apiClient.put<Envelope<BibliometricEdition>>(`${editionUrl(id)}/rankings`, body, { signal })).data.data
export const savePaperIndicator = async (id: string, body: IndicatorChange, signal?: AbortSignal): Promise<BibliometricEdition> => (await apiClient.put<Envelope<BibliometricEdition>>(`${editionUrl(id)}/indicators`, body, { signal })).data.data
export const publishBibliometricEdition = async (id: string, body: EditionChange, signal?: AbortSignal): Promise<BibliometricEdition> => (await apiClient.post<Envelope<BibliometricEdition>>(`${editionUrl(id)}/publish`, body, { signal })).data.data
export const reviseBibliometricEdition = async (id: string, body: EditionChange, signal?: AbortSignal): Promise<BibliometricEdition> => (await apiClient.post<Envelope<BibliometricEdition>>(`${editionUrl(id)}/revisions`, body, { signal, timeout: 90000 })).data.data
export const withdrawBibliometricObservation = async (id: string, body: EditionChange & { observation_id: string; observation_type: 'ranking' | 'indicator' }, signal?: AbortSignal): Promise<BibliometricEdition> => (await apiClient.post<Envelope<BibliometricEdition>>(`${editionUrl(id)}/withdraw`, body, { signal })).data.data
