import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export function checkVersion(current, previous) {
  const [pkg, config] = current
  const valid = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
  if (!valid.test(pkg) || pkg.split('.').some((part) => Number(part) > 65535)) {
    throw new Error('版本必须是三段数字，每段为 0–65535')
  }
  if (pkg !== config) throw new Error('package.json 与 net-conf.json 的 version 必须完全一致')
  if (!previous) return { version: pkg, release: false }
  const [oldPkg, oldConfig] = previous
  const changed = pkg !== oldPkg
  if (changed !== (config !== oldConfig)) throw new Error('两个 version 必须同时修改')
  if (changed) {
    const compare = (old) => {
      if (!valid.test(old)) throw new Error(`基准版本格式无效：${old}`)
      const parts = old.split('.').map(Number)
      for (const [index, value] of pkg.split('.').map(Number).entries()) {
        if (value !== parts[index]) return value > parts[index]
      }
      return false
    }
    if (!compare(oldPkg) || !compare(oldConfig)) throw new Error('新版本必须大于两个旧版本')
  }
  return { version: pkg, release: changed }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const files = ['package.json', 'net-conf.json']
    const current = files.map((file) => JSON.parse(readFileSync(file, 'utf8')).version)
    const base = process.argv[2]
    const previous = base
      ? files.map(
          (file) =>
            JSON.parse(
              execFileSync(
                'git',
                [
                  '-c',
                  `safe.directory=${process.cwd().replaceAll('\\', '/')}`,
                  'show',
                  `${base}:${file}`,
                ],
                { encoding: 'utf8' },
              ),
            ).version,
        )
      : undefined
    const result = checkVersion(current, previous)
    console.log(`version=${result.version}\nrelease=${result.release}`)
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        `version=${result.version}\nrelease=${result.release}\n`,
      )
    }
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}
