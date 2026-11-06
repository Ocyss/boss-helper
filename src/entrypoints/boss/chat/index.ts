import mqtt from 'mqtt'

import { getUuid } from '@/utils'

import { ProtoBufferMessage } from './geek-chat-core'

export class GeekChatClientManager {
  client!: mqtt.MqttClient
  msgBuilder!: ProtoBufferMessage

  private connecting?: Promise<void>
  private reconnectTimer?: ReturnType<typeof setTimeout>
  private retryDelay = 1000

  private scheduleReconnect() {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined
      void this.connect().catch((error) => {
        logger.error('消息发送ws: 重新初始化失败', error)
        this.scheduleReconnect()
      })
    }, this.retryDelay)
    this.retryDelay = Math.min(this.retryDelay * 2, 30000)
  }

  constructor() {}

  async connect() {
    if (this.connecting) return this.connecting
    if (this.client?.connected) return
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = undefined
    }
    this.client?.end(true)
    this.connecting = this.initConnection()
    try {
      await this.connecting
      this.retryDelay = 1000
    } catch (error) {
      this.scheduleReconnect()
      throw error
    } finally {
      this.connecting = undefined
    }
  }

  private async initConnection() {
    const res: {
      code: 0
      message: 'Success'
      zpData: {
        wt2: string
      }
    } = await fetch(`https://www.zhipin.com/wapi/zppassport/get/wt`, {
      signal: AbortSignal.timeout(10000),
    }).then((res) => res.json())
    if (res.code !== 0) {
      logger.error(`消息发送ws: 获取 wt 失败: ${res.message}`)
      throw new Error(`消息发送ws: 获取 wt 失败: ${res.message}`)
    }

    const wt = res.zpData.wt2

    const token = window._PAGE?.token

    if (!token) {
      throw new Error('未获取到当前用户 token')
    }

    const userId = Number(window._PAGE?.uid ?? window._PAGE?.userId)
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      throw new Error('未获取到有效的当前用户 ID')
    }
    if (!wt) throw new Error('未获取到有效的 wt')

    this.msgBuilder = new ProtoBufferMessage({
      userId,
      token,
      platform: 'web',
      friendSource: 0,
      supportPush: true,
      wt,
    })

    const client = mqtt.connect(`wss://ws.zhipin.com/chatws`, {
      clientId: `ws-${getUuid(16, 16)}`,
      username: `${token}|0`,
      password: wt,
      keepalive: 25,
      clean: true,
      // 统一重新初始化，以便重试时重新获取 wt，而不是复用失效凭证。
      reconnectPeriod: 0,
      queueQoSZero: false,
      connectTimeout: 10000,
      protocolVersion: 4,
      createWebsocket: (url: string) => {
        const subProtocols = wt ? [wt] : ['mqtt']
        const socket = new WebSocket(url, subProtocols)
        socket.addEventListener('close', ({ code, reason, wasClean }) => {
          logger.warn('消息发送ws: WebSocket 关闭', { code, reason, wasClean })
        })
        return socket
      },
    })

    this.client = client
    client.on('connect', () => {
      try {
        const cookie = document.cookie
          .split(';')
          .map((part) => part.trim())
          .find((part) => part.startsWith('__a='))
        const parts = cookie ? decodeURIComponent(cookie.slice(4)).split('.') : []
        const presence = this.msgBuilder.createMessage.presence({
          type: 1,
          uid: userId,
          lastMessageId: 0,
          clientInfo: {
            version: '4.92',
            system: '',
            systemVersion: '',
            model: '',
            uniqid: parts.length >= 2 ? `${parts[1]}${parts[0]}` : '',
            network: window._PAGE?.clientIP || '',
            appid: 9019,
            platform: 'web',
            channel: '-1',
            ssid: '',
            bssid: '',
            longitude: 0,
            latitude: 0,
          },
        })
        client.publish(
          'chat',
          this.msgBuilder.encode(presence),
          { qos: 1, retain: true },
          (error) => {
            if (error) logger.error('消息发送ws: Presence 发布失败', error)
            else logger.info('消息发送ws: Presence 已收到 MQTT PUBACK')
          },
        )
      } catch (error) {
        logger.error('消息发送ws: Presence 构造或发送失败', error)
      }
    })
    client.on('message', (topic, payload, packet) => {
      this.logProtocol('收到服务器消息', topic, payload, {
        mqttMessageId: packet.messageId,
        qos: packet.qos,
        dup: packet.dup,
        retain: packet.retain,
      })
    })
    client.on('packetsend', (packet) => {
      if (packet.cmd !== 'publish') return
      const payload =
        typeof packet.payload === 'string'
          ? new TextEncoder().encode(packet.payload)
          : packet.payload
      this.logProtocol('发送消息', packet.topic, payload, {
        mqttMessageId: packet.messageId,
        qos: packet.qos,
        dup: packet.dup,
      })
    })
    client.on('packetreceive', (packet) => {
      if (packet.cmd === 'puback' || packet.cmd === 'connack' || packet.cmd === 'disconnect') {
        logger.info('消息发送ws: MQTT 回执（PUBACK 不代表业务发送成功）', packet)
      }
    })
    client.on('close', () => {
      logger.warn('消息发送ws: MQTT 连接关闭')
      if (this.client === client) this.scheduleReconnect()
    })
    client.on('offline', () => logger.warn('消息发送ws: MQTT 离线'))
    client.on('error', (error) => {
      logger.error('消息发送ws: MQTT 错误', error)
      client.end(true)
      if (this.client === client) this.scheduleReconnect()
    })
    client.on('reconnect', () => logger.info('消息发送ws: MQTT 正在重连'))
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timer)
        client.off('connect', onConnect)
        client.off('error', onError)
        client.off('close', onClose)
        if (error) {
          client.end(true)
          reject(error)
        } else resolve()
      }
      const onConnect = () => finish()
      const onError = (error: Error) => finish(error)
      const onClose = () => finish(new Error('MQTT 连接建立前已关闭'))
      const timer = setTimeout(() => finish(new Error('MQTT 连接超时')), 15000)
      client.once('connect', onConnect)
      client.once('error', onError)
      client.once('close', onClose)
    })
  }

  async send(payload: Uint8Array, clientMid: number) {
    const client = this.client
    if (!client?.connected || client.disconnecting) {
      this.scheduleReconnect()
      throw new Error('MQTT 未连接，消息未发送')
    }
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timer)
        client.off('message', onMessage)
        client.off('close', onClose)
        client.off('error', onError)
        if (error) reject(error)
        else resolve()
      }
      const onClose = () => finish(new Error('MQTT 连接关闭，消息发送结果未确认'))
      const onError = (error: Error) => finish(error)
      const onMessage = (topic: string, body: Uint8Array) => {
        if (topic !== 'chat') return
        try {
          const protocol = this.msgBuilder.ChatProtocol.toObject(
            this.msgBuilder.ChatProtocol.decode(body),
            { longs: String },
          )
          if (
            protocol.type === 5 &&
            protocol.messageSync?.some(
              (sync: { clientMid: string; serverMid: string }) =>
                sync.clientMid === String(clientMid) && BigInt(sync.serverMid) > 0n,
            )
          )
            finish()
        } catch (error) {
          logger.warn('消息发送ws: 业务回执解析失败', error)
        }
      }
      const timer = setTimeout(() => {
        finish(new Error('等待消息业务回执超时，发送结果未确认，请勿直接重复发送'))
        client.end(true)
        this.scheduleReconnect()
      }, 15000)
      client.on('message', onMessage)
      client.once('close', onClose)
      client.once('error', onError)
      try {
        client.publish('chat', payload, { qos: 1, retain: true }, (error) => {
          if (error) finish(error)
        })
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  private logProtocol(direction: string, topic: string, payload: Uint8Array, metadata: object) {
    const context = { topic, byteLength: payload.byteLength, ...metadata }
    try {
      // 使用字符串保留 int64 精度，便于用 clientMid/cmid 对照发送包和业务回执。
      const protocol = this.msgBuilder.ChatProtocol.toObject(
        this.msgBuilder.ChatProtocol.decode(payload),
        { longs: String, bytes: String },
      )
      const protocolJson = JSON.stringify(protocol)
      const parsed = JSON.parse(protocolJson, (_key, value) => {
        if (typeof value !== 'string' || !/^[[{]/.test(value.trim())) return value
        try {
          return JSON.parse(value)
        } catch {
          return value
        }
      })
      logger.debug(`消息发送ws: ${direction} Protobuf`, {
        ...context,
        protocol: parsed,
        protocolJson,
      })
    } catch (error) {
      const preview = payload.subarray(0, 2048)
      logger.warn(`消息发送ws: ${direction} Protobuf 解析失败`, {
        ...context,
        error,
        rawHex: Array.from(preview, (byte) => byte.toString(16).padStart(2, '0')).join(''),
        rawText: new TextDecoder().decode(preview),
        truncated: payload.byteLength > preview.byteLength,
      })
    }
  }
}
