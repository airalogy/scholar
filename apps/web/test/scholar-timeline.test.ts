import { describe, expect, it } from 'vitest'
import {
  canShowScholarTimelineGeneration,
  getTimelinePollingDelay,
  isActiveTimelineGeneration,
} from '../src/utils/scholarTimeline'

describe('scholar timeline feature policy', () => {
  it('implements all four public configuration modes', () => {
    expect(canShowScholarTimelineGeneration('disabled', true, true)).toBe(false)
    expect(canShowScholarTimelineGeneration('request_only', true, false)).toBe(true)
    expect(canShowScholarTimelineGeneration('preview', true, false)).toBe(true)
    expect(canShowScholarTimelineGeneration('admin', true, false)).toBe(false)
    expect(canShowScholarTimelineGeneration('admin', true, true)).toBe(true)
    expect(canShowScholarTimelineGeneration('preview', false, true)).toBe(false)
  })

  it('polls only queued and running jobs while locking all active actions', () => {
    expect(getTimelinePollingDelay('requested')).toBe(10_000)
    expect(getTimelinePollingDelay('queued')).toBe(2_000)
    expect(getTimelinePollingDelay('running')).toBe(2_000)
    expect(getTimelinePollingDelay('ready')).toBeNull()
    expect(isActiveTimelineGeneration({ status: 'requested' })).toBe(true)
    expect(isActiveTimelineGeneration({ status: 'running' })).toBe(true)
    expect(isActiveTimelineGeneration({ status: 'failed' })).toBe(false)
  })
})
