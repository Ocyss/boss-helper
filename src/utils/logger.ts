import type { LogLevel } from 'devlog-ui'
import { logger, LogPersistence } from 'devlog-ui'

LogPersistence.enable({
  storage: 'local', // 刷新、关闭再打开页面后仍可恢复常规运行日志
  maxPersisted: 5000,
  debounceMs: 0, // 避免页面刚刷新时最后一批日志尚未写入
})

let level: string = 'debug'

if (
  'localStorage' in window &&
  typeof localStorage !== 'undefined' &&
  typeof localStorage.getItem === 'function'
) {
  level = localStorage.getItem('__BH_LOG_LEVEL__') ?? level
}

logger.configure({
  maxLogs: 5000, // Max logs in memory (FIFO rotation)
  minLevel: level as LogLevel, // Minimum level: 'debug' | 'info' | 'warn' | 'error'
  enabled: true, // Enable/disable logging
  shortcutAction: 'toggle', // Ctrl+Shift+L: 'toggle' | 'popout'
  showToggleButton: true, // Show the floating toggle button
  spanCollapsed: false, // Collapse span groups by default
})

export { logger }
