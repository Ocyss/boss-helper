import { FormDataRange } from '@/types/formData'
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

export function parseFiltering(content: string) {
  interface Item {
    reason: string
    score: number
  }

  const res = parseGptJson<{
    negative?: Item[] | string
    positive?: Item[] | string
    rating?: number
    message?: string
  }>(content)

  const toItems = (val: any): Item[] => {
    if (Array.isArray(val)) return val
    if (typeof val === 'string' && val) return [{ reason: val, score: 0 }]
    return []
  }

  const hand = (acc: { score: number; reason: string }, curr: Item) => ({
    score: acc.score + (Math.abs(Number(curr.score)) || 0),
    reason: `${acc.reason}\n${curr.reason ?? ''}/(${Math.abs(Number(curr.score)) || 0}分)`,
  })

  const negItems = toItems(res?.negative)
  const posItems = toItems(res?.positive)

  const neg = negItems.reduce(hand, { score: 0, reason: '' })
  const pos = posItems.reduce(hand, { score: 0, reason: '' })

  const rating = res?.rating ?? pos.score - neg.score

  const message = res?.message ?? `分数${rating}\n消极:${neg.reason}\n\n积极:${pos.reason}`

  return { res, message, rating, data: { negative: neg, positive: pos } }
}
