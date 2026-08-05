import { reactiveComputed, watchThrottled } from '@vueuse/core'

import { ref } from '#imports'
import { counter } from '@/message'
import type { Statistics } from '@/types/formData'
import { getCurDay } from '@/utils'
import deepmerge, { jsonClone } from '@/utils/deepmerge'
import { logger } from '@/utils/logger'
import { v2StorageKey } from '@/utils/namespace'

export const todayKey = v2StorageKey('statistics-today')
export const statisticsKey = v2StorageKey('statistics-history')
export const statisticsEventsKey = v2StorageKey('statistics-events')
const schemaVersion = 2
type StatisticsEvent =
  | 'seen'
  | 'eligible'
  | 'filtered'
  | 'duplicate'
  | 'activity_filter'
  | 'publish_success'
  | 'greeting_success'
  | 'error'
  | 'rate_limited'

// 同一页面可能同时创建多个 useStatistics 实例，模块级缓存保证事件归并幂等。
const eventCache = new Map<string, Set<string>>()
const eventLoaders = new Map<string, Promise<Set<string>>>()
const eventWriteLocks = new Map<string, Promise<void>>()

export const useStatistics = () => {
  const date = getCurDay()

  const todayData = reactiveComputed<Statistics>(() => {
    const current = {
      version: schemaVersion,
      date,
      success: 0,
      total: 0,
      repeat: 0,
      activityFilter: 0,
      filtered: 0,
      eligible: 0,
      greetingSuccess: 0,
      errors: 0,
      rateLimited: 0,
      tasks: {},
    }
    return current
  })

  const statisticsData = ref<Statistics[]>([])

  async function getStatistics(): Promise<string> {
    await updateStatistics()
    return JSON.stringify(jsonClone({ t: todayData, s: statisticsData.value }))
  }

  async function setStatistics(data: string) {
    const parsed = JSON.parse(data)
    const t = normalize(parsed.t)
    const s = Array.isArray(parsed.s) ? parsed.s.map(normalize) : []
    deepmerge(todayData, t, { clone: false })
    statisticsData.value = s
    await counter.storageSet(todayKey, t)
    await counter.storageSet(statisticsKey, s)
  }

  watchThrottled(
    todayData,
    (v) => {
      void counter.storageSet(todayKey, jsonClone(v))
    },
    { throttle: 200 },
  )

  async function updateStatistics(curData = jsonClone(todayData)) {
    // 先完成历史读取，再决定是否归档当天数据，避免旧历史覆盖新写入。
    const storedStatistics = await counter.storageGet<Statistics[]>(statisticsKey, [])
    statisticsData.value = Array.isArray(storedStatistics) ? storedStatistics.map(normalize) : []

    const g = await counter.storageGet(todayKey, curData)
    logger.debug('统计数据:', date, g)
    const normalized = normalize(g)
    if (normalized.date === date) {
      deepmerge(todayData, normalized, { clone: false })
      return g
    }

    const newStatistics = [
      normalized,
      ...statisticsData.value.filter((x) => x.date !== normalized.date),
    ]
    await counter.storageSet(statisticsKey, newStatistics)
    await counter.storageSet(todayKey, curData)
    statisticsData.value = newStatistics
  }

  /**
   * 记录一个可重放且幂等的岗位事件。
   * 事件键只包含阶段和岗位 key，不写入岗位描述、Cookie 或模型响应。
   */
  async function recordEvent(event: StatisticsEvent, jobKey: string): Promise<boolean> {
    const cacheKey = date
    // 同一页面的多个扫描任务串行读改写，避免并发 storage.set 覆盖计数。
    const previous = eventWriteLocks.get(cacheKey) ?? Promise.resolve()
    let release: () => void = () => undefined
    const lock = new Promise<void>((resolve) => {
      release = resolve
    })
    const queued = previous.then(() => lock)
    eventWriteLocks.set(cacheKey, queued)
    await previous
    try {
      let loader = eventLoaders.get(cacheKey)
      if (!loader) {
        loader = counter.storageGet<string[]>(v2EventKey(date), []).then((items) => {
          const set = new Set(Array.isArray(items) ? items : [])
          eventCache.set(cacheKey, set)
          return set
        })
        eventLoaders.set(cacheKey, loader)
      }
      const set = eventCache.get(cacheKey) ?? (await loader)
      const id = `${event}:${jobKey}`
      if (set.has(id)) return false
      set.add(id)
      if (set.size > 5000) {
        const first = set.values().next().value
        if (first) set.delete(first)
      }
      await counter.storageSet(v2EventKey(date), Array.from(set))

      switch (event) {
        case 'seen':
          todayData.total += 1
          break
        case 'eligible':
          todayData.eligible = (todayData.eligible ?? 0) + 1
          break
        case 'filtered':
          todayData.filtered = (todayData.filtered ?? 0) + 1
          break
        case 'duplicate':
          todayData.repeat += 1
          break
        case 'activity_filter':
          todayData.activityFilter += 1
          todayData.filtered = (todayData.filtered ?? 0) + 1
          break
        case 'publish_success':
          todayData.success += 1
          break
        case 'greeting_success':
          todayData.greetingSuccess = (todayData.greetingSuccess ?? 0) + 1
          break
        case 'error':
          todayData.errors = (todayData.errors ?? 0) + 1
          break
        case 'rate_limited':
          todayData.rateLimited = (todayData.rateLimited ?? 0) + 1
          break
      }
      await counter.storageSet(todayKey, jsonClone(todayData))
      return true
    } finally {
      release()
      if (eventWriteLocks.get(cacheKey) === queued) eventWriteLocks.delete(cacheKey)
    }
  }

  /** 兼容旧版本统计结构并确保数字字段可安全参与计算。 */
  function normalize(input: Partial<Statistics> | undefined): Statistics {
    return {
      version: schemaVersion,
      date: input?.date || date,
      success: Number(input?.success) || 0,
      total: Number(input?.total) || 0,
      repeat: Number(input?.repeat) || 0,
      activityFilter: Number(input?.activityFilter) || 0,
      filtered: Number(input?.filtered) || 0,
      eligible: Number(input?.eligible) || 0,
      greetingSuccess: Number(input?.greetingSuccess) || 0,
      errors: Number(input?.errors) || 0,
      rateLimited: Number(input?.rateLimited) || 0,
      tasks: input?.tasks && typeof input.tasks === 'object' ? input.tasks : {},
    }
  }

  return {
    todayData,
    statisticsData,
    updateStatistics,
    getStatistics,
    setStatistics,
    recordEvent,
  }
}

function v2EventKey(date: string): string {
  return `${statisticsEventsKey}-${date}`
}
