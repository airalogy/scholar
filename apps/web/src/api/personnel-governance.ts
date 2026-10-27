import { apiClient } from './client'
import { governanceBase, type ReviewStage } from './governance'

export const identityCodes = [
  'undergraduate',
  'masters_student',
  'doctoral_student',
  'postgraduate',
  'postdoc',
  'faculty',
  'staff',
  'pi',
  'research_assistant',
  'visitor',
  'other',
] as const
export const requestKinds = [
  'submission',
  'metadata',
  'attribution',
  'access',
  'bibliography',
  'institutional_withdrawal',
] as const
export interface Page<T> {
  items: T[]
  nextOffset: number | null
}
export interface Correction {
  id: string
  personId: string
  field: 'name' | 'admission'
  value: string
  sourceValue: string
  status: string
  reason: string
  expiresAt: string
  requestedBy: string
  approvedBy: string | null
  person?: { name: string }
}
export interface PersonHistory {
  person: {
    id: string
    name: string
    sourceName: string | null
    lifecycleStatus: string
    manuallySuspended: boolean
    source: { name: string; lastAppliedAt: string | null } | null
  }
  identities: Array<{
    id: string
    code: string
    status: string
    startsAt: string | null
    endsAt: string | null
    supersededAt: string | null
    revision: number
  }>
  relationships: Array<{
    id: string
    kind: string
    status: string
    relatedPerson: { name: string }
    startsAt: string | null
    endsAt: string | null
    supersededAt: string | null
    revision: number
  }>
  appointments: Array<{
    id: string
    status: string
    position: { name: string }
    startsAt: string | null
    endsAt: string | null
    recordedAt: string
    supersededAt: string | null
  }>
  corrections: Correction[]
  nextOffset: number | null
}
export interface ReviewRoute {
  id: string
  key: string
  revision: number
  name: string
  contentType: 'paper' | 'degree_thesis'
  priority: number
  identityCodes: string[]
  nodeIds: string[]
  requestKinds: string[]
  enabled: boolean
  supersededAt: string | null
  workflow: { steps: Array<{ resolverConfig: ReviewStage }> }
}
export interface Simulation {
  workflowName: string | null
  routing: {
    error: string | null
    matched: string[]
    selected: { key: string; revision: number; name: string } | null
  } | null
  stages: Array<{
    name: string
    reviewers: Array<{ personId: string; name: string; role: string }>
    problems: string[]
  }>
}
export interface OrgHistory {
  id: string
  parent: { name: string }
  child: { name: string }
  recordedAt: string
  endedAt: string | null
}
export const personnelGet = async <T>(
  slug: string,
  path: string,
  signal: AbortSignal,
  params: Record<string, string | number | boolean> = {},
): Promise<T> =>
  (
    await apiClient.get<{ code: number; data: T }>(`${governanceBase(slug)}/${path}`, {
      signal,
      params,
    })
  ).data.data
