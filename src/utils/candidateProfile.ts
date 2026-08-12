import type {
  CandidateKnowledgeItem,
  CandidateKnowledgePolicy,
  CandidateKnowledgeTask,
  CandidateKnowledgeTaskAccess,
  CandidateProfileConfig,
} from '@/types/aiReply'

const DEFAULT_TASK_ACCESS: CandidateKnowledgeTaskAccess = {
  filtering: false,
  greeting: false,
  reply: true,
}

export const DEFAULT_CANDIDATE_KNOWLEDGE_POLICIES: CandidateProfileConfig['policies'] = {
  filtering: { maxKnowledgeItems: 10, retrievalMode: 'all' },
  greeting: { maxKnowledgeItems: 4, retrievalMode: 'keyword' },
  reply: { maxKnowledgeItems: 8, retrievalMode: 'keyword' },
}

export function getCurrentShanghaiDate(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function normalizeDate(value: unknown): string {
  if (typeof value !== 'string') return ''
  const normalized = value.trim().replace(/\./g, '-')
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return ''
  const [, year, month, day] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  return date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day)
    ? normalized
    : ''
}

/** 兼容旧知识卡正文中的“有效期：YYYY-MM-DD”，新配置优先使用结构化字段。 */
export function extractLegacyKnowledgeValidUntil(content: string): string {
  const dates = content
    .split('\n')
    .filter((line) => /有效期\s*[：:]/.test(line))
    .flatMap((line) => line.match(/\b\d{4}[.-]\d{2}[.-]\d{2}\b/g) ?? [])
    .map((date) => normalizeDate(date))
    .filter(Boolean)
  return new Set(dates).size === 1 ? dates[0]! : ''
}

export function inferCandidateKnowledgeKeywords(title: string, content: string): string[] {
  const values = [
    ...title.split(/[、，,：:与和及/|]/),
    ...content.split('\n').map((line) => line.match(/^\s*[-*]?\s*([^：:]{2,32})[：:]/)?.[1] ?? ''),
  ]
  const seen = new Set<string>()
  return values
    .map((value) => value.trim())
    .filter((value) => value.length >= 2 && value.length <= 32)
    .filter((value) => {
      const key = value.toLocaleLowerCase('zh-CN')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 12)
}

export function normalizeCandidateKnowledgeItem(
  value: Partial<CandidateKnowledgeItem>,
  legacy = false,
): CandidateKnowledgeItem {
  const tasks = value.tasks
  return {
    id: typeof value.id === 'string' ? value.id.trim().toUpperCase() : '',
    title: typeof value.title === 'string' ? value.title.trim() : '',
    content: typeof value.content === 'string' ? value.content.trim() : '',
    keywords:
      Array.isArray(value.keywords) && value.keywords.length > 0
        ? value.keywords
            .filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
            .map((item) => item.trim())
        : legacy
          ? inferCandidateKnowledgeKeywords(
              typeof value.title === 'string' ? value.title : '',
              typeof value.content === 'string' ? value.content : '',
            )
          : [],
    enabled: value.enabled !== false,
    confirmed: value.confirmed === true,
    tasks: {
      filtering: tasks?.filtering === true,
      greeting: tasks?.greeting === true,
      reply: tasks?.reply ?? DEFAULT_TASK_ACCESS.reply,
    },
    // 旧知识原本已可用于自动回复；新建知识默认关闭自动发送授权。
    autoReplyAllowed: legacy ? value.autoReplyAllowed !== false : value.autoReplyAllowed === true,
    source: typeof value.source === 'string' ? value.source.trim() : '',
    confirmedAt: normalizeDate(value.confirmedAt),
    validUntil:
      normalizeDate(value.validUntil) ||
      (typeof value.content === 'string' ? extractLegacyKnowledgeValidUntil(value.content) : ''),
  }
}

export function normalizeCandidateProfile(
  value: Partial<CandidateProfileConfig> | undefined,
  legacyKnowledge: Partial<CandidateKnowledgeItem>[] = [],
): CandidateProfileConfig {
  const sourceKnowledge = Array.isArray(value?.knowledge) ? value.knowledge : legacyKnowledge
  const usingLegacyKnowledge = !Array.isArray(value?.knowledge)
  const policies = value?.policies
  const normalizePolicy = (
    task: CandidateKnowledgeTask,
    policy: Partial<CandidateKnowledgePolicy> | undefined,
  ): CandidateKnowledgePolicy => {
    const retrievalMode =
      policy?.retrievalMode ?? DEFAULT_CANDIDATE_KNOWLEDGE_POLICIES[task].retrievalMode
    return {
      maxKnowledgeItems: Math.min(
        50,
        Math.max(
          1,
          Number.isFinite(Number(policy?.maxKnowledgeItems))
            ? Math.trunc(Number(policy?.maxKnowledgeItems))
            : DEFAULT_CANDIDATE_KNOWLEDGE_POLICIES[task].maxKnowledgeItems,
        ),
      ),
      retrievalMode: retrievalMode === 'all' ? 'all' : 'keyword',
    }
  }

  return {
    knowledge: sourceKnowledge.map((item) =>
      normalizeCandidateKnowledgeItem(item, usingLegacyKnowledge),
    ),
    policies: {
      filtering: normalizePolicy('filtering', policies?.filtering),
      greeting: normalizePolicy('greeting', policies?.greeting),
      reply: normalizePolicy('reply', policies?.reply),
    },
  }
}

function normalizeSearchText(value: string): string {
  return value.toLocaleLowerCase('zh-CN').replace(/\s+/g, '')
}

function knowledgeScore(item: CandidateKnowledgeItem, query: string): number {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return 0
  const keywordScore = item.keywords.reduce((score, keyword) => {
    const normalizedKeyword = normalizeSearchText(keyword)
    return score + (normalizedKeyword && normalizedQuery.includes(normalizedKeyword) ? 10 : 0)
  }, 0)
  const normalizedTitle = normalizeSearchText(item.title)
  return keywordScore + (normalizedTitle && normalizedQuery.includes(normalizedTitle) ? 3 : 0)
}

export function selectCandidateKnowledge(
  profile: CandidateProfileConfig,
  task: CandidateKnowledgeTask,
  options: {
    query?: string
    currentDate?: string
    autoReplyOnly?: boolean
  } = {},
): CandidateKnowledgeItem[] {
  const policy = profile.policies[task] ?? DEFAULT_CANDIDATE_KNOWLEDGE_POLICIES[task]
  const eligible = profile.knowledge.filter((item) => {
    if (!item.enabled || !item.confirmed || !item.tasks[task]) return false
    if (options.autoReplyOnly && !item.autoReplyAllowed) return false
    if (/有效期\s*[：:]/.test(item.content) && !item.validUntil) return false
    if (item.validUntil && (!options.currentDate || item.validUntil < options.currentDate))
      return false
    return true
  })
  if (policy.retrievalMode === 'all') return eligible.slice(0, policy.maxKnowledgeItems)

  return eligible
    .map((item, index) => ({ item, index, score: knowledgeScore(item, options.query ?? '') }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, policy.maxKnowledgeItems)
    .map(({ item }) => item)
}

export function formatCandidateKnowledge(
  items: CandidateKnowledgeItem[],
  { includeIds = false }: { includeIds?: boolean } = {},
): string {
  return items.length
    ? items
        .map((item) => `${includeIds ? `[${item.id}] ` : ''}${item.title}：${item.content}`)
        .join('\n')
    : '（当前任务没有可用的已确认候选人事实）'
}
