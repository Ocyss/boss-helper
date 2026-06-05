import { ElMessage } from 'element-plus'

import { useLog } from '@/stores/log'

import type { TechwolfChatProtocol } from './type'
import { AwesomeMessage } from './type'

interface MessageArgs {
  form_uid: string
  to_uid: string
  to_name: string // encryptBossId  擦,boss的id不是岗位的
  content?: string
  image?: string // url
  boss_name?: string
  job_name?: string
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

  send() {
    const log = useLog()
    const channelStatus = {
      hasGeekChatCore: 'GeekChatCore' in window && window.GeekChatCore != null,
      hasChatWebsocket: 'ChatWebsocket' in window && window.ChatWebsocket != null,
      hasEventBus: window.EventBus != null,
      has_q_chatSend: window.__q_chatSend !== undefined,
    }

    log.info('打招呼-渠道检查', JSON.stringify(channelStatus))
    window.__bossHelperQueueGreeting?.(this.args, 'queued before channel send as chat-page fallback')
    window.__bossHelperAiRuntime?.({
      stage: 'message-send-called',
      to_uid: this.args.to_uid || '',
      boss_name: this.args.boss_name || '',
      job_name: this.args.job_name || '',
      contentLength: String(this.args.content || '').length,
    })

    if ('GeekChatCore' in window && window.GeekChatCore != null) {
      try {
        const core = window.GeekChatCore.getInstance()
        const client = core?.getClient?.()
        log.info(
          '打招呼-GeekChatCore',
          JSON.stringify({
            hasInstance: !!core,
            hasGetClient: !!client,
            hasClient: !!client?.client,
          }),
        )
        if (client?.client) {
          client.client.send(this)
          log.info('打招呼-发送成功', 'GeekChatCore 通道')
          return true
        }
      } catch (err) {
        log.info('打招呼-发送失败', `GeekChatCore: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    if ('ChatWebsocket' in window && window.ChatWebsocket != null) {
      try {
        log.info('打招呼-尝试ChatWebsocket', '')
        window.ChatWebsocket.send(this)
        log.info('打招呼-发送成功', 'ChatWebsocket 通道')
        return true
      } catch (err) {
        log.info('打招呼-发送失败', `ChatWebsocket: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    if (window.EventBus != null) {
      try {
        log.info('打招呼-尝试EventBus', '')
        window.EventBus.publish(
          'CHAT_SEND_TEXT',
          {
            uid: this.args.to_uid,
            encryptUid: this.args.to_name,
            message: this.args.content,
            msg: this.args.content,
          },
          () => {
            log.info('打招呼-发送成功', 'EventBus 通道')
          },
          () => {
            window.__bossHelperQueueGreeting?.(this.args, 'EventBus callback failed')
            log.info('打招呼-发送失败', 'EventBus 回调失败')
          },
        )
        return true
      } catch (err) {
        log.info('打招呼-发送失败', `EventBus: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    if (window.__q_chatSend !== undefined) {
      try {
        log.info('打招呼-尝试__q_chatSend', '')
        const result = window.__q_chatSend.call(this)
        if (result && typeof result.then === 'function') {
          result.then(
            () => {
              log.info('打招呼-发送成功', '__q_chatSend 通道')
            },
            (err: unknown) => {
              window.__bossHelperQueueGreeting?.(
                this.args,
                err instanceof Error ? err.message : '__q_chatSend rejected',
              )
              log.info('打招呼-发送失败', '__q_chatSend 回调失败')
            },
          )
        }
        return true
      } catch (err) {
        log.info('打招呼-发送失败', `__q_chatSend: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    window.__bossHelperQueueGreeting?.(this.args, 'no chat send channel')
    log.info('打招呼-无可用渠道', JSON.stringify(channelStatus))
    ElMessage.error('无可用发送渠道，请等待作者修复。可暂时关闭招呼语功能')
    return false
  }
}
