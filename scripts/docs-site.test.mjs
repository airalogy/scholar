import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const repositoryRoot = path.resolve(import.meta.dirname, '..')
const readRepositoryFile = (relativePath) => {
  return readFile(path.join(repositoryRoot, relativePath), 'utf8')
}

test('documentation is versioned with the Scholar product', async () => {
  const [version, docsPackageSource] = await Promise.all([
    readRepositoryFile('VERSION'),
    readRepositoryFile('apps/docs/package.json'),
  ])
  const docsPackage = JSON.parse(docsPackageSource)

  assert.equal(docsPackage.version, version.trim())
})

test('the Web image contains the built documentation site', async () => {
  const dockerfile = await readRepositoryFile('apps/web/Dockerfile')

  assert.match(dockerfile, /COPY apps\/docs apps\/docs/u)
  assert.match(dockerfile, /@airalogy\/scholar-docs build/u)
  assert.match(dockerfile, /apps\/docs\/\.vitepress\/dist \/srv\/docs/u)
})

test('Caddy serves documentation before the Web SPA fallback', async () => {
  const caddyfile = await readRepositoryFile('deploy/Caddyfile')
  const documentationRoute = caddyfile.indexOf('handle_path /docs/*')
  const spaFallback = caddyfile.indexOf('try_files {path} /index.html')

  assert.ok(documentationRoute >= 0)
  assert.ok(spaFallback > documentationRoute)
  assert.match(caddyfile, /redir \/docs \/docs\/zh\/ 308/u)
  assert.match(caddyfile, /redir \/docs\/ \/docs\/zh\/ 308/u)
  assert.match(caddyfile, /root \* \/srv\/docs/u)
})

test('release smoke test verifies human and machine-readable documentation', async () => {
  const releaseWorkflow = await readRepositoryFile('.github/workflows/release.yml')

  assert.match(releaseWorkflow, /http:\/\/127\.0\.0\.1:18080\/docs\/zh\//u)
  assert.match(releaseWorkflow, /http:\/\/127\.0\.0\.1:18080\/docs\/en\//u)
  assert.match(releaseWorkflow, /http:\/\/127\.0\.0\.1:18080\/api\/docs\/json/u)
})

test('the Web development server proxies the product documentation path', async () => {
  const viteConfig = await readRepositoryFile('apps/web/vite.config.ts')

  assert.match(viteConfig, /'\/docs':/u)
  assert.match(viteConfig, /target: 'http:\/\/localhost:5174'/u)
})
