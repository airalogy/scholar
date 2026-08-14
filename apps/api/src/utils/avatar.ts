import type { FastifyInstance } from 'fastify'
import { buildObjectKey } from './oss'
import { STANDARD_FILE_SECURITY_PROFILE } from './protected-files'

export const AVATAR_STORAGE_PREFIX = 'scholar/avatars'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

export interface AvatarFileRecord {
  id: string
  userId: string | null
  prefix: string | null
  ext: string
  mime_type: string
  security_profile: string
}

export const isAvatarFile = (file: AvatarFileRecord): boolean => {
  return (
    file.prefix === AVATAR_STORAGE_PREFIX &&
    file.security_profile === STANDARD_FILE_SECURITY_PROFILE &&
    file.mime_type.startsWith('image/')
  )
}

export const isAvatarFileId = (value: string): boolean => UUID_RE.test(value)

export const resolveSafeAvatarStorageKey = (value: string): string | null => {
  const key = value.trim().replace(/^\/+/, '')
  if (!key.startsWith(`${AVATAR_STORAGE_PREFIX}/`) || key.includes('..')) {
    return null
  }
  return key
}

export const resolveSafeAvatarHttpUrl = (value: string): string | null => {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

export const resolveAvatarUrl = async (
  fastify: FastifyInstance,
  avatar: string | null,
): Promise<string | null> => {
  if (!avatar) {
    return null
  }

  const httpUrl = resolveSafeAvatarHttpUrl(avatar)
  if (httpUrl) {
    return httpUrl
  }

  const storageKey = resolveSafeAvatarStorageKey(avatar)
  if (storageKey) {
    return fastify.oss.getSignedUrl(storageKey)
  }

  if (!isAvatarFileId(avatar)) {
    return null
  }

  const file = await fastify.prisma.oss_files.findUnique({ where: { id: avatar } })
  if (!file || !isAvatarFile(file)) {
    return null
  }

  return fastify.oss.getSignedUrl(buildObjectKey(file.prefix ?? '', file.id, file.ext ?? ''))
}

export const assertCanUseProfileAvatar = async (
  fastify: FastifyInstance,
  userId: string,
  currentAvatar: string | null,
  nextAvatar: string,
): Promise<void> => {
  if (!nextAvatar || nextAvatar === currentAvatar) {
    return
  }

  if (resolveSafeAvatarHttpUrl(nextAvatar) || resolveSafeAvatarStorageKey(nextAvatar)) {
    throw fastify.httpErrors.badRequest('Upload a new avatar before updating your profile')
  }

  if (!isAvatarFileId(nextAvatar)) {
    throw fastify.httpErrors.badRequest('Invalid avatar reference')
  }

  const file = await fastify.prisma.oss_files.findUnique({ where: { id: nextAvatar } })
  if (!file || file.userId !== userId || !isAvatarFile(file)) {
    throw fastify.httpErrors.forbidden('You can only use an avatar image uploaded by yourself')
  }
}
