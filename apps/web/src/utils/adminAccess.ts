export interface AdminAccess {
  can_access: boolean
  manage_platform: boolean
  manage_institutions: boolean
  manage_labs: boolean
  review_content: boolean
  import_data: boolean
}

export type AdminCapability = Exclude<keyof AdminAccess, 'can_access'>

export const EMPTY_ADMIN_ACCESS: AdminAccess = {
  can_access: false,
  manage_platform: false,
  manage_institutions: false,
  manage_labs: false,
  review_content: false,
  import_data: false,
}

export const FULL_ADMIN_ACCESS: AdminAccess = {
  can_access: true,
  manage_platform: true,
  manage_institutions: true,
  manage_labs: true,
  review_content: true,
  import_data: true,
}

export const hasAdminCapability = (
  access: AdminAccess | null,
  capabilities: AdminCapability[] = [],
): boolean => {
  if (!access?.can_access) {
    return false
  }

  return capabilities.length === 0 || capabilities.some((capability) => access[capability])
}

interface AdminRouteAccessOptions {
  deploymentMode: 'public' | 'private'
  platformOnlyInPublic?: boolean
}

export const hasAdminRouteAccess = (
  access: AdminAccess | null,
  capabilities: AdminCapability[],
  options: AdminRouteAccessOptions,
): boolean => {
  if (
    options.deploymentMode === 'public' &&
    options.platformOnlyInPublic === true &&
    access?.manage_platform !== true
  ) {
    return false
  }

  return hasAdminCapability(access, capabilities)
}

export const parseAdminCapabilities = (value: unknown): AdminCapability[] => {
  if (!Array.isArray(value)) {
    return []
  }

  const supported: AdminCapability[] = [
    'manage_platform',
    'manage_institutions',
    'manage_labs',
    'review_content',
    'import_data',
  ]
  return value.filter(
    (item): item is AdminCapability =>
      typeof item === 'string' && supported.includes(item as AdminCapability),
  )
}
