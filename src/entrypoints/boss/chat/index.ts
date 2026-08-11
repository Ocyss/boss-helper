import mqtt from 'mqtt'

import { getUuid } from '@/utils'
import { logger } from '@/utils/logger'

import { ProtoBufferMessage } from './geek-chat-core'
import type { BossRealtimeMessage } from './message-parser'
import { parseBossChatProtocol } from './message-parser'

type BossRealtimeMessageListener = (message: BossRealtimeMessage) => void

export type BossChatSocketStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error'

export interface BossChatSocketState {
  status: BossChatSocketStatus
  detail?: string
}

export interface BossTextMessageTarget {
  uid: string
  friendSource: number
  encryptUid: string
}

export interface BossReadMessageTarget {
  uid: string
  friendSource: number
}

type BossChatSocketStateListener = (state: BossChatSocketState) => void

const MAX_DEDUPLICATED_MESSAGES = 1000
const CONNECTION_STABLE_DELAY_MS = 2000

export class GeekChatClientManager {
  client!: mqtt.MqttClient
  msgBuilder!: ProtoBufferMessage
  private userId = 0
  private readonly listeners = new Set<BossRealtimeMessageListener>()
  private readonly stateListeners = new Set<BossChatSocketStateListener>()
  private readonly seenMessageIds = new Set<string>()
  private readonly messageIdQueue: string[] = []
  private socketState: BossChatSocketState = { status: 'idle' }
  private reconnectAttempts = 0
  private stableConnectionTimer?: ReturnType<typeof setTimeout>
  private lastClientMid = 0

  constructor() {}

  onMessage(listener: BossRealtimeMessageListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  onStateChange(listener: BossChatSocketStateListener): () => void {
    this.stateListeners.add(listener)
    listener(this.socketState)
    return () => this.stateListeners.delete(listener)
  }

  async sendText(target: BossTextMessageTarget, text: string): Promise<void> {
    const normalizedText = text.trim()
    if (!normalizedText) throw new Error('回复内容不能为空')
    if (!this.client?.connected || !this.msgBuilder) {
      throw new Error('BOSS WS 尚未连接，无法发送消息')
    }

    const uid = Number(target.uid)
    if (!Number.isFinite(uid) || uid <= 0 || !target.encryptUid) {
      throw new Error('当前会话缺少发送消息所需的 HR 标识')
    }

    const message = this.msgBuilder.createTextMessage(
      {
        uid,
        friendSource: target.friendSource,
        encryptUid: target.encryptUid,
        encryptGid: '',
        clientMid: this.nextClientMid(),
      },
      { text: normalizedText },
    )

    await new Promise<void>((resolve, reject) => {
      this.client.publish(
        'chat',
        this.msgBuilder.encode(message),
        { qos: 1, retain: true },
        (error) => {
          if (error) reject(error)
          else resolve()
        },
      )
    })
  }

  async markRead(target: BossReadMessageTarget, messageId: string): Promise<void> {
    if (!this.client?.connected || !this.msgBuilder) {
      throw new Error('BOSS WS 尚未连接，无法发送已读回执')
    }

    const uid = Number(target.uid)
    if (!Number.isFinite(uid) || uid <= 0 || !messageId) {
      throw new Error('当前会话缺少发送已读回执所需的标识')
    }

    const message = this.msgBuilder.createReadMessage(
      {
        uid,
        friendSource: target.friendSource,
        clientMid: this.nextClientMid(),
      },
      messageId,
    )

    await new Promise<void>((resolve, reject) => {
      this.client.publish(
        'chat',
        this.msgBuilder.encode(message),
        { qos: 1, retain: true },
        (error) => {
          if (error) reject(error)
          else resolve()
        },
      )
    })
  }

  private nextClientMid(): number {
    this.lastClientMid = Math.max(Date.now(), this.lastClientMid + 1)
    return this.lastClientMid
  }

  private setSocketState(status: BossChatSocketStatus, detail?: string): void {
    if (this.socketState.status === status && this.socketState.detail === detail) return
    this.socketState = { status, detail }
    for (const listener of this.stateListeners) listener(this.socketState)
  }

  private clearStableConnectionTimer(): void {
    if (!this.stableConnectionTimer) return
    clearTimeout(this.stableConnectionTimer)
    this.stableConnectionTimer = undefined
  }

  private markConnectionInterrupted(detail: string): void {
    this.clearStableConnectionTimer()
    const attemptText = this.reconnectAttempts > 0 ? `（第 ${this.reconnectAttempts} 次）` : ''
    this.setSocketState('reconnecting', `${detail}，正在自动重连${attemptText}`)
  }

  private markConnectionEstablished(): void {
    this.clearStableConnectionTimer()
    this.setSocketState('connecting', '连接已建立，正在确认稳定性…')
    this.publishPresence()

    this.stableConnectionTimer = setTimeout(() => {
      this.stableConnectionTimer = undefined
      if (!this.client.connected) return
      this.reconnectAttempts = 0
      this.setSocketState('connected')
    }, CONNECTION_STABLE_DELAY_MS)
  }

  private rememberMessage(id: string): boolean {
    if (this.seenMessageIds.has(id)) return false

    this.seenMessageIds.add(id)
    this.messageIdQueue.push(id)
    if (this.messageIdQueue.length > MAX_DEDUPLICATED_MESSAGES) {
      const expiredId = this.messageIdQueue.shift()
      if (expiredId) this.seenMessageIds.delete(expiredId)
    }
    return true
  }

  private handleMessagePayload(payload: Uint8Array): void {
    try {
      const protocol = this.msgBuilder.decode(new Uint8Array(payload))
      const messages = parseBossChatProtocol(protocol, this.userId)

      for (const message of messages) {
        if (!this.rememberMessage(message.id)) continue
        for (const listener of this.listeners) {
          try {
            listener(message)
          } catch (error) {
            logger.error('处理 BOSS WS 消息失败', error)
          }
        }
      }
    } catch (error) {
      logger.error('解析 BOSS WS 消息失败', error)
    }
  }

  private publishPresence(): void {
    try {
      const presence = this.msgBuilder.createPresenceMessage({
        uniqid: window.Cookie?.get?.('__a') || '',
        clientIP: window._PAGE?.clientIP || '',
      })
      this.client.publish('chat', this.msgBuilder.encode(presence), {
        qos: 1,
        retain: true,
      })
    } catch (error) {
      logger.error('发送 BOSS WS presence 失败', error)
    }
  }

  async connect() {
    this.setSocketState('connecting')

    try {
      const res: {
        code: 0
        message: 'Success'
        zpData: {
          wt2: string
        }
      } = await fetch('https://www.zhipin.com/wapi/zppassport/get/wt').then((res) => res.json())
      if (res.code !== 0) {
        throw new Error(`获取 wt 失败: ${res.message}`)
      }
      const wt = res.zpData.wt2

      const token = window._PAGE?.token

      if (!token) {
        throw new Error('未获取到当前用户 token')
      }

      this.userId = Number(window._PAGE?.uid ?? window._PAGE?.userId)
      if (!Number.isFinite(this.userId) || this.userId <= 0) {
        throw new Error('未获取到当前用户 ID')
      }

      this.msgBuilder = new ProtoBufferMessage({
        userId: this.userId,
        token,
        platform: 'web',
        friendSource: 0,
        supportPush: true,
        wt,
      })

      this.client = mqtt.connect('wss://ws6.zhipin.com/chatws', {
        clientId: `ws-${getUuid(16, 16)}`,
        username: `${token}|0`,
        password: wt,
        keepalive: 25,
        clean: true,
        reconnectPeriod: 1000,
        connectTimeout: 10000,
        protocolVersion: 4,
        createWebsocket: (url: string) => {
          const subProtocols = wt ? [wt] : ['mqtt']
          const socket = new WebSocket(url, subProtocols)
          socket.addEventListener('close', (event) => {
            logger.warn('BOSS WS 底层连接关闭', {
              code: event.code,
              reason: event.reason || undefined,
              wasClean: event.wasClean,
            })
          })
          return socket
        },
      })

      this.client.on('connect', () => this.markConnectionEstablished())
      this.client.on('reconnect', () => {
        this.reconnectAttempts += 1
        this.markConnectionInterrupted('连接短暂中断')
      })
      this.client.on('offline', () => this.markConnectionInterrupted('网络或连接暂不可用'))
      this.client.on('close', () => this.markConnectionInterrupted('连接已关闭'))
      this.client.on('message', (_topic, payload) => this.handleMessagePayload(payload))
      this.client.on('error', (error) => {
        this.markConnectionInterrupted(error.message || '连接发生错误')
        logger.error('BOSS WS 连接错误', error)
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      this.setSocketState('error', detail)
      throw error
    }
  }
}
