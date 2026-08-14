import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const allowedLicenses = new Set([
  '(MIT AND Zlib)',
  '(MPL-2.0 OR Apache-2.0)',
  '0BSD',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'BlueOak-1.0.0',
  'EPL-2.0',
  'ISC',
  'MIT',
  'MIT and ISC',
  'Unlicense',
])

const modulesMetadata = readFileSync(new URL('../node_modules/.modules.yaml', import.meta.url), 'utf8')
const storeDirectory = /^\s*"storeDir":\s*"([^"]+)"/mu.exec(modulesMetadata)?.[1]
if (!storeDirectory) {
  throw new Error('Cannot determine the pnpm store used by the installed dependencies')
}

const output = execFileSync(
  'pnpm',
  [`--config.store-dir=${storeDirectory}`, 'licenses', 'list', '--prod', '--json'],
  {
    cwd: new URL('../', import.meta.url),
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  },
)
const report = JSON.parse(output)
const discoveredLicenses = Object.keys(report).sort()
const rejectedLicenses = discoveredLicenses.filter((license) => !allowedLicenses.has(license))

if (rejectedLicenses.length > 0) {
  throw new Error(`Unreviewed production dependency licenses: ${rejectedLicenses.join(', ')}`)
}

const packageCount = Object.values(report).reduce((count, packages) => count + packages.length, 0)
console.log(
  `Reviewed ${packageCount} production dependency entries across ${discoveredLicenses.length} license expressions`,
)
