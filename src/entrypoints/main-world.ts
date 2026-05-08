import axios from 'axios'
import { createPinia } from 'pinia'
import { createApp } from 'vue'

import { defineUnlistedScript } from '#imports'
import App from '@/App.vue'
import { Message } from '@/composables/useWebSocket'
import {
  CHAT_SEND_MESSAGE,
  CHAT_SEND_RESULT,
  type ChatSendRuntimeMessage,
  type ChatSendRuntimeResult,
} from '@/message/chat'
import { getRootVue } from '@/composables/useVue'
import { loader } from '@/utils'
import { logger } from '@/utils/logger'

async function main(router: any) {
  let module = {
    run() {
      logger.info('BossHelper加载成功')
      logger.warn('当前页面无对应hook脚本', router.path)
    },
  }
  switch (router.path) {
    case '/web/geek/job':
    case '/web/geek/job-recommend':
    case '/web/geek/jobs':
      module = await import('@/pages/zhipin')
      break
  }
  module.run()
  const helper = document.querySelector('#boss-helper')
  if (!helper) {
    const app = createApp(App)
    app.use(createPinia())
    const appEl = document.createElement('div')
    appEl.id = 'boss-helper'
    document.body.append(appEl)
    app.mount(appEl)
  }
}

async function start() {
  //   document.documentElement.classList.toggle(
  //     "dark",
  //     GM_getValue("theme-dark", false)
  //   );

  const v = await getRootVue()
  v.$router.afterHooks.push(main)
  void main(v.$route)
  let axiosLoad: () => void
  axios.interceptors.request.use(
    (config) => {
      if (config.timeout != null) {
        axiosLoad = loader({ ms: config.timeout, color: '#F79E63' })
      }
      return config
    },
    async (error) => {
      axiosLoad()
      return Promise.reject(error)
    },
  )
  axios.interceptors.response.use(
    (response) => {
      axiosLoad()
      return response
    },
    async (error) => {
      axiosLoad()
      return Promise.reject(error)
    },
  )

  window.addEventListener('message', async (event) => {
    const data = event.data as ChatSendRuntimeMessage | undefined
    if (data?.type !== CHAT_SEND_MESSAGE) {
      return
    }

    try {
      const msg = new Message(data.payload)
      msg.send()
      const result: ChatSendRuntimeResult = {
        type: CHAT_SEND_RESULT,
        requestId: data.requestId,
        ok: true,
      }
      window.postMessage(result, '*')
    } catch (error) {
      const result: ChatSendRuntimeResult = {
        type: CHAT_SEND_RESULT,
        requestId: data.requestId,
        ok: false,
        error: error instanceof Error ? error.message : `${error}`,
      }
      window.postMessage(result, '*')
      logger.error('聊天页发送消息失败', error)
    }
  })
}

export default defineUnlistedScript(() => {
  start().catch((e) => {
    logger.error(e)
  })
})
