import type { BossProtoMessage } from './message-parser'

const CHATBOT_ID = 1400400
const DEFAULT_PAGE_SIZE = 100
const REQUEST_TIMEOUT_MS = 15000

interface BossApiResponse<T> {
  code: number
  message?: string
  zpData?: T
}

interface BossFriendIndexItem {
  friendId?: number | string
  friendSource?: number | string
  updateTime?: number
  encryptFriendId?: string
  name?: string
  brandName?: string
  jobTypeDesc?: string
  jobCity?: string
  positionName?: string
  jobName?: string
  bossTitle?: string
  encryptJobId?: string
  securityId?: string
  lid?: string
  jobId?: number | string
  unreadCount?: number | string
}

interface BossFriendIndexData {
  friendList?: BossFriendIndexItem[]
}

interface BossLastMessageInfo {
  msgId?: number | string
  showText?: string
  fromId?: number | string
  status?: number
}

interface BossFriendDetail {
  uid?: number | string
  friendSource?: number | string
  name?: string
  avatar?: string
  brandName?: string
  title?: string
  sourceTitle?: string
  encryptBossId?: string
  encryptJobId?: string
  securityId?: string
  lid?: string
  jobId?: number | string
  jobSource?: number | string
  isTop?: boolean | number
  lastTS?: number
  lastMessageInfo?: BossLastMessageInfo
  unreadCount?: number | string
}

interface BossFriendDetailData {
  result?: BossFriendDetail[]
}

export interface BossConversationSummary {
  id: string
  friendId: string
  friendSource: number
  name: string
  avatar: string
  companyName: string
  jobName: string
  lastMessageId: string
  lastMessageFromId: string
  lastMessage: string
  lastMessageAt: number
  isTop: boolean
  encryptBossId: string
  encryptJobId: string
  securityId: string
  jobLid: string
  jobId: string
  unreadCount?: number
}

interface BossConversationHistoryData {
  messages?: BossProtoMessage[]
  hasMore?: boolean
  minMsgId?: number | string
}

export interface BossConversationHistoryPage {
  messages: BossProtoMessage[]
  hasMore: boolean
  minMessageId: string
}

export interface BossConversationPage {
  items: BossConversationSummary[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

function toFiniteNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function toOptionalCount(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : undefined
}

function toId(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'number') return Number.isFinite(value) ? String(Math.trunc(value)) : ''
  if (typeof value === 'bigint') return value.toString()
  return String(value).trim()
}

function getConversationId(friendId: string, friendSource: number): string {
  return `${friendId}-${friendSource}`
}

function createTraceId(): string {
  const timePart = Date.now().toString(16).slice(-6)
  const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let randomPart = ''

  for (let index = 0; index < 10; index += 1) {
    randomPart += chars[Math.floor(Math.random() * chars.length)]
  }

  return `F-${timePart}${randomPart}`
}

function getBossToken(): string {
  return window.Cookie?.get?.('bst') ?? ''
}

export async function waitForBossSession(timeoutMs = 20000): Promise<void> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    if (getBossToken()) return
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  throw new Error('未获取到 BOSS 登录态，请确认已登录后刷新页面')
}

async function requestBossApi<T>(url: URL, init: RequestInit = {}): Promise<T> {
  const token = getBossToken()
  if (!token) {
    throw new Error('BOSS 登录态不可用，请重新登录后再试')
  }

  const headers = new Headers(init.headers)
  headers.set('Zp_token', token)
  headers.set('traceId', createTraceId())

  const response = await fetch(url, {
    ...init,
    credentials: 'include',
    headers,
    signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!response.ok) {
    throw new Error(`BOSS 接口请求失败：HTTP ${response.status}`)
  }

  const data = (await response.json()) as BossApiResponse<T>
  if (data.code !== 0) {
    throw new Error(`BOSS 接口返回错误：${data.message || `code ${data.code}`}`)
  }

  if (!data.zpData) {
    throw new Error('BOSS 接口未返回会话数据')
  }

  return data.zpData
}

function normalizeConversation(
  indexItem: BossFriendIndexItem,
  detail?: BossFriendDetail,
): BossConversationSummary {
  const friendId = toId(indexItem.friendId)
  const friendSource = toFiniteNumber(indexItem.friendSource)

  return {
    id: getConversationId(friendId, friendSource),
    friendId,
    friendSource,
    name: detail?.name || indexItem.name || '未知招聘者',
    avatar: detail?.avatar || '',
    companyName: detail?.brandName || indexItem.brandName || '',
    jobName:
      indexItem.jobName ||
      indexItem.positionName ||
      detail?.sourceTitle ||
      detail?.title ||
      indexItem.bossTitle ||
      '',
    lastMessageId: toId(detail?.lastMessageInfo?.msgId),
    lastMessageFromId: toId(detail?.lastMessageInfo?.fromId),
    lastMessage: detail?.lastMessageInfo?.showText || '',
    lastMessageAt: detail?.lastTS || indexItem.updateTime || 0,
    isTop: Boolean(detail?.isTop),
    encryptBossId: detail?.encryptBossId || indexItem.encryptFriendId || '',
    encryptJobId: detail?.encryptJobId || indexItem.encryptJobId || '',
    securityId: detail?.securityId || indexItem.securityId || '',
    jobLid: detail?.lid || indexItem.lid || '',
    jobId: toId(detail?.jobId || indexItem.jobId),
    unreadCount: toOptionalCount(detail?.unreadCount ?? indexItem.unreadCount),
  }
}

export async function fetchBossConversationHistory(
  target: Pick<BossConversationSummary, 'encryptBossId' | 'friendSource' | 'securityId'>,
  page = 1,
  pageSize = 30,
  maxMessageId = '0',
): Promise<BossConversationHistoryPage> {
  if (!target.encryptBossId || !target.securityId) {
    throw new Error('当前会话缺少读取聊天记录所需的 HR 或安全标识')
  }

  const url = new URL('/wapi/zpchat/geek/historyMsg', window.location.origin)
  url.searchParams.set('bossId', target.encryptBossId)
  url.searchParams.set('maxMsgId', maxMessageId || '0')
  url.searchParams.set('c', String(Math.min(50, Math.max(1, Math.floor(pageSize)))))
  url.searchParams.set('page', String(Math.max(1, Math.floor(page))))
  url.searchParams.set('src', String(target.friendSource))
  url.searchParams.set('securityId', target.securityId)

  const data = await requestBossApi<BossConversationHistoryData>(url)
  if (!Array.isArray(data.messages)) throw new Error('BOSS 聊天记录格式发生变化')

  return {
    messages: data.messages,
    hasMore: Boolean(data.hasMore),
    minMessageId: toId(data.minMsgId),
  }
}

export async function fetchBossConversationPage(
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<BossConversationPage> {
  const normalizedPage = Math.max(1, Math.floor(page))
  const normalizedPageSize = Math.min(DEFAULT_PAGE_SIZE, Math.max(1, Math.floor(pageSize)))

  const indexUrl = new URL('/wapi/zprelation/friend/geekFilterByLabel', window.location.origin)
  indexUrl.searchParams.set('labelId', '0')
  const indexData = await requestBossApi<BossFriendIndexData>(indexUrl)

  if (!Array.isArray(indexData.friendList)) {
    throw new Error('BOSS 会话索引格式发生变化')
  }

  // BOSS SDK 使用相同规则排除机器人和小于 1000 的系统账号。
  const allHrConversations = indexData.friendList.filter((item) => {
    const friendId = toFiniteNumber(item.friendId)
    const friendSource = toFiniteNumber(item.friendSource)
    return friendId > 1000 && friendId !== CHATBOT_ID && (friendSource === 0 || friendSource === 1)
  })

  const start = (normalizedPage - 1) * normalizedPageSize
  const pageItems = allHrConversations.slice(start, start + normalizedPageSize)
  if (pageItems.length === 0) {
    return {
      items: [],
      total: allHrConversations.length,
      page: normalizedPage,
      pageSize: normalizedPageSize,
      hasMore: false,
    }
  }

  const bossFriendIds: string[] = []
  const directFriendIds: string[] = []
  for (const item of pageItems) {
    const friendId = toId(item.friendId)
    if (toFiniteNumber(item.friendSource) === 1) {
      directFriendIds.push(friendId)
    } else {
      bossFriendIds.push(friendId)
    }
  }

  const requestBody = new URLSearchParams()
  if (bossFriendIds.length > 0) requestBody.set('friendIds', bossFriendIds.join(','))
  if (directFriendIds.length > 0) requestBody.set('dzFriendIds', directFriendIds.join(','))

  const detailUrl = new URL(
    '/wapi/zprelation/friend/getGeekFriendList.json',
    window.location.origin,
  )
  const detailData = await requestBossApi<BossFriendDetailData>(detailUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: requestBody,
  })

  if (!Array.isArray(detailData.result)) {
    throw new Error('BOSS 会话详情格式发生变化')
  }

  const details = new Map<string, BossFriendDetail>()
  for (const detail of detailData.result) {
    const friendId = toId(detail.uid)
    const friendSource = toFiniteNumber(detail.friendSource)
    if (toFiniteNumber(friendId) > 0) details.set(getConversationId(friendId, friendSource), detail)
  }

  const items = pageItems
    .map((item) => {
      const id = getConversationId(toId(item.friendId), toFiniteNumber(item.friendSource))
      return normalizeConversation(item, details.get(id))
    })
    .sort(
      (left, right) =>
        Number(right.isTop) - Number(left.isTop) || right.lastMessageAt - left.lastMessageAt,
    )

  return {
    items,
    total: allHrConversations.length,
    page: normalizedPage,
    pageSize: normalizedPageSize,
    hasMore: start + pageItems.length < allHrConversations.length,
  }
}
