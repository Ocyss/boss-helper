export type BossReplyMode = 'draft' | 'auto'

export type BossReplyTrigger = 'incoming' | 'manual' | 'follow_up'

export type BossReplyAction = 'reply' | 'ignore' | 'need_human'

export type CandidateKnowledgeTask = 'filtering' | 'greeting' | 'reply'

export type CandidateKnowledgeRetrievalMode = 'all' | 'keyword'

export interface CandidateKnowledgeTaskAccess {
  filtering: boolean
  greeting: boolean
  reply: boolean
}

export interface CandidateKnowledgeItem {
  id: string
  title: string
  content: string
  keywords: string[]
  enabled: boolean
  confirmed: boolean
  tasks: CandidateKnowledgeTaskAccess
  autoReplyAllowed: boolean
  source: string
  confirmedAt: string
  validUntil: string
}

/** @deprecated 仅用于兼容旧配置名称，新代码统一使用 CandidateKnowledgeItem。 */
export type BossReplyKnowledgeItem = CandidateKnowledgeItem

export interface CandidateKnowledgePolicy {
  maxKnowledgeItems: number
  retrievalMode: CandidateKnowledgeRetrievalMode
}

export interface CandidateProfileConfig {
  knowledge: CandidateKnowledgeItem[]
  policies: Record<CandidateKnowledgeTask, CandidateKnowledgePolicy>
}

export interface BossReplyDecision {
  action: BossReplyAction
  intent: string
  reply: string
  reason: string
  evidenceIds: string[]
  needsHumanReview: boolean
  unansweredTopics: string[]
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
  currentDate: string
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
  appId: string
  appSecret?: string
}

export interface FeishuNotificationConfigPublic {
  appId: string
  appSecretConfigured: boolean
  bound: boolean
  targetName: string
  targetType: FeishuReceiveIdType
  boundAt: number
}

export interface FeishuNotificationExportConfig {
  appId: string
  appSecret: string
  targetType: FeishuReceiveIdType
  targetId: string
  targetName: string
  boundAt: number
}

export interface FeishuBindingInfo {
  redirectUrl: string
}

export interface FeishuNotificationStatus {
  configured: boolean
  targetName: string
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
