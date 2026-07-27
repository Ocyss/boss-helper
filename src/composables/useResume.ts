import { createOpenAI } from '@ai-sdk/openai'
import { streamText } from 'ai'
import { ref } from 'vue'

import { activityLog } from '@/composables/useActivityLog'
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

export interface ResumeMatchSettings {
  enabled: boolean
  matchThreshold: number
}

export interface ResumeJobMatch {
  score: number
  matched: string[]
  missing: string[]
}

export interface ResumeProfile {
  fileName: string
  text: string
  updatedAt: number | null
  recommendation: ResumeRecommendation | null
  matching: ResumeMatchSettings
  pendingSearchQuery: string | null
  pendingAutoApply: boolean
  autoApplyActive: boolean
  searchQueue: string[]
  deliveredJobKeys: string[]
}

const defaultMatching = (): ResumeMatchSettings => ({
  enabled: true,
  matchThreshold: 60,
})

const defaultProfile = (): ResumeProfile => ({
  fileName: '',
  text: '',
  updatedAt: null,
  recommendation: null,
  matching: defaultMatching(),
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

function normalizeMatching(value: unknown): ResumeMatchSettings {
  if (!value || typeof value !== 'object') return defaultMatching()
  const source = value as Partial<ResumeMatchSettings>
  const matchThreshold =
    typeof source.matchThreshold === 'number' && Number.isFinite(source.matchThreshold)
      ? Math.min(100, Math.max(0, Math.round(source.matchThreshold)))
      : 60
  return {
    enabled: source.enabled !== false,
    matchThreshold,
  }
}

function normalizeProfile(value: unknown): ResumeProfile {
  if (!value || typeof value !== 'object') return defaultProfile()
  const source = value as Partial<ResumeProfile> & { preferences?: unknown }
  return {
    fileName: typeof source.fileName === 'string' ? source.fileName : '',
    text: typeof source.text === 'string' ? source.text.slice(0, 120_000) : '',
    updatedAt: typeof source.updatedAt === 'number' ? source.updatedAt : null,
    recommendation: normalizeRecommendation(source.recommendation),
    matching: normalizeMatching(source.matching ?? source.preferences),
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

    const text = jobText(job)
    const titleText = normalizeText([job.jobName, job.positionName].filter(Boolean).join(' '))
    const matched: string[] = []
    const missing: string[] = []

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

    return {
      score: Math.min(100, score),
      matched: Array.from(new Set(matched)).slice(0, 8),
      missing: Array.from(new Set(missing)).slice(0, 8),
    }
  }

  function isAutoApplyActive() {
    return profile.value.autoApplyActive
  }

  function hasValidAnalysis() {
    return Boolean(profile.value.text.trim() && profile.value.recommendation)
  }

  function isMatchFilterEnabled() {
    return hasValidAnalysis() && profile.value.matching.enabled
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
        pendingSearchQuery: null,
        pendingAutoApply: false,
        autoApplyActive: false,
        searchQueue: [],
        deliveredJobKeys: [],
      }
      await save()
      activityLog.add({
        category: '简历',
        action: '上传并提取',
        status: 'success',
        message: '已提取简历文本，旧的分析和岗位去重记录已清空；可继续保存或进行 AI 分析。',
        detail: { fileType: file.name.split('.').pop()?.toUpperCase() || '未知' },
      })
    } catch (error) {
      activityLog.add({
        category: '简历',
        action: '上传并提取',
        status: 'error',
        message: '简历文件未能提取；请确认文件未加密且格式受支持后重试。',
      })
      throw error
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
      activityLog.add({
        category: '简历',
        action: 'AI 分析',
        status: 'success',
        message: 'AI 已生成岗位方向和搜索词；请确认搜索词后再开始搜索或自动投递。',
        detail: {
          targetRoleCount: recommendation.targetRoles.length,
          searchQueryCount: recommendation.searchQueries.length,
        },
      })
      return recommendation
    } catch (error) {
      activityLog.add({
        category: '简历',
        action: 'AI 分析',
        status: 'error',
        message: 'AI 未能完成简历分析；请检查模型配置和网络后重试。',
      })
      throw error
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
      pendingSearchQuery: null,
      pendingAutoApply: false,
      autoApplyActive: false,
      searchQueue: [],
      deliveredJobKeys: [],
    }
    await save()
    activityLog.add({
      category: '简历',
      action: '保存文本',
      status: 'success',
      message: '简历文本已保存，旧的分析和岗位去重记录已清空；请重新进行 AI 分析。',
    })
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
    activityLog.add({
      category: '简历搜索',
      action: '开始搜索',
      status: 'success',
      message: `已准备搜索“${query.trim()}”；将跳转到岗位搜索页。`,
      detail: { autoApply },
    })
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
      deliveredJobKeys: [],
    }
    await save()
    activityLog.add({
      category: '简历搜索',
      action: '开始自动投递队列',
      status: 'success',
      message: `已开始 ${normalizedQueries.length} 个搜索词的自动投递队列；会按顺序搜索并去重。`,
      detail: { queryCount: normalizedQueries.length },
    })
    return pendingSearchQuery
  }

  async function markAutoApplyStarted() {
    if (!profile.value.pendingAutoApply) return
    profile.value = {
      ...profile.value,
      pendingAutoApply: false,
    }
    await save()
    activityLog.add({
      category: '简历搜索',
      action: '开始当前队列',
      status: 'success',
      message: '当前搜索词已开始自动投递；完成后会继续检查下一个搜索词。',
    })
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
    activityLog.add({
      category: '简历搜索',
      action: pendingSearchQuery ? '切换搜索词' : '完成自动投递队列',
      status: 'success',
      message: pendingSearchQuery
        ? `当前搜索已完成，接下来将搜索“${pendingSearchQuery}”。`
        : '全部搜索词已处理完毕；可在操作记录中查看投递与跳过原因。',
      detail: { remainingQueryCount: searchQueue.length },
    })
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
    activityLog.add({
      category: '简历搜索',
      action: '取消自动投递队列',
      status: 'skipped',
      message: '后续搜索和自动投递已停止；已开始的投递不会被撤回。',
    })
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
    hasValidAnalysis,
    isMatchFilterEnabled,
    isDeliveredJob,
    matchJob,
    clear,
  }
}
