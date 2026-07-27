import type { JobData } from '@/composables/useHelper'

export type CompanyRiskLevel = 'low' | 'medium' | 'high'
export type CompanyRiskSource = 'local' | 'combined'
export type ExternalCompanyRiskProvider = 'qichacha' | 'tianyancha' | 'custom'

export interface CompanyRiskExternalData {
  companyName?: string
  businessAbnormalCount?: number
  judicialRiskCount?: number
  executedPersonCount?: number
  administrativePenaltyCount?: number
  establishedAt?: string | number
  insuredEmployeeCount?: number
}

export interface CompanyRiskExternalInput {
  provider: ExternalCompanyRiskProvider
  raw: unknown
  /**
   * 供应商响应字段不同或 API 版本变化时，由调用方在此处映射为统一字段。
   * 此模块只归一化已有数据，不主动请求第三方企业信息服务。
   */
  adapter?: (raw: unknown) => CompanyRiskExternalData | null | undefined
}

export interface NormalizedCompanyRiskExternalData extends CompanyRiskExternalData {
  provider: ExternalCompanyRiskProvider
}

export interface CompanyRiskInput {
  job: JobData
  /** 同一公司当前可见的相似职位数，由搜索页或详情页采集后传入。 */
  postingCount?: number
  /** 招聘者距今未活跃的天数。未知时不要传入。 */
  hrActiveDaysAgo?: number
  /** 可选的企查查、天眼查或自定义适配后的既有响应。 */
  external?: CompanyRiskExternalInput
}

export interface CompanyRiskReason {
  code:
    | 'risk-keyword'
    | 'salary-outlier'
    | 'small-company'
    | 'missing-description'
    | 'missing-welfare'
    | 'repeated-postings'
    | 'inactive-hr'
    | 'business-abnormal'
    | 'judicial-risk'
    | 'executed-person'
    | 'administrative-penalty'
    | 'new-company'
    | 'no-insured-employees'
  source: 'local' | 'external'
  points: number
  message: string
}

export interface CompanyRiskDetails {
  localScore: number
  externalScore: number
  matchedKeywords: string[]
  salary?: { lowK: number; highK: number }
  companyScale?: string
  detailCollected: boolean
  hasJobDescription: boolean
  hasWelfare: boolean
  postingCount?: number
  hrActiveDaysAgo?: number
  external?: NormalizedCompanyRiskExternalData
}

export interface CompanyRiskResult {
  score: number
  level: CompanyRiskLevel
  reasons: CompanyRiskReason[]
  source: CompanyRiskSource
  details: CompanyRiskDetails
}

type SalaryRange = { lowK: number; highK: number }
type ScoredResult = { score: number; reasons: CompanyRiskReason[] }

const keywordRules = [
  {
    terms: ['培训贷', '贷款培训', '入职贷款'],
    points: 32,
    message: '职位文本命中培训贷相关关键词',
  },
  {
    terms: ['入职收费', '先交钱', '缴费入职', '付费培训'],
    points: 28,
    message: '职位文本命中收费相关关键词',
  },
  { terms: ['刷单', '刷信誉', '垫付返利'], points: 35, message: '职位文本命中刷单或垫付关键词' },
  {
    terms: ['日结兼职', '当天结算', '轻松月入'],
    points: 12,
    message: '职位文本命中需人工核验的高收益关键词',
  },
] as const

const externalAliases = {
  companyName: ['companyname', 'name', '公司名称', '企业名称'],
  businessAbnormalCount: [
    'businessabnormalcount',
    'abnormalcount',
    'exceptioncount',
    '经营异常数量',
    '经营异常',
  ],
  judicialRiskCount: [
    'judicialriskcount',
    'lawsuitcount',
    'judicialcasecount',
    '司法风险数量',
    '司法风险',
    '诉讼数量',
  ],
  executedPersonCount: [
    'executedpersoncount',
    'executedcount',
    'zhixingcount',
    '被执行人数量',
    '被执行人',
  ],
  administrativePenaltyCount: [
    'administrativepenaltycount',
    'penaltycount',
    '行政处罚数量',
    '行政处罚',
  ],
  establishedAt: [
    'establishedat',
    'establishdate',
    'estiblishtime',
    'startdate',
    '成立日期',
    '成立时间',
  ],
  insuredEmployeeCount: [
    'insuredemployeecount',
    'socialsecuritycount',
    'staffnum',
    '参保人数',
    '社保人数',
  ],
} as const

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function normalizedKey(value: string) {
  return value.toLocaleLowerCase().replace(/[\s_\-()[\]{}]/g, '')
}

function findValue(raw: unknown, aliases: readonly string[]) {
  const wanted = new Set(aliases.map(normalizedKey))
  const queue: Array<{ value: unknown; depth: number }> = [{ value: raw, depth: 0 }]
  const visited = new Set<object>()

  while (queue.length) {
    const current = queue.shift()!
    if (current.depth > 4) continue
    if (Array.isArray(current.value)) {
      current.value.slice(0, 10).forEach((value) => {
        if (value && typeof value === 'object') {
          queue.push({ value, depth: current.depth + 1 })
        }
      })
      continue
    }
    const record = asRecord(current.value)
    if (!record || visited.has(record)) continue
    visited.add(record)

    for (const [key, value] of Object.entries(record)) {
      if (wanted.has(normalizedKey(key))) return value
      if (value && typeof value === 'object') queue.push({ value, depth: current.depth + 1 })
    }
  }
}

function toCount(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return Math.floor(value)
  if (typeof value !== 'string') return undefined
  const match = value.replace(/,/g, '').match(/\d+(?:\.\d+)?/)
  return match ? Math.floor(Number(match[0])) : undefined
}

function toText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function clamp(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)))
}

function parseSalary(value: string): SalaryRange | undefined {
  const match = value
    .replace(/,/g, '')
    .match(/(\d+(?:\.\d+)?)\s*[kK]\s*(?:[-~至到]\s*(\d+(?:\.\d+)?)\s*[kK])?/)
  if (!match) return undefined
  const lowK = Number(match[1])
  const highK = Number(match[2] ?? match[1])
  return Number.isFinite(lowK) && Number.isFinite(highK) ? { lowK, highK } : undefined
}

function parseCompanySize(value: string) {
  const numbers = Array.from(value.matchAll(/\d+/g), (match) => Number(match[0])).filter(
    Number.isFinite,
  )
  return numbers.length ? Math.max(...numbers) : undefined
}

function textFromJob(job: JobData) {
  return [
    job.jobName,
    job.positionName,
    job.jobDescription,
    job.salary,
    job.showSkills?.join(' '),
    job.skills?.join(' '),
    job.welfareList?.join(' '),
    job.jobLabels?.join(' '),
    job.brand?.introduce,
    job.brand?.labels?.join(' '),
  ]
    .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
    .join(' ')
    .toLocaleLowerCase()
}

function addReason(
  result: ScoredResult,
  reason: Omit<CompanyRiskReason, 'points'> & { points: number },
) {
  result.score += reason.points
  result.reasons.push(reason)
}

function scoreLocal(input: CompanyRiskInput): ScoredResult {
  const result: ScoredResult = { score: 0, reasons: [] }
  const text = textFromJob(input.job)

  for (const rule of keywordRules) {
    const term = rule.terms.find((item) => text.includes(item.toLocaleLowerCase()))
    if (!term) continue
    addReason(result, {
      code: 'risk-keyword',
      source: 'local',
      points: rule.points,
      message: `${rule.message}：${term}`,
    })
  }

  const salary = parseSalary(input.job.salary || '')
  if (salary && (salary.lowK >= 80 || salary.highK >= 100)) {
    addReason(result, {
      code: 'salary-outlier',
      source: 'local',
      points: 10,
      message: `薪资范围 ${input.job.salary} 明显偏高，建议核验岗位真实性`,
    })
  } else if (salary && (salary.lowK >= 40 || salary.highK >= 60)) {
    addReason(result, {
      code: 'salary-outlier',
      source: 'local',
      points: 5,
      message: `薪资范围 ${input.job.salary} 偏高，建议结合职责核验`,
    })
  }

  const companySize = parseCompanySize(input.job.brand?.scale || '')
  if (companySize != null && companySize <= 10) {
    addReason(result, {
      code: 'small-company',
      source: 'local',
      points: 4,
      message: `公司规模较小：${input.job.brand.scale}`,
    })
  }

  if (input.job.detailCollected) {
    const description = input.job.jobDescription?.trim() || ''
    if (!description) {
      addReason(result, {
        code: 'missing-description',
        source: 'local',
        points: 10,
        message: '职位详情未提供描述',
      })
    } else if (description.length < 40) {
      addReason(result, {
        code: 'missing-description',
        source: 'local',
        points: 6,
        message: '职位描述过短，无法充分核验岗位职责',
      })
    }

    if (!input.job.welfareList?.length) {
      addReason(result, {
        code: 'missing-welfare',
        source: 'local',
        points: 3,
        message: '职位详情未提供福利信息',
      })
    }
  }

  const postingCount = toCount(input.postingCount)
  if (postingCount != null && postingCount >= 20) {
    addReason(result, {
      code: 'repeated-postings',
      source: 'local',
      points: 10,
      message: `同公司可见相似职位较多：${postingCount} 个`,
    })
  } else if (postingCount != null && postingCount >= 10) {
    addReason(result, {
      code: 'repeated-postings',
      source: 'local',
      points: 6,
      message: `同公司可见相似职位较多：${postingCount} 个`,
    })
  }

  const hrActiveDaysAgo = toCount(input.hrActiveDaysAgo)
  if (hrActiveDaysAgo != null && hrActiveDaysAgo >= 30) {
    addReason(result, {
      code: 'inactive-hr',
      source: 'local',
      points: 8,
      message: `招聘者已 ${hrActiveDaysAgo} 天未活跃`,
    })
  } else if (hrActiveDaysAgo != null && hrActiveDaysAgo >= 14) {
    addReason(result, {
      code: 'inactive-hr',
      source: 'local',
      points: 4,
      message: `招聘者已 ${hrActiveDaysAgo} 天未活跃`,
    })
  }

  return { ...result, score: clamp(result.score) }
}

function parseDate(value: string | number | undefined) {
  if (value == null) return undefined
  const numeric = typeof value === 'number' ? value : Number(value)
  const timestamp =
    Number.isFinite(numeric) && numeric > 100_000_000
      ? numeric < 10_000_000_000
        ? numeric * 1000
        : numeric
      : Date.parse(String(value))
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) || date.getTime() > Date.now() ? undefined : date
}

function companyAgeYears(value: string | number | undefined) {
  const date = parseDate(value)
  return date ? (Date.now() - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000) : undefined
}

function scoreExternal(external: NormalizedCompanyRiskExternalData): ScoredResult {
  const result: ScoredResult = { score: 0, reasons: [] }
  const abnormal = external.businessAbnormalCount ?? 0
  const judicial = external.judicialRiskCount ?? 0
  const executed = external.executedPersonCount ?? 0
  const penalty = external.administrativePenaltyCount ?? 0

  if (abnormal > 0) {
    addReason(result, {
      code: 'business-abnormal',
      source: 'external',
      points: Math.min(24, 8 + abnormal * 4),
      message: `企业信息显示 ${abnormal} 条经营异常记录`,
    })
  }
  if (judicial > 0) {
    addReason(result, {
      code: 'judicial-risk',
      source: 'external',
      points: Math.min(24, 5 + judicial * 3),
      message: `企业信息显示 ${judicial} 条司法风险记录`,
    })
  }
  if (executed > 0) {
    addReason(result, {
      code: 'executed-person',
      source: 'external',
      points: Math.min(30, 10 + executed * 5),
      message: `企业信息显示 ${executed} 条被执行人记录`,
    })
  }
  if (penalty > 0) {
    addReason(result, {
      code: 'administrative-penalty',
      source: 'external',
      points: Math.min(18, 4 + penalty * 3),
      message: `企业信息显示 ${penalty} 条行政处罚记录`,
    })
  }

  const age = companyAgeYears(external.establishedAt)
  if (age != null && age < 0.5) {
    addReason(result, {
      code: 'new-company',
      source: 'external',
      points: 4,
      message: '企业成立不足半年，建议额外核验',
    })
  }
  if (external.insuredEmployeeCount === 0 && age != null && age >= 1) {
    addReason(result, {
      code: 'no-insured-employees',
      source: 'external',
      points: 6,
      message: '企业信息显示参保人数为 0',
    })
  }

  return { ...result, score: clamp(result.score) }
}

function normalizeExternalData(
  provider: ExternalCompanyRiskProvider,
  value: CompanyRiskExternalData,
): NormalizedCompanyRiskExternalData | null {
  const normalized: NormalizedCompanyRiskExternalData = {
    provider,
    companyName: toText(value.companyName),
    businessAbnormalCount: toCount(value.businessAbnormalCount),
    judicialRiskCount: toCount(value.judicialRiskCount),
    executedPersonCount: toCount(value.executedPersonCount),
    administrativePenaltyCount: toCount(value.administrativePenaltyCount),
    establishedAt:
      typeof value.establishedAt === 'string' || typeof value.establishedAt === 'number'
        ? value.establishedAt
        : undefined,
    insuredEmployeeCount: toCount(value.insuredEmployeeCount),
  }
  return Object.values(normalized).some((item) => item !== undefined && item !== provider)
    ? normalized
    : null
}

function defaultExternalAdapter(raw: unknown): CompanyRiskExternalData {
  return {
    companyName: toText(findValue(raw, externalAliases.companyName)),
    businessAbnormalCount: toCount(findValue(raw, externalAliases.businessAbnormalCount)),
    judicialRiskCount: toCount(findValue(raw, externalAliases.judicialRiskCount)),
    executedPersonCount: toCount(findValue(raw, externalAliases.executedPersonCount)),
    administrativePenaltyCount: toCount(findValue(raw, externalAliases.administrativePenaltyCount)),
    establishedAt: findValue(raw, externalAliases.establishedAt) as string | number | undefined,
    insuredEmployeeCount: toCount(findValue(raw, externalAliases.insuredEmployeeCount)),
  }
}

/** 将企查查、天眼查或调用方自定义响应转换为稳定的风险字段。 */
export function normalizeCompanyRiskExternal(
  input: CompanyRiskExternalInput,
): NormalizedCompanyRiskExternalData | null {
  const adapted = input.adapter?.(input.raw) ?? defaultExternalAdapter(input.raw)
  return adapted ? normalizeExternalData(input.provider, adapted) : null
}

/**
 * 仅根据已经采集的岗位与企业数据给出风险分。无外部企业结果时自动退化为本地规则评分。
 */
export function evaluateCompanyRisk(input: CompanyRiskInput): CompanyRiskResult {
  const local = scoreLocal(input)
  const external = input.external ? normalizeCompanyRiskExternal(input.external) : null
  const externalScore = external ? scoreExternal(external) : { score: 0, reasons: [] }
  const score = clamp(local.score + externalScore.score)
  const salary = parseSalary(input.job.salary || '')

  return {
    score,
    level: score >= 50 ? 'high' : score >= 20 ? 'medium' : 'low',
    reasons: [...local.reasons, ...externalScore.reasons],
    source: external ? 'combined' : 'local',
    details: {
      localScore: local.score,
      externalScore: externalScore.score,
      matchedKeywords: local.reasons
        .filter((reason) => reason.code === 'risk-keyword')
        .map((reason) => reason.message.split('：').at(-1) || reason.message),
      salary,
      companyScale: input.job.brand?.scale || undefined,
      detailCollected: input.job.detailCollected === true,
      hasJobDescription: Boolean(input.job.jobDescription?.trim()),
      hasWelfare: Boolean(input.job.welfareList?.length),
      postingCount: toCount(input.postingCount),
      hrActiveDaysAgo: toCount(input.hrActiveDaysAgo),
      external: external ?? undefined,
    },
  }
}
