import { ElMessage } from 'element-plus'

import {
  BOSS_HELPER_CHAT_BRIDGE_SEND,
  BOSS_HELPER_CHAT_BRIDGE_SOURCE,
  type BossHelperChatMessageArgs,
  type BossHelperChatSendRequest,
  isBossHelperChatSendResult,
} from './chatBridge'
import { mqtt } from './mqtt'
import type { TechwolfChatProtocol } from './type'
import { AwesomeMessage } from './type'

type MessageArgs = BossHelperChatMessageArgs

let packetMessageId = 0

function nextPacketMessageId() {
  packetMessageId = (packetMessageId % 0xffff) + 1
  return packetMessageId
}

interface SocketLike {
  readyState: number
  send: (data: ArrayBuffer) => void
}

function isOpenWebSocket(socket: unknown): socket is SocketLike {
  return (
    typeof socket === 'object' &&
    socket != null &&
    'readyState' in socket &&
    'send' in socket &&
    socket.readyState === WebSocket.OPEN &&
    typeof socket.send === 'function'
  )
}

function getSocket(target: Window | null | undefined) {
  try {
    return target?.socket
  } catch {
    return undefined
  }
}

function resolveChatSocket() {
  const candidates = [getSocket(window), getSocket(window.top), getSocket(window.parent)]

  return candidates.find(isOpenWebSocket)
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return error
  }

  return new Error(typeof error === 'string' ? error : '打招呼发送失败')
}

async function sendThroughMainWorldBridge(args: MessageArgs) {
  const requestId = `boss-helper-chat-${Date.now()}-${Math.random().toString(16).slice(2)}`

  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error('主世界聊天桥接超时'))
    }, 25000)

    const cleanup = () => {
      window.clearTimeout(timer)
      window.removeEventListener('message', handler)
    }

    const handler = (event: MessageEvent<unknown>) => {
      if (event.source !== window || !isBossHelperChatSendResult(event.data)) {
        return
      }

      if (event.data.requestId !== requestId) {
        return
      }

      cleanup()

      if (event.data.success) {
        resolve()
        return
      }

      reject(new Error(event.data.error ?? '主世界聊天发送失败'))
    }

    window.addEventListener('message', handler)

    const request: BossHelperChatSendRequest = {
      source: BOSS_HELPER_CHAT_BRIDGE_SOURCE,
      type: BOSS_HELPER_CHAT_BRIDGE_SEND,
      requestId,
      payload: args,
    }
    window.postMessage(request, '*')
  })
}

export class Message {
  payload: Uint8Array
  packet: Uint8Array
  hex: string
  args: MessageArgs

  constructor(args: MessageArgs) {
    this.args = args

    const now = Date.now()
    const mid = now + 68256432452609
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
            source: args.friend_source ?? 0,
          },
          type: 1,
          mid: mid.toString(),
          time: now.toString(),
          body: {
            type: 1,
            templateId: 1,
            text: args.content,
          },
          cmid: mid.toString(),
        },
      ],
      type: 1,
    }

    this.payload = AwesomeMessage.encode(data).finish().slice()
    this.packet = mqtt.encode({
      messageId: nextPacketMessageId(),
      payload: this.payload,
    })
    this.hex = [...this.packet].map((b) => b.toString(16).padStart(2, '0')).join('')
  }

  toArrayBuffer(): ArrayBuffer {
    return this.packet.buffer.slice(
      this.packet.byteOffset,
      this.packet.byteOffset + this.packet.byteLength,
    ) as ArrayBuffer
  }

  toPayloadArrayBuffer(): ArrayBuffer {
    return this.payload.buffer.slice(
      this.payload.byteOffset,
      this.payload.byteOffset + this.payload.byteLength,
    ) as ArrayBuffer
  }

  async send() {
    let lastError: Error | null = null

    try {
      await sendThroughMainWorldBridge(this.args)
      return
    } catch (error) {
      lastError = normalizeError(error)
    }

    try {
      if ('ChatWebsocket' in window && window.ChatWebsocket != null) {
        window.ChatWebsocket.send({
          toArrayBuffer: () => this.toPayloadArrayBuffer(),
        })
        return
      }

      const socket = resolveChatSocket()

      if (socket != null) {
        socket.send(this.toArrayBuffer())
        return
      }
    } catch (error) {
      lastError = normalizeError(error)
    }

    const error = lastError ?? new Error('未找到可用聊天连接')
    ElMessage.error(error.message)
    throw error
  }
}
