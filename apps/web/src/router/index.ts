import { h } from 'vue'
import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
  type RouteRecordSingleView,
} from 'vue-router'
import { getMyProfile } from '@/api/users'
import { ApiError } from '@/api/client'
import { useAuth } from '@/composables/useAuth'
import { ensurePublicConfigLoaded, getCurrentPublicConfig } from '@/composables/usePublicConfig'
import { hasAdminRouteAccess, parseAdminCapabilities, type AdminCapability } from '@/utils/adminAccess'
import { isDevAuthBypassEnabled } from '@/utils/devAuth'

const EmptyRouteView = {
  render: () => h('div'),
}

interface AdminRouteDefinition {
  path: string
  name: string
  component: NonNullable<RouteRecordSingleView['component']>
  capabilities?: AdminCapability[]
  featureKey?: string
  platformOnlyInPublic?: boolean
}

const createAdminRoute = ({
  path,
  name,
  component,
  capabilities = [],
  featureKey,
  platformOnlyInPublic = false,
}: AdminRouteDefinition): RouteRecordRaw => ({
  path,
  name,
  component,
  meta: {
    requiresAdmin: true,
    adminCapabilities: capabilities,
    platformOnlyInPublic,
    ...(featureKey ? { featureKey } : {}),
  },
})

export const adminRoutes: RouteRecordRaw[] = [
  createAdminRoute({
    path: '/admin',
    name: 'AdminHome',
    component: () => import('../views/AdminHome.vue'),
  }),
  createAdminRoute({
    path: '/admin/papers',
    name: 'AdminPapers',
    component: () => import('../views/AdminPapers.vue'),
    capabilities: ['review_content'],
  }),
  createAdminRoute({
    path: '/admin/feedback',
    name: 'AdminFeedback',
    component: () => import('../views/AdminFeedback.vue'),
    capabilities: ['manage_platform'],
  }),
  createAdminRoute({
    path: '/admin/theses',
    name: 'AdminTheses',
    component: () => import('../views/AdminTheses.vue'),
    capabilities: ['review_content'],
    featureKey: 'degreeTheses',
  }),
  createAdminRoute({
    path: '/admin/scholar-timelines',
    name: 'AdminScholarTimelines',
    component: () => import('../views/AdminScholarTimelines.vue'),
    capabilities: ['manage_platform', 'manage_institutions'],
    platformOnlyInPublic: true,
  }),
  createAdminRoute({
    path: '/admin/academic-subjects',
    name: 'AdminAcademicSubjects',
    component: () => import('../views/AdminAcademicSubjects.vue'),
    capabilities: ['manage_platform', 'manage_institutions'],
  }),
  createAdminRoute({
    path: '/admin/institutions/:slug',
    name: 'AdminInstitutionContent',
    component: () => import('../views/AdminInstitutionContent.vue'),
    capabilities: [
      'manage_platform',
      'manage_institutions',
      'review_content',
      'import_data',
    ],
  }),
  createAdminRoute({
    path: '/admin/institutions/:slug/members',
    name: 'AdminInstitutionMembers',
    component: () => import('../views/AdminInstitutionMembers.vue'),
    capabilities: ['manage_platform', 'manage_institutions'],
  }),
  createAdminRoute({
    path: '/admin/labs/:slug/settings',
    name: 'AdminLabSettings',
    component: () => import('../views/AdminLabSettings.vue'),
    capabilities: ['manage_platform', 'manage_institutions', 'manage_labs'],
  }),
]

const routes = [
  {
    path: '/',
    name: 'Home',
    component: EmptyRouteView,
    meta: {
      allowAnonymous: true,
    },
  },
  {
    path: '/chat',
    name: 'Chat',
    component: () => import('../views/AiChat.vue'),
    meta: {
      allowAnonymous: true,
      featureKey: 'aiChat',
    },
  },
  {
    path: '/airalogy_oauth_callback',
    name: 'AiralogyOauthCallback',
    component: () => import('../views/AiralogyOauthCallback.vue'),
    meta: {
      allowAnonymous: true,
      oauthProvider: 'airalogy',
      oauthAuthorizePath: '/api/auth/airalogy/authorize',
    },
  },
  {
    path: '/institution_sso_callback',
    name: 'InstitutionSsoCallback',
    component: () => import('../views/AiralogyOauthCallback.vue'),
    meta: {
      allowAnonymous: true,
      oauthProvider: 'institution-sso',
      oauthAuthorizePath: '/api/auth/institution-sso/authorize',
    },
  },
  {
    path: '/ai-chat',
    redirect: '/chat'
  },
  {
    path: '/upload',
    name: 'Upload',
    component: () => import('../views/Upload.vue'),
    meta: {
      featureKey: 'paperUpload',
    },
  },
  {
    path: '/papers',
    name: 'Papers',
    component: () => import('../views/Papers.vue')
  },
  {
    path: '/institutions/:slug/papers',
    name: 'InstitutionPapers',
    component: () => import('../views/Papers.vue')
  },
  {
    path: '/institutions/:slug/colleges/:collegeSlug/papers',
    name: 'InstitutionCollegePapers',
    component: () => import('../views/Papers.vue')
  },
  {
    path: '/labs/:slug/papers',
    name: 'LabPapers',
    component: () => import('../views/Papers.vue')
  },
  {
    path: '/scholars/:id/papers',
    name: 'ScholarPapers',
    component: () => import('../views/Papers.vue')
  },
  {
    path: '/papers/:id',
    name: 'PaperDetail',
    component: () => import('../views/PaperDetail.vue')
  },
  {
    path: '/theses',
    name: 'Theses',
    component: () => import('../views/Theses.vue'),
    meta: {
      featureKey: 'degreeTheses',
    },
  },
  {
    path: '/theses/submit',
    name: 'ThesisSubmit',
    component: () => import('../views/ThesisEditor.vue'),
    meta: {
      featureKey: 'degreeTheses',
    },
  },
  {
    path: '/theses/mine',
    name: 'MyTheses',
    component: () => import('../views/MyTheses.vue'),
    meta: {
      featureKey: 'degreeTheses',
    },
  },
  {
    path: '/theses/:id/edit',
    name: 'ThesisEdit',
    component: () => import('../views/ThesisEditor.vue'),
    meta: {
      featureKey: 'degreeTheses',
    },
  },
  {
    path: '/theses/:id',
    name: 'ThesisDetail',
    component: () => import('../views/ThesisDetail.vue'),
    meta: {
      featureKey: 'degreeTheses',
    },
  },
  {
    path: '/scholars',
    name: 'Scholars',
    component: () => import('../views/Scholars.vue')
  },
  {
    path: '/scholars/:id',
    name: 'ScholarDetail',
    component: () => import('../views/ScholarDetail.vue')
  },
  {
    path: '/labs/:slug',
    name: 'LabDetail',
    component: () => import('../views/LabDetail.vue')
  },
  {
    path: '/my-library',
    redirect: '/my-library/favorites'
  },
  {
    path: '/my-library/favorites',
    name: 'Favorites',
    component: () => import('../views/MyLibrary.vue')
  },
  {
    path: '/my-library/uploads',
    name: 'MyUploads',
    component: () => import('../views/MyUploads.vue')
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('../views/Settings.vue')
  },
  ...adminRoutes,
  {
    path: '/admin/forbidden',
    name: 'AdminAccessDenied',
    component: () => import('../views/AdminAccessDenied.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

const resolveFeatureRedirectPath = (
  attemptedPath: string,
  defaultHomePath: string,
  papersHomePath: string,
): string => {
  return attemptedPath === defaultHomePath ? papersHomePath : defaultHomePath
}

router.beforeEach(async (to) => {
  await ensurePublicConfigLoaded()

  const publicConfig = getCurrentPublicConfig()
  const redirectPath = publicConfig.navigation.defaultHomePath
  const papersHomePath = publicConfig.paperLibrary.defaultPath
  const fixedInstitutionSlug = publicConfig.paperLibrary.fixedInstitutionSlug
  const routeFeatureKey = typeof to.meta.featureKey === 'string' ? to.meta.featureKey : ''
  const {
    isLoggedIn,
    adminAccess,
    adminAccessResolved,
    updateAdminAccess,
  } = useAuth()
  const allowAnonymous = to.meta.allowAnonymous === true

  if (typeof to.name === 'string' && to.name === 'Home') {
    return redirectPath
  }

  if (
    routeFeatureKey &&
    !publicConfig.features[routeFeatureKey as keyof typeof publicConfig.features]
  ) {
    return resolveFeatureRedirectPath(to.path, redirectPath, papersHomePath)
  }

  if (typeof to.name === 'string' && to.name === 'Papers' && papersHomePath !== '/papers') {
    return papersHomePath
  }

  if (
    fixedInstitutionSlug &&
    typeof to.name === 'string' &&
    (to.name === 'InstitutionPapers' || to.name === 'InstitutionCollegePapers') &&
    String(to.params.slug ?? '') !== fixedInstitutionSlug
  ) {
    return {
      name: to.name,
      params: {
        ...to.params,
        slug: fixedInstitutionSlug,
      },
      query: to.query,
      hash: to.hash,
    }
  }

  if (!allowAnonymous && !isLoggedIn.value && !isDevAuthBypassEnabled) {
    window.dispatchEvent(new CustomEvent('auth:unauthorized'))
    return false
  }

  if (to.meta.requiresAdmin === true) {
    if (!adminAccessResolved.value) {
      try {
        const profile = await getMyProfile()
        updateAdminAccess(profile.admin_access)
      } catch (error) {
        updateAdminAccess(null)
        if (error instanceof ApiError && error.response.status === 401) {
          return false
        }
        return {
          name: 'AdminAccessDenied',
          query: { reason: 'verification' },
        }
      }
    }

    const requiredCapabilities = parseAdminCapabilities(to.meta.adminCapabilities)
    if (
      !hasAdminRouteAccess(adminAccess.value, requiredCapabilities, {
        deploymentMode: publicConfig.deploymentMode,
        platformOnlyInPublic: to.meta.platformOnlyInPublic === true,
      })
    ) {
      return {
        name: 'AdminAccessDenied',
        query: { from: to.fullPath },
      }
    }
  }
})

export default router
