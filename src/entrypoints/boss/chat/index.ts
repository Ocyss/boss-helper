import mqtt from 'mqtt'

import { setChatConnectionStatus } from '@/chatAutomation/connection'
import { activityLog } from '@/composables/useActivityLog'
import { getUuid } from '@/utils'
import { logger } from '@/utils/logger'

import { ProtoBufferMessage } from './geek-chat-core'

export class GeekChatClientManager {
  client!: mqtt.MqttClient
  msgBuilder!: ProtoBufferMessage
  private incomingListeners = new Set<(message: Record<string, unknown>) => void>()
  private ownMessageListeners = new Set<
    (message: Record<string, unknown>, isExtensionMessage: boolean) => void
  >()
  private extensionMessages = new Map<string, number>()
  private connecting: Promise<void> | null = null

  constructor() {}

  async connect() {
    if (this.client?.connected) return
    if (this.connecting) return this.connecting
    if (this.client) {
      setChatConnectionStatus({ state: 'connecting' })
      return this.waitForConnection(this.client).catch((error) => {
        setChatConnectionStatus({ state: 'failed', error: connectionErrorMessage(error) })
        throw error
      })
    }

    setChatConnectionStatus({ state: 'connecting' })
    this.connecting = this.connectOnce()
      .catch((error) => {
        setChatConnectionStatus({ state: 'failed', error: connectionErrorMessage(error) })
        throw error
      })
      .finally(() => {
        this.connecting = null
      })
    return this.connecting
  }

  private async connectOnce() {
    const res: {
      code: 0
      message: 'Success'
      zpData: {
        wt2: string
      }
    } = await fetch(`https://www.zhipin.com/wapi/zppassport/get/wt`).then((res) => res.json())
    if (res.code !== 0) {
      throw new Error(`获取 wt 失败: ${res.message}`)
    }
    const wt = res.zpData.wt2

    const token = window._PAGE?.token

    if (!token) {
      throw new Error('未获取到当前用户 token')
    }

    this.client = mqtt.connect(`wss://ws6.zhipin.com/chatws`, {
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
        return new WebSocket(url, subProtocols)
      },
    })

    this.msgBuilder = new ProtoBufferMessage({
      userId: Number(window._PAGE?.uid ?? window._PAGE?.userId),
      token,
      platform: 'web',
      friendSource: 0,
      supportPush: true,
      wt,
    })
    this.client.on('message', (_topic, payload) => this.handleIncomingPayload(payload))
    this.client.on('connect', () => {
      setChatConnectionStatus({ state: 'connected' })
      this.client.subscribe('chat', { qos: 1 }, (error) => {
        if (error) {
          logger.warn('聊天消息订阅失败', error)
          activityLog.add({
            category: '聊天自动化',
            action: '订阅新消息',
            status: 'error',
            message: '聊天服务已连接，但暂时无法订阅新消息。请点击“重新连接”后再试。',
          })
        }
      })
    })
    this.client.on('error', (error) => {
      setChatConnectionStatus({ state: 'failed', error: connectionErrorMessage(error) })
      logger.warn('聊天通道错误', error)
    })
    this.client.on('reconnect', () => setChatConnectionStatus({ state: 'connecting' }))
    try {
      await this.waitForConnection(this.client)
    } catch (error) {
      setChatConnectionStatus({ state: 'failed', error: connectionErrorMessage(error) })
      throw error
    }
  }

  onIncomingMessage(listener: (message: Record<string, unknown>) => void) {
    this.incomingListeners.add(listener)
    return () => this.incomingListeners.delete(listener)
  }

  onOwnMessage(listener: (message: Record<string, unknown>, isExtensionMessage: boolean) => void) {
    this.ownMessageListeners.add(listener)
    return () => this.ownMessageListeners.delete(listener)
  }

  async retry() {
    activityLog.add({
      category: '聊天自动化',
      action: '重新连接聊天服务',
      status: 'action_required',
      message: '正在重新连接聊天服务，请保持 BOSS 页面打开并等待连接结果。',
    })
    if (this.client && !this.client.connected) this.client.reconnect()
    await this.connect()
  }

  async sendText(message: Record<string, unknown>, text: string) {
    const senderId = Number(message.senderId)
    const friendSource = Number(message.senderSource ?? 0)
    if (!Number.isFinite(senderId) || !text.trim()) throw new Error('聊天收件人或回复内容无效')
    await this.connect()
    if (!this.client?.connected) throw new Error('聊天通道未连接')

    const payload = this.msgBuilder.createTextMessage(
      {
        uid: senderId,
        friendSource,
        encryptUid: '',
        encryptGid: '',
        clientMid: Date.now(),
      },
      { text: text.trim() },
    )
    this.rememberExtensionMessage(senderId, friendSource, text)
    await new Promise<void>((resolve, reject) => {
      this.client.publish(
        'chat',
        this.msgBuilder.encode(payload),
        { qos: 1, retain: true },
        (error) => {
          if (error) reject(error)
          else resolve()
        },
      )
    })
  }

  private handleIncomingPayload(payload: Uint8Array) {
    try {
      const protocol = this.msgBuilder.decode(new Uint8Array(payload)) as {
        messages?: Array<Record<string, any>>
      }
      for (const message of protocol.messages ?? []) {
        const from = message.from ?? {}
        const body = message.body ?? {}
        const senderId = String(from.uid ?? '')
        const messageId = String(message.mid ?? message.cmid ?? '')
        const text = typeof body.text === 'string' ? body.text.trim() : ''
        if (!senderId || !messageId || !text || body.type !== 1 || message.offline === true)
          continue
        const senderSource = Number(from.source ?? 0)
        const isSelf = senderId === String(this.msgBuilder.config.userId)
        if (isSelf) {
          // Only treat explicit outgoing envelopes as user action. Some protocol frames are
          // self-authored system echoes and do not identify a recipient reliably.
          const recipient = message.to ?? {}
          const recipientId = String(recipient.uid ?? '')
          if (!recipientId) continue
          const recipientSource = Number(recipient.source ?? 0)
          const isExtensionMessage = this.consumeExtensionMessage(
            recipientId,
            recipientSource,
            text,
          )
          this.ownMessageListeners.forEach((listener) =>
            listener(
              {
                conversationId: `${recipientId}:${recipientSource}`,
                messageId,
                senderId: recipientId,
                senderSource: recipientSource,
                text,
                sentAt: Number(message.time) || Date.now(),
              },
              isExtensionMessage,
            ),
          )
          continue
        }
        const raw = {
          conversationId: `${senderId}:${senderSource}`,
          messageId,
          senderId,
          senderSource,
          senderName: typeof from.name === 'string' ? from.name : undefined,
          text,
          sentAt: Number(message.time) || Date.now(),
          companyName: body.jobDesc?.company,
          jobName: body.jobDesc?.title ?? body.jobDesc?.position,
          messageType: 'text',
          isSelf,
          isIncoming: true,
          isTextMessage: true,
          isOffline: message.offline === true,
          raw: message,
        }
        this.incomingListeners.forEach((listener) => listener(raw))
      }
    } catch (error) {
      logger.debug('聊天消息解析失败', error)
    }
  }

  private async waitForConnection(client: mqtt.MqttClient) {
    if (client.connected) return
    await new Promise<void>((resolve, reject) => {
      let settled = false
      const cleanup = () => {
        clearTimeout(timeout)
        client.removeListener('connect', onConnect)
        client.removeListener('error', onError)
      }
      const finish = (callback: () => void) => {
        if (settled) return
        settled = true
        cleanup()
        callback()
      }
      const onConnect = () => finish(resolve)
      const onError = (error: Error) => finish(() => reject(error))
      const timeout = setTimeout(
        () => finish(() => reject(new Error('聊天通道连接超时，请稍后重试'))),
        10_000,
      )

      client.once('connect', onConnect)
      client.once('error', onError)
    })
  }

  private rememberExtensionMessage(senderId: number, senderSource: number, text: string) {
    const now = Date.now()
    this.extensionMessages.set(outgoingMessageKey(senderId, senderSource, text), now + 60_000)
    for (const [key, expiresAt] of this.extensionMessages) {
      if (expiresAt < now) this.extensionMessages.delete(key)
    }
  }

  private consumeExtensionMessage(senderId: string, senderSource: number, text: string) {
    const key = outgoingMessageKey(senderId, senderSource, text)
    const expiresAt = this.extensionMessages.get(key)
    if (!expiresAt || expiresAt < Date.now()) return false
    this.extensionMessages.delete(key)
    return true
  }
}

function outgoingMessageKey(senderId: string | number, senderSource: number, text: string) {
  return `${senderId}:${senderSource}:${text.trim()}`
}

function connectionErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/(token|wt|authorization|password)\s*[:=]\s*[^\s,;]+/gi, '$1=已隐藏')
}
