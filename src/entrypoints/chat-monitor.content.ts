import { browser } from 'wxt/browser'

import { defineContentScript } from '#imports'
import type { ReplyDraftItem } from '@/types/replyDraft'
import { replyDraftQueueKey, replyMonitorEnabledKey } from '@/types/replyDraft'

/** 监控开关使用 browser.storage.local 的原始 key，不调用 chrome.cookies 或导出 Cookie。 */
function textHash(text: string): string {
  let hash = 2166136261
  for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  return (hash >>> 0).toString(16)
}

async function isEnabled(): Promise<boolean> {
  const value = await browser.storage.local.get(replyMonitorEnabledKey)
  return value[replyMonitorEnabledKey] === true
}

async function rememberDraft(item: ReplyDraftItem): Promise<boolean> {
  const stored = await browser.storage.local.get(replyDraftQueueKey)
  const queue = Array.isArray(stored[replyDraftQueueKey])
    ? (stored[replyDraftQueueKey] as ReplyDraftItem[])
    : []
  const duplicate = queue.some(
    (entry) => entry.conversationId === item.conversationId && entry.messageId === item.messageId,
  )
  if (duplicate) return false
  queue.push(item)
  await browser.storage.local.set({ [replyDraftQueueKey]: queue.slice(-100) })
  return true
}

async function scanUnread(): Promise<void> {
  if (!(await isEnabled())) return
  const url = new URL(location.href)
  if (url.origin !== 'https://www.zhipin.com' || url.pathname !== '/web/geek/chat') return
  const conversationId = url.searchParams.get('conversationId')
  if (!conversationId) return

  const unreadItems = Array.from(document.querySelectorAll('.chat-user.v2 .label-list li')).filter(
    (item) => /^未读/.test(item.textContent?.trim() ?? ''),
  )
  if (unreadItems.length !== 1) return

  const messages = Array.from(
    document.querySelectorAll('.chat-record .message-item.item-friend .message-content > .text'),
  )
  const latest = messages.at(-1)
  const text = latest?.textContent?.trim() ?? ''
  if (!latest || !text) return
  const messageId = latest.closest('.message-item')?.getAttribute('data-mid') || textHash(text)
  const item: ReplyDraftItem = {
    conversationId,
    messageId,
    text: text.slice(0, 500),
    createdAt: new Date().toISOString(),
    status: 'needs_review',
  }
  // 只有新消息首次入队才通知，避免 MutationObserver 重复触发通知。
  if (!(await rememberDraft(item))) return
  await browser.runtime.sendMessage({ type: 'BHV2_NOTIFY_UNREAD', conversationId, messageId })
}

export default defineContentScript({
  matches: ['https://www.zhipin.com/web/geek/chat*'],
  runAt: 'document_idle',
  main() {
    // 页面结构不匹配时 scanUnread 直接返回，不继续猜测选择器。
    let scanTimer: number | undefined
    let scanRunning = false
    const scheduleScan = () => {
      if (scanTimer !== undefined) window.clearTimeout(scanTimer)
      scanTimer = window.setTimeout(() => {
        scanTimer = undefined
        if (scanRunning) return
        scanRunning = true
        void scanUnread().finally(() => {
          scanRunning = false
        })
      }, 250)
    }
    const observer = new MutationObserver(scheduleScan)
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    })
    scheduleScan()
  },
})
