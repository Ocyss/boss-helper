import { ref } from 'vue'

import { counter } from '@/message'
import { logger } from '@/utils/logger'

const storageKey = 'local:boss-helper-activity-log'
const maxEntries = 500
const maxTextLength = 500
const restrictedDetailKey =
  /api[-_ ]?key|authorization|token|secret|password|credential|resume|简历|chat|message|content|正文/i

export type ActivityStatus = 'success' | 'skipped' | 'action_required' | 'error'

export interface ActivityLogEntry {
  id: string
  category: string
  action: string
  message: string
  status: ActivityStatus
  timestamp: number
  detail?: Record<string, string | number | boolean | null>
}

export interface AddActivityLogInput {
  category: string
  action?: string
  message: string
  status: ActivityStatus
  detail?: Record<string, unknown>
}

function truncate(value: string) {
  return value.length > maxTextLength ? `${value.slice(0, maxTextLength)}...` : value
}

function safeDetail(detail?: Record<string, unknown>) {
  if (!detail) return undefined

  const result: Record<string, string | number | boolean | null> = {}
  for (const [key, value] of Object.entries(detail)) {
    if (restrictedDetailKey.test(key)) continue
    if (value === null || typeof value === 'boolean' || typeof value === 'number') {
      result[key] = value
    } else if (typeof value === 'string') {
      result[key] = truncate(value)
    }
  }
  return Object.keys(result).length > 0 ? result : undefined
}

function normalizeEntry(value: unknown): ActivityLogEntry | null {
  if (!value || typeof value !== 'object') return null
  const entry = value as Partial<ActivityLogEntry>
  const status = entry.status
  if (
    typeof entry.id !== 'string' ||
    typeof entry.category !== 'string' ||
    typeof entry.action !== 'string' ||
    typeof entry.message !== 'string' ||
    typeof entry.timestamp !== 'number' ||
    !status ||
    !['success', 'skipped', 'action_required', 'error'].includes(status)
  ) {
    return null
  }

  return {
    id: entry.id,
    category: truncate(entry.category),
    action: truncate(entry.action),
    message: truncate(entry.message),
    status,
    timestamp: entry.timestamp,
    detail: safeDetail(entry.detail),
  }
}

class ActivityLogStore {
  readonly entries = ref<ActivityLogEntry[]>([])
  private initialized = false
  private initPromise: Promise<void> | null = null
  private saveQueue: Promise<void> = Promise.resolve()
  private discardStoredOnInit = false
  private sequence = 0

  init() {
    if (this.initialized) return Promise.resolve()
    if (this.initPromise) return this.initPromise

    this.initPromise = counter
      .storageGet<unknown[]>(storageKey, [])
      .then((stored) => {
        const current = this.entries.value
        const saved = this.discardStoredOnInit
          ? []
          : Array.isArray(stored)
            ? stored
                .map(normalizeEntry)
                .filter((entry): entry is ActivityLogEntry => entry !== null)
            : []
        const seen = new Set<string>()
        this.entries.value = [...saved, ...current]
          .filter((entry) => {
            if (seen.has(entry.id)) return false
            seen.add(entry.id)
            return true
          })
          .sort((left, right) => left.timestamp - right.timestamp)
          .slice(-maxEntries)
        this.initialized = true
      })
      .catch((error) => {
        logger.error('操作记录加载失败', error)
        this.initialized = true
      })
      .finally(() => {
        this.initPromise = null
      })
    return this.initPromise
  }

  add(input: AddActivityLogInput) {
    const entry: ActivityLogEntry = {
      id: `${Date.now()}-${++this.sequence}`,
      category: truncate(input.category),
      action: truncate(input.action ?? input.category),
      message: truncate(input.message),
      status: input.status,
      timestamp: Date.now(),
      detail: safeDetail(input.detail),
    }
    this.entries.value = [...this.entries.value, entry].slice(-maxEntries)
    void this.init().then(() => this.queueSave())
  }

  clear() {
    this.entries.value = []
    this.discardStoredOnInit = true
    void this.init().then(() => this.queueSave())
  }

  private queueSave() {
    const snapshot = this.entries.value.map((entry) => ({
      ...entry,
      detail: entry.detail && { ...entry.detail },
    }))
    this.saveQueue = this.saveQueue
      .catch(() => undefined)
      .then(() => counter.storageSet(storageKey, snapshot))
      .then(() => undefined)
      .catch((error) => {
        logger.error('操作记录保存失败', error)
      })
    return this.saveQueue
  }
}

export const activityLog = new ActivityLogStore()

export function useActivityLog() {
  return activityLog
}
