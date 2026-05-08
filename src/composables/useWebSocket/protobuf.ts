import { ElMessage } from 'element-plus'

import { logger } from '@/utils/logger'

import type { TechwolfChatProtocol } from './type'
import { AwesomeMessage } from './type'

interface MessageArgs {
  form_uid: string
  to_uid: string
  to_name: string // encryptBossId  擦,boss的id不是岗位的
  content?: string
  image?: string // url
}

export class Message {
  msg: Uint8Array
  hex: string
  args: MessageArgs

  constructor(args: MessageArgs) {
    this.args = args
    const r = new Date().getTime()
    const d = r + 68256432452609
    const data: TechwolfChatProtocol = {
      messages: [
        {
          from: {
            uid: args.form_uid,
            source: 0,
          },
          to: {
            uid: args.to_uid,
            name: args.to_name,
            source: 0,
          },
          type: 1,
          mid: d.toString(),
          time: r.toString(),
          body: {
            type: 1,
            templateId: 1,
            text: args.content,
            // image: {},
          },
          cmid: d.toString(),
        },
      ],
      type: 1,
    }

    this.msg = AwesomeMessage.encode(data).finish().slice()
    this.hex = [...this.msg].map((b) => b.toString(16).padStart(2, '0')).join('')
  }

  toArrayBuffer(): ArrayBuffer {
    return this.msg.buffer.slice(0, this.msg.byteLength) as ArrayBuffer
  }

  private getSendChannel() {
    if (window.ChatWebsocket != null && typeof window.ChatWebsocket.send === 'function') {
      return {
        type: 'ChatWebsocket',
        send: () => window.ChatWebsocket!.send(this),
      } as const
    }

    const geekChat = window.GeekChatCore?.getInstance?.()
    const socketClient = geekChat?.socketConnect?.client
    if (socketClient != null && typeof socketClient.send === 'function') {
      return {
        type: 'GeekChatCore.socketConnect.client',
        send: () => socketClient.send(this),
      } as const
    }

    const legacyClient = geekChat?.getClient?.()?.client
    if (legacyClient != null && typeof legacyClient.send === 'function') {
      return {
        type: 'GeekChatCore.getClient().client',
        send: () => legacyClient.send(this),
      } as const
    }

    return null
  }

  send() {
    const channel = this.getSendChannel()
    if (channel != null) {
      logger.debug('使用消息发送通道', channel.type)
      channel.send()
      return
    }
    // else if (window.EventBus != null) { // 2025-12-22 失效，疑似boss bug。暂时禁用
    //   window.EventBus.publish('CHAT_SEND_TEXT', {
    //     uid: this.args.to_uid,
    //     encryptUid: this.args.to_name,
    //     message: this.args.content,
    //     msg: this.args.content,
    //   }, () => {
    //     logger.debug('消息发送成功', this)
    //   }, () => {
    //     logger.error('消息发送失败', this)
    //   })
    // }
    // else if (window.__q_chatSend != null) { // 扩展限制，不能远程加载，暂不考虑实现
    //   // 当无渠道时，从网络加载临时补丁
    //   window.__q_chatSend.call(this).then(() => {
    //     logger.debug('消息发送成功', this)
    //   }, () => {
    //     logger.debug('消息发送失败', this)
    //   })
    // }

    const error = new Error('当前页面没有可用发送渠道，请切到聊天页后重试。')
    logger.error('无可用消息发送渠道', {
      hasGeekChatCore: window.GeekChatCore != null,
      hasChatWebsocket: window.ChatWebsocket != null,
      geekChatInstanceKeys: Object.keys(window.GeekChatCore?.getInstance?.() ?? {}),
    })
    ElMessage.error(error.message)
    throw error
  }
}
