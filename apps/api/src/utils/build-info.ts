import { readFileSync } from 'node:fs'

export interface BuildInfo {
  version: string
  tag: string | null
  commit: string
  buildTime: string | null
  dirty: boolean
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

const readBuiltInfo = (): Partial<BuildInfo> => {
  try {
    const value = JSON.parse(
      readFileSync(new URL('../../build-info.json', import.meta.url), 'utf8'),
    ) as unknown
    if (!isRecord(value)) {
      return {}
    }
    return {
      version: typeof value.version === 'string' ? value.version : undefined,
      tag: typeof value.tag === 'string' ? value.tag : null,
      commit: typeof value.commit === 'string' ? value.commit : undefined,
      buildTime: typeof value.buildTime === 'string' ? value.buildTime : null,
      dirty: typeof value.dirty === 'boolean' ? value.dirty : undefined,
    }
  } catch {
    return {}
  }
}

const readRepositoryVersion = (): string | undefined => {
  const candidates = [
    new URL('../../../../VERSION', import.meta.url),
    new URL('../../../../../VERSION', import.meta.url),
  ]

  for (const candidate of candidates) {
    try {
      const version = readFileSync(candidate, 'utf8').trim()
      if (version) {
        return version
      }
    } catch {
      continue
    }
  }

  return undefined
}

export const resolveBuildInfo = (): BuildInfo => {
  const builtInfo = readBuiltInfo()
  const configuredDirty = process.env.BUILD_DIRTY?.trim()

  return {
    version:
      process.env.APP_VERSION?.trim() ||
      builtInfo.version ||
      readRepositoryVersion() ||
      'development',
    tag: process.env.GIT_TAG?.trim() || builtInfo.tag || null,
    commit: process.env.GIT_COMMIT?.trim() || builtInfo.commit || 'unknown',
    buildTime: process.env.BUILD_TIME?.trim() || builtInfo.buildTime || null,
    dirty:
      configuredDirty === undefined
        ? (builtInfo.dirty ?? false)
        : configuredDirty === 'true' || configuredDirty === '1',
  }
}
