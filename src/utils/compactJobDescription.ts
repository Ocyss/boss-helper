/** 通用 JD 压缩：切段、去重、丢福利/营销噪声。 */

export const DEFAULT_COMPACT_NOISE_WORDS = [
  '五险一金',
  '带薪年假',
  '节日福利',
  '定期体检',
  '团队氛围',
  '发展空间',
  '扁平管理',
  '年终奖',
  '加班补助',
  '餐补',
  '交通补助',
  '通讯补贴',
  '免费零食',
  '下午茶',
  '团建',
  '周末双休',
  '朝九晚六',
  '大小周',
]

const WELFARE_HEADINGS = /^(福利|薪酬福利|职位福利|员工福利|待遇|我们的福利)\s*[:：]?$/
const MARKETING_HEADINGS =
  /^(关于我们|公司介绍|团队介绍|为什么加入|加入我们|你将获得|我们提供)\s*[:：]?$/

export type CompactJobDescriptionOptions = {
  noiseWords?: string[]
}

export function uniqueStringList(values: string[] | undefined): string[] {
  if (!values?.length) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of values) {
    const value = raw.trim()
    if (!value) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(value)
  }
  return result
}

function splitSentences(text: string): string[] {
  return text
    .split(/[\n\r]+|(?<=[。！？；;])/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function isHeading(line: string, pattern: RegExp): boolean {
  return pattern.test(line.replace(/[#*-\s]/g, ''))
}

function isNoiseLine(line: string, noiseWords: string[]): boolean {
  if (!noiseWords.some((word) => word && line.includes(word))) return false
  return line.length <= 40 || noiseWords.filter((word) => word && line.includes(word)).length >= 2
}

export function compactJobDescription(
  text: string | undefined,
  options: CompactJobDescriptionOptions = {},
): string {
  if (!text?.trim()) return ''
  const noiseWords = (options.noiseWords ?? DEFAULT_COMPACT_NOISE_WORDS).filter(Boolean)
  const seen = new Set<string>()
  const kept: string[] = []
  let dropping = false

  for (const sentence of splitSentences(text)) {
    if (isHeading(sentence, WELFARE_HEADINGS) || isHeading(sentence, MARKETING_HEADINGS)) {
      dropping = true
      continue
    }
    if (dropping) {
      if (
        sentence.length <= 24 &&
        /[:：]$/.test(sentence) &&
        !isHeading(sentence, WELFARE_HEADINGS)
      ) {
        dropping = false
      } else {
        continue
      }
    }
    if (isNoiseLine(sentence, noiseWords)) continue
    const key = sentence.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    kept.push(sentence)
  }

  return kept.join('\n')
}
