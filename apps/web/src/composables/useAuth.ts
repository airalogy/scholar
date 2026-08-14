import { reactive, computed, toRef } from 'vue'
import { devAuthUser, isDevAuthBypassEnabled } from '@/utils/devAuth'
import {
  FULL_ADMIN_ACCESS,
  hasAdminCapability,
  type AdminAccess,
} from '@/utils/adminAccess'

interface AuthState {
  token: string
  name: string
  avatarUrl: string
  adminAccess: AdminAccess | null
}

const state = reactive<AuthState>({
  token: localStorage.getItem('token') ?? (isDevAuthBypassEnabled ? devAuthUser.token : ''),
  name: localStorage.getItem('userName') ?? (isDevAuthBypassEnabled ? devAuthUser.name : ''),
  avatarUrl: localStorage.getItem('userAvatarUrl') ?? (isDevAuthBypassEnabled ? devAuthUser.avatarUrl : ''),
  adminAccess: isDevAuthBypassEnabled ? FULL_ADMIN_ACCESS : null,
})

export function useAuth() {
  const isLoggedIn = computed(() => isDevAuthBypassEnabled || !!state.token)
  const adminAccessResolved = computed(() => state.adminAccess !== null)
  const canAccessAdmin = computed(() => hasAdminCapability(state.adminAccess))

  function login(token: string, name: string, avatarUrl = '') {
    state.token = token
    state.name = name
    state.avatarUrl = avatarUrl
    state.adminAccess = isDevAuthBypassEnabled ? FULL_ADMIN_ACCESS : null
    localStorage.setItem('token', token)
    localStorage.setItem('userName', name)
    localStorage.setItem('userAvatarUrl', avatarUrl)
    localStorage.removeItem('canAccessAdmin')
    localStorage.removeItem('canManageLabs')
  }

  function logout() {
    state.token = ''
    state.name = ''
    state.avatarUrl = ''
    state.adminAccess = isDevAuthBypassEnabled ? FULL_ADMIN_ACCESS : null
    localStorage.removeItem('token')
    localStorage.removeItem('userName')
    localStorage.removeItem('userAvatarUrl')
    localStorage.removeItem('canAccessAdmin')
    localStorage.removeItem('canManageLabs')
  }

  function updateName(name: string) {
    state.name = name
    localStorage.setItem('userName', name)
  }

  function updateAvatar(avatarUrl: string) {
    state.avatarUrl = avatarUrl
    localStorage.setItem('userAvatarUrl', avatarUrl)
  }

  function updateAdminAccess(adminAccess: AdminAccess | null) {
    state.adminAccess = isDevAuthBypassEnabled ? FULL_ADMIN_ACCESS : adminAccess
    localStorage.removeItem('canAccessAdmin')
    localStorage.removeItem('canManageLabs')
  }

  return {
    isLoggedIn,
    token: toRef(state, 'token'),
    name: toRef(state, 'name'),
    avatarUrl: toRef(state, 'avatarUrl'),
    adminAccess: toRef(state, 'adminAccess'),
    adminAccessResolved,
    canAccessAdmin,
    login,
    logout,
    updateName,
    updateAvatar,
    updateAdminAccess,
  }
}
