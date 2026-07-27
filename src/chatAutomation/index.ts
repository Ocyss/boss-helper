import { counter } from '@/message'

import type {
  ChatAutomationDecision,
  ChatAllowlistRule,
  ChatAutomationSettings,
  ChatNotification,
  ConversationState,
  IncomingChatMessage,
} from './types'

export * from './readReceipt'
export type * from './types'

const STATE_KEY = 'local:chat-automation-states'
const NOTIFICATION_KEY = 'local:chat-automation-notifications'
const HANDLED_MESSAGE_KEY = 'local:chat-automation-handled-messages'
const DAILY_REPLY_KEY = 'local:chat-automation-daily-replies'
const HISTORY_KEY = 'local:chat-automation-history'
const MAX_NOTIFICATIONS = 200
const MAX_HANDLED_MESSAGES = 1000
const MAX_HISTORY_PER_CONVERSATION = 12
const MAX_HISTORY_CONVERSATIONS = 100

type ChatHistoryItem = Pick<
  IncomingChatMessage,
  'messageId' | 'senderId' | 'senderName' | 'text' | 'sentAt'
>

export function normalizeIncomingMessage(raw: unknown): IncomingChatMessage | null {
  if (!raw || typeof raw !== 'object') return null
  const source = raw as Record<string, unknown>
  const conversationId = pickString(source, ['conversationId', 'sessionId', 'chatId'])
  const messageId = pickString(source, ['messageId', 'msgId', 'id'])
  const senderId = pickString(source, ['senderId', 'fromUserId', 'fromId'])
  const text = pickString(source, ['text', 'content', 'message'])
  const direction = pickString(source, ['direction', 'messageDirection'])
  const messageType = pickString(source, ['type', 'messageType'])

  if (!conversationId || !messageId || !senderId || !text) return null
  if (source.isSelf === true || source.fromMe === true) return null
  if (source.isIncoming === false || source.isTextMessage === false || source.isOffline === true)
    return null
  if (direction && /^(out|send|self)$/i.test(direction)) return null
  if (messageType && /^(system|notice)$/i.test(messageType)) return null

  return {
    conversationId,
    messageId,
    senderId,
    senderSource: pickString(source, ['senderSource', 'fromSource', 'source']),
    senderName: pickString(source, ['senderName', 'fromName', 'userName']),
    text,
    sentAt: pickNumber(source, ['sentAt', 'timestamp', 'createTime']) ?? Date.now(),
    companyName: pickString(source, ['companyName', 'brandName']),
    jobName: pickString(source, ['jobName', 'positionName']),
    raw,
  }
}

export function messageDeduplicationKey(
  message: Pick<IncomingChatMessage, 'conversationId' | 'messageId'>,
) {
  return `${message.conversationId}:${message.messageId}`
}

export class ChatAutomationStore {
  private states: Record<string, ConversationState> = {}
  private notifications: ChatNotification[] = []
  private handledMessages: Record<string, number> = {}
  private dailyReplies: Record<string, number> = {}
  private history: Record<string, ChatHistoryItem[]> = {}
  private initialized = false

  async init() {
    if (this.initialized) return
    const [states, notifications, handledMessages, dailyReplies, history] = await Promise.all([
      counter.storageGet<Record<string, ConversationState>>(STATE_KEY, {}),
      counter.storageGet<ChatNotification[]>(NOTIFICATION_KEY, []),
      counter.storageGet<Record<string, number>>(HANDLED_MESSAGE_KEY, {}),
      counter.storageGet<Record<string, number>>(DAILY_REPLY_KEY, {}),
      counter.storageGet<Record<string, ChatHistoryItem[]>>(HISTORY_KEY, {}),
    ])
    this.states = states
    this.notifications = notifications
    this.handledMessages = handledMessages
    this.dailyReplies = dailyReplies
    this.history = history
    this.initialized = true
  }

  async reload() {
    this.initialized = false
    await this.init()
  }

  async getConversationState(conversationId: string): Promise<ConversationState> {
    await this.init()
    return this.states[conversationId] ?? this.createState(conversationId)
  }

  async getConversationStates(): Promise<ConversationState[]> {
    await this.init()
    return Object.values(this.states).sort((left, right) => right.updatedAt - left.updatedAt)
  }

  async shouldHandle(message: IncomingChatMessage): Promise<boolean> {
    await this.init()
    return this.handledMessages[messageDeduplicationKey(message)] == null
  }

  async markHandled(message: IncomingChatMessage) {
    await this.init()
    const state = await this.getConversationState(message.conversationId)
    this.states[message.conversationId] = {
      ...state,
      lastHandledMessageId: message.messageId,
      lastHandledAt: Date.now(),
      updatedAt: Date.now(),
    }
    this.handledMessages[messageDeduplicationKey(message)] = Date.now()
    await Promise.all([this.saveStates(), this.saveHandledMessages()])
  }

  async appendIncomingMessage(message: IncomingChatMessage) {
    await this.init()
    const history = this.history[message.conversationId] ?? []
    if (history.some((item) => item.messageId === message.messageId)) return
    this.history[message.conversationId] = [
      ...history,
      {
        messageId: message.messageId,
        senderId: message.senderId,
        senderName: message.senderName,
        text: message.text,
        sentAt: message.sentAt,
      },
    ].slice(-MAX_HISTORY_PER_CONVERSATION)
    this.history = Object.fromEntries(
      Object.entries(this.history)
        .sort(([, left], [, right]) => (right.at(-1)?.sentAt ?? 0) - (left.at(-1)?.sentAt ?? 0))
        .slice(0, MAX_HISTORY_CONVERSATIONS),
    )
    await counter.storageSet(HISTORY_KEY, this.history)
  }

  async getRecentMessages(conversationId: string) {
    await this.init()
    return [...(this.history[conversationId] ?? [])]
  }

  async updateConversationState(
    conversationId: string,
    update: Partial<Pick<ConversationState, 'paused' | 'manualTakeover'>>,
  ) {
    await this.init()
    this.states[conversationId] = {
      ...this.createState(conversationId),
      ...this.states[conversationId],
      ...update,
      updatedAt: Date.now(),
    }
    await this.saveStates()
  }

  async recordReply(conversationId: string) {
    await this.init()
    const state = await this.getConversationState(conversationId)
    this.states[conversationId] = {
      ...state,
      replyCount: state.replyCount + 1,
      lastReplyAt: Date.now(),
      updatedAt: Date.now(),
    }
    const day = new Date().toISOString().slice(0, 10)
    this.dailyReplies[day] = (this.dailyReplies[day] ?? 0) + 1
    await Promise.all([this.saveStates(), this.saveDailyReplies()])
  }

  async getDailyReplyCount(now = new Date()) {
    await this.init()
    return this.dailyReplies[now.toISOString().slice(0, 10)] ?? 0
  }

  async enqueueNotification(message: IncomingChatMessage): Promise<ChatNotification> {
    await this.init()
    const notification: ChatNotification = {
      id: messageDeduplicationKey(message),
      conversationId: message.conversationId,
      messageId: message.messageId,
      senderId: message.senderId,
      senderSource: message.senderSource,
      title:
        [message.senderName, message.companyName, message.jobName].filter(Boolean).join(' - ') ||
        'Boss直聘新消息',
      message: message.text,
      createdAt: Date.now(),
    }
    this.notifications = [
      notification,
      ...this.notifications.filter((item) => item.id !== notification.id),
    ].slice(0, MAX_NOTIFICATIONS)
    await counter.storageSet(NOTIFICATION_KEY, this.notifications)
    return notification
  }

  async updateNotification(
    id: string,
    update: Partial<Pick<ChatNotification, 'draftReply' | 'status'>>,
  ) {
    await this.init()
    this.notifications = this.notifications.map((notification) =>
      notification.id === id ? { ...notification, ...update } : notification,
    )
    await counter.storageSet(NOTIFICATION_KEY, this.notifications)
  }

  async getNotifications(): Promise<ChatNotification[]> {
    await this.init()
    return [...this.notifications]
  }

  async getNotification(id: string): Promise<ChatNotification | null> {
    await this.init()
    return this.notifications.find((notification) => notification.id === id) ?? null
  }

  async markNotificationRead(id: string) {
    await this.init()
    this.notifications = this.notifications.map((notification) =>
      notification.id === id ? { ...notification, readAt: Date.now() } : notification,
    )
    await counter.storageSet(NOTIFICATION_KEY, this.notifications)
  }

  private createState(conversationId: string): ConversationState {
    return {
      conversationId,
      replyCount: 0,
      paused: false,
      manualTakeover: false,
      updatedAt: Date.now(),
    }
  }

  private async saveStates() {
    await counter.storageSet(STATE_KEY, this.states)
  }

  private async saveHandledMessages() {
    const sorted = Object.entries(this.handledMessages)
      .sort(([, left], [, right]) => right - left)
      .slice(0, MAX_HANDLED_MESSAGES)
    this.handledMessages = Object.fromEntries(sorted)
    await counter.storageSet(HANDLED_MESSAGE_KEY, this.handledMessages)
  }

  private async saveDailyReplies() {
    const cutoff = Date.now() - 31 * 24 * 60 * 60 * 1000
    this.dailyReplies = Object.fromEntries(
      Object.entries(this.dailyReplies).filter(([day]) => new Date(day).getTime() >= cutoff),
    )
    await counter.storageSet(DAILY_REPLY_KEY, this.dailyReplies)
  }
}

export function decideChatAutomation(
  state: ConversationState,
  message: IncomingChatMessage,
  settings: ChatAutomationSettings,
  now = new Date(),
): ChatAutomationDecision {
  if (state.paused) return { allow: false, reason: 'paused' }
  if (state.manualTakeover) return { allow: false, reason: 'manual-takeover' }
  if (isWithinQuietHours(settings.quietHours, now)) return { allow: false, reason: 'quiet-hours' }
  if (settings.allowlist?.length && !matchesAllowlist(message, settings.allowlist))
    return { allow: false, reason: 'not-allowlisted' }
  if (settings.keywords?.length && !matchesKeywords(message.text, settings.keywords))
    return { allow: false, reason: 'keyword-not-matched' }
  if (
    settings.maxRepliesPerConversation != null &&
    state.replyCount >= settings.maxRepliesPerConversation
  )
    return { allow: false, reason: 'reply-limit' }
  if (
    settings.cooldownMs &&
    state.lastReplyAt &&
    now.getTime() - state.lastReplyAt < settings.cooldownMs
  )
    return { allow: false, reason: 'cooldown' }
  return { allow: true }
}

function matchesAllowlist(
  message: IncomingChatMessage,
  allowlist: Array<ChatAllowlistRule | string>,
) {
  return allowlist.some((rule) => {
    // Older local settings used a plain string and matched all fields by inclusion.
    if (typeof rule === 'string') return matchesValue(allMessageFields(message), rule, 'contains')
    const value = messageField(message, rule.target)
    return matchesValue(value, rule.value, rule.matchMode)
  })
}

function allMessageFields(message: IncomingChatMessage) {
  return [message.companyName, message.jobName, message.senderName, message.senderId]
    .filter(Boolean)
    .join('\n')
}

function messageField(message: IncomingChatMessage, target: ChatAllowlistRule['target']) {
  switch (target) {
    case 'company':
      return message.companyName ?? ''
    case 'job':
      return message.jobName ?? ''
    case 'hr':
      return message.senderName ?? ''
    case 'hr-id':
      return message.senderId
  }
}

function matchesValue(candidate: string, value: string, matchMode: ChatAllowlistRule['matchMode']) {
  const expected = value.trim().toLowerCase()
  if (!expected) return false
  const actual = candidate.toLowerCase()
  return matchMode === 'exact' ? actual === expected : actual.includes(expected)
}

function matchesKeywords(text: string, keywords: string[]) {
  const lowerText = text.toLowerCase()
  return keywords.some((item) => {
    const keyword = item.trim().toLowerCase()
    return Boolean(keyword) && lowerText.includes(keyword)
  })
}

function isWithinQuietHours(range: ChatAutomationSettings['quietHours'], now: Date) {
  if (!range) return false
  const start = clockToMinutes(range.start)
  const end = clockToMinutes(range.end)
  if (start == null || end == null || start === end) return false
  const current = now.getHours() * 60 + now.getMinutes()
  return start < end ? current >= start && current < end : current >= start || current < end
}

function clockToMinutes(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null
}

function pickString(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number') return String(value)
  }
}

function pickNumber(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && Number.isFinite(Number(value))) return Number(value)
  }
}
