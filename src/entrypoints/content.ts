import { browser, defineContentScript, injectScript } from '#imports'
import {
  CHAT_SEND_MESSAGE,
  CHAT_SEND_RESULT,
  type ChatSendRuntimeMessage,
  type ChatSendRuntimeResult,
} from '@/message/chat'
import { ProvideContentAdapter, provideContentCounter } from '@/message/contentScript'

import '@/main.scss'
import 'element-plus/theme-chalk/src/message-box.scss'
import 'element-plus/theme-chalk/src/message.scss'

export default defineContentScript({
  matches: ['*://zhipin.com/*', '*://*.zhipin.com/*'],
  async main(_ctx) {
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type !== CHAT_SEND_MESSAGE) {
        return
      }

      const request = message as ChatSendRuntimeMessage
      const timer = window.setTimeout(() => {
        window.removeEventListener('message', handler)
        sendResponse({
          type: CHAT_SEND_RESULT,
          requestId: request.requestId,
          ok: false,
          error: '聊天页主世界脚本响应超时',
        } satisfies ChatSendRuntimeResult)
      }, 5000)

      const handler = (event: MessageEvent<ChatSendRuntimeResult | undefined>) => {
        if (
          event.source !== window
          || event.data?.type !== CHAT_SEND_RESULT
          || event.data.requestId !== request.requestId
        ) {
          return
        }
        window.clearTimeout(timer)
        window.removeEventListener('message', handler)
        sendResponse(event.data)
      }

      window.addEventListener('message', handler)
      window.postMessage(request, '*')
      return true
    })

    provideContentCounter(new ProvideContentAdapter())

    await injectScript('/main-world.js', {
      keepInDom: true,
    })
  },
})
