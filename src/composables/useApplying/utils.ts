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

  let inputStart = Number.parseFloat(m[1] ?? '')
  let inputEnd = Number.parseFloat(m[2] ? m[2] : (m[1] ?? ''))
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

export interface GreetingResult {
  greeting: string
  reason?: string
  abilities?: string[]
  error?: string
}

export function parseGreeting(content: string, json = true): GreetingResult {
  if (!json) {
    if (!content.trim()) throw new Error('AI招呼语为空')
    return { greeting: content }
  }

  const text = content.trim()
  const fenced = text.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/)
  let result: unknown
  try {
    result = JSON.parse(fenced && fenced[1] ? fenced[1] : text)
  } catch {
    throw new Error('AI招呼语不是有效的JSON')
  }
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error('AI招呼语JSON必须为对象')
  }
  const data = result as Record<string, unknown>
  for (const key of ['greeting', 'reason', 'error'] as const) {
    if (key in data && typeof data[key] !== 'string') {
      throw new Error(`AI招呼语字段 ${key} 必须为字符串`)
    }
  }
  if (
    'abilities' in data &&
    (!Array.isArray(data.abilities) ||
      !data.abilities.every((ability) => typeof ability === 'string'))
  ) {
    throw new Error('AI招呼语字段 abilities 必须为字符串数组')
  }
  const rejected = typeof data.error === 'string' && Boolean(data.error.trim())
  if (!rejected && (typeof data.greeting !== 'string' || !data.greeting.trim())) {
    throw new Error('AI招呼语字段 greeting 必须为非空字符串')
  }
  return {
    greeting: typeof data.greeting === 'string' ? data.greeting : '',
    ...(typeof data.reason === 'string' ? { reason: data.reason } : {}),
    ...(Array.isArray(data.abilities) ? { abilities: data.abilities as string[] } : {}),
    ...(typeof data.error === 'string' ? { error: data.error } : {}),
  }
}

export function parseFiltering(content: string) {
  interface Item {
    reason: string
    score: number
  }
  const res = parseGptJson<{
    negative: Item[]
    positive: Item[]
  }>(content)

  const hand = (acc: { score: number; reason: string }, curr: Item) => ({
    score: acc.score + Math.abs(curr.score),
    reason: `${acc.reason}\n${curr.reason}/(${Math.abs(curr.score)}分)`,
  })
  const data = {
    negative: res?.negative?.reduce(hand, { score: 0, reason: '' }),
    positive: res?.positive?.reduce(hand, { score: 0, reason: '' }),
  }

  const rating = (data?.positive?.score ?? 0) - (data?.negative?.score ?? 0)

  const message = `分数${rating}\n消极:${data?.negative?.reason}\n\n积极:${data?.positive?.reason}`

  return { res, message, rating, data }
}
