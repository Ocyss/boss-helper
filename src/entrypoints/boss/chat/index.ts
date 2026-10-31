import mqtt from 'mqtt'

import { getUuid } from '@/utils'

import { ProtoBufferMessage } from './geek-chat-core'

export class GeekChatClientManager {
  client!: mqtt.MqttClient
  msgBuilder!: ProtoBufferMessage

  private connecting?: Promise<void>

  constructor() {}

  async connect() {
    if (this.connecting) return this.connecting
    if (this.client && !this.client.disconnected) return
    this.connecting = this.initConnection()
    try {
      await this.connecting
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
    } = await fetch(`https://www.zhipin.com/wapi/zppassport/get/wt`).then((res) => res.json())
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
      reconnectPeriod: 1000,
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
    client.on('close', () => logger.warn('消息发送ws: MQTT 连接关闭'))
    client.on('offline', () => logger.warn('消息发送ws: MQTT 离线'))
    client.on('error', (error) => logger.error('消息发送ws: MQTT 错误', error))
    client.on('reconnect', () => logger.info('消息发送ws: MQTT 正在重连'))
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
      logger.info(`消息发送ws: ${direction} Protobuf`, {
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
