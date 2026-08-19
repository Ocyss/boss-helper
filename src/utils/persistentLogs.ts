import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

const DATABASE_NAME = 'boss-helper-persistent-logs'
const STORE_NAME = 'logs'
const FALLBACK_STORAGE_KEY = '__BH_PERSISTENT_LOG_FALLBACK__'
const LOG_EVENT_NAME = 'boss-helper:persistent-log-written'
const FALLBACK_LOG_LIMIT = 100
/** 审计日志包含岗位 JD 和接口响应，数量受限以避免浏览器存储无限膨胀。 */
const MAX_PERSISTED_LOGS = 2000

export type PersistentLogLevel = 'debug' | 'info' | 'success' | 'warn' | 'error'

export type PersistentLogEntry = {
  id: string
  createdAt: number
  level: PersistentLogLevel
  title: string
  message?: string
  job?: {
    key: string
    name: string
    company?: string
    link?: string
  }
  data?: unknown
}

export type PersistentLogInput = Omit<PersistentLogEntry, 'id' | 'createdAt'> & {
  createdAt?: number
}

interface BossHelperLogDatabase extends DBSchema {
  logs: {
    key: string
    value: PersistentLogEntry
    indexes: { createdAt: number }
  }
}

let databasePromise: Promise<IDBPDatabase<BossHelperLogDatabase>> | undefined
let writeQueue: Promise<void> = Promise.resolve()
let persistentStorageRequested = false

function getDatabase() {
  databasePromise ??= openDB<BossHelperLogDatabase>(DATABASE_NAME, 1, {
    upgrade(db) {
      const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      store.createIndex('createdAt', 'createdAt')
    },
  })
  return databasePromise
}

function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/**
 * 将运行时对象转换为可持久化的快照，避免 Error、Proxy 或循环引用导致整条日志写入失败。
 */
function toSerializable(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value)
  if (typeof value === 'bigint') return `${value}n`
  if (typeof value === 'undefined') return '[undefined]'
  if (typeof value === 'symbol' || typeof value === 'function') return String(value)

  if (value instanceof Date) return value.toISOString()
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      cause: toSerializable(value.cause, seen),
    }
  }
  if (typeof Element !== 'undefined' && value instanceof Element) {
    return {
      type: 'Element',
      tagName: value.tagName,
      id: value.id,
      className: value.className,
      text: value.textContent?.slice(0, 500),
    }
  }
  if (value instanceof Map) {
    return Array.from(value.entries(), ([key, item]) => [
      toSerializable(key, seen),
      toSerializable(item, seen),
    ])
  }
  if (value instanceof Set) {
    return Array.from(value, (item) => toSerializable(item, seen))
  }
  if (ArrayBuffer.isView(value)) {
    return Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
  }
  if (value instanceof ArrayBuffer) return Array.from(new Uint8Array(value))
  if (typeof value !== 'object') return String(value)

  if (seen.has(value)) return '[循环引用]'
  seen.add(value)

  if (Array.isArray(value)) return value.map((item) => toSerializable(item, seen))

  const result: Record<string, unknown> = {}
  for (const key of Object.keys(value)) {
    try {
      result[key] = toSerializable((value as Record<string, unknown>)[key], seen)
    } catch (error) {
      result[key] = `[读取失败: ${error instanceof Error ? error.message : String(error)}]`
    }
  }
  return result
}

function createEntry(input: PersistentLogInput): PersistentLogEntry {
  const entry: PersistentLogEntry = {
    ...input,
    id: createId(),
    createdAt: input.createdAt ?? Date.now(),
  }
  try {
    entry.data = input.data === undefined ? undefined : toSerializable(input.data)
  } catch (error) {
    entry.data = {
      serializationError: error instanceof Error ? error.message : String(error),
    }
  }
  return entry
}

async function requestPersistentStorage() {
  if (persistentStorageRequested || typeof navigator === 'undefined') return
  persistentStorageRequested = true
  try {
    await navigator.storage?.persist?.()
  } catch {
    // 浏览器可以拒绝持久化配额；IndexedDB 仍会正常用于页面刷新后的恢复。
  }
}

async function putAndTrim(
  database: IDBPDatabase<BossHelperLogDatabase>,
  entry: PersistentLogEntry,
) {
  const transaction = database.transaction(STORE_NAME, 'readwrite')
  const store = transaction.objectStore(STORE_NAME)
  await store.put(entry)

  let overflow = (await store.count()) - MAX_PERSISTED_LOGS
  if (overflow > 0) {
    const index = store.index('createdAt')
    let cursor = await index.openCursor()
    while (cursor && overflow > 0) {
      await cursor.delete()
      cursor = await cursor.continue()
      overflow--
    }
  }
  await transaction.done
}

function writeFallback(entry: PersistentLogEntry) {
  try {
    const current = JSON.parse(
      localStorage.getItem(FALLBACK_STORAGE_KEY) ?? '[]',
    ) as PersistentLogEntry[]
    current.push(entry)
    localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(current.slice(-FALLBACK_LOG_LIMIT)))
  } catch {
    // IndexedDB 和 localStorage 均不可用时，不能影响投递工作流本身。
  }
}

function readFallback(): PersistentLogEntry[] {
  try {
    const data = JSON.parse(localStorage.getItem(FALLBACK_STORAGE_KEY) ?? '[]')
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function notifyLogWritten() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(LOG_EVENT_NAME))
  }
}

/**
 * 关键日志按调用顺序串行写入 IndexedDB。函数不会把日志故障扩散为投递故障。
 */
export function persistLog(input: PersistentLogInput): Promise<void> {
  const entry = createEntry(input)
  const write = async () => {
    await requestPersistentStorage()
    let lastError: unknown
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const database = await getDatabase()
        await putAndTrim(database, entry)
        notifyLogWritten()
        return
      } catch (error) {
        lastError = error
        databasePromise = undefined
        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)))
      }
    }
    writeFallback(entry)
    notifyLogWritten()
    console.error('持久化日志写入失败，已尝试 localStorage 兜底。', lastError)
  }

  const task = writeQueue.then(write, write)
  writeQueue = task.catch(() => undefined)
  return task
}

/** 读取所有审计日志；调用方按 createdAt 倒序展示，最新记录始终位于最上方。 */
export async function getPersistentLogs(): Promise<PersistentLogEntry[]> {
  const fallback = readFallback()
  try {
    const database = await getDatabase()
    const entries = await database.getAll(STORE_NAME)
    const merged = new Map(entries.map((entry) => [entry.id, entry]))
    fallback.forEach((entry) => merged.set(entry.id, entry))
    return Array.from(merged.values()).sort((left, right) => right.createdAt - left.createdAt)
  } catch {
    return fallback.sort((left, right) => right.createdAt - left.createdAt)
  }
}

/** 清空审计日志和降级存储；等待此前排队的写入结束，避免清空后又出现旧记录。 */
export function clearPersistentLogs(): Promise<void> {
  const clear = async () => {
    try {
      localStorage.removeItem(FALLBACK_STORAGE_KEY)
    } catch {
      // localStorage 不可用时仍继续清理 IndexedDB。
    }
    try {
      const database = await getDatabase()
      await database.clear(STORE_NAME)
    } catch (error) {
      databasePromise = undefined
      console.error('清空持久化日志失败。', error)
    }
    notifyLogWritten()
  }

  const task = writeQueue.then(clear, clear)
  writeQueue = task.catch(() => undefined)
  return task
}

export { LOG_EVENT_NAME, MAX_PERSISTED_LOGS }
