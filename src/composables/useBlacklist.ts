import { computed, ref } from 'vue'

import { activityLog } from '@/composables/useActivityLog'
import type { JobData } from '@/composables/useHelper'
import { counter } from '@/message'
import { jsonClone } from '@/utils/deepmerge'

export const blacklistStorageKey = 'local:boss-helper-blacklist'

export const blacklistTargets = ['company', 'hr', 'job', 'keyword'] as const
export type BlacklistTarget = (typeof blacklistTargets)[number]

export const blacklistMatchModes = ['exact', 'contains'] as const
export type BlacklistMatchMode = (typeof blacklistMatchModes)[number]

export const blacklistKeywordScopes = [
  'job-name',
  'description',
  'welfare',
  'company-introduction',
  'skills',
] as const
export type BlacklistKeywordScope = (typeof blacklistKeywordScopes)[number]

export const blacklistLists = ['blacklist', 'whitelist'] as const
export type BlacklistList = (typeof blacklistLists)[number]

export interface BlacklistRule {
  id: string
  list: BlacklistList
  target: BlacklistTarget
  matchMode: BlacklistMatchMode
  /** 仅关键词规则使用；未设置表示兼容旧规则，在全部字段中匹配。 */
  keywordScopes?: BlacklistKeywordScope[]
  value: string
  reason: string
  createdAt: number
  expiresAt: number | null
}

export interface BlacklistData {
  version: 1
  rules: BlacklistRule[]
}

export type BlacklistRuleInput = Pick<BlacklistRule, 'target' | 'value'> &
  Partial<Omit<BlacklistRule, 'target' | 'value'>>

export type BlacklistImportMode = 'replace' | 'merge'

const targetLabels: Record<BlacklistTarget, string> = {
  company: '公司',
  hr: '招聘者',
  job: '岗位',
  keyword: '关键词',
}

function createRuleId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function createData(): BlacklistData {
  return { version: 1, rules: [] }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asText(value: unknown, maxLength = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function asTimestamp(value: unknown, fallback: number | null): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value)
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed) && parsed >= 0) return parsed
  }
  return fallback
}

function isTarget(value: unknown): value is BlacklistTarget {
  return typeof value === 'string' && (blacklistTargets as readonly string[]).includes(value)
}

function isMatchMode(value: unknown): value is BlacklistMatchMode {
  return typeof value === 'string' && (blacklistMatchModes as readonly string[]).includes(value)
}

function isList(value: unknown): value is BlacklistList {
  return typeof value === 'string' && (blacklistLists as readonly string[]).includes(value)
}

function isKeywordScope(value: unknown): value is BlacklistKeywordScope {
  return typeof value === 'string' && (blacklistKeywordScopes as readonly string[]).includes(value)
}

function normalizeKeywordScopes(value: unknown): BlacklistKeywordScope[] | undefined {
  if (!Array.isArray(value)) return undefined
  const scopes = Array.from(new Set(value.filter(isKeywordScope)))
  return scopes.length ? scopes : undefined
}

function defaultReason(list: BlacklistList, target: BlacklistTarget, value: string) {
  return `命中${targetLabels[target]}${list === 'whitelist' ? '白名单' : '黑名单'}：${value}`
}

function normalizeRule(raw: unknown, now = Date.now()): BlacklistRule | null {
  if (!isRecord(raw) || !isTarget(raw.target)) return null

  const value = asText(raw.value)
  if (!value) return null

  const id = asText(raw.id, 120) || createRuleId()
  const list = isList(raw.list) ? raw.list : 'blacklist'
  const matchMode = isMatchMode(raw.matchMode) ? raw.matchMode : 'contains'
  const createdAt = asTimestamp(raw.createdAt, now) ?? now
  const expiresAt = asTimestamp(raw.expiresAt, null)
  const reason = asText(raw.reason) || defaultReason(list, raw.target, value)
  const keywordScopes =
    raw.target === 'keyword' ? normalizeKeywordScopes(raw.keywordScopes) : undefined

  return {
    id,
    list,
    target: raw.target,
    matchMode,
    keywordScopes,
    value,
    reason,
    createdAt,
    expiresAt,
  }
}

export function normalizeBlacklistData(input: unknown, now = Date.now()): BlacklistData {
  const rawRules = Array.isArray(input)
    ? input
    : isRecord(input) && Array.isArray(input.rules)
      ? input.rules
      : []
  const ruleIds = new Set<string>()
  const rules: BlacklistRule[] = []

  for (const rawRule of rawRules) {
    const rule = normalizeRule(rawRule, now)
    if (!rule) continue
    while (ruleIds.has(rule.id)) rule.id = createRuleId()
    ruleIds.add(rule.id)
    rules.push(rule)
  }

  return { version: 1, rules }
}

function isExpired(rule: BlacklistRule, now = Date.now()) {
  return rule.expiresAt != null && rule.expiresAt <= now
}

function normalizeForMatch(value: string) {
  return value.trim().toLowerCase()
}

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function candidateValues(
  job: JobData,
  target: BlacklistTarget,
  keywordScopes?: BlacklistKeywordScope[],
): string[] {
  const values: unknown[] = {
    company: [job.brand.key, job.brand.name],
    hr: [job.boss.key, job.boss.name, job.boss.title],
    job: [job.key, job.jobName, job.positionName],
    keyword: keywordScopes?.length
      ? keywordScopes.flatMap((scope) => {
          const scopeValues: Record<BlacklistKeywordScope, unknown[]> = {
            'job-name': [job.jobName, job.positionName],
            description: [job.jobDescription],
            welfare: [job.welfareList],
            'company-introduction': [job.brand.introduce, job.brand.labels],
            skills: [job.showSkills, job.skills, job.jobLabels],
          }
          return scopeValues[scope]
        })
      : [
          job.jobName,
          job.positionName,
          job.jobDescription,
          job.welfareList,
          job.brand.introduce,
          job.brand.labels,
          job.showSkills,
          job.skills,
          job.jobLabels,
        ],
  }[target]

  return Array.from(new Set(values.flatMap(strings).map(normalizeForMatch).filter(Boolean)))
}

export function matchesBlacklistRule(job: JobData, rule: BlacklistRule) {
  const expected = normalizeForMatch(rule.value)
  if (!expected || isExpired(rule)) return false

  return candidateValues(job, rule.target, rule.keywordScopes).some((value) =>
    rule.matchMode === 'exact' ? value === expected : value.includes(expected),
  )
}

function ruleSignature(rule: BlacklistRule) {
  return [
    rule.list,
    rule.target,
    rule.matchMode,
    rule.keywordScopes?.join(',') || 'all',
    normalizeForMatch(rule.value),
  ].join(':')
}

function createBlacklist() {
  const data = ref<BlacklistData>(createData())
  const initialized = ref(false)
  let initializePromise: Promise<void> | null = null
  let saveQueue: Promise<void> = Promise.resolve()

  function queueSave() {
    const snapshot = jsonClone(data.value)
    const pending = saveQueue.then(async () => {
      await counter.storageSet(blacklistStorageKey, snapshot)
    })
    saveQueue = pending.catch(() => {})
    return pending
  }

  function removeExpired(now = Date.now()) {
    const current = data.value.rules
    const rules = current.filter((rule) => !isExpired(rule, now))
    if (rules.length === current.length) return 0
    data.value = { version: 1, rules }
    return current.length - rules.length
  }

  async function init() {
    if (initialized.value) return
    if (initializePromise) return initializePromise

    initializePromise = counter
      .storageGet<unknown>(blacklistStorageKey, createData())
      .then(async (stored) => {
        data.value = normalizeBlacklistData(stored)
        initialized.value = true
        if (removeExpired() > 0) await queueSave()
      })
      .finally(() => {
        initializePromise = null
      })
    return initializePromise
  }

  async function addRule(input: BlacklistRuleInput) {
    try {
      await init()
      const rule = normalizeRule(input)
      if (!rule) throw new Error('黑白名单规则无效')
      const ids = new Set(data.value.rules.map((item) => item.id))
      while (ids.has(rule.id)) rule.id = createRuleId()
      data.value = { version: 1, rules: [...data.value.rules, rule] }
      removeExpired()
      await queueSave()
      activityLog.add({
        category: '黑白名单',
        action: `新增${rule.list === 'whitelist' ? '白名单' : '黑名单'}规则`,
        status: 'success',
        message: `已新增${targetLabels[rule.target]}${rule.list === 'whitelist' ? '白名单' : '黑名单'}规则；后续筛选会立即生效。`,
        detail: { target: rule.target, matchMode: rule.matchMode },
      })
      return jsonClone(rule)
    } catch (error) {
      activityLog.add({
        category: '黑白名单',
        action: '新增规则',
        status: 'error',
        message: '黑白名单规则未保存；请检查规则内容和浏览器存储权限后重试。',
      })
      throw error
    }
  }

  async function removeRule(id: string) {
    try {
      await init()
      const rules = data.value.rules.filter((rule) => rule.id !== id)
      if (rules.length === data.value.rules.length) return false
      data.value = { version: 1, rules }
      await queueSave()
      activityLog.add({
        category: '黑白名单',
        action: '删除规则',
        status: 'success',
        message: '黑白名单规则已删除；后续筛选不再使用该规则。',
      })
      return true
    } catch (error) {
      activityLog.add({
        category: '黑白名单',
        action: '删除规则',
        status: 'error',
        message: '黑白名单规则未删除；请检查浏览器存储权限后重试。',
      })
      throw error
    }
  }

  async function clearRules(list?: BlacklistList) {
    await init()
    const rules = list ? data.value.rules.filter((rule) => rule.list !== list) : []
    const removed = data.value.rules.length - rules.length
    if (!removed) return 0
    data.value = { version: 1, rules }
    await queueSave()
    activityLog.add({
      category: '黑白名单',
      action: '清空规则',
      status: 'success',
      message: `已删除 ${removed} 条${list === 'whitelist' ? '白名单' : list === 'blacklist' ? '黑名单' : '黑白名单'}规则。`,
      detail: { removed },
    })
    return removed
  }

  async function cleanupExpired() {
    await init()
    const removed = removeExpired()
    if (removed) await queueSave()
    return removed
  }

  async function importRules(input: unknown, mode: BlacklistImportMode = 'replace') {
    await init()
    const imported = normalizeBlacklistData(input)
    const activeRules = imported.rules.filter((rule) => !isExpired(rule))

    if (mode === 'replace') {
      data.value = { version: 1, rules: activeRules }
      await queueSave()
      activityLog.add({
        category: '黑白名单',
        action: '导入规则',
        status: 'success',
        message: `已替换为导入的 ${activeRules.length} 条有效规则；过期规则未导入。`,
        detail: { mode, ruleCount: activeRules.length },
      })
      return activeRules.length
    }

    const existing = new Set(data.value.rules.map(ruleSignature))
    const ids = new Set(data.value.rules.map((rule) => rule.id))
    const newRules = activeRules.filter((rule) => {
      const signature = ruleSignature(rule)
      if (existing.has(signature)) return false
      existing.add(signature)
      while (ids.has(rule.id)) rule.id = createRuleId()
      ids.add(rule.id)
      return true
    })
    if (!newRules.length) {
      activityLog.add({
        category: '黑白名单',
        action: '导入规则',
        status: 'skipped',
        message: '导入规则均已存在或已过期，当前黑白名单未发生变化。',
        detail: { mode, ruleCount: 0 },
      })
      return 0
    }
    data.value = { version: 1, rules: [...data.value.rules, ...newRules] }
    await queueSave()
    activityLog.add({
      category: '黑白名单',
      action: '导入规则',
      status: 'success',
      message: `已合并导入 ${newRules.length} 条新规则；重复或过期规则已跳过。`,
      detail: { mode, ruleCount: newRules.length },
    })
    return newRules.length
  }

  function exportRules(): BlacklistData {
    return jsonClone({ version: 1, rules: data.value.rules.filter((rule) => !isExpired(rule)) })
  }

  function evaluate(job: JobData): string | null {
    const activeRules = data.value.rules.filter((rule) => !isExpired(rule))
    if (activeRules.some((rule) => rule.list === 'whitelist' && matchesBlacklistRule(job, rule))) {
      return null
    }
    const rule = activeRules.find(
      (item) => item.list === 'blacklist' && matchesBlacklistRule(job, item),
    )
    return rule?.reason ?? null
  }

  return {
    data: computed(() => jsonClone(data.value)),
    rules: computed(() => jsonClone(data.value.rules)),
    initialized: computed(() => initialized.value),
    init,
    addRule,
    removeRule,
    clearRules,
    cleanupExpired,
    importRules,
    exportRules,
    evaluate,
  }
}

const blacklist = createBlacklist()

export const useBlacklist = () => blacklist
