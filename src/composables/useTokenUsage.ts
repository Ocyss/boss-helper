import { ref } from 'vue'

import { counter } from '@/message'
import type {
  TokenUsageExportPayload,
  TokenUsageKind,
  TokenUsageKindSummary,
  TokenUsageModelSummary,
  TokenUsageRecord,
  TokenUsageSummary,
  TokenUsageWindow,
} from '@/types/tokenUsage'
import { getUuid } from '@/utils'
import { jsonClone } from '@/utils/deepmerge'
import { logger } from '@/utils/logger'

export const tokenUsageKey = 'local:token-usage'

export const TOKEN_USAGE_WINDOW_LABEL: Record<TokenUsageWindow, string> = {
  1: '当天',
  3: '3天',
  7: '7天',
}

export const TOKEN_USAGE_KIND_LABEL: Record<TokenUsageKind, string> = {
  aiFiltering: 'AI过滤',
  aiGreeting: 'AI打招呼',
}

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000
const MAX_RECORDS = 5000

function emptyKindSummary(): TokenUsageKindSummary {
  return {
    calls: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    avgDurationMs: null,
  }
}

function startOfLocalDay(date = new Date()): Date {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  return start
}

function avgDuration(sum: number, count: number): number | null {
  return count > 0 ? Math.round(sum / count) : null
}

function modelDisplayName(record: TokenUsageRecord): string {
  return record.modelName?.trim() || record.model
}

function addUsage(
  target: TokenUsageKindSummary,
  prompt: number,
  completion: number,
  total: number,
) {
  target.calls += 1
  target.promptTokens += prompt
  target.completionTokens += completion
  target.totalTokens += total
}

export function tokenUsageWindowStart(days: TokenUsageWindow, now = Date.now()): number {
  const start = startOfLocalDay(new Date(now))
  start.setDate(start.getDate() - (days - 1))
  return start.getTime()
}

export function summarizeTokenUsage(records: TokenUsageRecord[]): TokenUsageSummary {
  const summary: TokenUsageSummary = {
    ...emptyKindSummary(),
    byKind: {
      aiFiltering: emptyKindSummary(),
      aiGreeting: emptyKindSummary(),
    },
    byModel: [],
  }
  let durationSum = 0
  let durationCount = 0
  const kindDuration: Record<TokenUsageKind, { sum: number; count: number }> = {
    aiFiltering: { sum: 0, count: 0 },
    aiGreeting: { sum: 0, count: 0 },
  }
  const modelMap = new Map<string, TokenUsageModelSummary>()
  const modelDuration = new Map<string, { sum: number; count: number }>()

  for (const record of records) {
    const prompt = record.promptTokens ?? 0
    const completion = record.completionTokens ?? 0
    const total = record.totalTokens ?? prompt + completion
    addUsage(summary, prompt, completion, total)
    addUsage(summary.byKind[record.kind], prompt, completion, total)

    const modelName = modelDisplayName(record)
    const modelKey = `${modelName}\0${record.model}`
    let modelItem = modelMap.get(modelKey)
    if (!modelItem) {
      modelItem = {
        model: record.model,
        modelName,
        ...emptyKindSummary(),
      }
      modelMap.set(modelKey, modelItem)
      modelDuration.set(modelKey, { sum: 0, count: 0 })
    }
    addUsage(modelItem, prompt, completion, total)

    if (typeof record.durationMs === 'number') {
      durationSum += record.durationMs
      durationCount += 1
      kindDuration[record.kind].sum += record.durationMs
      kindDuration[record.kind].count += 1
      const modelDur = modelDuration.get(modelKey)
      if (modelDur) {
        modelDur.sum += record.durationMs
        modelDur.count += 1
      }
    }
  }

  summary.avgDurationMs = avgDuration(durationSum, durationCount)
  for (const kind of Object.keys(kindDuration) as TokenUsageKind[]) {
    const item = kindDuration[kind]
    summary.byKind[kind].avgDurationMs = avgDuration(item.sum, item.count)
  }
  for (const [key, item] of modelMap) {
    const dur = modelDuration.get(key)
    item.avgDurationMs = avgDuration(dur?.sum ?? 0, dur?.count ?? 0)
  }
  summary.byModel = [...modelMap.values()].sort(
    (a, b) =>
      b.totalTokens - a.totalTokens ||
      b.calls - a.calls ||
      a.modelName.localeCompare(b.modelName, 'zh'),
  )

  return summary
}

export function tokenUsageExportBasename(windowDays: TokenUsageWindow, now = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `boss-helper-token-usage-${windowDays}d-${year}${month}${day}`
}

function csvCell(value: string | number | undefined): string {
  if (value == null) return ''
  const text = String(value)
  if (/[",\r\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`
  return text
}

function usageCsvRow(name: string, extra: string | undefined, item: TokenUsageKindSummary): string {
  return [
    csvCell(name),
    ...(extra === undefined ? [] : [csvCell(extra)]),
    csvCell(item.calls),
    csvCell(item.promptTokens),
    csvCell(item.completionTokens),
    csvCell(item.totalTokens),
    csvCell(item.avgDurationMs ?? undefined),
  ].join(',')
}

export function buildTokenUsageCsv(
  records: TokenUsageRecord[],
  windowDays: TokenUsageWindow,
): string {
  const summary = summarizeTokenUsage(records)
  const usageHeader = ['调用次数', 'Input', 'Output', 'Total', '平均耗时(ms)']
  const lines = [
    '# 窗口汇总',
    ['窗口', '调用次数', 'Input', 'Output', 'Total', '平均耗时(ms)'].join(','),
    [
      csvCell(TOKEN_USAGE_WINDOW_LABEL[windowDays]),
      csvCell(summary.calls),
      csvCell(summary.promptTokens),
      csvCell(summary.completionTokens),
      csvCell(summary.totalTokens),
      csvCell(summary.avgDurationMs ?? undefined),
    ].join(','),
    '',
    '# 按类型',
    ['类型', ...usageHeader].join(','),
    usageCsvRow(TOKEN_USAGE_KIND_LABEL.aiFiltering, undefined, summary.byKind.aiFiltering),
    usageCsvRow(TOKEN_USAGE_KIND_LABEL.aiGreeting, undefined, summary.byKind.aiGreeting),
    '',
    '# 按模型',
    ['模型', '模型ID', ...usageHeader].join(','),
    ...summary.byModel.map((item) => usageCsvRow(item.modelName, item.model, item)),
    '',
    '# 明细',
    ['时间', '类型', '岗位', '模型', 'Input', 'Output', 'Total', '耗时(ms)'].join(','),
    ...records.map((record) =>
      [
        csvCell(new Date(record.time).toLocaleString()),
        csvCell(TOKEN_USAGE_KIND_LABEL[record.kind]),
        csvCell(record.jobTitle),
        csvCell(modelDisplayName(record)),
        csvCell(record.promptTokens),
        csvCell(record.completionTokens),
        csvCell(record.totalTokens),
        csvCell(record.durationMs),
      ].join(','),
    ),
  ]
  // UTF-8 BOM，方便 Excel 正确识别中文
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

export function buildTokenUsageJson(
  records: TokenUsageRecord[],
  windowDays: TokenUsageWindow,
  now = Date.now(),
): string {
  const payload: TokenUsageExportPayload = {
    exportedAt: new Date(now).toISOString(),
    windowDays,
    windowLabel: TOKEN_USAGE_WINDOW_LABEL[windowDays],
    windowStart: tokenUsageWindowStart(windowDays, now),
    windowEnd: now,
    summary: summarizeTokenUsage(records),
    records: jsonClone(records),
  }
  return `${JSON.stringify(payload, null, 2)}\n`
}

export function downloadTokenUsageFile(content: string, filename: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function pruneRecords(list: TokenUsageRecord[], now = Date.now()): TokenUsageRecord[] {
  const cutoff = now - RETENTION_MS
  const kept = list.filter((item) => item.time >= cutoff)
  if (kept.length <= MAX_RECORDS) return kept
  return kept.slice(kept.length - MAX_RECORDS)
}

export function useTokenUsage(getUid: () => string) {
  const records = ref<TokenUsageRecord[]>([])
  const ready = ref(false)
  let loadedUid = ''
  let opChain = Promise.resolve()

  function currentUid() {
    return getUid() || 'anon'
  }

  function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const next = opChain.then(fn, fn)
    opChain = next.then(
      () => undefined,
      (error) => {
        logger.error('Token usage 操作失败', error)
      },
    )
    return next
  }

  async function persist(uid: string, list: TokenUsageRecord[]) {
    const all = await counter.storageGet<Record<string, TokenUsageRecord[]>>(tokenUsageKey, {})
    await counter.storageSet(tokenUsageKey, {
      ...all,
      [uid]: jsonClone(list),
    })
  }

  async function loadUnlocked() {
    const uid = currentUid()
    const all = await counter.storageGet<Record<string, TokenUsageRecord[]>>(tokenUsageKey, {})
    const next = pruneRecords(all[uid] ?? [])
    records.value = next
    loadedUid = uid
    ready.value = true
    if (next.length !== (all[uid]?.length ?? 0)) {
      await persist(uid, next)
    }
  }

  async function ensureLoadedUnlocked() {
    if (!ready.value || loadedUid !== currentUid()) {
      await loadUnlocked()
    }
  }

  function load() {
    return runExclusive(async () => {
      try {
        await loadUnlocked()
      } catch (error) {
        logger.error('Token usage 加载失败', error)
      }
    })
  }

  function record(entry: Omit<TokenUsageRecord, 'id'> & { kind: TokenUsageKind }) {
    return runExclusive(async () => {
      try {
        await ensureLoadedUnlocked()
        const next = pruneRecords([
          ...records.value,
          {
            ...entry,
            id: getUuid(16, 16),
          },
        ])
        records.value = next
        await persist(currentUid(), next)
      } catch (error) {
        logger.error('Token usage 记录失败', error)
      }
    })
  }

  function clear() {
    return runExclusive(async () => {
      try {
        await ensureLoadedUnlocked()
        records.value = []
        await persist(currentUid(), [])
      } catch (error) {
        logger.error('Token usage 清空失败', error)
      }
    })
  }

  return {
    records,
    ready,
    load,
    record,
    clear,
  }
}
