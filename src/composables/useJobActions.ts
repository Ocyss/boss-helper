import type { ContextMenuItem } from '@nuxt/ui'
import { computed, ref } from 'vue'

import { useHelper } from '@/composables/useHelper'
import type { JobData } from '@/composables/useHelper'

const busy = ref(false)

export function useJobActions() {
  const helper = useHelper()
  const toast = useToast()
  const blocked = computed(() => busy.value || helper.workflow?.status.value === 'running')

  async function run(label: string, action: () => void | Promise<void>) {
    try {
      await action()
      return true
    } catch (error) {
      toast.add({
        title: `${label}失败`,
        description: error instanceof Error ? error.message : String(error),
        color: 'error',
      })
      return false
    }
  }

  async function fetchDetails(key: string) {
    if (helper.hasJobDetails(key)) return true
    if (blocked.value) {
      toast.add({
        title: '暂时无法拉取信息',
        description: '请先暂停工作流或等待当前操作完成',
        color: 'warning',
      })
      return false
    }
    busy.value = true
    try {
      return await run('拉取信息', () => helper.fetchJobDetails(key))
    } finally {
      busy.value = false
    }
  }

  async function deliver(job: JobData) {
    if (blocked.value) return
    if (
      !window.confirm(
        `确定向「${job.brand.name}」的「${job.jobName}」岗位手动投递吗？此操作将强制触发投递和招呼语。`,
      )
    )
      return
    if (blocked.value) return
    busy.value = true
    try {
      await run('手动投递', () => helper.deliverJob(job.key))
    } finally {
      busy.value = false
    }
  }

  function items(job: JobData): ContextMenuItem[] {
    return [
      ...(!helper.hasJobDetails(job.key)
        ? [
            {
              label: '拉取信息',
              icon: 'i-lucide-download',
              disabled: blocked.value,
              onSelect: () => {
                void fetchDetails(job.key)
              },
            },
          ]
        : []),
      {
        label: '手动过滤',
        icon: 'i-lucide-list-filter',
        onSelect: () => {
          void run('手动过滤', () => helper.filterJob(job.key))
        },
      },
      {
        label: '手动投递',
        icon: 'i-lucide-send',
        disabled: blocked.value,
        onSelect: () => {
          void deliver(job)
        },
      },
    ]
  }

  return { items, fetchDetails, run }
}
