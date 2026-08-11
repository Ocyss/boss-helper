export type BossReplyMode = 'draft' | 'auto'

export type BossReplyTrigger = 'incoming' | 'manual' | 'follow_up'

export type BossReplyAction = 'reply' | 'ignore' | 'need_human'

export interface BossReplyKnowledgeItem {
  id: string
  title: string
  content: string
  keywords: string[]
  enabled: boolean
  confirmed: boolean
}

export interface BossReplyDecision {
  action: BossReplyAction
  intent: string
  reply: string
  reason: string
  evidenceIds: string[]
}

export interface BossReplyMessage {
  id: string
  direction: 'incoming' | 'outgoing'
  text: string
  sentAt: number
}

export interface BossReplyPromptContext {
  trigger: BossReplyTrigger
  triggerLabel: string
  taskInstruction: string
  candidate: string
  recruiter: string
  job: string
  incomingMessages: string
  recentConversation: string
  knowledge: string
  availableEvidenceIds: string
  conversationHistoryComplete: string
  maxReplyLength: number
}

export type BossReplyStatus =
  | 'disabled'
  | 'ready'
  | 'queued'
  | 'generating'
  | 'draft'
  | 'sent'
  | 'ignored'
  | 'awaiting_human'
  | 'paused'
  | 'error'

export interface BossReplySessionState {
  status: BossReplyStatus
  message: string
  decision?: BossReplyDecision
  updatedAt: number
}

export type FeishuReceiveIdType = 'chat_id' | 'open_id'

export interface FeishuNotificationConfigInput {
  enabled: boolean
  appId: string
  appSecret?: string
  receiveIdType: FeishuReceiveIdType
  receiveId: string
}

export interface FeishuNotificationConfigPublic {
  enabled: boolean
  appId: string
  appSecretConfigured: boolean
  receiveIdType: FeishuReceiveIdType
  receiveId: string
}

export interface FeishuNotificationStatus {
  enabled: boolean
  configured: boolean
}

export interface BossHumanHandoffNotification {
  conversationId: string
  recruiterName: string
  companyName: string
  jobName: string
  latestMessage: string
  reason: string
  trigger: BossReplyTrigger
}
