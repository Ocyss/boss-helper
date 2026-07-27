<script lang="tsx" setup>
import type { TableColumn } from '@nuxt/ui'
import { computed, reactive, ref } from 'vue'

import { useHelper } from '@/composables/useHelper'
import type { Log, LogState } from '@/composables/useHelper/type'
import { useActivityLog, type ActivityStatus } from '@/composables/useActivityLog'

const helper = useHelper()
const activityLog = useActivityLog()
const dialogData = reactive<{ show: boolean; data?: Log }>({ show: false })
const activityStatusFilter = ref<ActivityStatus | 'all'>('all')
const activityCategoryFilter = ref('all')

const logs = computed(() => [...helper.logs.value].reverse())

const stateColors: Record<LogState, 'info' | 'success' | 'warning' | 'error'> = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  danger: 'error',
}

const activityStatusMeta: Record<ActivityStatus, { label: string; color: 'success' | 'warning' | 'error' }> = {
  success: { label: '已完成', color: 'success' },
  skipped: { label: '已跳过', color: 'warning' },
  action_required: { label: '需要处理', color: 'warning' },
  error: { label: '失败', color: 'error' },
}

const activityStatusItems = [
  { label: '全部状态', value: 'all' },
  ...Object.entries(activityStatusMeta).map(([value, meta]) => ({ label: meta.label, value })),
]

const activityCategoryItems = computed(() => [
  { label: '全部类别', value: 'all' },
  ...Array.from(new Set(activityLog.entries.value.map((entry) => entry.category)))
    .sort((left, right) => left.localeCompare(right, 'zh-CN'))
    .map((category) => ({ label: category, value: category })),
])

const activityEntries = computed(() =>
  [...activityLog.entries.value]
    .reverse()
    .filter(
      (entry) =>
        (activityStatusFilter.value === 'all' || entry.status === activityStatusFilter.value) &&
        (activityCategoryFilter.value === 'all' || entry.category === activityCategoryFilter.value),
    ),
)

const formatTime = (timestamp?: number) => {
  if (!timestamp) return '-'
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false })
}

const formatDuration = (durationMs?: number) => {
  if (durationMs == null) return '-'
  return durationMs < 1000 ? `${durationMs} ms` : `${(durationMs / 1000).toFixed(1)} s`
}

const formatActivityDetail = (detail?: Record<string, string | number | boolean | null>) =>
  detail ? Object.entries(detail).map(([key, value]) => `${key}：${String(value)}`) : []

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
    <section class="border-b border-default pb-3">
      <div class="mb-2 flex items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <span class="font-medium">操作记录</span>
          <UBadge color="neutral" variant="subtle">{{ activityLog.entries.value.length }}</UBadge>
        </div>
        <UButton
          color="error"
          variant="ghost"
          icon="i-lucide-trash-2"
          label="清空"
          :disabled="activityLog.entries.value.length === 0"
          @click="activityLog.clear"
        />
      </div>
      <div class="mb-2 flex flex-wrap gap-2">
        <USelectMenu
          v-model="activityStatusFilter"
          :items="activityStatusItems"
          value-key="value"
          :search-input="false"
          class="w-31"
        />
        <USelectMenu
          v-model="activityCategoryFilter"
          :items="activityCategoryItems"
          value-key="value"
          :search-input="false"
          class="min-w-35"
        />
      </div>
      <p v-if="activityLog.entries.value.length === 0" class="text-sm text-muted">
        暂时没有操作记录。开始搜索、投递或使用自动化功能后，处理结果会显示在这里。
      </p>
      <p v-else-if="activityEntries.length === 0" class="text-sm text-muted">
        没有符合当前筛选条件的记录。
      </p>
      <ul v-else class="max-h-56 space-y-1.5 overflow-y-auto pr-1 text-sm">
        <li v-for="entry in activityEntries" :key="entry.id" class="flex items-start gap-2">
          <UBadge :color="activityStatusMeta[entry.status].color" variant="subtle" class="shrink-0">
            {{ activityStatusMeta[entry.status].label }}
          </UBadge>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span class="font-medium">{{ entry.category }}</span>
              <span class="text-muted">{{ entry.action }}</span>
              <time class="text-xs text-muted">{{ formatTime(entry.timestamp) }}</time>
            </div>
            <p class="break-words text-muted">{{ entry.message }}</p>
            <details v-if="entry.detail" class="mt-0.5 text-xs text-muted">
              <summary class="cursor-pointer select-none">查看详情</summary>
              <p class="mt-1 break-words">{{ formatActivityDetail(entry.detail).join('；') }}</p>
            </details>
          </div>
        </li>
      </ul>
    </section>

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
