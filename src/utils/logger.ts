// https://bbs.tampermonkey.net.cn/forum.php?mod=redirect&goto=findpost&ptid=5899&pid=77134

import { ref } from 'vue'

const icons = { debug: '🐞', info: 'ℹ️', warn: '⚠', error: '❌️' }
const Color = {
  debug: '#42CA8C;',
  info: '#37C5D6;',
  warn: '#EFC441;',
  error: '#FF6257;',
}

function getCleanConsole() {
  const iframe = document.createElement('iframe')
  iframe.name = 'boss-helper-iframe'
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
    const temp = localStorage.getItem('__BH_LOG_LEVEL__')
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
      content: args,
      stack: new Error().stack?.split('\n').slice(3).join('\n'),
    })
    return originalMethod.apply(newConsole, [prefix, style, ...args])
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
      content: args,
      isGroup: true,
      children: [],
    }
    pushToContext(newGroup)
    currentGroupStack.push(newGroup) // 进栈
    newConsole.groupCollapsed(...args)
  },

  groupEnd() {
    currentGroupStack.pop() // 出栈
    newConsole.groupEnd()
  },
}
