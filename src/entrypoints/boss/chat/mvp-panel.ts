import { logger } from '@/utils/logger'

import type { BossConversationPage, BossConversationSummary } from './conversation-list'
import { fetchBossConversationPage, waitForBossSession } from './conversation-list'

const PANEL_ID = 'boss-helper-chat-mvp'

const panelStyle = `
  :host {
    color: #1f2937;
    font-family: Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
  }
  * { box-sizing: border-box; }
  .panel {
    position: fixed;
    right: 18px;
    bottom: 18px;
    z-index: 2147483000;
    width: min(380px, calc(100vw - 36px));
    max-height: min(620px, calc(100vh - 36px));
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid #d1d5db;
    border-radius: 12px;
    background: #ffffff;
    box-shadow: 0 16px 48px rgb(15 23 42 / 22%);
  }
  .header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 14px;
    color: #ffffff;
    background: #0f766e;
  }
  .title { flex: 1; font-size: 15px; font-weight: 700; }
  .header button {
    border: 1px solid rgb(255 255 255 / 45%);
    border-radius: 6px;
    padding: 5px 8px;
    color: #ffffff;
    background: transparent;
    cursor: pointer;
  }
  .header button:disabled { cursor: wait; opacity: 0.65; }
  .summary {
    padding: 10px 14px;
    border-bottom: 1px solid #e5e7eb;
    color: #4b5563;
    font-size: 13px;
    background: #f8fafc;
  }
  .content { min-height: 110px; overflow: auto; }
  .message { padding: 24px 16px; color: #64748b; font-size: 13px; text-align: center; }
  .message.error { color: #b91c1c; }
  .conversation {
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr);
    gap: 10px;
    padding: 11px 14px;
    border-bottom: 1px solid #f1f5f9;
  }
  .avatar {
    width: 42px;
    height: 42px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border-radius: 50%;
    color: #0f766e;
    font-weight: 700;
    background: #ccfbf1;
  }
  .avatar img { width: 100%; height: 100%; object-fit: cover; }
  .line { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
  .name { flex: 1; overflow: hidden; font-size: 14px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
  .time { flex: none; color: #94a3b8; font-size: 11px; }
  .meta, .last-message {
    margin-top: 4px;
    overflow: hidden;
    color: #64748b;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .last-message { color: #475569; }
  .footer {
    padding: 8px 14px;
    color: #64748b;
    font-size: 11px;
    text-align: center;
    background: #f8fafc;
  }
  .collapsed .summary, .collapsed .content, .collapsed .footer { display: none; }
`

function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName)
  if (className) element.className = className
  if (text !== undefined) element.textContent = text
  return element
}

function formatConversationTime(timestamp: number): string {
  if (!timestamp) return '时间未知'
  const milliseconds = timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp
  const date = new Date(milliseconds)
  if (Number.isNaN(date.getTime())) return '时间未知'

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function createAvatar(conversation: BossConversationSummary): HTMLElement {
  const avatar = createElement('div', 'avatar')
  if (conversation.avatar) {
    const image = createElement('img')
    image.src = conversation.avatar
    image.alt = ''
    image.referrerPolicy = 'no-referrer'
    avatar.appendChild(image)
  } else {
    avatar.textContent = conversation.name.slice(0, 1) || '?'
  }
  return avatar
}

function createConversationItem(conversation: BossConversationSummary): HTMLElement {
  const item = createElement('article', 'conversation')
  item.appendChild(createAvatar(conversation))

  const body = createElement('div')
  const firstLine = createElement('div', 'line')
  firstLine.append(
    createElement('div', 'name', conversation.name),
    createElement('time', 'time', formatConversationTime(conversation.lastMessageAt)),
  )

  const meta = [conversation.companyName, conversation.jobName].filter(Boolean).join(' · ')
  body.append(
    firstLine,
    createElement('div', 'meta', meta || '公司和岗位信息暂缺'),
    createElement('div', 'last-message', conversation.lastMessage || '暂无最近消息'),
  )
  item.appendChild(body)
  return item
}

async function waitForBody(): Promise<HTMLElement> {
  if (document.body) return document.body

  return new Promise((resolve) => {
    document.addEventListener('DOMContentLoaded', () => resolve(document.body), { once: true })
  })
}

export function unmountBossChatMvp(): void {
  document.getElementById(PANEL_ID)?.remove()
}

export async function mountBossChatMvp(): Promise<void> {
  if (document.getElementById(PANEL_ID)) return

  const body = await waitForBody()
  const host = createElement('div')
  host.id = PANEL_ID
  const shadow = host.attachShadow({ mode: 'open' })

  const style = createElement('style')
  style.textContent = panelStyle

  const panel = createElement('section', 'panel')
  const header = createElement('header', 'header')
  const title = createElement('div', 'title', 'BossHelper 聊天 MVP')
  const refreshButton = createElement('button', undefined, '刷新')
  refreshButton.type = 'button'
  const collapseButton = createElement('button', undefined, '收起')
  collapseButton.type = 'button'
  header.append(title, refreshButton, collapseButton)

  const summary = createElement('div', 'summary', '准备读取已聊 HR 会话…')
  const content = createElement('div', 'content')
  const footer = createElement('div', 'footer', '只读首屏，最多 100 条；不会自动发送消息')
  panel.append(header, summary, content, footer)
  shadow.append(style, panel)
  body.appendChild(host)

  let loading = false

  const renderPage = (page: BossConversationPage) => {
    summary.textContent = `本页 ${page.items.length} 条 / 共 ${page.total} 个已聊 HR 会话`
    content.replaceChildren()

    if (page.items.length === 0) {
      content.appendChild(createElement('div', 'message', '没有读取到已聊 HR 会话'))
      return
    }

    content.append(...page.items.map(createConversationItem))
  }

  const refresh = async () => {
    if (loading) return
    loading = true
    refreshButton.disabled = true
    refreshButton.textContent = '读取中'
    summary.textContent = '正在使用当前 BOSS 登录态读取会话…'
    content.replaceChildren(createElement('div', 'message', '正在加载，请稍候'))

    try {
      await waitForBossSession()
      const page = await fetchBossConversationPage()
      renderPage(page)
      logger.info('聊天会话列表读取成功', { count: page.items.length, total: page.total })
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      summary.textContent = '读取失败'
      content.replaceChildren(createElement('div', 'message error', message))
      logger.error('聊天会话列表读取失败', error)
    } finally {
      loading = false
      refreshButton.disabled = false
      refreshButton.textContent = '刷新'
    }
  }

  refreshButton.addEventListener('click', () => void refresh())
  collapseButton.addEventListener('click', () => {
    const collapsed = panel.classList.toggle('collapsed')
    collapseButton.textContent = collapsed ? '展开' : '收起'
  })

  await refresh()
}
