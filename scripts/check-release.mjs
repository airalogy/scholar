import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'

const version = (await readFile(new URL('../VERSION', import.meta.url), 'utf8')).trim()
const expectedTag = `v${version}`
const suppliedTag = process.env.RELEASE_TAG?.trim() || process.argv[2]?.trim()

if (suppliedTag && suppliedTag !== expectedTag) {
  throw new Error(`Release tag ${suppliedTag} does not match VERSION ${version}`)
}

const repositoryRoot = new URL('../', import.meta.url)
const trackedChanges = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
  cwd: repositoryRoot,
  encoding: 'utf8',
}).trim()

if (trackedChanges) {
  throw new Error('Release verification requires a clean tracked worktree')
}

const exactTag = execFileSync('git', ['tag', '--points-at', 'HEAD'], {
  cwd: repositoryRoot,
  encoding: 'utf8',
})
  .trim()
  .split('\n')
  .filter(Boolean)

if (suppliedTag && !exactTag.includes(suppliedTag)) {
  throw new Error(`HEAD is not tagged ${suppliedTag}`)
}

console.log(`Scholar ${version} release metadata is valid${suppliedTag ? ` for ${suppliedTag}` : ''}`)
