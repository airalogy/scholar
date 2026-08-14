import type { TimelineGeneration, TimelineGenerationStatus } from '@/api/scholars'
import type { ScholarTimelineGenerationMode } from '@/api/public-config'

export const canShowScholarTimelineGeneration = (
  mode: ScholarTimelineGenerationMode,
  isLoggedIn: boolean,
  canAccessAdmin: boolean,
): boolean => {
  if (!isLoggedIn || mode === 'disabled') {
    return false
  }
  return mode !== 'admin' || canAccessAdmin
}

export const isActiveTimelineGeneration = (
  generation: Pick<TimelineGeneration, 'status'> | null,
): boolean => {
  return generation !== null && ['requested', 'queued', 'running'].includes(generation.status)
}

export const getTimelinePollingDelay = (
  status: TimelineGenerationStatus,
): number | null => {
  if (status === 'requested') {
    return 10_000
  }
  if (status === 'queued' || status === 'running') {
    return 2_000
  }
  return null
}
