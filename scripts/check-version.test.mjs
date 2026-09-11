import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

const checkChangelogs = async (english, chinese) => {
  const root = await mkdtemp(path.join(tmpdir(), 'scholar-version-check-'))
  const files = {
    VERSION: '4.0.1\n',
    'package.json': '{"version":"4.0.1"}',
    'apps/api/package.json': '{"version":"4.0.1"}',
    'apps/web/package.json': '{"version":"4.0.1"}',
    'apps/docs/package.json': '{"version":"4.0.1"}',
    'apps/api/.env.example': 'APP_VERSION=4.0.1\n',
    'deploy/.env.example': 'SCHOLAR_VERSION=4.0.1\nSCHOLAR_API_IMAGE=example/api:4.0.1\nSCHOLAR_WEB_IMAGE=example/web:4.0.1\n',
    'CHANGELOG.md': `## [4.0.1]\n\n${english}\n`,
    'CHANGELOG.zh-CN.md': `## [4.0.1]\n\n${chinese}\n`,
  }
  try {
    for (const [file, content] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true })
      await writeFile(path.join(root, file), content)
    }
    await mkdir(path.join(root, 'scripts'))
    const script = path.join(root, 'scripts/check-version.mjs')
    await copyFile(new URL('./check-version.mjs', import.meta.url), script)
    return spawnSync(process.execPath, [script], { encoding: 'utf8' })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test('patch releases can omit categories that are absent in both languages', async () => {
  const result = await checkChangelogs('### Fixed\n\n- Layout fix.', '### 修复\n\n- 布局修复。')
  assert.equal(result.status, 0, result.stderr)
})

test('a category present in only one language is rejected even when empty', async () => {
  const result = await checkChangelogs('### Security\n', '')
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Bilingual changelog section mismatch: Security/)
})

for (const [english, chinese] of [['Changed', '变更'], ['Fixed', '修复'], ['Breaking Changes', '不兼容变更']]) {
  test(`${english} item counts must match across languages`, async () => {
    const result = await checkChangelogs(`### ${english}\n\n- First.\n- Second.`, `### ${chinese}\n\n- 第一项。`)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /Bilingual changelog section mismatch/)
  })
}

test('previous releases do not supply a missing translated category', async () => {
  const result = await checkChangelogs('### Fixed\n\n- Current fix.', '## [4.0.0]\n\n### 修复\n\n- 旧版修复。')
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Bilingual changelog section mismatch: Fixed/)
})
