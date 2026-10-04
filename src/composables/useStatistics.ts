import { watchThrottled } from '@vueuse/core'

import { ref } from '#imports'
import { counter } from '@/message'
import type { Statistics } from '@/types/formData'
import { getCurDay } from '@/utils'
import deepmerge, { jsonClone } from '@/utils/deepmerge'
import { logger } from '@/utils/logger'
import { getStatisticsKeys } from '@/utils/statisticsKeys'

export { getStatisticsKeys }

export const useStatistics = (accountId?: string | (() => string)) => {
  const date = getCurDay()
  const getAccountId = () => (typeof accountId === 'function' ? accountId() : (accountId ?? ''))
  const getKeys = () => getStatisticsKeys(getAccountId())

  const todayData = ref<Statistics>({
    date,
    success: 0,
    total: 0,
    repeat: 0,
    activityFilter: 0,
    tasks: {},
  })

  const statisticsData = ref<Statistics[]>([])

  watchThrottled(
    todayData,
    (v) => {
      void counter.storageSet(getKeys().today, jsonClone(v))
    },
    { throttle: 200, deep: true },
  )

  function recordTaskResult(taskId: string, result: { isSkip?: boolean; status?: string }) {
    if (result.status) {
      todayData.value.tasks[taskId] ??= {}
      todayData.value.tasks[taskId]![result.status] ??= 0
      todayData.value.tasks[taskId]![result.status]! += 1
    }
    if (taskId === '岗位投递' && result.status === 'success') {
      todayData.value.success += 1
    }
    if (result.isSkip && (taskId === '已沟通' || taskId.startsWith('重复沟通-'))) {
      todayData.value.repeat += 1
    }
    if (result.isSkip && taskId === '活跃度过滤') {
      todayData.value.activityFilter += 1
    }
  }

  function recordProcessed() {
    todayData.value.total += 1
  }

  async function updateStatistics(curData = jsonClone(todayData.value)) {
    const keys = getKeys()
    void counter.storageGet<Statistics[]>(keys.history, []).then((data) => {
      statisticsData.value = data
    })

    const g = await counter.storageGet(keys.today, curData)
    logger.debug('统计数据:', date, g)
    if (g.date === date) {
      todayData.value = deepmerge(curData, g, { clone: false })
      return
    }

    const statistics = await counter.storageGet(keys.history, [])

    const newStatistics = [g, ...statistics]
    await counter.storageSet(keys.history, newStatistics)
    await counter.storageSet(keys.today, curData)
    statisticsData.value = newStatistics
  }

  return {
    todayData,
    statisticsData,
    recordTaskResult,
    recordProcessed,
    updateStatistics,
  }
}
