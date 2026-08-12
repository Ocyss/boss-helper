import type { Adapter, Message, OnMessage, SendMessage } from 'comctx'
import { openDB } from 'idb'

import type { Browser } from '#imports'
import { browser } from '#imports'
import type {
  BossHumanHandoffNotification,
  FeishuBindingInfo,
  FeishuNotificationExportConfig,
  FeishuNotificationConfigInput,
  FeishuNotificationConfigPublic,
  FeishuNotificationStatus,
  FeishuReceiveIdType,
} from '@/types/aiReply'
import type { ResponseType } from '@/utils/request'

export const userKey = 'local:conf-user'

const DB_NAME = 'ExtensionGlobalDB'
const STORE_NAME = 'images'
const FEISHU_CONFIG_KEY = 'boss-helper-feishu-notification'
const FEISHU_REQUEST_TIMEOUT_MS = 15000
const FEISHU_TOKEN_URL = 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal/'
const FEISHU_MESSAGE_URL = 'https://open.feishu.cn/open-apis/im/v1/messages'
const FEISHU_OAUTH_AUTHORIZE_URL = 'https://accounts.feishu.cn/open-apis/authen/v1/authorize'
const FEISHU_OAUTH_TOKEN_URL = 'https://open.feishu.cn/open-apis/authen/v2/oauth/token'
const FEISHU_USER_INFO_URL = 'https://open.feishu.cn/open-apis/authen/v1/user_info'

interface StoredFeishuNotificationConfig {
  appId: string
  appSecret: string
  targetType: FeishuReceiveIdType
  targetId: string
  targetName: string
  boundAt: number
}

interface LegacyStoredFeishuNotificationConfig {
  enabled?: boolean
  receiveIdType?: FeishuReceiveIdType
  receiveId?: string
}

interface FeishuTokenCache {
  credentialKey: string
  token: string
  expiresAt: number
}

interface FeishuApiResponse {
  code?: number
  msg?: string
  tenant_access_token?: string
  expire?: number
}

interface FeishuOAuthTokenResponse extends FeishuApiResponse {
  access_token?: string
}

interface FeishuUserInfoResponse extends FeishuApiResponse {
  data?: {
    open_id?: string
    name?: string
  }
  open_id?: string
  name?: string
}

function normalizeReceiveIdType(value: unknown): FeishuReceiveIdType {
  return value === 'open_id' ? 'open_id' : 'chat_id'
}

function randomBase64Url(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength))
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '')
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '')
}

async function readFeishuConfig(): Promise<StoredFeishuNotificationConfig> {
  const stored = await browser.storage.local.get(FEISHU_CONFIG_KEY)
  const value = stored[FEISHU_CONFIG_KEY] as
    | (Partial<StoredFeishuNotificationConfig> & LegacyStoredFeishuNotificationConfig)
    | undefined

  return {
    appId: typeof value?.appId === 'string' ? value.appId.trim() : '',
    appSecret: typeof value?.appSecret === 'string' ? value.appSecret.trim() : '',
    targetType: normalizeReceiveIdType(value?.targetType ?? value?.receiveIdType),
    targetId:
      typeof value?.targetId === 'string'
        ? value.targetId.trim()
        : typeof value?.receiveId === 'string'
          ? value.receiveId.trim()
          : '',
    targetName: typeof value?.targetName === 'string' ? value.targetName.trim() : '',
    boundAt: Number.isFinite(Number(value?.boundAt)) ? Number(value?.boundAt) : 0,
  }
}

async function writeFeishuConfig(config: StoredFeishuNotificationConfig): Promise<void> {
  await browser.storage.local.set({ [FEISHU_CONFIG_KEY]: config })
}

function toPublicFeishuConfig(
  config: StoredFeishuNotificationConfig,
): FeishuNotificationConfigPublic {
  return {
    appId: config.appId,
    appSecretConfigured: Boolean(config.appSecret),
    bound: Boolean(config.targetId),
    targetName: config.targetName,
    targetType: config.targetType,
    boundAt: config.boundAt,
  }
}

function truncateText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized
}

async function initDB() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    },
  })
}

export class BackgroundCounter {
  private feishuTokenCache?: FeishuTokenCache

  async getFeishuNotificationConfig(): Promise<FeishuNotificationConfigPublic> {
    return toPublicFeishuConfig(await readFeishuConfig())
  }

  async getFeishuNotificationStatus(): Promise<FeishuNotificationStatus> {
    const config = await readFeishuConfig()
    return {
      configured: Boolean(config.appId && config.appSecret && config.targetId),
      targetName: config.targetName,
    }
  }

  async getFeishuBindingInfo(): Promise<FeishuBindingInfo> {
    return { redirectUrl: browser.identity.getRedirectURL('feishu') }
  }

  async openOptionsPage(): Promise<boolean> {
    await browser.runtime.openOptionsPage()
    return true
  }

  async configureFeishuNotification(
    args: FeishuNotificationConfigInput,
  ): Promise<FeishuNotificationConfigPublic> {
    const previous = await readFeishuConfig()
    const appId = args.appId.trim()
    const appSecret = args.appSecret?.trim() || (appId === previous.appId ? previous.appSecret : '')

    const config: StoredFeishuNotificationConfig = {
      appId,
      appSecret,
      targetType: appId === previous.appId ? previous.targetType : 'open_id',
      targetId: appId === previous.appId ? previous.targetId : '',
      targetName: appId === previous.appId ? previous.targetName : '',
      boundAt: appId === previous.appId ? previous.boundAt : 0,
    }
    await writeFeishuConfig(config)
    if (appId !== previous.appId || appSecret !== previous.appSecret) {
      this.feishuTokenCache = undefined
    }
    return toPublicFeishuConfig(config)
  }

  async bindFeishuNotification(): Promise<FeishuNotificationConfigPublic> {
    const config = await readFeishuConfig()
    if (!config.appId || !config.appSecret) {
      throw new Error('请先保存 App ID 和 App Secret')
    }

    const redirectUrl = browser.identity.getRedirectURL('feishu')
    const state = randomBase64Url(24)
    const codeVerifier = randomBase64Url(48)
    const authorizeUrl = new URL(FEISHU_OAUTH_AUTHORIZE_URL)
    authorizeUrl.searchParams.set('client_id', config.appId)
    authorizeUrl.searchParams.set('response_type', 'code')
    authorizeUrl.searchParams.set('redirect_uri', redirectUrl)
    authorizeUrl.searchParams.set('scope', 'auth:user.id:read')
    authorizeUrl.searchParams.set('state', state)
    authorizeUrl.searchParams.set('code_challenge', await sha256Base64Url(codeVerifier))
    authorizeUrl.searchParams.set('code_challenge_method', 'S256')

    const responseUrl = await browser.identity.launchWebAuthFlow({
      url: authorizeUrl.toString(),
      interactive: true,
    })
    if (!responseUrl) throw new Error('飞书授权未返回结果')

    const callbackUrl = new URL(responseUrl)
    if (callbackUrl.searchParams.get('state') !== state) throw new Error('飞书授权状态校验失败')
    const oauthError = callbackUrl.searchParams.get('error')
    if (oauthError) throw new Error(`飞书授权失败：${oauthError}`)
    const code = callbackUrl.searchParams.get('code')
    if (!code) throw new Error('飞书授权结果缺少授权码')

    const tokenResponse = await fetch(FEISHU_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: config.appId,
        client_secret: config.appSecret,
        code,
        redirect_uri: redirectUrl,
        code_verifier: codeVerifier,
      }),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(FEISHU_REQUEST_TIMEOUT_MS),
    })
    const tokenData = (await tokenResponse.json()) as FeishuOAuthTokenResponse
    if (!tokenResponse.ok || tokenData.code !== 0 || !tokenData.access_token) {
      throw new Error(
        `飞书绑定失败：${tokenData.msg || `HTTP ${tokenResponse.status || 'unknown'}`}`,
      )
    }

    const userResponse = await fetch(FEISHU_USER_INFO_URL, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(FEISHU_REQUEST_TIMEOUT_MS),
    })
    const userData = (await userResponse.json()) as FeishuUserInfoResponse
    const openId = userData.data?.open_id || userData.open_id || ''
    const name = userData.data?.name || userData.name || '已绑定用户'
    if (!userResponse.ok || userData.code !== 0 || !openId) {
      throw new Error(`获取飞书绑定用户失败：${userData.msg || `HTTP ${userResponse.status}`}`)
    }

    const boundConfig: StoredFeishuNotificationConfig = {
      ...config,
      targetType: 'open_id',
      targetId: openId,
      targetName: name,
      boundAt: Date.now(),
    }
    await writeFeishuConfig(boundConfig)
    return toPublicFeishuConfig(boundConfig)
  }

  async exportFeishuNotificationConfig(): Promise<FeishuNotificationExportConfig> {
    return await readFeishuConfig()
  }

  async importFeishuNotificationConfig(
    input: FeishuNotificationExportConfig,
  ): Promise<FeishuNotificationConfigPublic> {
    const config: StoredFeishuNotificationConfig = {
      appId: typeof input?.appId === 'string' ? input.appId.trim() : '',
      appSecret: typeof input?.appSecret === 'string' ? input.appSecret.trim() : '',
      targetType: normalizeReceiveIdType(input?.targetType),
      targetId: typeof input?.targetId === 'string' ? input.targetId.trim() : '',
      targetName: typeof input?.targetName === 'string' ? input.targetName.trim() : '',
      boundAt: Number.isFinite(Number(input?.boundAt)) ? Number(input.boundAt) : 0,
    }
    await writeFeishuConfig(config)
    this.feishuTokenCache = undefined
    return toPublicFeishuConfig(config)
  }

  async testFeishuNotification(): Promise<boolean> {
    const config = await readFeishuConfig()
    await this.sendFeishuText(config, 'BossHelper 飞书通知测试成功。')
    return true
  }

  async notifyBossHumanHandoff(args: BossHumanHandoffNotification): Promise<boolean> {
    const config = await readFeishuConfig()
    if (!config.appId || !config.appSecret || !config.targetId) return false

    const lines = [
      '【BossHelper 人工接管】',
      `触发：${args.trigger === 'manual' ? '用户主动处理' : 'HR 新消息'}`,
      `HR：${truncateText(args.recruiterName || '未知招聘者', 80)}`,
      args.companyName ? `公司：${truncateText(args.companyName, 100)}` : '',
      args.jobName ? `岗位：${truncateText(args.jobName, 100)}` : '',
      args.latestMessage ? `最近消息：${truncateText(args.latestMessage, 500)}` : '',
      `原因：${truncateText(args.reason, 500)}`,
      `会话：${truncateText(args.conversationId, 120)}`,
    ].filter(Boolean)

    await this.sendFeishuText(config, lines.join('\n'))
    return true
  }

  private async getFeishuTenantAccessToken(
    config: StoredFeishuNotificationConfig,
  ): Promise<string> {
    const credentialKey = `${config.appId}:${config.appSecret}`
    if (
      this.feishuTokenCache?.credentialKey === credentialKey &&
      this.feishuTokenCache.expiresAt > Date.now() + 5 * 60 * 1000
    ) {
      return this.feishuTokenCache.token
    }

    const response = await fetch(FEISHU_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ app_id: config.appId, app_secret: config.appSecret }),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(FEISHU_REQUEST_TIMEOUT_MS),
    })
    const data = (await response.json()) as FeishuApiResponse
    if (!response.ok) {
      throw new Error(`飞书鉴权失败：HTTP ${response.status} ${data.msg || ''}`.trim())
    }
    if (data.code !== 0 || !data.tenant_access_token) {
      throw new Error(`飞书鉴权失败：${data.msg || `code ${data.code ?? 'unknown'}`}`)
    }

    const expiresIn = Math.max(0, Number(data.expire) || 0)
    this.feishuTokenCache = {
      credentialKey,
      token: data.tenant_access_token,
      expiresAt: Date.now() + expiresIn * 1000,
    }
    return data.tenant_access_token
  }

  private async sendFeishuText(
    config: StoredFeishuNotificationConfig,
    text: string,
  ): Promise<void> {
    if (!config.appId || !config.appSecret || !config.targetId) {
      throw new Error('飞书通知配置不完整')
    }

    const token = await this.getFeishuTenantAccessToken(config)
    const url = new URL(FEISHU_MESSAGE_URL)
    url.searchParams.set('receive_id_type', config.targetType)
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        receive_id: config.targetId,
        msg_type: 'text',
        content: JSON.stringify({ text }),
      }),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(FEISHU_REQUEST_TIMEOUT_MS),
    })
    const data = (await response.json()) as FeishuApiResponse
    if (!response.ok || data.code !== 0) {
      throw new Error(
        `飞书消息发送失败：${response.ok ? '' : `HTTP ${response.status} `}${data.msg || `code ${data.code ?? 'unknown'}`}`,
      )
    }
  }

  async request(args: {
    url: string
    data: RequestInit
    timeout: number
    responseType: ResponseType
  }) {
    console.log('request', args)
    const signal = AbortSignal.timeout(args.timeout * 1000)

    const res = await fetch(args.url, {
      ...args.data,
      signal,
      mode: 'cors',
      credentials: 'include',
    }).then(async (res) => {
      console.log('request res', res)

      if (!res.ok || res.status >= 400) {
        const errorText = await res.text()
        throw new Error(`状态码: ${res.status}: ${errorText}`)
      }

      const result = args.responseType === 'json' ? await res.json() : await res.text()

      return result
    })
    return res
  }

  async notify(args: Browser.notifications.NotificationCreateOptions) {
    await browser.notifications.create({
      type: args.type,
      iconUrl: args.iconUrl,
      title: args.title,
      message: args.message,
    })
    return true
  }

  async backgroundTest(type: 'success' | 'error') {
    if (type === 'error') {
      throw new Error(`background test error date: ${Date.now()}`)
    }
    return Date.now()
  }

  async fetch(...args: Parameters<typeof fetch>) {
    return await fetch(...args)
  }
  async getImage(key: string): Promise<
    | { success: false }
    | {
        success: true
        name: string
        type: string
        buffer: number[]
      }
  > {
    const db = await initDB()
    const file: File | undefined = await db.get(STORE_NAME, key)
    if (!file) {
      return { success: false }
    }
    const arrayBuffer = await file.arrayBuffer()
    return {
      success: true,
      name: file.name,
      type: file.type,
      buffer: Array.from(new Uint8Array(arrayBuffer)),
    }
  }
  async setImage(opt: {
    name: string
    type: string
    buffer: number[]
  }): Promise<{ success: boolean; key: string }> {
    const db = await initDB()
    const file = new File([new Uint8Array(opt.buffer).buffer], opt.name, { type: opt.type })
    const key = `img-${await calculateFileMD5(file)}`
    await db.put(STORE_NAME, file, key)
    return { success: true, key }
  }
}

interface MessageMeta {
  url: string
  injector: 'content' | 'popup'
}

export class ProvideBackgroundAdapter implements Adapter<MessageMeta> {
  sendMessage: SendMessage<MessageMeta> = async (message) => {
    switch (message.meta.injector) {
      case 'content': {
        const tabs = await browser.tabs.query({ url: message.meta.url })
        void tabs.map((tab) => browser.tabs.sendMessage(tab.id!, message))
        break
      }
      case 'popup': {
        await browser.runtime.sendMessage(message).catch((error) => {
          if (error.message.includes('Receiving end does not exist')) {
            return
          }
          throw error
        })
        break
      }
    }
  }
  onMessage: OnMessage<MessageMeta> = (callback) => {
    const handler = (message?: Partial<Message<MessageMeta>>) => {
      if (!message?.meta) {
        return callback(message)
      }
      callback({
        ...message,
        meta: {
          ...message.meta,
          injector: message?.sender?.name as MessageMeta['injector'],
        },
      })
    }
    browser.runtime.onMessage.addListener(handler)
    return () => browser.runtime.onMessage.removeListener(handler)
  }
}

export class InjectBackgroundAdapter implements Adapter<MessageMeta> {
  constructor(public name: MessageMeta['injector'] = 'content') {}
  sendMessage: SendMessage<MessageMeta> = (message) => {
    void browser.runtime.sendMessage(browser.runtime.id, {
      ...message,
      meta: { url: document.location.href, injector: this.name },
    } satisfies Message<MessageMeta>)
  }
  onMessage: OnMessage<MessageMeta> = (callback) => {
    const handler = (message?: Partial<Message<MessageMeta>>) => {
      callback(message)
    }
    browser.runtime.onMessage.addListener(handler)
    return () => browser.runtime.onMessage.removeListener(handler)
  }
}
