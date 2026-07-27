export interface IncomingChatMessage {
  conversationId: string
  messageId: string
  senderId: string
  senderSource?: string
  senderName?: string
  text: string
  sentAt: number
  companyName?: string
  jobName?: string
  raw: unknown
}

export interface ConversationState {
  conversationId: string
  lastHandledMessageId?: string
  lastHandledAt?: number
  replyCount: number
  lastReplyAt?: number
  paused: boolean
  manualTakeover: boolean
  updatedAt: number
}

export interface ChatNotification {
  id: string
  conversationId: string
  messageId: string
  senderId?: string
  senderSource?: string
  title: string
  message: string
  createdAt: number
  readAt?: number
  draftReply?: string
  status?: 'received' | 'manual-review' | 'draft-ready' | 'submitted' | 'replied'
}

export interface ChatAutomationSettings {
  quietHours?: { start: string; end: string }
  allowlist?: Array<ChatAllowlistRule | string>
  keywords?: string[]
  maxRepliesPerConversation?: number
  cooldownMs?: number
  dailyReplyLimit?: number
}

export type ChatAllowlistTarget = 'company' | 'hr' | 'job' | 'hr-id'
export type ChatAllowlistMatchMode = 'exact' | 'contains'

export interface ChatAllowlistRule {
  target: ChatAllowlistTarget
  matchMode: ChatAllowlistMatchMode
  value: string
}

export type ChatConnectionStatus = {
  state: 'idle' | 'connecting' | 'connected' | 'failed'
  error?: string
  updatedAt: number
}

export type ChatAutomationDecision =
  | { allow: true }
  | {
      allow: false
      reason:
        | 'quiet-hours'
        | 'not-allowlisted'
        | 'keyword-not-matched'
        | 'paused'
        | 'manual-takeover'
        | 'cooldown'
        | 'reply-limit'
    }

export interface ReadReceiptRequest {
  url?: string | URL
  body?: unknown
  event?: string
}
