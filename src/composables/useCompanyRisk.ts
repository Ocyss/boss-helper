import { computed, ref } from 'vue'

import { activityLog } from '@/composables/useActivityLog'
import type { JobData } from '@/composables/useHelper'
import { counter } from '@/message'
import type { CompanyRiskConfig } from '@/types/formData'
import { evaluateCompanyRisk, normalizeCompanyRiskExternal } from '@/utils/companyRisk'
import type { CompanyRiskResult, NormalizedCompanyRiskExternalData } from '@/utils/companyRisk'
import { logger } from '@/utils/logger'

const cacheKey = 'local:company-risk-external-cache'
const statusKey = 'local:company-risk-external-status'
const maxCacheEntries = 200

type CachedExternalData = {
  fetchedAt: number
  value: NormalizedCompanyRiskExternalData
}

type ExternalCache = Record<string, CachedExternalData>

export type CompanyRiskExternalStatusKind = 'local' | 'cache' | 'external' | 'fallback'

export interface CompanyRiskExternalStatus {
  kind: CompanyRiskExternalStatusKind
  message: string
  updatedAt: number
}

const defaultExternalStatus: CompanyRiskExternalStatus = {
  kind: 'local',
  message: '尚未执行企业信息查询，将使用本地规则。',
  updatedAt: 0,
}
const latestExternalStatus = ref<CompanyRiskExternalStatus>(defaultExternalStatus)
let statusInitialized = false
let statusInitializePromise: Promise<void> | null = null
const externalActivityKeys = new Set<string>()

const externalProviders = ['qichacha', 'tianyancha', 'custom'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isExternalProvider(value: unknown): value is (typeof externalProviders)[number] {
  return typeof value === 'string' && externalProviders.includes(value as never)
}

function cacheId(companyName: string, config: CompanyRiskConfig) {
  return [
    config.external.provider,
    config.external.endpoint,
    companyName.trim().toLowerCase(),
  ].join('|')
}

function parseHeaders(value: string): Record<string, string> {
  if (!value.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] =>
          typeof entry[1] === 'string' && entry[0].trim() !== '',
      ),
    )
  } catch {
    return {}
  }
}

function resolveUrl(endpoint: string, companyName: string) {
  const url = new URL(endpoint.replaceAll('{companyName}', encodeURIComponent(companyName)))
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('企业信息查询地址仅支持 HTTP 或 HTTPS')
  }
  if (!url.searchParams.has('keyword')) url.searchParams.set('keyword', companyName)
  return url.toString()
}

function buildHeaders(config: CompanyRiskConfig): Record<string, string> {
  const headers = parseHeaders(config.external.headers)
  const { apiKey, apiSecret, provider } = config.external
  if (apiKey) {
    if (provider === 'tianyancha') headers.Authorization ??= apiKey
    else if (provider === 'qichacha') headers.Key ??= apiKey
    else headers['X-API-Key'] ??= apiKey
  }
  if (apiSecret) headers['X-API-Secret'] ??= apiSecret
  return headers
}

function isExternalEnabled(config: CompanyRiskConfig) {
  const external = config?.external
  if (!external || !isExternalProvider(external.provider) || !external.endpoint?.trim())
    return false
  if (external.provider !== 'custom' && !external.apiKey?.trim()) return false
  try {
    resolveUrl(external.endpoint.trim(), 'company')
    return true
  } catch {
    return false
  }
}

function externalConfigurationIssue(config: CompanyRiskConfig) {
  const external = config?.external
  if (!external || external.provider === 'none') return '未启用外部企业信息查询，使用本地规则。'
  if (!isExternalProvider(external.provider)) return '企业信息服务商配置无效，已回退本地规则。'
  if (!external.endpoint?.trim()) return '未填写企业信息查询地址，已回退本地规则。'
  if (external.provider !== 'custom' && !external.apiKey?.trim()) {
    return '未填写企业信息 API Key，已回退本地规则。'
  }
  try {
    resolveUrl(external.endpoint.trim(), 'company')
    return null
  } catch {
    return '企业信息查询地址无效，已回退本地规则。'
  }
}

function isExternalStatus(value: unknown): value is CompanyRiskExternalStatus {
  return (
    isRecord(value) &&
    typeof value.message === 'string' &&
    typeof value.updatedAt === 'number' &&
    Number.isFinite(value.updatedAt) &&
    ['local', 'cache', 'external', 'fallback'].includes(String(value.kind))
  )
}

async function setExternalStatus(kind: CompanyRiskExternalStatusKind, message: string) {
  const status = { kind, message, updatedAt: Date.now() }
  latestExternalStatus.value = status
  try {
    await counter.storageSet(statusKey, status)
  } catch (error) {
    logger.warn('企业风险状态保存失败', error)
  }
}

function recordExternalActivity(
  kind: CompanyRiskExternalStatusKind,
  message: string,
  config: CompanyRiskConfig,
  companyName?: string,
) {
  const provider = config.external?.provider || 'none'
  const key = `${kind}:${provider}:${companyName || message}`
  if (externalActivityKeys.has(key)) return
  externalActivityKeys.add(key)
  activityLog.add({
    category: '企业信息',
    action: '企业风险查询',
    status:
      kind === 'external' || kind === 'cache'
        ? 'success'
        : kind === 'local'
          ? 'skipped'
          : message.includes('查询失败')
            ? 'error'
            : 'action_required',
    message,
    detail: { provider, source: kind, company: companyName ? '已查询' : '未查询' },
  })
}

export function useCompanyRiskExternalStatus() {
  async function init() {
    if (statusInitialized) return
    if (statusInitializePromise) return statusInitializePromise
    statusInitializePromise = counter
      .storageGet<unknown>(statusKey, defaultExternalStatus)
      .then((stored) => {
        if (isExternalStatus(stored)) latestExternalStatus.value = stored
        statusInitialized = true
      })
      .catch((error) => {
        logger.warn('企业风险状态读取失败', error)
      })
      .finally(() => {
        statusInitializePromise = null
      })
    return statusInitializePromise
  }

  return { status: computed(() => latestExternalStatus.value), init }
}

async function loadCache(): Promise<ExternalCache> {
  const stored = await counter.storageGet<unknown>(cacheKey, {})
  if (!isRecord(stored)) return {}

  return Object.fromEntries(
    Object.entries(stored).filter(
      (entry): entry is [string, CachedExternalData] =>
        isRecord(entry[1]) &&
        typeof entry[1].fetchedAt === 'number' &&
        Number.isFinite(entry[1].fetchedAt) &&
        isRecord(entry[1].value),
    ),
  )
}

async function saveCache(cache: ExternalCache) {
  const entries = Object.entries(cache)
    .sort(([, left], [, right]) => right.fetchedAt - left.fetchedAt)
    .slice(0, maxCacheEntries)
  await counter.storageSet(cacheKey, Object.fromEntries(entries))
}

async function getExternalData(job: JobData, config: CompanyRiskConfig) {
  const external = config?.external
  const configurationIssue = externalConfigurationIssue(config)
  if (configurationIssue) {
    await setExternalStatus(
      external?.provider === 'none' ? 'local' : 'fallback',
      configurationIssue,
    )
    recordExternalActivity(
      external?.provider === 'none' ? 'local' : 'fallback',
      configurationIssue,
      config,
    )
    return null
  }
  if (!external || !isExternalProvider(external.provider) || !isExternalEnabled(config)) return null
  if (!job.brand.name.trim()) {
    await setExternalStatus('fallback', '缺少公司名称，已回退本地规则。')
    recordExternalActivity('fallback', '缺少公司名称，已回退本地规则。', config)
    return null
  }

  const { provider } = external
  const companyName = job.brand.name.trim()

  const id = cacheId(companyName, config)
  let cache: ExternalCache = {}
  try {
    cache = await loadCache()
  } catch (error) {
    logger.warn('企业风险缓存读取失败，将直接查询并回退本地规则', error)
  }
  const cached = cache[id]
  const ttl = Math.max(1, external.cacheMinutes || 60) * 60 * 1000
  if (cached && Date.now() - cached.fetchedAt < ttl) {
    const value = normalizeCompanyRiskExternal({ provider, raw: cached.value })
    if (value) {
      await setExternalStatus('cache', '已使用本地缓存的企业信息。')
      recordExternalActivity('cache', '已使用本地缓存的企业信息完成风险评估。', config, companyName)
      return value
    }
  }

  try {
    const raw = await counter.request({
      url: resolveUrl(external.endpoint.trim(), companyName),
      data: {
        method: 'GET',
        headers: buildHeaders(config),
      },
      timeout: 15,
      responseType: 'json',
    })
    const value = normalizeCompanyRiskExternal({ provider, raw })
    if (!value) {
      logger.warn('企业风险外部响应未包含可识别字段，已回退本地规则', { provider, companyName })
      await setExternalStatus('fallback', '外部响应未包含可识别风险字段，已回退本地规则。')
      recordExternalActivity(
        'fallback',
        '外部企业信息未返回可识别风险字段，已使用本地规则；请检查服务商接口配置。',
        config,
        companyName,
      )
      return null
    }
    cache[id] = { fetchedAt: Date.now(), value }
    try {
      await saveCache(cache)
    } catch (error) {
      logger.warn('企业风险缓存保存失败，本次结果仍将使用', error)
    }
    await setExternalStatus('external', '本次已成功查询外部企业信息。')
    recordExternalActivity('external', '已查询外部企业信息并用于风险评估。', config, companyName)
    return value
  } catch (error) {
    logger.warn('企业风险外部查询失败，已回退本地规则', { provider, companyName, error })
    await setExternalStatus('fallback', '外部企业信息查询失败，已回退本地规则。')
    recordExternalActivity(
      'fallback',
      '外部企业信息查询失败，已使用本地规则；请检查服务商地址、密钥和网络后重试。',
      config,
      companyName,
    )
    return null
  }
}

export async function evaluateJobCompanyRisk(
  job: JobData,
  config: CompanyRiskConfig,
  options: { postingCount?: number; hrActiveDaysAgo?: number } = {},
): Promise<CompanyRiskResult> {
  const external = await getExternalData(job, config)
  return evaluateCompanyRisk({
    job,
    postingCount: options.postingCount,
    hrActiveDaysAgo: options.hrActiveDaysAgo,
    external: external
      ? {
          provider: external.provider,
          raw: external,
          adapter: () => external,
        }
      : undefined,
  })
}
