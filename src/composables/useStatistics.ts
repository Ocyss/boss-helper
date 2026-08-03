import { watchThrottled } from '@vueuse/core'

import { reactive, ref } from '#imports'
import { counter } from '@/message'
import type { Statistics } from '@/types/formData'
import { getCurDay } from '@/utils'
import deepmerge, { jsonClone } from '@/utils/deepmerge'
import { logger } from '@/utils/logger'

export const todayKey = 'local:web-geek-job-Today'
export const statisticsKey = 'local:web-geek-job-Statistics'

function createTodayData(date = getCurDay()): Statistics {
  return {
    date,
    success: 0,
    total: 0,
    repeat: 0,
    activityFilter: 0,
    tasks: {},
  }
}

const todayData = reactive<Statistics>(createTodayData())
const statisticsData = ref<Statistics[]>([])
let updateQueue = Promise.resolve<Statistics>(jsonClone(todayData))

watchThrottled(
  todayData,
  (value) => {
    void counter.storageSet(todayKey, jsonClone(value))
  },
  { throttle: 200 },
)

export const useStatistics = () => {
  async function getStatistics(): Promise<string> {
    await updateStatistics()
    return JSON.stringify(jsonClone({ t: todayData, s: statisticsData.value }))
  }

  async function setStatistics(data: string) {
    const { t, s } = JSON.parse(data)
    deepmerge(todayData, t, { clone: false })
    statisticsData.value = s
    await counter.storageSet(todayKey, t)
    await counter.storageSet(statisticsKey, s)
  }

  function updateStatistics() {
    const run = async () => {
      const current = createTodayData()
      const [storedToday, storedStatistics] = await Promise.all([
        counter.storageGet<Statistics>(todayKey, current),
        counter.storageGet<Statistics[]>(statisticsKey, []),
      ])

      logger.debug('统计数据:', current.date, storedToday)
      if (storedToday.date === current.date) {
        deepmerge(todayData, current, { clone: false })
        deepmerge(todayData, storedToday, { clone: false })
        statisticsData.value = storedStatistics
        return jsonClone(todayData)
      }

      const newStatistics = storedToday.date ? [storedToday, ...storedStatistics] : storedStatistics
      deepmerge(todayData, current, { clone: false })
      statisticsData.value = newStatistics
      await Promise.all([
        counter.storageSet(statisticsKey, newStatistics),
        counter.storageSet(todayKey, jsonClone(todayData)),
      ])
      return jsonClone(todayData)
    }

    updateQueue = updateQueue.then(run, run)
    return updateQueue
  }

  return {
    todayData,
    statisticsData,
    updateStatistics,
    getStatistics,
    setStatistics,
  }
}
