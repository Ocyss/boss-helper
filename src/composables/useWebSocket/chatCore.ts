import {
  BOSS_HELPER_CHAT_BRIDGE_RESULT,
  BOSS_HELPER_CHAT_BRIDGE_SOURCE,
  type BossHelperChatMessageArgs,
  type BossHelperChatSendResult,
  isBossHelperChatSendRequest,
} from './chatBridge'
import { logger } from '@/utils/logger'

type GeekChatCoreVersion = '1.0.8' | '2.0.1'

interface GeekChatCoreClient {
  on: (event: string, handler: (...args: any[]) => void) => void
  off?: (event: string, handler: (...args: any[]) => void) => void
  sendMessage: (
    friend: {
      uid: number
      friendSource: number
      encryptUid: string
      encryptGid: string
      clientMid: number
    },
    message: string,
    messageType: string,
  ) => void
}

const GEEK_CHAT_TOGGLE_SYSTEM = '9E2145704D3D49648DD85D6DDAC1CF0D'
const GEEK_CHAT_DEFAULT_VERSION: GeekChatCoreVersion = '1.0.8'
const GEEK_CHAT_VERSION_V2: GeekChatCoreVersion = '2.0.1'
const GEEK_CHAT_SCRIPT_TS = '20260123'
const GEEK_CHAT_TIMEOUT_MS = 20000
const GEEK_CHAT_BRIDGE_FLAG = '__BOSS_HELPER_GEEK_CHAT_BRIDGE_READY__'

let scriptPromise: Promise<void> | null = null
let clientPromise: Promise<GeekChatCoreClient> | null = null

function getTokenHeader() {
  return window._PAGE?.token?.split('|')?.[0] ?? ''
}

function getCookieValue(name: string) {
  try {
    if (window.Cookie?.get != null) {
      return window.Cookie.get(name) ?? ''
    }
  } catch (error) {
    logger.warn('读取 Cookie.get 失败', error)
  }

  const matches = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return matches?.[1] != null ? decodeURIComponent(matches[1]) : ''
}

function createRequestHeaders() {
  const headers = new Headers({
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  })

  const token = getTokenHeader()
  if (token) {
    headers.set('token', token)
  }

  const zpToken = getCookieValue('bst')
  if (zpToken) {
    headers.set('zp_token', zpToken)
  }

  return headers
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
    ...init,
    headers: {
      ...Object.fromEntries(createRequestHeaders().entries()),
      ...Object.fromEntries(new Headers(init?.headers).entries()),
    },
  })

  if (!response.ok) {
    throw new Error(`请求失败: ${response.status}`)
  }

  return (await response.json()) as T
}

async function getGeekChatCoreVersion(): Promise<GeekChatCoreVersion> {
  try {
    const data = await requestJson<{
      zpData?: {
        c_geek_chat_core_sdk_v2?: { result?: number }
      }
    }>('/wapi/zpCommon/toggle/all', {
      method: 'POST',
      body: new URLSearchParams({
        system: GEEK_CHAT_TOGGLE_SYSTEM,
      }),
    })

    if ((data?.zpData?.c_geek_chat_core_sdk_v2?.result ?? 0) > 0) {
      return GEEK_CHAT_VERSION_V2
    }
  } catch (error) {
    logger.warn('获取 GeekChatCore 版本失败，回退默认版本', error)
  }

  return GEEK_CHAT_DEFAULT_VERSION
}

async function getSupportPush() {
  try {
    const data = await requestJson<{
      code?: number
      zpData?: {
        userNotifySettingList?: Array<{
          notifyType?: number
          settingType?: number
        }>
      }
    }>('/wapi/zpchat/notify/setting/get')

    return (data?.zpData?.userNotifySettingList ?? []).some(
      (item) => item.notifyType === 113 && item.settingType === 4,
    )
  } catch (error) {
    logger.warn('获取 supportPush 失败，按 false 处理', error)
    return false
  }
}

function buildGeekChatCoreScriptUrl(version: GeekChatCoreVersion) {
  return `https://static.zhipin.com/assets/sdk/geek-chat/js/geek-chat-core.${version}.umd.min.js?from=geek-pc&t=${GEEK_CHAT_SCRIPT_TS}`
}

async function loadGeekChatCoreScript(version: GeekChatCoreVersion) {
  if (window.GeekChatCore != null) {
    return
  }

  if (scriptPromise != null) {
    return scriptPromise
  }

  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = buildGeekChatCoreScriptUrl(version)
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`GeekChatCore 脚本加载失败: ${version}`))
    ;(document.head ?? document.documentElement).appendChild(script)
  }).catch((error) => {
    scriptPromise = null
    throw error
  })

  return scriptPromise
}

async function initGeekChatClient() {
  const userId = window._PAGE?.uid ?? window._PAGE?.userId
  const token = window._PAGE?.token

  if (userId == null) {
    throw new Error('未获取到当前用户 uid')
  }

  if (!token) {
    throw new Error('未获取到当前用户 token')
  }

  const [version, supportPush] = await Promise.all([getGeekChatCoreVersion(), getSupportPush()])
  await loadGeekChatCoreScript(version)

  if (window.GeekChatCore?.init == null) {
    throw new Error('GeekChatCore.init 不可用')
  }

  return (await window.GeekChatCore.init({
    userId,
    token,
    platform: 'web',
    friendSource: 0,
    supportPush,
  })) as GeekChatCoreClient
}

async function ensureGeekChatClient() {
  if (clientPromise != null) {
    return clientPromise
  }

  clientPromise = initGeekChatClient().catch((error) => {
    clientPromise = null
    throw error
  })

  return clientPromise
}

function normalizeChatError(error: unknown) {
  if (error instanceof Error) {
    return error
  }

  return new Error(typeof error === 'string' ? error : '聊天发送失败')
}

function waitForChatSendResult(client: GeekChatCoreClient, clientMid: number) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timer)
      client.off?.('messageDelivered', handleDelivered)
      client.off?.('sendError', handleSendError)
    }

    const isMatched = (message: any) => {
      const mid = String(message?.cmid ?? message?.clientMid ?? '')
      return mid === String(clientMid)
    }

    const handleDelivered = (messages: any) => {
      const list = Array.isArray(messages) ? messages : [messages]
      if (list.some(isMatched)) {
        cleanup()
        resolve()
      }
    }

    const handleSendError = (payload: any) => {
      const message = payload?.message ?? payload
      if (!isMatched(message)) {
        return
      }

      cleanup()
      reject(new Error(payload?.error ?? '聊天消息发送失败'))
    }

    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error('聊天连接建立成功，但消息发送超时'))
    }, GEEK_CHAT_TIMEOUT_MS)

    client.on('messageDelivered', handleDelivered)
    client.on('sendError', handleSendError)
  })
}

export async function sendChatByGeekChatCore(args: BossHelperChatMessageArgs) {
  const content = args.content?.trim()
  if (!content) {
    throw new Error('打招呼内容为空')
  }

  const client = await ensureGeekChatClient()
  const clientMid = Date.now()
  const waitForResult = waitForChatSendResult(client, clientMid)

  client.sendMessage(
    {
      uid: Number(args.to_uid),
      friendSource: args.friend_source ?? 0,
      encryptUid: args.to_name,
      encryptGid: '',
      clientMid,
    },
    content,
    'text',
  )

  await waitForResult
}

function createSendResult(
  requestId: string,
  success: boolean,
  error?: string,
): BossHelperChatSendResult {
  return {
    source: BOSS_HELPER_CHAT_BRIDGE_SOURCE,
    type: BOSS_HELPER_CHAT_BRIDGE_RESULT,
    requestId,
    success,
    error,
  }
}

export function initGeekChatBridge() {
  if (window[GEEK_CHAT_BRIDGE_FLAG] === true) {
    return
  }

  window[GEEK_CHAT_BRIDGE_FLAG] = true

  window.addEventListener('message', (event) => {
    if (event.source !== window || !isBossHelperChatSendRequest(event.data)) {
      return
    }

    const { requestId, payload } = event.data

    void sendChatByGeekChatCore(payload)
      .then(() => {
        window.postMessage(createSendResult(requestId, true), '*')
      })
      .catch((error) => {
        const normalizedError = normalizeChatError(error)
        logger.error('主世界聊天发送失败', normalizedError)
        window.postMessage(createSendResult(requestId, false, normalizedError.message), '*')
      })
  })
}
