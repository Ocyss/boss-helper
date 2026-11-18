<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { computed, onMounted, ref, watch } from 'vue'
import { browser } from 'wxt/browser'

import { useAccounts } from '@/composables/useAccounts'
import type { TaskResult } from '@/composables/useApplying/type'
import { counter } from '@/message'

type Entries = Record<string, { result: TaskResult; savedAt: number }>
type Entry = Entries[string] & { key: string }
const { accounts, activeAccount, init } = useAccounts()
const account = ref(activeAccount.value)
const entries = ref<Entries>({})
const selected = ref(new Set<string>())
const search = ref('')
const period = ref('all')
const start = ref('')
const end = ref('')
const loading = ref(false)
const removing = ref(false)
const error = ref('')
const usedBytes = ref<number>()
const quotaBytes = ref<number>()
const usage = ref('尚未读取')
function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}
const usageRatio = computed(() =>
  usedBytes.value !== undefined && quotaBytes.value
    ? `${((usedBytes.value / quotaBytes.value) * 100).toFixed(1)}%`
    : '当前浏览器未提供配额',
)
const now = ref(Date.now())
const toast = useToast()
let revision = 0
const periods = [
  { label: '全部时间', value: 'all' },
  { label: '最近24小时', value: '1' },
  { label: '最近7天', value: '7' },
  { label: '最近30天', value: '30' },
  { label: '7天前', value: 'before7' },
  { label: '30天前', value: 'before30' },
  { label: '自定义日期', value: 'custom' },
]
const invalidDates = computed(() => Boolean(start.value && end.value && start.value > end.value))
const rows = computed<Entry[]>(() => {
  const query = search.value.trim().toLowerCase()
  const day = 86400000
  const from = start.value ? new Date(`${start.value}T00:00:00`).getTime() : -Infinity
  const until = end.value ? new Date(`${end.value}T00:00:00`) : null
  until?.setDate(until.getDate() + 1)
  return Object.entries(entries.value)
    .map(([key, entry]) => ({ key, ...entry }))
    .filter((entry) => {
      if (
        query &&
        ![entry.key, entry.result.status, entry.result.msg, entry.result.reason].some((value) =>
          value?.toLowerCase().includes(query),
        )
      )
        return false
      if (period.value === 'custom') {
        return (
          !invalidDates.value &&
          entry.savedAt >= from &&
          entry.savedAt < (until?.getTime() ?? Infinity)
        )
      }
      if (period.value.startsWith('before')) {
        return entry.savedAt < now.value - Number(period.value.slice(6)) * day
      }
      return period.value === 'all' || entry.savedAt >= now.value - Number(period.value) * day
    })
    .sort((a, b) => b.savedAt - a.savedAt)
})
const allSelected = computed(
  () => rows.value.length > 0 && rows.value.every((row) => selected.value.has(row.key)),
)
const columns: TableColumn<Entry>[] = [
  {
    id: 'select',
    header: '',
    meta: { class: { th: 'w-12', td: 'w-12' } },
  },
  {
    accessorKey: 'key',
    header: '职位 Key',
    meta: { class: { th: 'w-48', td: 'w-48' } },
  },
  { id: 'result', header: '处理结果' },
  {
    accessorKey: 'savedAt',
    header: '缓存时间',
    meta: { class: { th: 'w-48', td: 'w-48' } },
  },
]
function clearSelection() {
  selected.value = new Set()
}
function toggle(key: string, checked: boolean | 'indeterminate') {
  if (checked === true) selected.value.add(key)
  else selected.value.delete(key)
}
function toggleAll(checked: boolean | 'indeterminate') {
  selected.value = new Set(checked === true ? rows.value.map((row) => row.key) : [])
}
watch([search, period, start, end], clearSelection, { flush: 'sync' })
function storageKey(value: string) {
  return `local:job-result-cache:${encodeURIComponent(value)}`
}
async function readUsage() {
  try {
    const local = browser.storage.local
    if (typeof local.getBytesInUse !== 'function') {
      usage.value = '当前浏览器不支持读取存储占用'
      return
    }
    const bytes = await local.getBytesInUse(null)
    usedBytes.value = bytes
    quotaBytes.value = (local as typeof local & { QUOTA_BYTES?: number }).QUOTA_BYTES
    usage.value = formatBytes(bytes)
  } catch {
    usage.value = '无法读取存储占用'
  }
}
async function refresh() {
  const request = ++revision
  const key = storageKey(account.value)
  clearSelection()
  entries.value = {}
  loading.value = true
  error.value = ''
  now.value = Date.now()
  try {
    const data = await counter.storageGet<Entries>(key, {})
    if (request === revision) entries.value = data
    await readUsage()
  } catch (e) {
    if (request === revision) error.value = String(e)
  } finally {
    if (request === revision) loading.value = false
  }
}
watch(account, () => void refresh(), { flush: 'sync' })
async function removeSelected() {
  if (loading.value || removing.value || !selected.value.size) return
  const keys = [...selected.value]
  const target = account.value
  if (
    !window.confirm(
      `请先停止投递任务。确定移除选中的 ${keys.length} 条职位缓存？移除后请回到投递页面手动刷新，避免缓存不同步。`,
    )
  )
    return
  removing.value = true
  error.value = ''
  try {
    const key = storageKey(target)
    const latest = await counter.storageGet<Entries>(key, {})
    for (const selectedKey of keys) delete latest[selectedKey]
    await counter.storageSet(key, latest)
    toast.add({
      title: '选中的职位缓存已移除',
      color: 'success',
      description: '回到投递页面记得手动刷新，避免缓存不同步',
    })
    await refresh()
  } catch (e) {
    error.value = String(e)
  } finally {
    removing.value = false
  }
}
onMounted(async () => {
  try {
    await init()
    account.value = activeAccount.value
    await refresh()
  } catch (e) {
    error.value = String(e)
  }
})
</script>

<template>
  <UCard>
    <template #header><h2 class="font-semibold">职位结果缓存</h2></template>
    <div class="space-y-4">
      <dl class="grid grid-cols-1 gap-5 border-b border-default pb-5 sm:grid-cols-3">
        <div>
          <dt class="text-xs text-muted">插件本地存储</dt>
          <dd class="mt-1 text-2xl font-semibold tabular-nums">{{ usage }}</dd>
          <p class="mt-1 text-xs text-muted">包含配置、缓存等全部本地数据</p>
        </div>
        <div>
          <dt class="text-xs text-muted">存储配额占用</dt>
          <dd class="mt-1 text-2xl font-semibold tabular-nums">{{ usageRatio }}</dd>
          <p class="mt-1 text-xs text-muted">
            {{ quotaBytes ? `配额 ${formatBytes(quotaBytes)}` : '无法计算时不显示估算比例' }}
          </p>
        </div>
        <div>
          <dt class="text-xs text-muted">当前账号结果缓存</dt>
          <dd class="mt-1 text-2xl font-semibold tabular-nums">
            {{ Object.keys(entries).length.toLocaleString() }} 条
          </dd>
          <p class="mt-1 text-xs text-muted">不包含公司及 HR 去重记录</p>
        </div>
      </dl>
      <p class="text-sm text-warning">
        移除前请先停止投递任务；移除后请回到投递页面手动刷新，避免缓存不同步。
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <USelect
          v-model="account"
          :items="accounts"
          :disabled="loading || removing"
          aria-label="缓存所属账号"
          class="w-44"
        />
        <UInput
          v-model="search"
          placeholder="搜索 Key / 处理结果"
          aria-label="搜索缓存"
          class="w-56"
        />
        <USelect v-model="period" :items="periods" aria-label="缓存时间范围" class="w-40" />
        <UButton
          color="neutral"
          variant="outline"
          :loading="loading"
          :disabled="removing"
          @click="refresh"
          >刷新</UButton
        >
        <UButton
          color="error"
          variant="soft"
          :loading="removing"
          :disabled="loading || !selected.size"
          @click="removeSelected"
          >移除选中（{{ selected.size }}）</UButton
        >
      </div>
      <div v-if="period === 'custom'" class="flex flex-wrap items-center gap-2">
        <label class="flex items-center gap-2 text-sm"
          >起始日期<UInput v-model="start" type="date" aria-label="起始日期"
        /></label>
        <label class="flex items-center gap-2 text-sm"
          >结束日期<UInput v-model="end" type="date" aria-label="结束日期"
        /></label>
        <span class="text-xs text-muted">包含起止日期，按本地时间；留空表示不限。</span>
        <span v-if="invalidDates" class="text-sm text-error">起始日期不能晚于结束日期</span>
      </div>
      <p v-if="error" role="alert" class="text-sm text-error">操作失败：{{ error }}</p>
      <p class="text-sm text-muted">
        共 {{ Object.keys(entries).length }} 条，筛选结果
        {{ rows.length }} 条；表头勾选全部筛选结果。
      </p>
      <UTable
        :data="rows"
        :columns="columns"
        :get-row-id="(row: Entry) => row.key"
        :virtualize="{ estimateSize: 56, overscan: 10 }"
        :loading="loading"
        sticky
        class="h-120 overflow-auto overscroll-contain"
        :ui="{
          base: 'table-fixed w-full',
          thead: 'bg-default',
          tbody: 'bg-default',
          td: 'align-middle whitespace-nowrap overflow-hidden',
        }"
        empty="暂无符合条件的职位缓存"
      >
        <template #select-header>
          <UCheckbox
            :model-value="allSelected ? true : selected.size ? 'indeterminate' : false"
            :disabled="!rows.length || removing"
            aria-label="选择全部筛选结果"
            @update:model-value="toggleAll"
          />
        </template>
        <template #select-cell="{ row }">
          <UCheckbox
            :model-value="selected.has(row.original.key)"
            :disabled="removing"
            :aria-label="`选择 ${row.original.key}`"
            @update:model-value="toggle(row.original.key, $event)"
          />
        </template>
        <template #key-cell="{ row }"
          ><div class="truncate" :title="row.original.key">{{ row.original.key }}</div></template
        >
        <template #result-cell="{ row }">
          <div
            class="truncate"
            :title="
              [row.original.result.status, row.original.result.msg, row.original.result.reason]
                .filter(Boolean)
                .join(' · ')
            "
          >
            {{
              [row.original.result.status, row.original.result.msg, row.original.result.reason]
                .filter(Boolean)
                .join(' · ') || '—'
            }}
          </div>
        </template>
        <template #savedAt-cell="{ row }">{{
          new Date(row.original.savedAt).toLocaleString()
        }}</template>
      </UTable>
    </div>
  </UCard>
</template>
