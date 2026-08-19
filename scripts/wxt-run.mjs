import { spawn } from 'node:child_process'
import { join } from 'node:path'
import process from 'node:process'

/**
 * WXT CLI 包装器：解决 `wxt build`/`wxt zip` 成功后进程不主动退出的问题。
 *
 * 根因：WXT 0.21.x 的 CLI 只在失败时调用 process.exit(1)，成功路径依赖事件循环自然排空；
 * Vite 8（rolldown 原生线程）构建后残留存活句柄，导致命令成功但终端/CI 永不返回。
 *
 * 本脚本正常转发子进程输出；检测到成功输出标记后结束整个进程树并以 0 退出；
 * 子进程异常退出则透传退出码。仅用于一次性命令（build/zip），不可用于 wxt dev。
 *
 * 实现要点：直接用 node 执行 node_modules/wxt/bin/wxt.mjs（WXT 构建全程在该进程内完成，
 * 无子进程，杀掉它即杀全树），避免 `bun x` 中间层产生隔代孤儿进程；node 缺失时回退 bun x。
 *
 * 用法: bun scripts/wxt-run.mjs <subcommand> <browser> [...extra wxt args]
 */
const [subcommand, browser, ...extraArgs] = process.argv.slice(2)

const SUPPORTED = new Set(['build', 'zip'])
const BROWSERS = new Set(['chrome', 'firefox', 'edge'])
if (!SUPPORTED.has(subcommand) || !BROWSERS.has(browser)) {
  console.error(
    `用法: bun scripts/wxt-run.mjs <build|zip> <chrome|firefox|edge> [...args]（收到: ${subcommand} ${browser}）`,
  )
  process.exit(1)
}

const SUCCESS_MARKER = 'Finished in'
const spawnOptions = {
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: process.platform !== 'win32',
}
const wxtBin = join(process.cwd(), 'node_modules', 'wxt', 'bin', 'wxt.mjs')
const wxtArgs = [subcommand, '-b', browser, ...extraArgs]

let pendingTail = ''
let finished = false

const killTree = (pid) => {
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    try {
      process.kill(-pid, 'SIGKILL')
    } catch {
      // detached 进程组不存在时退回直接终止
      try {
        process.kill(pid, 'SIGKILL')
      } catch {}
    }
  }
}

const handleChunk = (target) => (chunk) => {
  // 成功标记可能跨 chunk 边界，保留尾部片段拼接后再检测
  const text = pendingTail + chunk.toString()
  pendingTail = text.slice(-64)
  target.write(chunk)
  if (!finished && text.includes(SUCCESS_MARKER)) {
    finished = true
    // 给尾部日志留出输出时间，然后结束整个进程树
    setTimeout(() => {
      if (child.pid !== undefined) killTree(child.pid)
      process.exit(0)
    }, 300)
  }
}

const wireChild = (proc) => {
  proc.stdout.on('data', handleChunk(process.stdout))
  proc.stderr.on('data', handleChunk(process.stderr))
  proc.on('exit', (code, signal) => {
    if (!finished) {
      process.exit(code ?? (signal ? 1 : 0))
    }
  })
}

let child = spawn('node', [wxtBin, ...wxtArgs], spawnOptions)
wireChild(child)
child.on('error', (error) => {
  if (error.code !== 'ENOENT' || child.pid !== undefined) {
    console.error(`启动 wxt ${subcommand} 失败: ${error.message}`)
    process.exit(1)
    return
  }
  // node 不在 PATH：退回 bun x 解析本地 bin
  child = spawn(process.execPath, ['x', 'wxt', ...wxtArgs], spawnOptions)
  wireChild(child)
  child.on('error', (fallbackError) => {
    console.error(`启动 wxt ${subcommand} 失败: ${fallbackError.message}`)
    process.exit(1)
  })
})
