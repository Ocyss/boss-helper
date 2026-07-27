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
