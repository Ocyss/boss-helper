// https://bbs.tampermonkey.net.cn/forum.php?mod=redirect&goto=findpost&ptid=5899&pid=77134

import { ref } from 'vue'

import { BOSS_HELPER_V2_DOM } from '@/utils/namespace'

const icons = { debug: '🐞', info: 'ℹ️', warn: '⚠', error: '❌️' }
const Color = {
  debug: '#42CA8C;',
  info: '#37C5D6;',
  warn: '#EFC441;',
  error: '#FF6257;',
}

function getCleanConsole() {
  const iframe = document.createElement('iframe')
  iframe.name = BOSS_HELPER_V2_DOM.loggerFrame
  iframe.style.display = 'none'
  document.head.appendChild(iframe)
  const cleanConsole = iframe.contentWindow?.console as Console
  // document.head.removeChild(iframe)
  return cleanConsole
}
enum LogLevel {
  DEBUG = 8,
  INFO = 4,
  WARN = 2,
  ERROR = 1,
}

function getLogLevel() {
  if (
    'localStorage' in window &&
    typeof localStorage !== 'undefined' &&
    typeof localStorage.getItem === 'function'
  ) {
    const temp = localStorage.getItem('__BHV2_LOG_LEVEL__')
    if (temp) {
      switch (temp.toLowerCase()) {
        case 'debug':
          return LogLevel.DEBUG
        case 'info':
          return LogLevel.INFO
        case 'warn':
          return LogLevel.WARN
        case 'error':
          return LogLevel.ERROR
      }
    }
  }
  return LogLevel.INFO
}

const newConsole = getCleanConsole() ?? {}

const logLevel = getLogLevel()

interface LogEntry {
  id: string
  level: string
  time: string
  content: any[]
  stack?: string
  children?: LogEntry[]
  isGroup?: boolean
}

const MAX_LOGS = 500

const secretKeyPattern = /api[_-]?key|authorization|cookie|token|password|secret/i
const secretValuePattern = /(bearer\s+|sk-[a-z0-9]|key[-_]|token[-_])/iu

/** 统一脱敏日志参数，避免令牌、密钥和完整模型/聊天内容进入控制台。 */
function sanitizeLogValue(value: unknown, depth = 0): unknown {
  if (depth > 3) return '[已省略]'
  if (typeof value === 'string') {
    if (secretValuePattern.test(value)) return '[已隐藏凭据]'
    return value.length > 800 ? `${value.slice(0, 800)}…` : value
  }
  if (Array.isArray(value))
    return value.slice(0, 20).map((item) => sanitizeLogValue(item, depth + 1))
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 50)) {
      output[key] = secretKeyPattern.test(key) ? '[已隐藏凭据]' : sanitizeLogValue(item, depth + 1)
    }
    return output
  }
  return value
}

export const logTree = ref<LogEntry[]>([])

let currentGroupStack: LogEntry[] = []

function pushToContext(entry: LogEntry) {
  const targetArray =
    currentGroupStack.length > 0
      ? currentGroupStack[currentGroupStack.length - 1].children!
      : logTree.value

  if (targetArray.length >= MAX_LOGS) targetArray.shift()
  targetArray.push(entry)
}

function createLogMethod(level: keyof typeof Color, originalMethod: Function) {
  const prefix = `%c${icons[level]} ${level} > `
  const style = `color:${Color[level]}; padding-left:1.2em; line-height:1.5em;`

  return (...args: any[]) => {
    pushToContext({
      id: Math.random().toString(36).slice(2),
      level,
      time: new Date().toLocaleTimeString(),
      content: args.map((arg) => sanitizeLogValue(arg)),
      stack: new Error().stack?.split('\n').slice(3).join('\n'),
    })
    return originalMethod.apply(newConsole, [
      prefix,
      style,
      ...args.map((arg) => sanitizeLogValue(arg)),
    ])
  }
}

export const logger = {
  debug: logLevel >= LogLevel.DEBUG ? createLogMethod('debug', newConsole.log) : () => {},
  info: logLevel >= LogLevel.INFO ? createLogMethod('info', newConsole.info) : () => {},
  warn: logLevel >= LogLevel.WARN ? createLogMethod('warn', newConsole.warn) : () => {},
  error: logLevel >= LogLevel.ERROR ? createLogMethod('error', newConsole.error) : () => {},

  group(...args: any[]) {
    const newGroup: LogEntry = {
      id: Math.random().toString(36).slice(2),
      level: 'info',
      time: new Date().toLocaleTimeString(),
      content: args.map((arg) => sanitizeLogValue(arg)),
      isGroup: true,
      children: [],
    }
    pushToContext(newGroup)
    currentGroupStack.push(newGroup) // 进栈
    newConsole.groupCollapsed(...args.map((arg) => sanitizeLogValue(arg)))
  },

  groupEnd() {
    currentGroupStack.pop() // 出栈
    newConsole.groupEnd()
  },
}
