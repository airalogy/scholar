import {
  normalizeInstitutionRole,
  normalizeLabRole,
  normalizePlatformRole,
  type InstitutionRole,
  type LabRole,
  type PlatformRole,
} from './permissions'

export interface AdminAccessSummary {
  can_access: boolean
  manage_platform: boolean
  manage_institutions: boolean
  manage_labs: boolean
  review_content: boolean
  import_data: boolean
}

export interface AdminAccessInstitutionMembership {
  role: unknown
  can_review_content: boolean
  can_import_data: boolean
}

export interface AdminAccessLabMembership {
  role: unknown
}

interface ResolveAdminAccessOptions {
  platformRole: unknown
  institutionMemberships: AdminAccessInstitutionMembership[]
  labMemberships: AdminAccessLabMembership[]
}

const hasManagementRole = (role: InstitutionRole | LabRole): boolean => {
  return role === 'owner' || role === 'admin'
}

export const resolveAdminAccess = ({
  platformRole,
  institutionMemberships,
  labMemberships,
}: ResolveAdminAccessOptions): AdminAccessSummary => {
  const normalizedPlatformRole: PlatformRole = normalizePlatformRole(platformRole)
  const managePlatform = normalizedPlatformRole === 'platform_admin'
  const hasInstitutionManagement = institutionMemberships.some((membership) => {
    return hasManagementRole(normalizeInstitutionRole(membership.role))
  })
  const hasLabManagement = labMemberships.some((membership) => {
    return hasManagementRole(normalizeLabRole(membership.role))
  })
  const hasReviewPermission = institutionMemberships.some((membership) => {
    return (
      hasManagementRole(normalizeInstitutionRole(membership.role)) || membership.can_review_content
    )
  })
  const hasImportPermission = institutionMemberships.some((membership) => {
    return (
      hasManagementRole(normalizeInstitutionRole(membership.role)) || membership.can_import_data
    )
  })
  const manageInstitutions = managePlatform || hasInstitutionManagement
  const manageLabs = managePlatform || hasInstitutionManagement || hasLabManagement
  const reviewContent = managePlatform || hasReviewPermission || hasLabManagement
  const importData = managePlatform || hasImportPermission

  return {
    can_access: managePlatform || manageInstitutions || manageLabs || reviewContent || importData,
    manage_platform: managePlatform,
    manage_institutions: manageInstitutions,
    manage_labs: manageLabs,
    review_content: reviewContent,
    import_data: importData,
  }
}
