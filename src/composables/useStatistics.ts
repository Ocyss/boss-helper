import { reactiveComputed, watchThrottled } from '@vueuse/core'

import { ref } from '#imports'
import { counter } from '@/message'
import type { Statistics } from '@/types/formData'
import { getCurDay } from '@/utils'
import deepmerge, { jsonClone } from '@/utils/deepmerge'
import { logger } from '@/utils/logger'

export const todayKey = 'local:web-geek-job-Today'
export const statisticsKey = 'local:web-geek-job-Statistics'

type SummaryCounter = 'success' | 'greetingSuccess' | 'total' | 'repeat' | 'activityFilter'

const createTracking = (): NonNullable<Statistics['tracking']> => ({
  total: [],
  success: [],
  greetingSuccess: [],
  repeat: [],
  activityFilter: [],
  tasks: {},
})

const createTodayData = (date: string): Statistics => ({
  date,
  success: 0,
  greetingSuccess: 0,
  total: 0,
  repeat: 0,
  activityFilter: 0,
  tasks: {},
  tracking: createTracking(),
})

const normalizeStatistics = (data: Partial<Statistics>, fallbackDate = getCurDay()) =>
  deepmerge(createTodayData(data.date ?? fallbackDate), data)

const createStatistics = () => {
  const date = getCurDay()

  const todayData = reactiveComputed<Statistics>(() => createTodayData(date))

  const statisticsData = ref<Statistics[]>([])

  async function getStatistics(): Promise<string> {
    await updateStatistics()
    return JSON.stringify(jsonClone({ t: todayData, s: statisticsData.value }))
  }

  async function setStatistics(data: string) {
    const { t, s } = JSON.parse(data)
    const normalizedToday = normalizeStatistics(t)
    const normalizedHistory = (s as Statistics[]).map((item) => normalizeStatistics(item))
    deepmerge(todayData, normalizedToday, { clone: false })
    statisticsData.value = normalizedHistory
    await counter.storageSet(todayKey, normalizedToday)
    await counter.storageSet(statisticsKey, normalizedHistory)
  }

  watchThrottled(
    todayData,
    (v) => {
      void counter.storageSet(todayKey, jsonClone(v))
    },
    { throttle: 200 },
  )

  async function updateStatistics(curData = jsonClone(todayData)) {
    void counter.storageGet<Statistics[]>(statisticsKey, []).then((data) => {
      statisticsData.value = data.map((item) => normalizeStatistics(item))
    })

    const g = normalizeStatistics(await counter.storageGet(todayKey, curData), date)
    logger.debug('统计数据:', date, g)
    if (g.date === date) {
      deepmerge(todayData, g, { clone: false })
      return g
    }

    const statistics = (await counter.storageGet<Statistics[]>(statisticsKey, [])).map((item) =>
      normalizeStatistics(item),
    )

    const newStatistics = [g, ...statistics]
    await counter.storageSet(statisticsKey, newStatistics)
    await counter.storageSet(todayKey, curData)
    statisticsData.value = newStatistics
  }

  function recordSummary(counterName: SummaryCounter, jobKey: string) {
    const tracking = (todayData.tracking ??= createTracking())
    const trackedJobs = (tracking[counterName] ??= [])
    if (trackedJobs.includes(jobKey)) return false

    trackedJobs.push(jobKey)
    todayData[counterName] += 1
    return true
  }

  function recordTask(jobKey: string, taskId: string, status: string) {
    const tracking = (todayData.tracking ??= createTracking())
    const taskTracking = (tracking.tasks[taskId] ??= {})
    const trackedJobs = (taskTracking[status] ??= [])
    if (trackedJobs.includes(jobKey)) return false

    trackedJobs.push(jobKey)
    todayData.tasks[taskId] ??= {}
    todayData.tasks[taskId][status] ??= 0
    todayData.tasks[taskId][status] += 1
    return true
  }

  return {
    todayData,
    statisticsData,
    updateStatistics,
    getStatistics,
    setStatistics,
    recordSummary,
    recordTask,
  }
}

const statistics = createStatistics()

export const useStatistics = () => statistics
