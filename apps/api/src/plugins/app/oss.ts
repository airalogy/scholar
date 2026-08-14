import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import OSS from 'ali-oss'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import {
  buildSignedStorageAccessUrl,
  createSignedStorageAccessToken,
} from '../../utils/storage-access'

interface OssService {
  /** Upload a file buffer to OSS */
  upload(key: string, data: Buffer): Promise<{ key: string; url: string }>
  /** Download a file buffer from OSS */
  download(key: string): Promise<Buffer>
  /** Delete a stored object */
  delete(key: string): Promise<void>
  /** Generate a signed URL for temporary access */
  getSignedUrl(key: string, expires?: number): string
  /** Build a unique OSS key: prefix/uuid-filename */
  buildKey(prefix: string, filename: string): string
}

declare module 'fastify' {
  interface FastifyInstance {
    oss: OssService
  }
}

export default fp(async (fastify: FastifyInstance) => {
  const storageProvider = fastify.config.STORAGE_PROVIDER
  const localStorageRoot = path.resolve(process.cwd(), fastify.config.LOCAL_STORAGE_DIR)
  const hasOssConfig = [
    fastify.config.OSS_ENDPOINT,
    fastify.config.OSS_ACCESS_KEY_ID,
    fastify.config.OSS_ACCESS_KEY_SECRET,
    fastify.config.OSS_BUCKET,
  ].every(Boolean)

  const client =
    storageProvider === 'oss'
      ? (() => {
          if (!hasOssConfig) {
            throw new Error('OSS storage provider requires OSS endpoint, credentials, and bucket')
          }

          return new OSS({
            endpoint: fastify.config.OSS_ENDPOINT,
            accessKeyId: fastify.config.OSS_ACCESS_KEY_ID,
            accessKeySecret: fastify.config.OSS_ACCESS_KEY_SECRET,
            bucket: fastify.config.OSS_BUCKET,
          })
        })()
      : null

  const readStreamToBuffer = async (stream: NodeJS.ReadableStream): Promise<Buffer> => {
    const chunks: Buffer[] = []

    for await (const chunk of stream as Readable) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }

    return Buffer.concat(chunks)
  }

  const normalizeStorageKey = (key: string): string => {
    const trimmedKey = key.trim().replace(/^\/+/, '')
    const normalizedKey = path.posix.normalize(trimmedKey)

    if (
      !normalizedKey ||
      normalizedKey === '.' ||
      normalizedKey.startsWith('../') ||
      normalizedKey.includes('/../')
    ) {
      throw fastify.httpErrors.badRequest('Invalid storage key')
    }

    return normalizedKey
  }

  const resolveLocalStoragePath = (key: string): string => {
    const normalizedKey = normalizeStorageKey(key)
    const targetPath = path.resolve(localStorageRoot, normalizedKey)
    const relativePath = path.relative(localStorageRoot, targetPath)

    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      throw fastify.httpErrors.badRequest('Invalid storage key')
    }

    return targetPath
  }

  if (storageProvider === 'local') {
    await fs.mkdir(localStorageRoot, { recursive: true })
    fastify.log.info({ localStorageRoot }, 'Initialized local file storage')
  }

  const buildLocalSignedUrl = (key: string, expires = 3600): string => {
    const token = createSignedStorageAccessToken(
      fastify,
      {
        key: normalizeStorageKey(key),
      },
      expires,
    )
    return buildSignedStorageAccessUrl(token)
  }

  const ossService: OssService = {
    async upload(key: string, data: Buffer) {
      if (storageProvider === 'local') {
        const targetPath = resolveLocalStoragePath(key)
        await fs.mkdir(path.dirname(targetPath), { recursive: true })
        await fs.writeFile(targetPath, data)
        return { key, url: buildLocalSignedUrl(key) }
      }

      if (!client) throw new Error('OSS not configured')
      const result = await client.put(key, data)
      return { key, url: result.url }
    },

    async download(key: string) {
      if (storageProvider === 'local') {
        const targetPath = resolveLocalStoragePath(key)
        try {
          return await fs.readFile(targetPath)
        } catch (error) {
          const err = error as NodeJS.ErrnoException
          if (err.code === 'ENOENT') {
            throw fastify.httpErrors.notFound('File not found')
          }

          throw error
        }
      }

      if (!client) throw new Error('OSS not configured')
      const result = await client.get(key)
      const content = result.content

      if (Buffer.isBuffer(content)) {
        return content
      }

      if (typeof content === 'string') {
        return Buffer.from(content)
      }

      return readStreamToBuffer(content)
    },

    async delete(key: string) {
      if (storageProvider === 'local') {
        const targetPath = resolveLocalStoragePath(key)
        await fs.rm(targetPath, { force: true })
        return
      }

      if (!client) throw new Error('OSS not configured')
      await client.delete(key)
    },

    getSignedUrl(key: string, expires = 3600) {
      if (storageProvider === 'local') {
        return buildLocalSignedUrl(key, expires)
      }

      if (!client) throw new Error('OSS not configured')
      return client.signatureUrl(key, { expires })
    },

    buildKey(prefix: string, filename: string) {
      const uuid = crypto.randomUUID()
      const ext = path.extname(filename)
      return `${prefix}/${uuid}${ext}`
    },
  }

  fastify.decorate('oss', ossService)
})
