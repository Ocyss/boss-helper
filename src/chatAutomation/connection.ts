import { activityLog } from '@/composables/useActivityLog'

import type { ChatConnectionStatus } from './types'

let status: ChatConnectionStatus = { state: 'idle', updatedAt: Date.now() }
const listeners = new Set<(value: ChatConnectionStatus) => void>()

export function getChatConnectionStatus() {
  return status
}

export function subscribeChatConnectionStatus(listener: (value: ChatConnectionStatus) => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setChatConnectionStatus(next: Omit<ChatConnectionStatus, 'updatedAt'>) {
  status = { ...next, updatedAt: Date.now() }
  if (next.state === 'connecting') {
    activityLog.add({
      category: '聊天自动化',
      action: '连接聊天服务',
      status: 'action_required',
      message: '正在连接聊天服务，请保持 BOSS 账号登录。',
    })
  } else if (next.state === 'connected') {
    activityLog.add({
      category: '聊天自动化',
      action: '连接聊天服务',
      status: 'success',
      message: '聊天服务已连接，可以接收新消息和发送已确认的回复。',
    })
  } else if (next.state === 'failed') {
    activityLog.add({
      category: '聊天自动化',
      action: '连接聊天服务',
      status: 'error',
      message: '聊天服务连接失败。请确认 BOSS 页面仍处于登录状态后，点击“重新连接”。',
      detail: { hasError: Boolean(next.error) },
    })
  }
  listeners.forEach((listener) => listener(status))
}
