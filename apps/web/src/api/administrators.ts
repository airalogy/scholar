import { apiClient } from './client'
import type { InstitutionRole } from './institutions'

export interface PermissionEvent {
  id: string
  entity: string
  entityId: string
  actorUserId: string | null
  actorLabel: string
  source: string
  reason: string
  before: unknown
  after: unknown
  createdAt: string
}
export interface AdministratorAudit {
  items: PermissionEvent[]
  activeOwners: number
}
export interface HandoffPair {
  fromUserId: string
  toUserId: string
}
export interface HandoffPreview {
  digest: string
  from: { userId: string; role: InstitutionRole; user: { name: string } }
  to: { userId: string; role: InstitutionRole; user: { name: string } }
  labs: { labId: string }[]
  grants: { id: string; role: string }[]
  tasks: { id: string; kind: string; status: string; step: { caseId: string } }[]
  invitations: { id: string }[]
  credentials: { id: string }[]
}
const base = (slug: string): string => `/v1/institutions/${encodeURIComponent(slug)}/administrators`

export const loadAdministratorAudit = async (slug: string, offset: number, signal: AbortSignal): Promise<AdministratorAudit> => {
  const response = await apiClient.get<{ code: 0; data: AdministratorAudit }>(`${base(slug)}/audit`, { params: { offset }, signal })
  return response.data.data
}
export const previewAdministratorHandoff = async (slug: string, pair: HandoffPair, signal: AbortSignal): Promise<HandoffPreview> => {
  const response = await apiClient.post<{ code: 0; data: HandoffPreview }>(`${base(slug)}/handoff/preview`, pair, { signal })
  return response.data.data
}
export const completeAdministratorHandoff = async (slug: string, input: HandoffPair & { digest: string; reason: string; acknowledgeOutstanding: boolean }, signal: AbortSignal): Promise<void> => {
  await apiClient.post(`${base(slug)}/handoff`, input, { signal })
}
