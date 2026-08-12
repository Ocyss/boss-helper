import { counter } from '@/message'
import type { FormDataRange } from '@/types/formData'
import { parseGptJson } from '@/utils/ai'

export function rangeMatchFormat(v: FormDataRange, unit: string): string {
  return `${v[0]} - ${v[1]} ${unit} ${v[2] ? '严格' : '宽松'}`
}

// 匹配范围
export function rangeMatch(rangeStr: string, form: FormDataRange): boolean {
  if (!rangeStr) return false
  let [start, end, mode] = form // mode: true=严格(包含)，false=宽松(重叠)
  if (start > end) {
    ;[start, end] = [end, start]
  }
  const re = /(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?/
  const m = String(rangeStr).match(re)
  if (!m) return false

  let inputStart = Number.parseFloat(m[1])
  let inputEnd = Number.parseFloat(m[2] != null ? m[2] : m[1])
  if (!Number.isFinite(inputStart) || !Number.isFinite(inputEnd)) return false

  if (inputStart > inputEnd) {
    ;[inputStart, inputEnd] = [inputEnd, inputStart]
  }
  // console.log({
  //     inputStart,inputEnd,start,end
  // })
  if (mode) {
    // 严格：职位范围(input) 完全覆盖 目标范围(form)
    return start <= inputStart && inputEnd <= end
  } else {
    // 宽松：任意重叠（闭区间）
    return Math.max(inputStart, start) <= Math.min(inputEnd, end)
  }
}

export interface FilteringItem {
  reason: string
  score: number
}

export interface FilteringResponse {
  negative: FilteringItem[]
  positive: FilteringItem[]
}

export class FilteringResponseError extends Error {
  override name = 'FilteringResponseError'
}

function parseFilteringItems(value: unknown, field: keyof FilteringResponse): FilteringItem[] {
  if (!Array.isArray(value)) {
    throw new FilteringResponseError(`AI 筛选结果缺少 ${field} 数组`)
  }

  return value.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new FilteringResponseError(`AI 筛选结果 ${field}[${index}] 不是对象`)
    }

    const reason = 'reason' in item && typeof item.reason === 'string' ? item.reason.trim() : ''
    const score = 'score' in item ? item.score : undefined
    if (!reason) {
      throw new FilteringResponseError(`AI 筛选结果 ${field}[${index}] 缺少理由`)
    }
    if (typeof score !== 'number' || !Number.isInteger(score) || score <= 0 || score > 100) {
      throw new FilteringResponseError(
        `AI 筛选结果 ${field}[${index}] 的分数必须是 1 至 100 的整数`,
      )
    }

    return { reason, score }
  })
}

export function parseFiltering(content: string) {
  const parsed: unknown = parseGptJson(content)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new FilteringResponseError('AI 筛选未返回有效 JSON 对象')
  }

  const res: FilteringResponse = {
    negative: parseFilteringItems('negative' in parsed ? parsed.negative : undefined, 'negative'),
    positive: parseFilteringItems('positive' in parsed ? parsed.positive : undefined, 'positive'),
  }
  if (res.negative.length + res.positive.length === 0) {
    throw new FilteringResponseError('AI 筛选未返回任何评分项')
  }

  const hand = (acc: { score: number; reason: string }, curr: FilteringItem) => ({
    score: acc.score + Math.abs(curr.score),
    reason: `${acc.reason}\n${curr.reason}/(${Math.abs(curr.score)}分)`,
  })
  const data = {
    negative: res.negative.reduce(hand, { score: 0, reason: '' }),
    positive: res.positive.reduce(hand, { score: 0, reason: '' }),
  }

  const rating = data.positive.score - data.negative.score

  const message = `分数${rating}\n消极:${data.negative.reason}\n\n积极:${data.positive.reason}`

  return { res, message, rating, data }
}

export async function loadSet(key: string, uid: string): Promise<Map<string, number>> {
  const raw = await counter.storageGet<Record<string, string[] | Record<string, number>>>(key, {})

  const map = new Map<string, number>()

  const value = raw[uid]

  const entries = Array.isArray(value)
    ? value.map((id) => [id, 0] as const)
    : Object.entries(value ?? {})

  for (const [id, time] of entries) {
    map.set(id, time)
  }

  return map
}

export async function saveSet(key: string, uid: string, map: Map<string, number>, EXPIRE = 0) {
  const now = Date.now()
  const expire = now - EXPIRE
  if (EXPIRE > 0) {
    // GC
    for (const [id, time] of map) {
      if (time < expire) {
        map.delete(id)
      }
    }
  }

  const old = await counter.storageGet(key, {})

  await counter.storageSet(key, {
    ...old,
    [uid]: Object.fromEntries(map),
  })
}
