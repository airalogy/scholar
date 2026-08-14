export const isDevAuthBypassEnabled = import.meta.env.DEV &&
  import.meta.env.VITE_DEV_AUTH_BYPASS === 'true'

export const devAuthUser = {
  token: 'dev-auth-bypass-token',
  name: 'Local Dev',
  avatarUrl: '',
}
