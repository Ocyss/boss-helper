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
}

interface BossFriendIndexData {
  friendList?: BossFriendIndexItem[]
}

interface BossLastMessageInfo {
  msgId?: number
  showText?: string
  fromId?: number
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
  isTop?: boolean | number
  lastTS?: number
  lastMessageInfo?: BossLastMessageInfo
}

interface BossFriendDetailData {
  result?: BossFriendDetail[]
}

export interface BossConversationSummary {
  id: string
  friendId: number
  friendSource: number
  name: string
  avatar: string
  companyName: string
  jobName: string
  lastMessage: string
  lastMessageAt: number
  isTop: boolean
  encryptBossId: string
  encryptJobId: string
  securityId: string
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

function getConversationId(friendId: number, friendSource: number): string {
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
  const friendId = toFiniteNumber(indexItem.friendId)
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
    lastMessage: detail?.lastMessageInfo?.showText || '',
    lastMessageAt: detail?.lastTS || indexItem.updateTime || 0,
    isTop: Boolean(detail?.isTop),
    encryptBossId: detail?.encryptBossId || indexItem.encryptFriendId || '',
    encryptJobId: detail?.encryptJobId || '',
    securityId: detail?.securityId || '',
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
    const friendId = String(toFiniteNumber(item.friendId))
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
    const friendId = toFiniteNumber(detail.uid)
    const friendSource = toFiniteNumber(detail.friendSource)
    if (friendId > 0) details.set(getConversationId(friendId, friendSource), detail)
  }

  const items = pageItems
    .map((item) => {
      const id = getConversationId(toFiniteNumber(item.friendId), toFiniteNumber(item.friendSource))
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
