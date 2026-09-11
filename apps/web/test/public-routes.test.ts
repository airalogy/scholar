// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import type { RouteRecordRaw } from 'vue-router'
import { appRoutes } from '@/router'

const routeByName = (name: string): RouteRecordRaw => {
  const route = appRoutes.find((item) => item.name === name)
  if (!route) {
    throw new Error(`Missing route: ${name}`)
  }
  return route
}

describe('public route policies', () => {
  it.each([
    'Papers',
    'InstitutionPapers',
    'InstitutionCollegePapers',
    'LabPapers',
    'ScholarPapers',
    'PaperDetail',
    'Scholars',
    'ScholarDetail',
    'LabDetail',
    'Theses',
    'ThesisDetail',
    'About',
  ])('allows anonymous browsing on %s', (name) => {
    expect(routeByName(name).meta?.allowAnonymous).toBe(true)
  })

  it('keeps version information available even when institution content requires sign-in', () => {
    expect(routeByName('About').meta?.publicContent).not.toBe(true)
  })

  it.each([
    'Upload',
    'ThesisSubmit',
    'MyTheses',
    'ThesisEdit',
    'Favorites',
    'MyUploads',
    'Settings',
  ])('keeps %s behind sign-in', (name) => {
    expect(routeByName(name).meta?.allowAnonymous).not.toBe(true)
  })
})
