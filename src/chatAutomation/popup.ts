import type { IncomingChatMessage } from './types'

const popupClass = 'boss-helper-chat-automation-popup'
const hostId = 'boss-helper-chat-automation-host'
const maxPopupCount = 4

export function showChatAutomationPopup(options: {
  message: IncomingChatMessage
  draft?: string
  state: 'received' | 'manual-review' | 'draft-ready' | 'submitted'
  onOpenConversation?: () => void | Promise<void>
  onSend?: (text: string) => Promise<void>
  onBlacklist?: () => Promise<void>
  onPause?: () => Promise<void>
  onManualTakeover?: () => Promise<void>
}) {
  const host = getHost()
  const rootId = `${popupClass}-${options.message.conversationId}-${options.message.messageId}`
  host.shadowRoot?.getElementById(rootId)?.remove()
  while ((host.shadowRoot?.querySelectorAll(`.${popupClass}`).length ?? 0) >= maxPopupCount) {
    host.shadowRoot?.querySelector(`.${popupClass}`)?.remove()
  }

  const root = document.createElement('div')
  root.id = rootId
  root.className = popupClass
  root.tabIndex = options.onOpenConversation ? 0 : -1
  if (options.onOpenConversation) root.title = '点击提示可进入对应会话'
  root.style.cssText = [
    'width:min(360px,calc(100vw - 32px))',
    'padding:16px',
    'border:1px solid #d1d5db',
    'border-radius:8px',
    'background:#fff',
    'box-shadow:0 12px 32px rgba(0,0,0,.22)',
    'color:#111827',
    'font:14px/1.5 system-ui,sans-serif',
    options.onOpenConversation ? 'cursor:pointer' : '',
  ].join(';')

  const openConversation = async () => {
    await options.onOpenConversation?.()
  }
  root.onclick = (event) => {
    if (!options.onOpenConversation || !(event.target instanceof Element)) return
    if (event.target.closest('button,textarea,input,select,a')) return
    void openConversation()
  }
  root.onkeydown = (event) => {
    if (!options.onOpenConversation || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    void openConversation()
  }

  const title = document.createElement('strong')
  title.textContent = options.message.senderName || 'Boss直聘新消息'
  root.append(title)

  let draftInput: HTMLTextAreaElement | undefined

  const context = [options.message.companyName, options.message.jobName].filter(Boolean).join(' · ')
  if (context) {
    const meta = document.createElement('div')
    meta.style.cssText = 'margin-top:2px;color:#6b7280;font-size:12px'
    meta.textContent = context
    root.append(meta)
  }

  const message = document.createElement('p')
  message.style.margin = '8px 0'
  message.textContent = options.message.text
  root.append(message)

  if (options.state === 'manual-review') {
    const hint = document.createElement('p')
    hint.style.cssText = 'margin:8px 0;color:#b45309'
    hint.textContent = '该消息需要人工处理，未自动生成或发送回复。'
    root.append(hint)
  }

  if (options.state === 'submitted') {
    const hint = document.createElement('p')
    hint.style.cssText = 'margin:8px 0;color:#0f766e'
    hint.textContent = '发送请求已提交，平台送达状态尚未确认。'
    root.append(hint)
  }

  if (options.draft) {
    draftInput = document.createElement('textarea')
    draftInput.value = options.draft
    draftInput.style.cssText =
      'box-sizing:border-box;width:100%;min-height:76px;padding:8px;border:1px solid #d1d5db;border-radius:4px;resize:vertical'
    root.append(draftInput)
  }

  const actions = document.createElement('div')
  actions.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:12px'
  const close = document.createElement('button')
  close.type = 'button'
  close.textContent = '关闭'
  close.onclick = () => root.remove()
  actions.append(close)

  if (options.onOpenConversation) {
    const open = document.createElement('button')
    open.type = 'button'
    open.textContent = '进入会话'
    open.style.cssText =
      'border:0;border-radius:4px;background:#0f766e;color:white;padding:6px 10px;cursor:pointer'
    open.onclick = () => void openConversation()
    actions.append(open)
  }

  if (options.onBlacklist) {
    const blacklist = document.createElement('button')
    blacklist.type = 'button'
    blacklist.textContent = '拉黑'
    blacklist.onclick = async () => {
      blacklist.disabled = true
      try {
        await options.onBlacklist?.()
        root.remove()
      } catch {
        blacklist.disabled = false
      }
    }
    actions.append(blacklist)
  }

  if (options.onPause) {
    const pause = document.createElement('button')
    pause.type = 'button'
    pause.textContent = '暂停会话'
    pause.onclick = async () => {
      pause.disabled = true
      try {
        await options.onPause?.()
        root.remove()
      } catch {
        pause.disabled = false
      }
    }
    actions.append(pause)
  }

  if (options.onManualTakeover) {
    const takeover = document.createElement('button')
    takeover.type = 'button'
    takeover.textContent = '人工接管'
    takeover.onclick = async () => {
      takeover.disabled = true
      try {
        await options.onManualTakeover?.()
        root.remove()
      } catch {
        takeover.disabled = false
      }
    }
    actions.append(takeover)
  }

  if (options.draft && options.onSend) {
    const send = document.createElement('button')
    send.type = 'button'
    send.textContent = '发送回复'
    send.style.cssText =
      'border:0;border-radius:4px;background:#0f766e;color:white;padding:6px 10px;cursor:pointer'
    send.onclick = async () => {
      send.disabled = true
      send.textContent = '发送中...'
      try {
        await options.onSend?.(draftInput?.value ?? '')
        root.remove()
      } catch {
        send.disabled = false
        send.textContent = '重试发送'
      }
    }
    actions.append(send)
  }
  root.append(actions)
  host.shadowRoot?.querySelector<HTMLElement>('[data-popup-stack]')?.append(root)
}

function getHost() {
  let host = document.getElementById(hostId) as HTMLElement | null
  if (!host) {
    host = document.createElement('div')
    host.id = hostId
    host.attachShadow({ mode: 'open' })
    host.style.cssText =
      'position:fixed;right:20px;bottom:20px;z-index:2147483647;pointer-events:none'
    document.documentElement.append(host)
  }
  const shadow = host.shadowRoot
  if (shadow && !shadow.querySelector('[data-popup-stack]')) {
    const stack = document.createElement('div')
    stack.dataset.popupStack = 'true'
    stack.style.cssText =
      'display:flex;max-height:calc(100vh - 40px);flex-direction:column-reverse;gap:8px;pointer-events:auto;overflow:auto'
    shadow.append(stack)
  }
  return host
}
