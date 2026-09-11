import { apiClient } from './client'

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
export type BibliographyPaper = Record<string, JsonValue>
export interface BibliographyInput {
  schema_version: 2
  source: string
  items: Array<{ source_row?: number; paper: BibliographyPaper }>
}
export interface BibliographyIssue { code: string; severity: string; field: string; message: string }
export interface BibliographyItem {
  id: string; index: number; source_row: number | null; title: string
  action: string; status: string; paper_id: string | null; target_id: string | null
  decision: string | null; message: string | null; issues: BibliographyIssue[]
}
export interface BibliographySummary {
  id: string; schema_version: 2; institution_id: string; source: string; status: string
  created_at: string; updated_at: string
  summary: { total: number; ready: number; pending_review: number; completed: number; errors: number; rejected: number }
}
export interface BibliographyImport extends BibliographySummary { items: BibliographyItem[] }
export interface BibliographyDetail extends BibliographyItem {
  paper: BibliographyPaper
  changes: Array<{ field: string; before: JsonValue; after: JsonValue }>
  claim_review_status: string | null
  decisions: Array<{ id: string; decision: string; notes: string | null; actor_type: string; actor_name: string | null; created_at: string }>
}
export interface BibliographyField {
  key: string; label: string; label_en: string | null
  field_type: 'text' | 'number' | 'boolean' | 'date' | 'single_select' | 'multi_select'
  options: string[]; is_active: boolean; is_required: boolean; display_order: number
  visibility: 'admin' | 'institution' | 'public'
  min_value?: number | null; max_value?: number | null; max_length?: number
  min_date?: string | null; max_date?: string | null
}
interface Envelope<T> { code: number; data: T }
const base = (slug: string): string => `/v2/institutions/${encodeURIComponent(slug)}`
export const createBibliographyPreview = async (slug: string, body: BibliographyInput, key: string, signal?: AbortSignal): Promise<BibliographyImport> => {
  const response = await apiClient.post<Envelope<BibliographyImport>>(`${base(slug)}/imports/papers`, body, { headers: { 'Idempotency-Key': key }, signal, timeout: 180000 })
  return response.data.data
}
export const getBibliographyImport = async (slug: string, id: string, signal?: AbortSignal): Promise<BibliographyImport> => (await apiClient.get<Envelope<BibliographyImport>>(`${base(slug)}/imports/${encodeURIComponent(id)}`, { signal })).data.data
export const listBibliographyImports = async (slug: string, offset = 0, signal?: AbortSignal): Promise<{ items: BibliographySummary[]; total: number }> => (await apiClient.get<Envelope<{ items: BibliographySummary[]; total: number }>>(`${base(slug)}/imports`, { params: { limit: 20, offset }, signal })).data.data
export const getBibliographyItem = async (slug: string, importId: string, itemId: string, signal?: AbortSignal): Promise<BibliographyDetail> => (await apiClient.get<Envelope<BibliographyDetail>>(`${base(slug)}/imports/${encodeURIComponent(importId)}/items/${encodeURIComponent(itemId)}`, { signal })).data.data
export const applyBibliographyImport = async (slug: string, id: string, body: { item_ids: string[]; acknowledge_warnings: boolean }, signal?: AbortSignal): Promise<BibliographyImport> => (await apiClient.post<Envelope<BibliographyImport>>(`${base(slug)}/imports/${encodeURIComponent(id)}/apply`, body, { signal, timeout: 180000 })).data.data
export const reviewBibliographyImport = async (slug: string, id: string, body: { item_ids: string[]; acknowledge_warnings: boolean; decision: 'approve' | 'reject'; notes: string }, signal?: AbortSignal): Promise<BibliographyImport> => (await apiClient.post<Envelope<BibliographyImport>>(`${base(slug)}/imports/${encodeURIComponent(id)}/review`, body, { signal, timeout: 180000 })).data.data
export const getBibliographyFields = async (slug: string, signal?: AbortSignal): Promise<BibliographyField[]> => (await apiClient.get<Envelope<BibliographyField[]>>(`${base(slug)}/paper-fields`, { signal })).data.data
export const saveBibliographyField = async (slug: string, body: BibliographyField, signal?: AbortSignal): Promise<BibliographyField> => (await apiClient.put<Envelope<BibliographyField>>(`${base(slug)}/paper-fields`, body, { signal })).data.data
