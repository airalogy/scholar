// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import type { RouteRecordRaw } from 'vue-router'
import { adminRoutes } from '@/router'

const routeByName = (name: string): RouteRecordRaw => {
  const route = adminRoutes.find((item) => item.name === name)
  if (!route) {
    throw new Error(`Missing admin route: ${name}`)
  }
  return route
}

describe('admin route policies', () => {
  it('marks every administration route for server-derived access checks', () => {
    expect(adminRoutes.length).toBeGreaterThan(0)
    for (const route of adminRoutes) {
      expect(route.meta?.requiresAdmin).toBe(true)
    }
  })

  it('keeps platform feedback unavailable to institution-only administrators', () => {
    expect(routeByName('AdminFeedback').meta?.adminCapabilities).toEqual(['manage_platform'])
  })

  it('allows the institution workspace to serve review and import delegates', () => {
    expect(routeByName('AdminInstitutionContent').meta?.adminCapabilities).toEqual([
      'manage_platform',
      'manage_institutions',
      'review_content',
      'import_data',
    ])
  })

  it('matches timeline review access to public and private deployment policy', () => {
    const route = routeByName('AdminScholarTimelines')
    expect(route.meta?.adminCapabilities).toEqual(['manage_platform', 'manage_institutions'])
    expect(route.meta?.platformOnlyInPublic).toBe(true)
  })
})
