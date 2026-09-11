import { apiClient } from './client'

export interface SystemVersion {
  version: string
  tag: string | null
  commit: string
  buildTime: string | null
  dirty: boolean
}

export const getSystemVersion = async (signal?: AbortSignal): Promise<SystemVersion> => {
  const response = await apiClient.get<{ code: number; data?: SystemVersion }>('/version', {
    signal,
    timeout: 8000,
    promptOnUnauthorized: false,
  })
  const data = response.data?.data
  if (response.data?.code !== 0 || !data || typeof data.version !== 'string' || !data.version.trim()) {
    throw new Error('Version information unavailable')
  }
  return data
}
