import mqtt from 'mqtt'

import { getUuid } from '@/utils'

import { ProtoBufferMessage } from './geek-chat-core'

export class GeekChatClientManager {
  client!: mqtt.MqttClient
  msgBuilder!: ProtoBufferMessage

  constructor() {}

  async connect() {
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
  }
}
