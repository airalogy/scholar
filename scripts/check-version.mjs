import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const repositoryRootUrl = new URL('../', import.meta.url)
const repositoryRoot = fileURLToPath(repositoryRootUrl)
const readText = async (path) => readFile(new URL(path, repositoryRootUrl), 'utf8')
const readJson = async (path) => JSON.parse(await readText(path))

const version = (await readFile(new URL('../VERSION', import.meta.url), 'utf8')).trim()
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`VERSION is not a valid semantic version: ${version}`)
}

const packageFiles = [
  'package.json',
  'apps/api/package.json',
  'apps/web/package.json',
  'apps/docs/package.json',
]
for (const packageFile of packageFiles) {
  const packageJson = await readJson(packageFile)
  if (packageJson.version !== version) {
    throw new Error(`${packageFile} has version ${packageJson.version}; expected ${version}`)
  }
}

const deploymentEnvironment = await readText('deploy/.env.example')
const deploymentVersion = /^SCHOLAR_VERSION=(.+)$/mu.exec(deploymentEnvironment)?.[1]?.trim()
if (deploymentVersion !== version) {
  throw new Error(
    `deploy/.env.example has SCHOLAR_VERSION ${deploymentVersion ?? 'missing'}; expected ${version}`,
  )
}

const apiEnvironment = await readText('apps/api/.env.example')
const apiVersion = /^APP_VERSION=(.+)$/mu.exec(apiEnvironment)?.[1]?.trim()
if (apiVersion !== version) {
  throw new Error(
    `apps/api/.env.example has APP_VERSION ${apiVersion ?? 'missing'}; expected ${version}`,
  )
}
const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
for (const imageKey of ['SCHOLAR_API_IMAGE', 'SCHOLAR_WEB_IMAGE']) {
  const image = new RegExp(`^${imageKey}=(.+)$`, 'mu').exec(deploymentEnvironment)?.[1]?.trim()
  if (!image || !new RegExp(`:${escapedVersion}(?:@|$)`).test(image)) {
    throw new Error(`deploy/.env.example ${imageKey} must use product version ${version}`)
  }
}

const changelogFiles = ['CHANGELOG.md', 'CHANGELOG.zh-CN.md']
const changelogs = new Map()
for (const changelogFile of changelogFiles) {
  const changelog = await readText(changelogFile)
  if (!changelog.includes(`## [${version}]`)) {
    throw new Error(`${changelogFile} does not declare release ${version}`)
  }
  changelogs.set(changelogFile, changelog)
}

const readVersionSection = (changelog) => {
  const marker = `## [${version}]`
  const start = changelog.indexOf(marker)
  const contentStart = start + marker.length
  const nextVersion = changelog.indexOf('\n## ', contentStart)
  return changelog.slice(start, nextVersion === -1 ? changelog.length : nextVersion)
}

const readSectionBulletCount = (changelog, heading) => {
  const marker = `### ${heading}`
  const start = changelog.indexOf(marker)
  if (start === -1) {
    throw new Error(`Changelog section is missing: ${marker}`)
  }
  const contentStart = start + marker.length
  const nextSection = changelog.indexOf('\n### ', contentStart)
  const nextVersion = changelog.indexOf('\n## ', contentStart)
  const candidates = [nextSection, nextVersion].filter((index) => index !== -1)
  const end = candidates.length > 0 ? Math.min(...candidates) : changelog.length
  return (changelog.slice(contentStart, end).match(/^- /gmu) ?? []).length
}

const sectionPairs = [
  ['Added', '新增'],
  ['Security', '安全'],
  ['Quality Assurance', '质量保障'],
  ['Database and Deployment', '数据库与部署'],
]
const englishChangelog = readVersionSection(changelogs.get('CHANGELOG.md'))
const chineseChangelog = readVersionSection(changelogs.get('CHANGELOG.zh-CN.md'))
for (const [englishHeading, chineseHeading] of sectionPairs) {
  const englishCount = readSectionBulletCount(englishChangelog, englishHeading)
  const chineseCount = readSectionBulletCount(chineseChangelog, chineseHeading)
  if (englishCount !== chineseCount) {
    throw new Error(
      `Bilingual changelog section mismatch: ${englishHeading} has ${englishCount} items, ${chineseHeading} has ${chineseCount}`,
    )
  }
}

console.log(`Scholar version ${version} is consistent across ${repositoryRoot}`)
