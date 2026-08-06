import { counter } from '@/message'
import { FormDataRange } from '@/types/formData'
import { parseGptJson } from '@/utils/ai'
import { v2StorageKey } from '@/utils/namespace'

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

type FilteringVerdict = 'accept' | 'review' | 'reject'

/**
 * 将模型明确给出的有限结论别名归一化；未知值统一按人工复核处理，避免放宽通过条件。
 * @param value 模型返回的 verdict 字段
 * @returns 内部统一结论
 */
function normalizeFilteringVerdict(value: unknown): FilteringVerdict {
  const verdict = (typeof value === 'string' ? value : '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/gu, '')
  if (
    [
      'accept',
      'accepted',
      'approve',
      'approved',
      'pass',
      'passed',
      'yes',
      '通过',
      '接受',
      '同意',
      '推荐',
    ].includes(verdict)
  ) {
    return 'accept'
  }
  if (['reject', 'rejected', 'fail', 'failed', 'no', '否决', '拒绝', '不通过'].includes(verdict)) {
    return 'reject'
  }
  return 'review'
}

/**
 * 解析 AI 筛选结构化结果并生成脱敏原因；证据或结论不明确时 fail-closed。
 * @param content 模型返回的 JSON 文本
 * @returns 评分、结论和用户可见的短原因
 */
export function parseFiltering(content: string) {
  interface Item {
    reason: string
    score: number
  }
  const res = parseGptJson<{
    negative: Item[]
    positive: Item[]
    finalScore?: number
    verdict?: string
    veto?: boolean
  }>(content)

  // AI 输出异常时必须拒绝通过，避免解析失败导致误投递。
  if (
    !res ||
    typeof res !== 'object' ||
    !Array.isArray(res.negative) ||
    !Array.isArray(res.positive) ||
    !Number.isFinite(res.finalScore) ||
    typeof res.verdict !== 'string'
  ) {
    return {
      res: null,
      message: 'AI筛选结果无效',
      rating: Number.NEGATIVE_INFINITY,
      data: null,
      finalScore: null,
      verdict: 'reject',
      veto: true,
    }
  }
  const validItems = (items: Item[]) =>
    items.every(
      (item) =>
        item &&
        typeof item.reason === 'string' &&
        item.reason.trim().length > 0 &&
        Number.isFinite(item.score),
    )
  if (!validItems(res.negative) || !validItems(res.positive)) {
    return {
      res: null,
      message: 'AI筛选证据无效，需人工判断',
      rating: Number.NEGATIVE_INFINITY,
      data: null,
      finalScore: null,
      verdict: 'review',
      veto: true,
    }
  }

  const hand = (acc: { score: number; reason: string }, curr: Item) => ({
    score: acc.score + Math.abs(curr.score),
    reason: `${acc.reason}\n${curr.reason}/(${Math.abs(curr.score)}分)`,
  })
  const data = {
    negative: res?.negative?.reduce(hand, { score: 0, reason: '' }),
    positive: res?.positive?.reduce(hand, { score: 0, reason: '' }),
  }

  const rating = Number(res.finalScore)
  const verdict = normalizeFilteringVerdict(res.verdict)
  // 只有明确 accept 且未触发 veto 才允许进入投递流程。
  const veto = res.veto === true || verdict !== 'accept'

  const message = `分数${rating}\n消极:${data?.negative?.reason}\n\n积极:${data?.positive?.reason}`

  return { res, message, rating, data, finalScore: rating, verdict: res.verdict, veto }
}

export interface CandidateProfile {
  /** 固定版本，便于未来迁移而不破坏本地画像。 */
  schema_version: 'candidate-profile.v1'
  target_roles: string[]
  location: string
  resume_summary: string
  skills_with_evidence: Array<{ skill: string; evidence: string }>
  availability_policy: string
  salary_policy: string
  contact_policy: string
  reply_style: string
}

/** 返回不包含个人事实的空画像；空画像会让 AI 招呼语按规则 fail-closed。 */
export function createEmptyCandidateProfile(): CandidateProfile {
  return {
    schema_version: 'candidate-profile.v1',
    target_roles: [],
    location: '',
    resume_summary: '',
    skills_with_evidence: [],
    availability_policy: '',
    salary_policy: '',
    contact_policy: '',
    reply_style: '',
  }
}

/** 只接受结构化画像；旧版纯文本配置迁移到 resume_summary，不写入日志。 */
export function parseCandidateProfile(value: unknown): CandidateProfile | null {
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) return createEmptyCandidateProfile()
    try {
      return parseCandidateProfile(JSON.parse(text))
    } catch {
      return { ...createEmptyCandidateProfile(), resume_summary: text }
    }
  }
  if (!value || typeof value !== 'object') return null
  const source = value as Partial<CandidateProfile>
  if (source.schema_version !== 'candidate-profile.v1') return null
  if (!Array.isArray(source.target_roles) || !Array.isArray(source.skills_with_evidence))
    return null
  const skills = source.skills_with_evidence.filter(
    (item): item is { skill: string; evidence: string } =>
      Boolean(item) &&
      typeof item === 'object' &&
      typeof item.skill === 'string' &&
      typeof item.evidence === 'string',
  )
  return {
    schema_version: 'candidate-profile.v1',
    target_roles: source.target_roles.filter((item): item is string => typeof item === 'string'),
    location: typeof source.location === 'string' ? source.location : '',
    resume_summary: typeof source.resume_summary === 'string' ? source.resume_summary : '',
    skills_with_evidence: skills,
    availability_policy:
      typeof source.availability_policy === 'string' ? source.availability_policy : '',
    salary_policy: typeof source.salary_policy === 'string' ? source.salary_policy : '',
    contact_policy: typeof source.contact_policy === 'string' ? source.contact_policy : '',
    reply_style: typeof source.reply_style === 'string' ? source.reply_style : '',
  }
}

/** 仅使用 chrome.storage.local 保存候选人画像，避免泄漏到同步存储。 */
export async function getCandidateProfile(): Promise<CandidateProfile> {
  try {
    const raw = await counter.storageGet<unknown>(v2StorageKey('candidate-profile'), null)
    return parseCandidateProfile(raw) ?? createEmptyCandidateProfile()
  } catch {
    return createEmptyCandidateProfile()
  }
}

/** 写入画像；非法画像不落盘，避免 AI 使用不完整事实。 */
export async function setCandidateProfile(profile: CandidateProfile): Promise<void> {
  try {
    await counter.storageSet(v2StorageKey('candidate-profile'), profile)
  } catch {
    // 扩展初始化前保存失败时静默处理，不暴露页面上下文。
  }
}
