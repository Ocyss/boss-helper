import { ref, watch } from 'vue'

import { counter } from '@/message'
import type { Statistics } from '@/types/formData'
import { getCurDay } from '@/utils'
import { jsonClone } from '@/utils/deepmerge'

import { useAccounts } from './useAccounts'

export const todayKey = 'local:web-geek-job-Today'
export const statisticsKey = 'local:web-geek-job-Statistics'

export const useStatistics = () => {
  const accounts = useAccounts()
  const empty = (): Statistics => ({
    date: getCurDay(),
    success: 0,
    total: 0,
    repeat: 0,
    activityFilter: 0,
    tasks: {},
  })
  const todayData = ref<Statistics>(empty())
  const statisticsData = ref<Statistics[]>([])
  let loadedAccount: string | undefined
  let loading = false
  let pending = Promise.resolve()
  const key = (base: string, account: string) =>
    account === 'default' ? base : `${base}-${account}`

  watch(
    todayData,
    (value) => {
      if (loading || !loadedAccount) return
      const storageKey = key(todayKey, loadedAccount)
      const data = jsonClone(value)
      pending = pending
        .catch(() => {})
        .then(async () => {
          await counter.storageSet(storageKey, data)
        })
    },
    { deep: true, flush: 'sync' },
  )

  async function updateStatistics() {
    await accounts.init()
    await pending
    const account = accounts.activeAccount.value
    loading = true
    try {
      const current = empty()
      const today = await counter.storageGet(key(todayKey, account), current)
      const history = await counter.storageGet<Statistics[]>(key(statisticsKey, account), [])
      if (today.date !== current.date) {
        history.unshift(today)
        await counter.storageSet(key(statisticsKey, account), history)
        await counter.storageSet(key(todayKey, account), current)
      }
      todayData.value = today.date === current.date ? today : current
      statisticsData.value = history
      loadedAccount = account
    } finally {
      loading = false
    }
  }

  return { todayData, statisticsData, updateStatistics }
}
