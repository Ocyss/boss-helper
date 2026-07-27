<script lang="tsx" setup>
import type { TableColumn } from '@nuxt/ui'
import { computed, reactive } from 'vue'

import { useHelper } from '@/composables/useHelper'
import type { Log, LogState } from '@/composables/useHelper/type'

const helper = useHelper()
const dialogData = reactive<{ show: boolean; data?: Log }>({ show: false })

const logs = computed(() => [...helper.logs.value].reverse())

const stateColors: Record<LogState, 'info' | 'success' | 'warning' | 'error'> = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  danger: 'error',
}

const formatTime = (timestamp?: number) => {
  if (!timestamp) return '-'
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false })
}

const formatDuration = (durationMs?: number) => {
  if (durationMs == null) return '-'
  return durationMs < 1000 ? `${durationMs} ms` : `${(durationMs / 1000).toFixed(1)} s`
}

const showDetails = (log: Log) => {
  dialogData.data = log
  dialogData.show = true
}

const columns: TableColumn<Log>[] = [
  {
    accessorKey: 'timestamp',
    header: '时间',
    cell: ({ row }) => <span class="whitespace-nowrap text-xs">{formatTime(row.original.timestamp)}</span>,
  },
  {
    accessorKey: 'title',
    header: '岗位/流程',
    cell: ({ row }) => (
      <button
        class="max-w-52 truncate text-left text-primary hover:underline"
        title={row.original.title}
        onClick={() => showDetails(row.original)}
      >
        {row.original.title}
      </button>
    ),
  },
  {
    accessorKey: 'step',
    header: '步骤',
    cell: ({ row }) => <span class="whitespace-nowrap">{row.original.step ?? '-'}</span>,
  },
  {
    accessorKey: 'state',
    header: '状态',
    cell: ({ row }) => (
      <UBadge color={stateColors[row.original.state]} variant="subtle">
        {row.original.state_name}
      </UBadge>
    ),
  },
  {
    accessorKey: 'durationMs',
    header: '耗时',
    cell: ({ row }) => <span class="whitespace-nowrap">{formatDuration(row.original.durationMs)}</span>,
  },
  {
    accessorKey: 'message',
    header: '消息',
    cell: ({ row }) => (
      <span class="block max-w-96 truncate" title={row.original.message}>
        {row.original.message ?? '-'}
      </span>
    ),
  },
]
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <span class="font-medium">实时日志</span>
        <UBadge color="neutral" variant="subtle">{{ helper.logs.value.length }}</UBadge>
      </div>
      <UButton
        color="error"
        variant="ghost"
        icon="i-lucide-trash-2"
        label="清空"
        :disabled="helper.logs.value.length === 0"
        @click="helper.logs.clear"
      />
    </div>

    <div class="overflow-x-auto">
      <UTable :columns="columns" :data="logs" sticky class="min-w-225 max-h-96" />
    </div>

    <UModal v-model:open="dialogData.show" title="日志详情">
      <template #body>
        <dl class="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
          <dt class="text-muted">时间</dt>
          <dd>{{ formatTime(dialogData.data?.timestamp) }}</dd>

          <dt class="text-muted">岗位/流程</dt>
          <dd class="break-words">{{ dialogData.data?.title }}</dd>

          <dt class="text-muted">岗位标识</dt>
          <dd class="break-all">{{ dialogData.data?.jobKey ?? '-' }}</dd>

          <dt class="text-muted">步骤</dt>
          <dd>{{ dialogData.data?.step ?? '-' }}</dd>

          <dt class="text-muted">状态</dt>
          <dd>
            <UBadge
              v-if="dialogData.data"
              :color="stateColors[dialogData.data.state]"
              variant="subtle"
            >
              {{ dialogData.data.state_name }}
            </UBadge>
          </dd>

          <dt class="text-muted">耗时</dt>
          <dd>{{ formatDuration(dialogData.data?.durationMs) }}</dd>

          <dt class="text-muted">消息</dt>
          <dd class="whitespace-pre-wrap break-words">{{ dialogData.data?.message ?? '-' }}</dd>
        </dl>
      </template>
      <template #footer>
        <UButton color="neutral" variant="outline" @click="dialogData.show = false">关闭</UButton>
      </template>
    </UModal>
  </div>
</template>
