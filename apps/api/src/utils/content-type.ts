import path from 'node:path'

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  '.avif': 'image/avif',
  '.csv': 'text/csv; charset=utf-8',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
}

export const guessContentTypeFromKey = (key: string): string => {
  const ext = path.extname(key).toLowerCase()
  return CONTENT_TYPE_BY_EXTENSION[ext] ?? 'application/octet-stream'
}
