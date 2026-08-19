<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import {
  clearPersistentLogs,
  getPersistentLogs,
  LOG_EVENT_NAME,
  MAX_PERSISTED_LOGS,
  type PersistentLogEntry,
  type PersistentLogLevel,
} from '@/utils/persistentLogs'

const PAGE_SIZE = 100
const logs = ref<PersistentLogEntry[]>([])
const loading = ref(false)
const page = ref(0)

const totalPages = computed(() => Math.max(1, Math.ceil(logs.value.length / PAGE_SIZE)))
const visibleLogs = computed(() => {
  const start = page.value * PAGE_SIZE
  return logs.value.slice(start, start + PAGE_SIZE)
})

const levelNames: Record<PersistentLogLevel, string> = {
  debug: '调试',
  info: '信息',
  success: '成功',
  warn: '提醒',
  error: '错误',
}

const levelColors = {
  debug: 'neutral',
  info: 'info',
  success: 'success',
  warn: 'warning',
  error: 'error',
} as const satisfies Record<PersistentLogLevel, string>

async function refreshLogs(resetPage = true) {
  loading.value = true
  try {
    logs.value = await getPersistentLogs()
    if (resetPage || page.value >= totalPages.value) {
      page.value = 0
    }
  } finally {
    loading.value = false
  }
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false })
}

function formatData(data: unknown) {
  return JSON.stringify(data, null, 2)
}

function createFileName(extension: 'jsonl' | 'txt') {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .replace('Z', '')
  return `boss-helper-audit-${timestamp}.${extension}`
}

function downloadFile(content: string, type: string, extension: 'jsonl' | 'txt') {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = createFileName(extension)
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function exportJsonl() {
  const content = logs.value.map((entry) => JSON.stringify(entry)).join('\n')
  downloadFile(content, 'application/x-ndjson;charset=utf-8', 'jsonl')
}

function exportTxt() {
  const separator = '\n' + '='.repeat(80) + '\n'
  const content = logs.value
    .map((entry) => {
      const job = entry.job
        ? `岗位：${entry.job.company ? `${entry.job.company} · ` : ''}${entry.job.name}`
        : undefined
      return [
        `[${formatTime(entry.createdAt)}] [${levelNames[entry.level]}] ${entry.title}`,
        job,
        entry.message ? `说明：${entry.message}` : undefined,
        entry.data === undefined ? undefined : `详情：\n${formatData(entry.data)}`,
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join(separator)
  // UTF-8 BOM 让 Windows 文本编辑器也能正确识别中文；JSONL 则保持标准 UTF-8 无 BOM。
  downloadFile(`\uFEFF${content}`, 'text/plain;charset=utf-8', 'txt')
}

async function clearLogs() {
  if (!logs.value.length || !window.confirm('确定清空全部审计日志吗？此操作无法恢复。')) {
    return
  }
  loading.value = true
  try {
    await clearPersistentLogs()
    logs.value = []
    page.value = 0
  } finally {
    loading.value = false
  }
}

function showNewerPage() {
  if (page.value > 0) page.value--
}

function showOlderPage() {
  if (page.value < totalPages.value - 1) page.value++
}

function handleLogWritten() {
  void refreshLogs()
}

onMounted(() => {
  void refreshLogs()
  window.addEventListener(LOG_EVENT_NAME, handleLogWritten)
})

onBeforeUnmount(() => {
  window.removeEventListener(LOG_EVENT_NAME, handleLogWritten)
})
</script>

<template>
  <section class="mt-3 space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 class="text-base font-semibold">投递审计日志</h3>
        <p class="text-xs text-muted">
          最新日志在上方；每页 {{ PAGE_SIZE }} 条，最多保留
          {{ MAX_PERSISTED_LOGS }} 条，超量自动删除最旧记录。
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <UButton
          size="xs"
          variant="outline"
          color="neutral"
          :loading="loading"
          @click="refreshLogs"
        >
          刷新
        </UButton>
        <UButton
          size="xs"
          variant="outline"
          color="neutral"
          :disabled="!logs.length"
          @click="exportJsonl"
        >
          导出 JSONL
        </UButton>
        <UButton
          size="xs"
          variant="outline"
          color="neutral"
          :disabled="!logs.length"
          @click="exportTxt"
        >
          导出 TXT
        </UButton>
        <UButton
          size="xs"
          variant="outline"
          color="error"
          :disabled="!logs.length"
          @click="clearLogs"
        >
          清空日志
        </UButton>
      </div>
    </div>

    <div
      v-if="!loading && visibleLogs.length === 0"
      class="rounded-md border border-default p-4 text-sm text-muted"
    >
      暂无日志。开始投递后会自动记录岗位信息、JD、筛选结果和投递详情。
    </div>

    <div v-else class="space-y-3">
      <div
        class="h-[72vh] max-h-[48rem] overflow-y-auto rounded-md border border-default bg-muted/20 p-3"
      >
        <div class="space-y-2">
          <details
            v-for="log in visibleLogs"
            :key="log.id"
            class="rounded-md border border-default bg-elevated p-3"
          >
            <summary class="cursor-pointer list-none">
              <div class="flex flex-wrap items-center gap-2 pr-3">
                <UBadge :color="levelColors[log.level]" variant="subtle" size="xs">
                  {{ levelNames[log.level] }}
                </UBadge>
                <span class="font-medium">{{ log.title }}</span>
                <span v-if="log.job" class="text-sm text-muted">
                  {{ log.job.company ? `${log.job.company} · ` : '' }}{{ log.job.name }}
                </span>
                <time class="ml-auto text-xs text-muted">{{ formatTime(log.createdAt) }}</time>
                <span
                  v-if="log.message || log.data !== undefined || log.job?.link"
                  class="text-xs text-muted"
                >
                  查看详情
                </span>
              </div>
            </summary>

            <div class="mt-3 space-y-2 border-t border-default pt-3">
              <p v-if="log.message" class="text-sm text-muted">{{ log.message }}</p>
              <a
                v-if="log.job?.link"
                :href="log.job.link"
                target="_blank"
                rel="noreferrer"
                class="text-sm text-primary underline"
              >
                打开岗位页面
              </a>
              <pre
                v-if="log.data !== undefined"
                class="max-h-96 overflow-auto rounded bg-muted p-3 text-xs leading-5 whitespace-pre-wrap break-all"
                >{{ formatData(log.data) }}</pre>
            </div>
          </details>
        </div>
      </div>

      <div v-if="logs.length > PAGE_SIZE" class="flex items-center justify-between gap-2">
        <UButton
          size="sm"
          color="neutral"
          variant="outline"
          :disabled="page === 0"
          @click="showNewerPage"
        >
          更新的日志
        </UButton>
        <span class="text-xs text-muted"
          >第 {{ page + 1 }} / {{ totalPages }} 页，共 {{ logs.length }} 条</span
        >
        <UButton
          size="sm"
          color="neutral"
          variant="outline"
          :disabled="page >= totalPages - 1"
          @click="showOlderPage"
        >
          更早的日志
        </UButton>
      </div>
    </div>
  </section>
</template>
