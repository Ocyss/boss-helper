import { createOpenAI } from '@ai-sdk/openai'
import { streamText } from 'ai'
import { ref } from 'vue'

import { counter } from '@/message'
import { parseGptJson } from '@/utils/ai'
import { logger } from '@/utils/logger'
import { extractResumeText } from '@/utils/resume'
import type { JobData } from '~/composables/useHelper'

import { useModel } from './useModel'

const resumeProfileKey = 'local:resume-profile'
const maxPromptChars = 40_000

export interface ResumeRecommendation {
  summary: string
  targetRoles: string[]
  searchQueries: string[]
  companyTargets: string[]
  strengths: string[]
  requirements: string[]
}

export interface ResumePreferences {
  enabled: boolean
  cities: string[]
  minSalary: number | null
  employmentType: 'any' | 'internship' | 'full-time'
  remote: 'any' | 'preferred' | 'required'
  industries: string[]
  companySizes: string[]
  excludedKeywords: string[]
  matchThreshold: number
}

export interface ResumeJobMatch {
  score: number
  matched: string[]
  missing: string[]
  hardMismatches: string[]
}

export interface ResumeProfile {
  fileName: string
  text: string
  updatedAt: number | null
  recommendation: ResumeRecommendation | null
  preferences: ResumePreferences
  pendingSearchQuery: string | null
  pendingAutoApply: boolean
  autoApplyActive: boolean
  searchQueue: string[]
  deliveredJobKeys: string[]
}

const defaultPreferences = (): ResumePreferences => ({
  enabled: true,
  cities: [],
  minSalary: null,
  employmentType: 'any',
  remote: 'any',
  industries: [],
  companySizes: [],
  excludedKeywords: [],
  matchThreshold: 60,
})

const defaultProfile = (): ResumeProfile => ({
  fileName: '',
  text: '',
  updatedAt: null,
  recommendation: null,
  preferences: defaultPreferences(),
  pendingSearchQuery: null,
  pendingAutoApply: false,
  autoApplyActive: false,
  searchQueue: [],
  deliveredJobKeys: [],
})

const profile = ref<ResumeProfile>(defaultProfile())
const isLoading = ref(false)
const isAnalyzing = ref(false)
let initialized = false
let initializePromise: Promise<void> | null = null

function stringList(value: unknown, limit = 12): string[] {
  const list = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[、,，;；\n]/)
      : []
  return Array.from(
    new Set(
      list
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).slice(0, limit)
}

function normalizeRecommendation(value: unknown): ResumeRecommendation | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Partial<ResumeRecommendation> & Record<string, unknown>
  const recommendation: ResumeRecommendation = {
    summary:
      typeof (source.summary ?? source['求职画像']) === 'string'
        ? String(source.summary ?? source['求职画像']).trim()
        : '',
    targetRoles: stringList(source.targetRoles ?? source['适合岗位'] ?? source['岗位方向']),
    searchQueries: stringList(source.searchQueries ?? source['搜索词'] ?? source['搜索关键词']),
    companyTargets: stringList(source.companyTargets ?? source['目标公司'] ?? source['目标行业']),
    strengths: stringList(source.strengths ?? source['核心优势'] ?? source['核心能力']),
    requirements: stringList(source.requirements ?? source['优先条件'] ?? source['求职需求']),
  }
  return recommendation.targetRoles.length || recommendation.searchQueries.length
    ? recommendation
    : null
}

function normalizePreferences(value: unknown): ResumePreferences {
  if (!value || typeof value !== 'object') return defaultPreferences()
  const source = value as Partial<ResumePreferences>
  const minSalary =
    typeof source.minSalary === 'number' &&
    Number.isFinite(source.minSalary) &&
    source.minSalary >= 0
      ? source.minSalary
      : null
  const matchThreshold =
    typeof source.matchThreshold === 'number' && Number.isFinite(source.matchThreshold)
      ? Math.min(100, Math.max(0, Math.round(source.matchThreshold)))
      : 60
  return {
    enabled: source.enabled !== false,
    cities: stringList(source.cities),
    minSalary,
    employmentType:
      source.employmentType === 'internship' || source.employmentType === 'full-time'
        ? source.employmentType
        : 'any',
    remote: source.remote === 'preferred' || source.remote === 'required' ? source.remote : 'any',
    industries: stringList(source.industries),
    companySizes: stringList(source.companySizes),
    excludedKeywords: stringList(source.excludedKeywords),
    matchThreshold,
  }
}

function normalizeProfile(value: unknown): ResumeProfile {
  if (!value || typeof value !== 'object') return defaultProfile()
  const source = value as Partial<ResumeProfile>
  return {
    fileName: typeof source.fileName === 'string' ? source.fileName : '',
    text: typeof source.text === 'string' ? source.text.slice(0, 120_000) : '',
    updatedAt: typeof source.updatedAt === 'number' ? source.updatedAt : null,
    recommendation: normalizeRecommendation(source.recommendation),
    preferences: normalizePreferences(source.preferences),
    pendingSearchQuery:
      typeof source.pendingSearchQuery === 'string' && source.pendingSearchQuery.trim()
        ? source.pendingSearchQuery.trim()
        : null,
    pendingAutoApply: source.pendingAutoApply === true,
    autoApplyActive: source.autoApplyActive === true || source.pendingAutoApply === true,
    searchQueue: stringList(source.searchQueue, 12),
    deliveredJobKeys: stringList(source.deliveredJobKeys, 1_000),
  }
}

function normalizeText(value: string) {
  return value.toLocaleLowerCase().replace(/\s+/g, ' ').trim()
}

function contains(text: string, term: string) {
  return Boolean(term.trim()) && text.includes(normalizeText(term))
}

function splitTerms(items: string[]) {
  return Array.from(
    new Set(
      items
        .flatMap((item) => [item, ...item.split(/[、,，/|；;\n]/)])
        .flatMap((item) => [
          item,
          item.replace(
            /熟悉|掌握|具备|相关|优先|要求|经验|岗位|职位|工程师|开发|实习生|实习|全职/g,
            '',
          ),
        ])
        .map((item) => item.trim())
        .filter((item) => item.length >= 2),
    ),
  )
}

function jobText(job: JobData) {
  return normalizeText(
    [
      job.jobName,
      job.positionName,
      job.jobDescription,
      job.experienceName,
      job.degreeName,
      job.salary,
      job.city,
      job.address,
      job.skills.join(' '),
      job.showSkills.join(' '),
      job.jobLabels.join(' '),
      job.welfareList?.join(' '),
      job.brand.name,
      job.brand.industry,
      job.brand.scale,
      job.brand.stageName,
      job.brand.introduce,
      job.boss.title,
    ]
      .filter(Boolean)
      .join(' '),
  )
}

function parseLowestSalaryK(value: string) {
  const match = value
    .replace(/,/g, '')
    .match(/(\d+(?:\.\d+)?)\s*(?:[-~至到]\s*\d+(?:\.\d+)?\s*)?[kK]/)
  return match ? Number(match[1]) : null
}

function matchTerms(text: string, terms: string[], prefix: string) {
  const matched: string[] = []
  const missing: string[] = []
  for (const term of terms) {
    if (contains(text, term)) matched.push(`${prefix}${term}`)
    else missing.push(`${prefix}${term}`)
  }
  return { matched, missing }
}

async function save() {
  await counter.storageSet(resumeProfileKey, profile.value)
}

async function init() {
  if (initialized) return
  if (initializePromise) return initializePromise

  initializePromise = counter
    .storageGet<ResumeProfile | null>(resumeProfileKey, null)
    .then((stored) => {
      profile.value = normalizeProfile(stored)
      initialized = true
    })
    .catch((error) => {
      logger.error('简历资料加载失败', error)
      initialized = true
      throw error
    })
    .finally(() => {
      initializePromise = null
    })
  return initializePromise
}

export const useResume = () => {
  const models = useModel()

  function matchJob(job: JobData): ResumeJobMatch | null {
    const recommendation = profile.value.recommendation
    if (!recommendation) return null

    const preferences = profile.value.preferences
    const text = jobText(job)
    const titleText = normalizeText([job.jobName, job.positionName].filter(Boolean).join(' '))
    const matched: string[] = []
    const missing: string[] = []
    const hardMismatches: string[] = []

    if (preferences.cities.length) {
      const location = normalizeText([job.city, job.address].filter(Boolean).join(' '))
      if (!location) hardMismatches.push('岗位未提供城市信息')
      else if (!preferences.cities.some((city) => contains(location, city))) {
        hardMismatches.push(`城市不符合：${preferences.cities.join('、')}`)
      } else {
        matched.push(`城市：${preferences.cities.find((city) => contains(location, city))}`)
      }
    }

    if (preferences.minSalary != null) {
      const minimum = parseLowestSalaryK(job.salary)
      if (minimum == null) hardMismatches.push(`无法解析薪资：${job.salary || '未提供'}`)
      else if (minimum < preferences.minSalary) {
        hardMismatches.push(`最低薪资 ${minimum}K 低于 ${preferences.minSalary}K`)
      } else {
        matched.push(`薪资：${minimum}K 起`)
      }
    }

    const isInternship = /实习|intern/.test(text)
    if (preferences.employmentType === 'internship' && !isInternship) {
      hardMismatches.push('不是实习岗位')
    } else if (preferences.employmentType === 'full-time' && isInternship) {
      hardMismatches.push('是实习岗位，非全职')
    } else if (preferences.employmentType !== 'any') {
      matched.push(preferences.employmentType === 'internship' ? '实习岗位' : '全职岗位')
    }

    const isRemote = /远程|remote|居家|在家办公/.test(text)
    if (preferences.remote === 'required' && !isRemote) {
      hardMismatches.push('不支持远程')
    } else if (preferences.remote !== 'any' && isRemote) {
      matched.push('支持远程')
    }

    if (preferences.industries.length) {
      const industry = normalizeText(job.brand.industry)
      if (!industry || !preferences.industries.some((item) => contains(industry, item))) {
        hardMismatches.push(`行业不符合：${preferences.industries.join('、')}`)
      } else {
        matched.push(`行业：${preferences.industries.find((item) => contains(industry, item))}`)
      }
    }

    if (preferences.companySizes.length) {
      const scale = normalizeText(job.brand.scale)
      if (!scale || !preferences.companySizes.some((item) => contains(scale, item))) {
        hardMismatches.push(`公司规模不符合：${preferences.companySizes.join('、')}`)
      } else {
        matched.push(`规模：${preferences.companySizes.find((item) => contains(scale, item))}`)
      }
    }

    const excluded = preferences.excludedKeywords.find((keyword) => contains(text, keyword))
    if (excluded) hardMismatches.push(`命中排除词：${excluded}`)

    let score = 0
    const roleTerms = splitTerms([...recommendation.targetRoles, ...recommendation.searchQueries])
    const roleMatch = matchTerms(titleText, roleTerms, '岗位：')
    if (roleMatch.matched.length) {
      score += 35
      matched.push(...roleMatch.matched.slice(0, 2))
    } else {
      missing.push(...roleMatch.missing.slice(0, 3))
    }

    const strengthMatch = matchTerms(text, splitTerms(recommendation.strengths), '技能：')
    const matchedStrengths = strengthMatch.matched.slice(0, 3)
    score += matchedStrengths.length * 15
    matched.push(...matchedStrengths)
    missing.push(...strengthMatch.missing.slice(0, 4))

    const requirementMatch = matchTerms(text, splitTerms(recommendation.requirements), '要求：')
    const matchedRequirements = requirementMatch.matched.slice(0, 3)
    score += matchedRequirements.length * 5
    matched.push(...matchedRequirements)
    missing.push(...requirementMatch.missing.slice(0, 3))

    if (preferences.remote === 'preferred' && isRemote) score += 5

    return {
      score: Math.min(100, score),
      matched: Array.from(new Set(matched)).slice(0, 8),
      missing: Array.from(new Set(missing)).slice(0, 8),
      hardMismatches,
    }
  }

  function isAutoApplyActive() {
    return profile.value.autoApplyActive && profile.value.preferences.enabled
  }

  function isDeliveredJob(key: string) {
    return profile.value.deliveredJobKeys.includes(key)
  }

  async function importFile(file: File) {
    isLoading.value = true
    try {
      const text = await extractResumeText(file)
      profile.value = {
        ...profile.value,
        fileName: file.name,
        text,
        updatedAt: Date.now(),
        recommendation: null,
      }
      await save()
    } finally {
      isLoading.value = false
    }
  }

  async function analyze(modelKey: string) {
    const modelConf = models.modelData.value.find((model) => model.key === modelKey)
    if (!profile.value.text.trim()) throw new Error('请先上传或粘贴简历内容')
    if (!modelConf?.data) throw new Error('请选择已配置的模型')

    isAnalyzing.value = true
    try {
      const provider = createOpenAI({
        baseURL: modelConf.data.base_url,
        apiKey: modelConf.data.api_key,
        headers: modelConf.data.advanced?.extra_headers,
      })
      const model = modelConf.data.responses
        ? provider.responses(modelConf.data.model)
        : provider.chat(modelConf.data.model)
      const result = streamText({
        model,
        prompt: `你是求职助手。仅根据以下简历，生成适合在 BOSS 直聘搜索的岗位方向和求职需求。不要虚构已开放的岗位或公司职位。只返回 JSON，不要 Markdown：
{
  "summary": "一句话求职画像",
  "targetRoles": ["3至6个适合岗位名称"],
  "searchQueries": ["3至6个适合直接搜索的短关键词"],
  "companyTargets": ["适合的公司类型、行业或公司关键词"],
  "strengths": ["核心能力"],
  "requirements": ["应优先筛选的工作条件、技术或岗位要求"]
}

简历：
${profile.value.text.slice(0, maxPromptChars)}`,
        abortSignal: AbortSignal.timeout(modelConf.data.other?.timeout ?? 60_000),
      })
      const raw = await result.text
      const recommendation = normalizeRecommendation(parseGptJson(raw))
      if (!recommendation) {
        logger.warn('简历分析模型返回格式无效', {
          model: modelConf.name,
          response: raw.slice(0, 1_000),
        })
        throw new Error('模型未返回可识别的岗位推荐，请更换支持 JSON 输出的模型后重试')
      }

      profile.value = {
        ...profile.value,
        recommendation,
        updatedAt: Date.now(),
      }
      await save()
      return recommendation
    } finally {
      isAnalyzing.value = false
    }
  }

  async function updateText(text: string) {
    profile.value = {
      ...profile.value,
      text: text.slice(0, 120_000),
      updatedAt: Date.now(),
      recommendation: null,
    }
    await save()
  }

  async function setSearchRequest(query: string, autoApply: boolean) {
    profile.value = {
      ...profile.value,
      pendingSearchQuery: query.trim(),
      pendingAutoApply: autoApply,
      autoApplyActive: autoApply,
      searchQueue: [],
    }
    await save()
  }

  async function startSearchQueue(queries: string[]) {
    const seen = new Set<string>()
    const normalizedQueries = queries
      .map((query) => query.trim())
      .filter((query) => {
        const key = normalizeText(query)
        if (!key || seen.has(key)) return false
        seen.add(key)
        return true
      })
    const [pendingSearchQuery, ...searchQueue] = normalizedQueries
    if (!pendingSearchQuery) throw new Error('没有可执行的搜索词')
    profile.value = {
      ...profile.value,
      pendingSearchQuery,
      pendingAutoApply: true,
      autoApplyActive: true,
      searchQueue,
    }
    await save()
    return pendingSearchQuery
  }

  async function markAutoApplyStarted() {
    if (!profile.value.pendingAutoApply) return
    profile.value = {
      ...profile.value,
      pendingAutoApply: false,
    }
    await save()
  }

  async function advanceSearchQueue() {
    const [pendingSearchQuery, ...searchQueue] = profile.value.searchQueue
    profile.value = {
      ...profile.value,
      pendingSearchQuery: pendingSearchQuery ?? null,
      pendingAutoApply: Boolean(pendingSearchQuery),
      autoApplyActive: Boolean(pendingSearchQuery),
      searchQueue,
    }
    await save()
    return pendingSearchQuery ?? null
  }

  async function cancelSearchQueue() {
    profile.value = {
      ...profile.value,
      pendingSearchQuery: null,
      pendingAutoApply: false,
      autoApplyActive: false,
      searchQueue: [],
    }
    await save()
  }

  async function recordDeliveredJob(key: string) {
    if (!key || isDeliveredJob(key)) return
    profile.value = {
      ...profile.value,
      deliveredJobKeys: [...profile.value.deliveredJobKeys, key].slice(-1_000),
    }
    await save()
  }

  async function clear() {
    profile.value = defaultProfile()
    await save()
  }

  return {
    profile,
    isLoading,
    isAnalyzing,
    init,
    importFile,
    analyze,
    updateText,
    save,
    setSearchRequest,
    startSearchQueue,
    markAutoApplyStarted,
    advanceSearchQueue,
    cancelSearchQueue,
    recordDeliveredJob,
    isAutoApplyActive,
    isDeliveredJob,
    matchJob,
    clear,
  }
}
