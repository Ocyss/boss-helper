/** 回复监控的本地草稿项；只用于人工确认，不包含发送动作。 */
export interface ReplyDraftItem {
  conversationId: string
  messageId: string
  text: string
  createdAt: string
  updatedAt?: string
  draft?: string
  error?: string
  status: 'needs_review' | 'ready' | 'error'
}

export const replyDraftQueueKey = 'boss-helper-v2:reply-draft-queue'
export const replyMonitorEnabledKey = 'boss-helper-v2:reply-monitor-enabled'
