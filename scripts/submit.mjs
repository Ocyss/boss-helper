import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { checkVersion } from './check-version.mjs'

const browsers = ['chrome', 'edge', 'firefox']
const args = process.argv.slice(2)
if (args.some((arg) => arg !== '--dry-run' && !browsers.includes(arg))) {
  console.error('Usage: bun run submit [chrome|edge|firefox] [--dry-run]')
  process.exit(1)
}
const { name, version } = JSON.parse(readFileSync('package.json', 'utf8'))
checkVersion([version, JSON.parse(readFileSync('net-conf.json', 'utf8')).version])
const selected = args.filter((arg) => browsers.includes(arg))
const flags = args.includes('--dry-run') ? ['--dry-run'] : []
for (const browser of selected.length ? selected : browsers) {
  flags.push(`--${browser}-zip`, `.output/${name}-${version}-${browser}.zip`)
  if (browser === 'firefox')
    flags.push('--firefox-sources-zip', `.output/${name}-${version}-sources.zip`)
}
for (let index = 0; index < flags.length; index++) {
  if (flags[index].endsWith('-zip') && !existsSync(flags[index + 1])) {
    console.error(`缺少 ${flags[index + 1]}，请先运行 bun run zip`)
    process.exit(1)
  }
}
// Use the installed WXT; do not download a different CLI through bunx.
const cli = fileURLToPath(new URL('../node_modules/wxt/bin/wxt.mjs', import.meta.url))
const result = spawnSync(process.execPath, [cli, 'submit', ...flags], { stdio: 'inherit' })
if (result.error) console.error(result.error.message)
process.exit(result.status ?? 1)
