import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const docsRoot = path.resolve(import.meta.dirname, '..')

const collectMarkdown = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (entry.name === '.vitepress' || entry.name === 'node_modules') {
      continue
    }
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...await collectMarkdown(target))
    } else if (entry.name.endsWith('.md')) {
      files.push(target)
    }
  }
  return files
}

const requiredPairs = [
  'index.md',
  'integration/index.md',
  'integration/authentication.md',
  'integration/bulk-import.md',
  'administration/index.md',
  'administration/data-import.md',
  'reference/openapi.md',
]

const errors = []
for (const relativePath of requiredPairs) {
  const chinesePath = path.join(docsRoot, 'zh', relativePath)
  const englishPath = path.join(docsRoot, 'en', relativePath)
  const [chinese, english] = await Promise.all([
    readFile(chinesePath, 'utf8').catch(() => ''),
    readFile(englishPath, 'utf8').catch(() => ''),
  ])
  if (!chinese) errors.push(`Missing or empty Chinese page: zh/${relativePath}`)
  if (!english) errors.push(`Missing or empty English page: en/${relativePath}`)
}

const languageLandingPage = await readFile(path.join(docsRoot, 'index.md'), 'utf8').catch(() => '')
if (!languageLandingPage.includes('link: /zh/') || !languageLandingPage.includes('link: /en/')) {
  errors.push('The documentation landing page must link to both /zh/ and /en/')
}

const markdownFiles = await collectMarkdown(docsRoot)
const forbiddenSecretPatterns = [
  /sch_secret_[A-Za-z0-9_-]{16,}/u,
  /OPENAI_API_KEY\s*=\s*[^\s<>{}\[\]]{8,}/u,
  /client_secret["']?\s*[:=]\s*["'](?!YOUR_|<)[^"']{16,}["']/u,
]

for (const file of markdownFiles) {
  const source = await readFile(file, 'utf8')
  for (const pattern of forbiddenSecretPatterns) {
    if (pattern.test(source)) {
      errors.push(`${path.relative(docsRoot, file)} contains a credential-like value`)
    }
  }
}

const requiredImportTerms = [
  '/auth/integration-token',
  '/v1/institutions/:slug/imports/papers',
  '/v1/institutions/:slug/imports/scholars',
  'Idempotency-Key',
  'papers:import',
  'scholars:import',
  'imports:read',
]
for (const relativePath of ['zh/integration/bulk-import.md', 'en/integration/bulk-import.md']) {
  const source = await readFile(path.join(docsRoot, relativePath), 'utf8')
  for (const term of requiredImportTerms) {
    if (!source.includes(term)) {
      errors.push(`${relativePath} is missing required import term: ${term}`)
    }
  }
}

const publicImplementationTerms = [
  'apps/docs',
  'deploy/Caddyfile',
  'pnpm --filter @airalogy/scholar-docs',
]
for (const file of markdownFiles) {
  const relativePath = path.relative(docsRoot, file)
  const source = await readFile(file, 'utf8')
  for (const term of publicImplementationTerms) {
    if (source.includes(term)) {
      errors.push(`${relativePath} contains repository-maintainer content: ${term}`)
    }
  }
}

if (errors.length > 0) {
  console.error('Scholar documentation validation failed:\n')
  errors.forEach((error) => console.error(`- ${error}`))
  process.exit(1)
}

console.log(`Validated ${markdownFiles.length} Scholar documentation pages in two languages`)
