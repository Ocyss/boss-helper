import { activityLog } from '@/composables/useActivityLog'
import type { ChatAutomationConfig } from '@/types/formData'
import { logger } from '@/utils/logger'

import { getBossChatUrlForMessage } from './chatUrl'
import { ChatAutomationStore, decideChatAutomation, normalizeIncomingMessage } from './index'
import { showChatAutomationPopup } from './popup'
import type { IncomingChatMessage } from './types'

let storedDraftSender: ((notificationId: string) => Promise<void>) | null = null
let storedConnectionRetry: (() => Promise<void>) | null = null

export async function sendStoredChatDraft(notificationId: string) {
  if (!storedDraftSender) throw new Error('聊天服务尚未准备完成，请稍后重试')
  await storedDraftSender(notificationId)
}

export async function retryChatConnection() {
  if (!storedConnectionRetry) throw new Error('聊天服务尚未准备完成，请稍后重试')
  await storedConnectionRetry()
}

export type ChatAutomationRuntimeOptions = {
  getConfig: () => ChatAutomationConfig
  createDraft: (message: IncomingChatMessage, history: string[]) => Promise<string>
  sendReply: (message: IncomingChatMessage, text: string) => Promise<void>
  notify: (title: string, message: string, clickUrl: string) => Promise<void>
  blacklistSender: (message: IncomingChatMessage) => Promise<void>
  retryConnection: () => Promise<void>
}

export class ChatAutomationRuntime {
  readonly store = new ChatAutomationStore()
  private draftSends = new Map<string, Promise<void>>()
  private handledMessages = new Set<string>()

  constructor(private options: ChatAutomationRuntimeOptions) {
    storedDraftSender = (notificationId) => this.sendStoredDraft(notificationId)
    storedConnectionRetry = () => this.options.retryConnection()
  }

  async sendStoredDraft(notificationId: string) {
    const existing = this.draftSends.get(notificationId)
    if (existing) return existing

    const send = this.sendStoredDraftOnce(notificationId).finally(() => {
      this.draftSends.delete(notificationId)
    })
    this.draftSends.set(notificationId, send)
    return send
  }

  private async sendStoredDraftOnce(notificationId: string) {
    const notification = await this.store.getNotification(notificationId)
    const reply = notification?.draftReply?.trim()
    if (!notification || !reply) throw new Error('该消息没有可发送的草稿')
    if (notification.status === 'submitted' || notification.status === 'replied') return
    if (!notification.senderId) throw new Error('该消息缺少会话标识，无法发送草稿')

    const message: IncomingChatMessage = {
      conversationId: notification.conversationId,
      messageId: notification.messageId,
      senderId: notification.senderId,
      senderSource: notification.senderSource,
      text: notification.message,
      sentAt: notification.createdAt,
      raw: {
        senderId: notification.senderId,
        senderSource: notification.senderSource,
      },
    }
    try {
      await this.options.sendReply(message, reply)
      await Promise.all([
        this.store.recordReply(message.conversationId),
        this.store.updateNotification(notification.id, { draftReply: reply, status: 'submitted' }),
      ])
      this.recordActivity(
        message,
        '提交草稿回复',
        'success',
        '回复请求已提交，平台送达状态尚未确认。',
      )
    } catch (error) {
      this.recordActivity(
        message,
        '提交草稿回复',
        'error',
        '草稿没有发送成功，已保留。请检查聊天连接后重试，或进入会话手动发送。',
      )
      throw error
    }
  }

  private showPopup(options: {
    message: IncomingChatMessage
    draft?: string
    state: 'received' | 'manual-review' | 'draft-ready' | 'submitted'
    onSend?: (text: string) => Promise<void>
  }) {
    this.recordActivity(
      options.message,
      '显示页面提示',
      'success',
      options.state === 'draft-ready'
        ? '已显示回复草稿，确认内容后可提交发送。'
        : options.state === 'manual-review'
          ? '已显示人工处理提示，请进入会话查看后回复。'
          : '已显示新消息提示。',
    )
    showChatAutomationPopup({
      ...options,
      onOpenConversation: () => {
        const url = getBossChatUrlForMessage(options.message)
        if (!url) {
          this.recordActivity(
            options.message,
            '打开对应会话',
            'action_required',
            '暂时无法定位对应会话，请在 BOSS 页面中手动打开该联系人。',
          )
          return
        }
        this.recordActivity(options.message, '打开对应会话', 'success', '正在打开对应会话。')
        window.location.assign(url)
      },
      onBlacklist: async () => {
        try {
          await this.options.blacklistSender(options.message)
          this.recordActivity(
            options.message,
            '加入黑名单',
            'success',
            '已加入黑名单，后续不会再自动处理该对象。',
          )
        } catch (error) {
          this.recordActivity(
            options.message,
            '加入黑名单',
            'error',
            '加入黑名单失败，请稍后重试。',
          )
          throw error
        }
      },
      onPause: async () => {
        await this.store.updateConversationState(options.message.conversationId, { paused: true })
        this.recordActivity(
          options.message,
          '暂停会话自动化',
          'success',
          '该会话已暂停，收到新消息时不会自动生成或发送回复。',
        )
      },
      onManualTakeover: async () => {
        await this.store.updateConversationState(options.message.conversationId, {
          manualTakeover: true,
        })
        this.recordActivity(
          options.message,
          '人工接管会话',
          'success',
          '该会话已交给你处理，插件不会继续自动回复。',
        )
      },
    })
  }

  async handleRawMessage(raw: unknown) {
    const message = normalizeIncomingMessage(raw)
    if (!message) return
    const messageKey = `${message.conversationId}:${message.messageId}`
    if (this.handledMessages.has(messageKey) || !(await this.store.shouldHandle(message))) return

    this.handledMessages.add(messageKey)
    try {
      await this.handleIncomingMessage(message)
    } finally {
      this.handledMessages.delete(messageKey)
    }
  }

  async handleOwnMessage(raw: unknown, isExtensionMessage: boolean) {
    if (isExtensionMessage || !raw || typeof raw !== 'object') return
    const message = raw as Partial<IncomingChatMessage>
    if (!message.conversationId || !message.messageId) return
    // Only protocol messages carrying an explicit recipient reach this path. Unknown self
    // frames are ignored instead of incorrectly disabling automation for a conversation.
    await this.store.updateConversationState(message.conversationId, { manualTakeover: true })
    this.recordActivity(
      message,
      '检测到手动回复',
      'success',
      '检测到你已在会话中手动回复，已切换为人工接管，插件不会继续自动回复。',
    )
    logger.info('检测到用户手动发送消息，已切换为人工接管', {
      conversationId: message.conversationId,
    })
  }

  private async handleIncomingMessage(message: IncomingChatMessage) {
    await Promise.all([this.store.markHandled(message), this.store.appendIncomingMessage(message)])
    const config = this.options.getConfig()
    const notification = await this.store.enqueueNotification(message)
    this.recordActivity(
      message,
      '收到新消息',
      'success',
      `收到一条新消息（${message.text.length} 个字）。`,
      { summaryLength: message.text.length },
    )
    if (config.browserNotification) {
      const url = getBossChatUrlForMessage(message)
      if (url) {
        try {
          await this.options.notify(notification.title, notification.message, url)
          this.recordActivity(
            message,
            '发送浏览器通知',
            'success',
            '已发送浏览器通知，可点击通知进入对应会话。',
          )
        } catch (error) {
          this.recordActivity(
            message,
            '发送浏览器通知',
            'error',
            '浏览器通知没有发送成功，但消息已保存在通知历史中。',
          )
          logger.warn('聊天浏览器通知发送失败', error)
        }
      } else {
        this.recordActivity(
          message,
          '发送浏览器通知',
          'skipped',
          '未找到可跳转的会话地址，消息已保存在通知历史中。',
        )
      }
    }

    // Notifications are useful even when reply automation is off. The global switch
    // controls draft generation and sending only.
    if (!config.enable) {
      this.recordActivity(
        message,
        '自动回复判断',
        'skipped',
        '聊天自动化未开启，本次只记录消息，不会生成或发送回复。',
      )
      if (config.pagePopup) this.showPopup({ message, state: 'received' })
      return
    }

    if (config.mode === 'remind') {
      this.recordActivity(
        message,
        '提醒用户回复',
        'action_required',
        '已提醒你查看这条消息；插件不会生成或发送回复。',
      )
      if (config.pagePopup) this.showPopup({ message, state: 'received' })
      return
    }

    const manualReview = config.manualReviewKeywords
      .map((keyword) => keyword.trim().toLowerCase())
      .filter(Boolean)
      .some((keyword) => message.text.toLowerCase().includes(keyword))
    if (manualReview) {
      await this.store.updateNotification(notification.id, { status: 'manual-review' })
      this.recordActivity(
        message,
        '自动回复判断',
        'action_required',
        '消息命中人工处理词，未自动回复。请进入会话确认后手动处理。',
      )
      if (config.pagePopup) this.showPopup({ message, state: 'manual-review' })
      return
    }

    // Confirmation and automatic modes are deliberately scoped. A blank scope must
    // never turn either mode into a reply-to-everyone setting.
    if (config.mode !== 'suggest' && !hasConfiguredValues(config.allowlist)) {
      this.recordActivity(
        message,
        '自动回复判断',
        'skipped',
        '尚未设置允许自动处理的公司、HR 或岗位，本次不会自动回复。',
      )
      if (config.pagePopup) this.showPopup({ message, state: 'received' })
      return
    }
    if (config.mode === 'auto' && !hasConfiguredValues(config.keywords)) {
      this.recordActivity(
        message,
        '自动回复判断',
        'skipped',
        '自动发送模式尚未设置触发词，本次不会自动回复。',
      )
      if (config.pagePopup) this.showPopup({ message, state: 'received' })
      return
    }

    const state = await this.store.getConversationState(message.conversationId)
    const decision =
      config.mode === 'suggest'
        ? { allow: true as const }
        : decideChatAutomation(state, message, {
            quietHours: { start: config.quietStart, end: config.quietEnd },
            allowlist: config.allowlist,
            keywords: config.keywords,
            maxRepliesPerConversation: config.maxRepliesPerConversation,
            cooldownMs: config.cooldownMinutes * 60 * 1000,
            dailyReplyLimit: config.dailyReplyLimit,
          })
    if (!decision.allow) {
      this.recordActivity(
        message,
        '自动回复判断',
        decisionStatus(decision.reason),
        decisionMessage(decision.reason),
      )
      if (config.pagePopup) this.showPopup({ message, state: 'received' })
      return
    }

    if (
      config.mode === 'auto' &&
      (await this.store.getDailyReplyCount()) >= config.dailyReplyLimit
    ) {
      this.recordActivity(
        message,
        '自动回复判断',
        'skipped',
        '今天已达到自动回复上限，本次不会自动发送。你仍可进入会话手动回复。',
      )
      if (config.pagePopup) this.showPopup({ message, state: 'received' })
      return
    }

    const history = (await this.store.getRecentMessages(message.conversationId)).map(
      (item) => `${item.senderName ?? item.senderId}：${item.text}`,
    )
    let draft: string
    try {
      draft = (await this.options.createDraft(message, history)).trim()
    } catch (error) {
      logger.warn('AI 聊天草稿生成失败，已转为人工处理', error)
      await this.store.updateNotification(notification.id, { status: 'manual-review' })
      this.recordActivity(
        message,
        '生成回复草稿',
        'error',
        '回复草稿生成失败，已转为人工处理。请检查 AI 回复配置后重试。',
      )
      if (config.pagePopup) this.showPopup({ message, state: 'manual-review' })
      return
    }
    if (!draft) {
      this.recordActivity(
        message,
        '生成回复草稿',
        'action_required',
        '没有生成可用回复草稿，请进入会话手动处理。',
      )
      return
    }

    await this.store.updateNotification(notification.id, {
      draftReply: draft,
      status: 'draft-ready',
    })
    this.recordActivity(message, '生成回复草稿', 'success', '已生成回复草稿，请确认内容后再发送。')
    const send = async (text: string) => {
      const reply = text.trim()
      if (!reply) throw new Error('回复内容不能为空')
      try {
        await this.options.sendReply(message, reply)
        await this.store.recordReply(message.conversationId)
        await this.store.updateNotification(notification.id, {
          draftReply: reply,
          status: 'submitted',
        })
        this.recordActivity(
          message,
          '提交回复请求',
          'success',
          '回复请求已提交，平台送达状态尚未确认。',
        )
      } catch (error) {
        this.recordActivity(
          message,
          '提交回复请求',
          'error',
          '回复没有发送成功，草稿已保留。请检查聊天连接后重试，或进入会话手动发送。',
        )
        throw error
      }
    }

    if (config.mode === 'auto') {
      try {
        await send(draft)
        if (config.pagePopup) this.showPopup({ message, draft, state: 'submitted' })
      } catch (error) {
        logger.warn('AI 自动回复发送失败，草稿已保留', error)
        if (config.pagePopup) this.showPopup({ message, draft, state: 'draft-ready', onSend: send })
      }
      return
    }
    if (config.pagePopup) this.showPopup({ message, draft, state: 'draft-ready', onSend: send })
  }

  private recordActivity(
    message: Pick<IncomingChatMessage, 'senderName' | 'companyName' | 'jobName'> & {
      senderId?: string
    },
    action: string,
    status: 'success' | 'skipped' | 'action_required' | 'error',
    text: string,
    detail: Record<string, string | number> = {},
  ) {
    activityLog.add({
      category: '聊天自动化',
      action,
      status,
      message: text,
      detail: {
        hr: message.senderName ?? message.senderId ?? '未提供',
        company: message.companyName ?? '',
        job: message.jobName ?? '',
        ...detail,
      },
    })
  }
}

function decisionStatus(
  reason: Exclude<ReturnType<typeof decideChatAutomation>, { allow: true }>['reason'],
) {
  return reason === 'paused' || reason === 'manual-takeover' ? 'action_required' : 'skipped'
}

function decisionMessage(
  reason: Exclude<ReturnType<typeof decideChatAutomation>, { allow: true }>['reason'],
) {
  const messages = {
    'quiet-hours': '当前处于免打扰时段，本次不会自动回复。可在聊天自动化设置中调整时间。',
    'not-allowlisted':
      '该会话不在允许自动处理的范围内，本次不会自动回复。可在聊天自动化设置中添加规则。',
    'keyword-not-matched': '消息未命中自动发送触发词，本次不会自动发送。可进入会话手动回复。',
    paused: '该会话已暂停，插件不会自动生成或发送回复。恢复会话后可继续使用。',
    'manual-takeover': '该会话正在由你处理，插件不会自动回复。恢复会话后可重新开启。',
    cooldown: '刚刚已回复过该会话，仍在冷却时间内，本次不会重复发送。',
    'reply-limit': '该会话已达到回复次数上限，本次不会自动回复。可进入会话手动处理。',
  } as const
  return messages[reason]
}

function hasConfiguredValues(values: ChatAutomationConfig['allowlist']) {
  return values.some((value) =>
    Boolean(typeof value === 'string' ? value.trim() : value.value.trim()),
  )
}
