import type { FormDataRange, FormSalaryRangeInput } from '@/types/formData'

export function rangeMatchFormat(value: FormDataRange, unit: string): string {
  return `${value[0]} - ${value[1]} ${unit} ${value[2] ? '严格' : '宽松'}`
}

export function rangeMatch(rangeText: string, expected: FormDataRange): boolean {
  const match = String(rangeText || '').match(/(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?/)
  if (!match) return false

  let [start, end, strict] = expected
  if (start > end) [start, end] = [end, start]
  let inputStart = Number(match[1])
  let inputEnd = Number(match[2] ?? match[1])
  if (!Number.isFinite(inputStart) || !Number.isFinite(inputEnd)) return false
  if (inputStart > inputEnd) [inputStart, inputEnd] = [inputEnd, inputStart]

  return strict
    ? start <= inputStart && inputEnd <= end
    : Math.max(inputStart, start) <= Math.min(inputEnd, end)
}

const SALARY_UNITS = [
  { key: 'H', unit: '元/时', pattern: /\/时/ },
  { key: 'D', unit: '元/天', pattern: /\/天|\/日/ },
  { key: 'M', unit: '元/月', pattern: /\/月/ },
  { key: 'K', unit: 'K', pattern: /K/i },
] as const

export type SalaryUnitKey = (typeof SALARY_UNITS)[number]['key']

export function matchSalaryUnit(text: string): { key: SalaryUnitKey; unit: string } | null {
  return SALARY_UNITS.find((item) => item.pattern.test(text)) ?? null
}

export function matchSalaryRange(
  text: string,
  conf: Pick<FormSalaryRangeInput, 'value' | 'advancedValue'>,
): { matched: boolean; expected?: string } {
  const unit = matchSalaryUnit(text)
  // 面议等无法解析的薪资不做过滤。
  if (!unit) return { matched: true }

  const expected = unit.key === 'K' ? conf.value : conf.advancedValue[unit.key]
  const matched = rangeMatch(text, expected)
  return {
    matched,
    expected: matched ? undefined : rangeMatchFormat(expected, unit.unit),
  }
}
