import { execFileSync } from 'node:child_process'

const runGit = (args) =>
  execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  }).trim()

try {
  if (runGit(['rev-parse', '--is-inside-work-tree']) !== 'true') {
    process.exit(0)
  }

  const currentHooksPath = runGit(['config', '--local', '--get', 'core.hooksPath'])
  if (currentHooksPath === '.githooks') {
    process.exit(0)
  }
} catch {
  // A source archive or container build may not include Git metadata.
}

try {
  execFileSync('git', ['config', '--local', 'core.hooksPath', '.githooks'], {
    stdio: 'ignore'
  })
  console.log('Configured Git hooks from .githooks')
} catch {
  console.log('Skipped Git hook configuration because this is not a writable Git worktree')
}
