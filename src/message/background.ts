import type { Adapter, Message, OnMessage, SendMessage } from 'comctx'
import { openDB } from 'idb'

import type { Browser } from '#imports'
import { browser } from '#imports'
import type {
  BossHumanHandoffNotification,
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

interface StoredFeishuNotificationConfig {
  enabled: boolean
  appId: string
  appSecret: string
  receiveIdType: FeishuReceiveIdType
  receiveId: string
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

function normalizeReceiveIdType(value: unknown): FeishuReceiveIdType {
  return value === 'open_id' ? 'open_id' : 'chat_id'
}

async function readFeishuConfig(): Promise<StoredFeishuNotificationConfig> {
  const stored = await browser.storage.local.get(FEISHU_CONFIG_KEY)
  const value = stored[FEISHU_CONFIG_KEY] as
    | Partial<StoredFeishuNotificationConfig>
    | undefined

  return {
    enabled: Boolean(value?.enabled),
    appId: typeof value?.appId === 'string' ? value.appId.trim() : '',
    appSecret: typeof value?.appSecret === 'string' ? value.appSecret.trim() : '',
    receiveIdType: normalizeReceiveIdType(value?.receiveIdType),
    receiveId: typeof value?.receiveId === 'string' ? value.receiveId.trim() : '',
  }
}

function toPublicFeishuConfig(
  config: StoredFeishuNotificationConfig,
): FeishuNotificationConfigPublic {
  return {
    enabled: config.enabled,
    appId: config.appId,
    appSecretConfigured: Boolean(config.appSecret),
    receiveIdType: config.receiveIdType,
    receiveId: config.receiveId,
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
      enabled: config.enabled,
      configured: Boolean(config.appId && config.appSecret && config.receiveId),
    }
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
    const appSecret =
      args.appSecret?.trim() || (appId === previous.appId ? previous.appSecret : '')
    const receiveId = args.receiveId.trim()

    if (args.enabled && (!appId || !appSecret || !receiveId)) {
      throw new Error('启用飞书通知前必须填写 App ID、App Secret 和接收目标 ID')
    }

    const config: StoredFeishuNotificationConfig = {
      enabled: args.enabled,
      appId,
      appSecret,
      receiveIdType: normalizeReceiveIdType(args.receiveIdType),
      receiveId,
    }
    await browser.storage.local.set({ [FEISHU_CONFIG_KEY]: config })
    if (appId !== previous.appId || appSecret !== previous.appSecret) {
      this.feishuTokenCache = undefined
    }
    return toPublicFeishuConfig(config)
  }

  async testFeishuNotification(): Promise<boolean> {
    const config = await readFeishuConfig()
    if (!config.enabled) throw new Error('飞书通知尚未启用')
    await this.sendFeishuText(config, 'BossHelper 飞书通知测试成功。')
    return true
  }

  async notifyBossHumanHandoff(args: BossHumanHandoffNotification): Promise<boolean> {
    const config = await readFeishuConfig()
    if (!config.enabled) return false

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
    if (!config.appId || !config.appSecret || !config.receiveId) {
      throw new Error('飞书通知配置不完整')
    }

    const token = await this.getFeishuTenantAccessToken(config)
    const url = new URL(FEISHU_MESSAGE_URL)
    url.searchParams.set('receive_id_type', config.receiveIdType)
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        receive_id: config.receiveId,
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
