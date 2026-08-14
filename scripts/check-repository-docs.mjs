import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
const repositoryDocsRoot = path.join(repositoryRoot, 'docs')
const productDocsRoot = path.join(repositoryRoot, 'apps', 'docs')
const languages = ['en', 'zh']

const collectMarkdown = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    if (entry.name === '.vitepress' || entry.name === 'node_modules' || entry.name === 'dist') {
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

const fileExists = async (target) => {
  try {
    await stat(target)
    return true
  } catch {
    return false
  }
}

const extractLocalLinks = (source) => {
  const links = []
  const pattern = /!?(?:\[[^\]]*\])\(([^)]+)\)/gu

  for (const match of source.matchAll(pattern)) {
    let destination = match[1].trim()
    if (destination.startsWith('<')) {
      const closing = destination.indexOf('>')
      destination = closing === -1 ? destination.slice(1) : destination.slice(1, closing)
    } else {
      destination = destination.split(/\s+["']/u, 1)[0]
    }

    if (
      !destination ||
      destination.startsWith('#') ||
      destination.startsWith('/') ||
      /^[a-z][a-z0-9+.-]*:/iu.test(destination)
    ) {
      continue
    }

    const withoutFragment = destination.split('#', 1)[0].split('?', 1)[0]
    if (withoutFragment) {
      links.push(decodeURIComponent(withoutFragment))
    }
  }

  return links
}

const validateLocalLinks = async (files, errors) => {
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    for (const link of extractLocalLinks(source)) {
      const target = path.resolve(path.dirname(file), link)
      if (!await fileExists(target)) {
        errors.push(
          `${path.relative(repositoryRoot, file)} links to missing local target: ${link}`,
        )
      }
    }
  }
}

const validateRepositoryDocs = async () => {
  const errors = []
  const rootEntries = await readdir(repositoryDocsRoot, { withFileTypes: true })
  for (const entry of rootEntries) {
    if (entry.isFile() && entry.name.endsWith('.md')) {
      errors.push(`Repository document must live under docs/en or docs/zh: docs/${entry.name}`)
    }
  }

  const documentsByLanguage = new Map()
  for (const language of languages) {
    const languageRoot = path.join(repositoryDocsRoot, language)
    const files = await collectMarkdown(languageRoot)
    documentsByLanguage.set(
      language,
      files.map((file) => path.relative(languageRoot, file)).sort(),
    )
  }

  const englishDocuments = documentsByLanguage.get('en') ?? []
  const chineseDocuments = documentsByLanguage.get('zh') ?? []
  for (const document of englishDocuments) {
    if (!chineseDocuments.includes(document)) {
      errors.push(`Missing Chinese repository document: docs/zh/${document}`)
    }
  }
  for (const document of chineseDocuments) {
    if (!englishDocuments.includes(document)) {
      errors.push(`Missing English repository document: docs/en/${document}`)
    }
  }

  for (const document of englishDocuments) {
    const [englishSource, chineseSource] = await Promise.all([
      readFile(path.join(repositoryDocsRoot, 'en', document), 'utf8'),
      readFile(path.join(repositoryDocsRoot, 'zh', document), 'utf8'),
    ])
    const chineseLink = `../zh/${document}`
    const englishLink = `../en/${document}`
    if (!englishSource.includes(chineseLink)) {
      errors.push(`docs/en/${document} must link to ${chineseLink}`)
    }
    if (!chineseSource.includes(englishLink)) {
      errors.push(`docs/zh/${document} must link to ${englishLink}`)
    }
  }

  const englishReadme = await readFile(path.join(repositoryRoot, 'README.md'), 'utf8')
  const chineseReadme = await readFile(path.join(repositoryRoot, 'README.zh-CN.md'), 'utf8')
  if (!englishReadme.includes('./docs/en/README.md')) {
    errors.push('README.md must link to the English repository documentation index')
  }
  if (!chineseReadme.includes('./docs/zh/README.md')) {
    errors.push('README.zh-CN.md must link to the Chinese repository documentation index')
  }

  const entryPointFiles = [
    path.join(repositoryRoot, 'README.md'),
    path.join(repositoryRoot, 'README.zh-CN.md'),
    path.join(repositoryRoot, 'CONTRIBUTING.md'),
    path.join(repositoryRoot, 'apps', 'api', 'README.md'),
    path.join(repositoryRoot, 'apps', 'web', 'README.md'),
  ]
  const repositoryDocs = [
    ...await collectMarkdown(path.join(repositoryDocsRoot, 'en')),
    ...await collectMarkdown(path.join(repositoryDocsRoot, 'zh')),
  ]
  await validateLocalLinks([...entryPointFiles, ...repositoryDocs], errors)

  const productDocs = await collectMarkdown(productDocsRoot)
  const maintainerOnlyTerms = [
    '../../docs/en/',
    '../../docs/zh/',
    'deploy/scholarctl',
    'RELEASE-SOURCE-MANIFEST.json',
    'SCHOLAR_BACKUP_DIR',
    'SCHOLAR_STATE_DIR',
  ]
  for (const file of productDocs) {
    const source = await readFile(file, 'utf8')
    for (const term of maintainerOnlyTerms) {
      if (source.includes(term)) {
        errors.push(
          `${path.relative(repositoryRoot, file)} contains repository-maintainer content: ${term}`,
        )
      }
    }
  }

  const productDocsConfig = await readFile(
    path.join(productDocsRoot, '.vitepress', 'config.mts'),
    'utf8',
  )
  if (
    !productDocsConfig.includes("title: 'Airalogy Scholar Documentation'") ||
    !productDocsConfig.includes("title: 'Airalogy Scholar 文档'")
  ) {
    errors.push('The product documentation must use the full Airalogy Scholar brand in both languages')
  }

  return { documentCount: englishDocuments.length + chineseDocuments.length, errors }
}

const { documentCount, errors } = await validateRepositoryDocs()
if (errors.length > 0) {
  console.error('Repository documentation validation failed:\n')
  errors.forEach((error) => console.error(`- ${error}`))
  process.exit(1)
}

console.log(`Validated ${documentCount} paired Airalogy Scholar repository documents and local links`)
