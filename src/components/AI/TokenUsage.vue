<script lang="ts" setup>
import type { TableColumn } from '@nuxt/ui'
import { computed, ref, watch } from 'vue'

import { useHelper } from '@/composables/useHelper'
import {
  buildTokenUsageCsv,
  buildTokenUsageJson,
  downloadTokenUsageFile,
  summarizeTokenUsage,
  TOKEN_USAGE_WINDOW_LABEL,
  tokenUsageExportBasename,
  tokenUsageWindowStart,
} from '@/composables/useTokenUsage'
import type { TokenUsageKind, TokenUsageRecord, TokenUsageWindow } from '@/types/tokenUsage'

const helper = useHelper()
const open = ref(false)
const windowDays = ref<TokenUsageWindow>(1)
const clearing = ref(false)

const windows: { label: string; value: TokenUsageWindow }[] = [
  { label: TOKEN_USAGE_WINDOW_LABEL[1], value: 1 },
  { label: TOKEN_USAGE_WINDOW_LABEL[3], value: 3 },
  { label: TOKEN_USAGE_WINDOW_LABEL[7], value: 7 },
]

const kindLabel: Record<TokenUsageKind, string> = {
  aiFiltering: '过滤',
  aiGreeting: '打招呼',
}

const rows = computed(() => {
  const start = tokenUsageWindowStart(windowDays.value)
  return helper.tokenUsage.records.value
    .filter((item) => item.time >= start)
    .slice()
    .reverse()
})

const summary = computed(() => summarizeTokenUsage(rows.value))
const canExport = computed(() => rows.value.length > 0)

watch(open, (value) => {
  if (value) void helper.tokenUsage.load()
})

const columns: TableColumn<TokenUsageRecord>[] = [
  { id: 'time', header: '时间' },
  { id: 'kind', header: '类型' },
  { id: 'jobTitle', header: '岗位' },
  { id: 'model', header: '模型' },
  { id: 'promptTokens', header: 'Input' },
  { id: 'completionTokens', header: 'Output' },
  { id: 'totalTokens', header: 'Total' },
  { id: 'durationMs', header: '耗时' },
]

function formatTokens(value?: number) {
  if (value == null) return '—'
  return value.toLocaleString()
}

function formatDuration(value?: number | null) {
  if (value == null) return '—'
  return `${value.toLocaleString()} ms`
}

function formatTime(time: number) {
  return new Date(time).toLocaleString()
}

function exportCsv() {
  if (!canExport.value) return
  const basename = tokenUsageExportBasename(windowDays.value)
  downloadTokenUsageFile(
    buildTokenUsageCsv(rows.value, windowDays.value),
    `${basename}.csv`,
    'text/csv;charset=utf-8',
  )
}

function exportJsonFile() {
  if (!canExport.value) return
  const basename = tokenUsageExportBasename(windowDays.value)
  downloadTokenUsageFile(
    buildTokenUsageJson(rows.value, windowDays.value),
    `${basename}.json`,
    'application/json;charset=utf-8',
  )
}

async function clearRecords() {
  clearing.value = true
  try {
    await helper.tokenUsage.clear()
  } finally {
    clearing.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Token 消耗"
    :ui="{ content: 'sm:max-w-[80%]' }"
    :dismissible="false"
  >
    <slot />
    <template #body>
      <div class="flex flex-col gap-4">
        <UAlert
          color="info"
          variant="subtle"
          title="按账号隔离，保留近 7 天明细"
          description="数字来自模型返回的 usage（prompt/completion/total），覆盖 AI 过滤与 AI 打招呼的成功调用；耗时为发出请求到拿到返回的毫秒数。可导出当前窗口的 CSV / JSON 对账。"
        />
        <UFieldGroup>
          <UButton
            v-for="item in windows"
            :key="item.value"
            :variant="windowDays === item.value ? 'solid' : 'outline'"
            color="primary"
            size="sm"
            @click="windowDays = item.value"
          >
            {{ item.label }}
          </UButton>
        </UFieldGroup>
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <div>
            <div class="text-sm text-gray-500">调用次数</div>
            <div class="text-2xl font-semibold">
              {{ summary.calls }}
              <span class="text-sm text-gray-400">次</span>
            </div>
          </div>
          <div>
            <div class="text-sm text-gray-500">Input</div>
            <div class="text-2xl font-semibold">{{ formatTokens(summary.promptTokens) }}</div>
          </div>
          <div>
            <div class="text-sm text-gray-500">Output</div>
            <div class="text-2xl font-semibold">{{ formatTokens(summary.completionTokens) }}</div>
          </div>
          <div>
            <div class="text-sm text-gray-500">Total</div>
            <div class="text-2xl font-semibold">{{ formatTokens(summary.totalTokens) }}</div>
          </div>
          <div>
            <div class="text-sm text-gray-500">平均耗时</div>
            <div class="text-2xl font-semibold">{{ formatDuration(summary.avgDurationMs) }}</div>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <div class="text-sm text-gray-500">过滤</div>
            <div class="text-lg font-semibold">
              {{ summary.byKind.aiFiltering.calls }} 次 /
              {{ formatTokens(summary.byKind.aiFiltering.totalTokens) }} tokens
            </div>
          </div>
          <div>
            <div class="text-sm text-gray-500">打招呼</div>
            <div class="text-lg font-semibold">
              {{ summary.byKind.aiGreeting.calls }} 次 /
              {{ formatTokens(summary.byKind.aiGreeting.totalTokens) }} tokens
            </div>
          </div>
        </div>
        <div v-if="summary.byModel.length > 0" class="flex flex-col gap-3">
          <div class="text-sm text-gray-500">按模型</div>
          <div
            class="grid gap-4"
            :class="summary.byModel.length === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'"
          >
            <div v-for="item in summary.byModel" :key="`${item.modelName}\0${item.model}`">
              <div class="text-sm text-gray-500">
                {{ item.modelName }}
                <span
                  v-if="item.model && item.model !== item.modelName"
                  class="text-xs text-gray-400"
                >
                  （{{ item.model }}）
                </span>
              </div>
              <div class="text-lg font-semibold">
                {{ item.calls }} 次 / {{ formatTokens(item.totalTokens) }} tokens
              </div>
              <div class="text-sm text-gray-500">
                Input {{ formatTokens(item.promptTokens) }} · Output
                {{ formatTokens(item.completionTokens) }} · 平均
                {{ formatDuration(item.avgDurationMs) }}
              </div>
            </div>
          </div>
        </div>
        <div v-if="rows.length === 0" class="text-sm text-gray-500 py-6 text-center">
          暂无记录。完成 AI 过滤或打招呼后，将按实际 usage 显示。
        </div>
        <div v-else class="overflow-auto max-h-80">
          <UTable :data="rows" :columns="columns">
            <template #time-cell="{ row }">
              {{ formatTime(row.original.time) }}
            </template>
            <template #kind-cell="{ row }">
              <UBadge
                :color="row.original.kind === 'aiFiltering' ? 'info' : 'success'"
                variant="subtle"
                size="sm"
              >
                {{ kindLabel[row.original.kind] }}
              </UBadge>
            </template>
            <template #jobTitle-cell="{ row }">
              <span class="line-clamp-1" :title="row.original.jobTitle">
                {{ row.original.jobTitle || '—' }}
              </span>
            </template>
            <template #model-cell="{ row }">
              <span class="line-clamp-1" :title="row.original.modelName || row.original.model">
                {{ row.original.modelName || row.original.model }}
              </span>
            </template>
            <template #promptTokens-cell="{ row }">
              {{ formatTokens(row.original.promptTokens) }}
            </template>
            <template #completionTokens-cell="{ row }">
              {{ formatTokens(row.original.completionTokens) }}
            </template>
            <template #totalTokens-cell="{ row }">
              {{ formatTokens(row.original.totalTokens) }}
            </template>
            <template #durationMs-cell="{ row }">
              {{ formatDuration(row.original.durationMs) }}
            </template>
          </UTable>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex flex-wrap justify-end gap-2">
        <UButton color="neutral" variant="outline" @click="open = false">关闭</UButton>
        <UButton color="success" variant="outline" :disabled="!canExport" @click="exportCsv">
          导出 CSV
        </UButton>
        <UButton color="success" variant="outline" :disabled="!canExport" @click="exportJsonFile">
          导出 JSON
        </UButton>
        <UButton
          color="error"
          variant="soft"
          :loading="clearing"
          :disabled="helper.tokenUsage.records.value.length === 0"
          @click="clearRecords"
        >
          清空记录
        </UButton>
      </div>
    </template>
  </UModal>
</template>
