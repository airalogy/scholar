import { describe, expect, it } from 'vitest'
import {
  EMPTY_ADMIN_ACCESS,
  hasAdminCapability,
  hasAdminRouteAccess,
  parseAdminCapabilities,
  type AdminAccess,
} from '@/utils/adminAccess'

const importOnlyAccess: AdminAccess = {
  ...EMPTY_ADMIN_ACCESS,
  can_access: true,
  import_data: true,
}

describe('admin access policies', () => {
  it('denies unresolved and ordinary member access', () => {
    expect(hasAdminCapability(null)).toBe(false)
    expect(hasAdminCapability(EMPTY_ADMIN_ACCESS)).toBe(false)
  })

  it('allows import-only members into the console and import-capable routes', () => {
    expect(hasAdminCapability(importOnlyAccess)).toBe(true)
    expect(hasAdminCapability(importOnlyAccess, ['import_data'])).toBe(true)
    expect(hasAdminCapability(importOnlyAccess, ['review_content'])).toBe(false)
    expect(hasAdminCapability(importOnlyAccess, ['manage_institutions'])).toBe(false)
  })

  it('accepts any matching capability when a route supports multiple administrator types', () => {
    expect(
      hasAdminCapability(importOnlyAccess, [
        'manage_platform',
        'manage_institutions',
        'review_content',
        'import_data',
      ]),
    ).toBe(true)
  })

  it('ignores unsupported route metadata values', () => {
    expect(parseAdminCapabilities(['import_data', 'unknown', 1])).toEqual(['import_data'])
    expect(parseAdminCapabilities('import_data')).toEqual([])
  })

  it('restricts public platform-only tools while allowing private institution admins', () => {
    const institutionAdmin: AdminAccess = {
      ...EMPTY_ADMIN_ACCESS,
      can_access: true,
      manage_institutions: true,
    }

    expect(
      hasAdminRouteAccess(institutionAdmin, ['manage_platform', 'manage_institutions'], {
        deploymentMode: 'public',
        platformOnlyInPublic: true,
      }),
    ).toBe(false)
    expect(
      hasAdminRouteAccess(institutionAdmin, ['manage_platform', 'manage_institutions'], {
        deploymentMode: 'private',
        platformOnlyInPublic: true,
      }),
    ).toBe(true)
  })
})
