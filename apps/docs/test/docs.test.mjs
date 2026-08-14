import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const docsRoot = path.resolve(import.meta.dirname, '..')

test('bulk import guides document both actor types and safe credential handling', async () => {
  for (const relativePath of [
    'zh/integration/bulk-import.md',
    'en/integration/bulk-import.md',
  ]) {
    const source = await readFile(path.join(docsRoot, relativePath), 'utf8')
    assert.match(source, /Bearer/u)
    assert.match(source, /can_import_data/u)
    assert.match(source, /client_id/u)
    assert.match(source, /YOUR_CLIENT_SECRET/u)
    assert.doesNotMatch(source, /sch_secret_[A-Za-z0-9_-]{16,}/u)
  }
})

test('documentation configuration is versioned with explicit Chinese and English routes', async () => {
  const config = await readFile(path.join(docsRoot, '.vitepress', 'config.mts'), 'utf8')
  assert.match(config, /base: '\/docs\/'/u)
  assert.match(config, /\.\.\/\.\.\/\.\.\/VERSION/u)
  assert.match(config, /provider: 'local'/u)
  assert.match(config, /zh: \{/u)
  assert.match(config, /link: '\/zh\/'/u)
  assert.match(config, /en: \{/u)
  assert.match(config, /link: '\/en\/'/u)
  assert.doesNotMatch(config, /Documentation Deployment/u)
})

test('visible documentation titles use the full Airalogy Scholar brand', async () => {
  const pages = await Promise.all([
    readFile(path.join(docsRoot, 'index.md'), 'utf8'),
    readFile(path.join(docsRoot, 'en/index.md'), 'utf8'),
    readFile(path.join(docsRoot, 'zh/index.md'), 'utf8'),
  ])
  pages.forEach((source) => assert.match(source, /Airalogy Scholar/u))
})

test('administration guides document server-derived and delegated access', async () => {
  for (const relativePath of [
    'zh/administration/index.md',
    'en/administration/index.md',
  ]) {
    const source = await readFile(path.join(docsRoot, relativePath), 'utf8')
    assert.match(source, /can_review_content/u)
    assert.match(source, /can_import_data/u)
    assert.match(source, /server|API|服务器/u)
  }
})
