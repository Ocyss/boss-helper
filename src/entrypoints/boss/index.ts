import { ref } from 'vue'

import { defineUnlistedScript } from '#imports'
import { appearanceConf, useConf } from '@/composables/conf'
import type { WorkflowData } from '@/composables/useApplying/type'
import { createLazyObject, isInitialized } from '@/composables/useApplying/type'
import type { JobData } from '@/composables/useHelper'
import { HelperContext } from '@/composables/useHelper'
import type { AlertItem, ConfigAccordionItem } from '@/composables/useHelper/type'
import type { ChatSessionMeta, Message } from '@/composables/useModel'
import { getRootVue, useHookVueData, useHookVueFn } from '@/composables/useVue'
import { run } from '@/index'
import { counter, initCounter } from '@/message'
import type {
  BossHumanHandoffNotification,
  BossReplyDecision,
  BossReplyMessage,
  BossReplyPromptContext,
  BossReplyTrigger,
} from '@/types/aiReply'
import type { FormDataInput } from '@/types/formData'
import elmGetter from '@/utils/elmGetter'
import { logger } from '@/utils/logger'

import { GeekChatClientManager } from './chat'
import type { BossChatSocketState } from './chat'
import {
  fetchBossConversationHistory,
  fetchBossConversationPage,
  waitForBossSession,
} from './chat/conversation-list'
import type { BossMessageJobContext, BossRealtimeMessage } from './chat/message-parser'
import { parseBossChatProtocol } from './chat/message-parser'
import { mountBossChatMvp, unmountBossChatMvp } from './chat/mvp-panel'
import type { BoosJobData } from './delivery'
import { bossWorkflow } from './delivery'
import { BossReplyBatcher } from './reply/batcher'
import { validateBossReplyDecision } from './reply/decision'
import { getBossData, getChatJobBaseInfo, getJobDetail, uploadImage } from './requests'
import type { BossZpDetailData, BossZpJobItemData } from './types'

const BOSS_REPLY_PAUSED_SESSIONS_KEY = 'local:boss-reply-paused-sessions-v1'
const BOSS_HISTORY_PAGE_SIZE = 30
const BOSS_HISTORY_MAX_PAGES = 2

function removeAd() {
  // 新职位发布时通知我
  void elmGetter.rm('.job-list-wrapper .subscribe-weixin-wrapper')
  // 侧栏
  void elmGetter.rm('.job-side-wrapper')
  // 侧边悬浮框
  void elmGetter.rm('.side-bar-box')
  // 搜索栏登录框
  void elmGetter.rm('.go-login-btn')
  // 底部页脚
  // elmGetter.rm("#footer-wrapper");

  // 新版: 微信扫码
  void elmGetter.rm('.c-subscribe-weixin')
  // 新版: 求职工具
  void elmGetter.rm('.c-job-tools.job-tools')
  // 新版: 热门职位
  void elmGetter.rm('.c-hot-link.hot-link')
  // 新版: 面包屑
  void elmGetter.rm('.c-breadcrumb')
  // 新版: 职位详情页的引导(想要什么工作)
  void elmGetter.rm('.job-detail-container .job-detail-guide-cont')
}

const initChange = useHookVueFn('#wrap .page-job-wrapper', 'pageChangeAction')
const initSearch = useHookVueFn('#wrap .page-job-wrapper,.job-recommend-main,.page-jobs-main', [
  'searchJobAction',
  'onSearch',
])

function formatActiveTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const day = 24 * 60 * 60 * 1000

  if (diff < day) return '今日活跃'
  if (diff < 2 * day) return '昨日活跃'
  if (diff < 7 * day) return '本周活跃'
  if (diff < 30 * day) return '本月活跃'
  return '较久未活跃'
}

function clampFiniteNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback
}

function convertBossZpJobItemToJobData(item: BossZpJobItemData): JobData {
  const key = `boss::${item.encryptJobId}`

  return {
    key,
    link: `https://www.zhipin.com/job_detail/${item.encryptJobId}.html`,
    jobName: item.jobName,
    positionName: item.jobName,
    jobDescription: '',

    // 经验和学历要求 - 从 jobLabels 中解析或直接使用
    experienceName: item.jobExperience || item.jobLabels?.[0] || '经验不限',
    degreeName: item.jobDegree || '学历不限',
    salary: item.salaryDesc,

    // 地址相关
    address: [item.cityName, item.areaDistrict, item.businessDistrict].filter(Boolean).join('-'),
    addressCoords: item.gps ? [item.gps.longitude, item.gps.latitude] : undefined,

    // 技能标签
    showSkills: item.skills || [],
    jobLabels: item.jobLabels || [],
    skills: item.skills || [],

    // 活跃时间 - 从 lastModifyTime 获取
    activeTime: item.lastModifyTime,
    activeTimeStr: item.lastModifyTime ? formatActiveTime(item.lastModifyTime) : undefined,

    // 福利
    welfareList: item.welfareList,

    // 招聘者信息
    boss: {
      link: `https://www.zhipin.com/boss_detail/${item.encryptBossId}.html`,
      name: item.bossName,
      title: item.bossTitle,
      avatar: item.bossAvatar,
      certificated: item.bossCert > 0,
      isHeadhunter: item.goldHunter === 1,
      isFriend: false,
      isOnline: item.bossOnline ?? false,
    },

    // 公司品牌信息
    brand: {
      link: `https://www.zhipin.com/gongsi/${item.encryptBrandId}.html`,
      name: item.brandName,
      logo: item.brandLogo,
      scale: item.brandScaleName,
      industry: item.brandIndustry,
      stageName: item.brandStageName,
      introduce: '',
      labels: [],
    },

    // 状态信息
    // status: {
    //   status: item.contact ? 'warn' : 'pending',
    //   msg: item.contact ? '已沟通' : '未开始',
    // },
  }
}

export class BossHelperCtx extends HelperContext<BossHelperCtx, BoosJobData, {}> {
  private static instance: HTMLElement | null = null
  label = 'Boss直聘'
  key = 'boss'

  geek!: GeekChatClientManager
  private readonly replyBatcher = new BossReplyBatcher((messages) =>
    this.flushBossReplyMessages(messages),
  )
  private readonly pausedReplySessions = new Set<string>()
  private readonly replyTasks = new Map<string, Promise<void>>()
  private readonly replyDraftVersions = new Map<string, string>()
  private readonly sessionJobDetails = new Map<string, BossZpDetailData>()
  private readonly sessionContextTasks = new Map<string, Promise<void>>()
  private replyPausedSessionsLoaded = false
  private replyConfigWatcher?: () => void

  _page = ref({ page: 1, pageSize: 15 })
  _pageHasMore = ref(true)
  _jobDetail = ref<BossZpDetailData>()
  _pageChange = (_v: number) => {
    throw new Error('pageChange is undefined')
  }
  _clickJobCardAction = (_: BossZpJobItemData) => {}
  _jobList: Ref<BossZpJobItemData[]>
  _jobDataMap: Map<string, BoosJobData>

  rootVue: any = null
  jobMaps: Map<string, WorkflowData<BoosJobData, {}>>
  jobList: Ref<JobData[]>

  constructor() {
    const jobList = ref<JobData[]>([])
    const _jobList = ref<BossZpJobItemData[]>([])
    const _jobListMap = new Map<string, BoosJobData>()

    super()

    this.jobList = jobList
    this._jobList = _jobList
    this._jobDataMap = _jobListMap

    this.jobMaps = reactive(new Map())
  }

  get uid() {
    // return window?.Cookie.get('bst') // token ?
    if (!window._PAGE.encryptUserId) {
      useToast().add({
        color: 'error',
        title: '未获取到用户ID，可能会出现奇怪bug, 请尝试刷新页面或反馈',
      })
    }
    return window._PAGE.encryptUserId
  }

  get userInfo() {
    return {
      id: window._PAGE.encryptUserId,
      name: window._PAGE.showName ?? window._PAGE.name,
      avatar: window._PAGE.largeAvatar ?? window._PAGE.tinyAvatar ?? '',
    }
  }

  static async new() {
    const ctx = new BossHelperCtx()
    ctx.rootVue = await getRootVue()
    ctx.workflow = await bossWorkflow(ctx)
    return ctx
  }

  async loadMoreJob(delay: Promise<any>): Promise<boolean> {
    try {
      const oldLen = this._jobList.value.length
      const oldFirstJobId = this._jobList.value[0]?.encryptJobId ?? ''

      this._pageChange(this._page.value.page + 1)
      await delay
      const currentFirstJobId = this._jobList.value[0]?.encryptJobId ?? ''
      if (
        (location.href.includes('/web/geek/job-recommend') ||
          location.href.includes('/web/geek/jobs')) &&
        oldLen === this._jobList.value.length &&
        oldFirstJobId === currentFirstJobId
      ) {
        logger.error('翻页: 内容无变化')
        return false
      }
    } catch (err) {
      logger.error('翻页: 下一页错误', err)
      return false
    }
    return true
  }

  async start() {
    if (!this.workflow) {
      this.workflow = await bossWorkflow(this)
    }
    await this.workflow.executeAll(this._jobDataMap)
  }

  async sendMessage(data: WorkflowData<BoosJobData, {}>, msgs: FormDataInput['value']) {
    logger.debug('发送消息', { jobKey: data.jobData.key, msg: msgs })

    const stanza = {
      uid: Number(data.rawData.boss.data.bossId),
      friendSource: data.rawData.detail.bossInfo.bossSource ?? 0,
      encryptUid: data.rawData.jobitem.encryptBossId,
      encryptGid: '',
      clientMid: Date.now(),
    }
    if (typeof msgs === 'string') {
      msgs = [{ type: 'text', content: msgs }]
    }
    for (const msg of msgs) {
      var m
      // Each chat message needs its own client id; reusing one makes later messages look duplicated.
      stanza.clientMid = Date.now()
      if (msg.type === 'image') {
        const response = await counter.getImage(msg.image)
        if (!response.success) {
          throw new Error('图片未上传或已过期')
        }
        const u8Array = new Uint8Array(response.buffer)
        const file = new File([u8Array.buffer], response.name, { type: response.type })
        const img = await uploadImage(data.rawData.boss.data.securityId, file)

        m = this.geek.msgBuilder.createImageMessage(stanza, {
          content: {
            iid: 0,
            ...img,
          },
        })
      } else if (msg.type === 'text') {
        this.pendingMessages.value = msg.content
        await delay(this.conf.formData.delayMessageSending)
        m = this.geek.msgBuilder.createTextMessage(stanza, {
          text: this.pendingMessages.value,
        })
        this.pendingMessages.value = undefined
      } else {
        throw new Error('不支持的消息类型:' + msg['type'])
      }
      this.geek.client.publish('chat', this.geek.msgBuilder.encode(m), {
        qos: 1,
        retain: true,
      })
    }
  }

  private handleChatSocketState(state: BossChatSocketState): void {
    switch (state.status) {
      case 'idle':
        this.chatModel.setBossConnection('idle', '实时连接尚未启动')
        break
      case 'connecting':
        this.chatModel.setBossConnection(
          'connecting',
          state.detail || '正在连接 BOSS 实时消息…',
        )
        break
      case 'connected':
        this.chatModel.setBossConnection('connected', 'WS 已连接，等待 HR 新消息')
        break
      case 'reconnecting':
        this.chatModel.setBossConnection(
          'reconnecting',
          state.detail || '实时连接中断，正在重连…',
        )
        break
      case 'disconnected':
        this.chatModel.setBossConnection(
          'disconnected',
          state.detail ? `实时连接已断开：${state.detail}` : '实时连接已断开',
        )
        break
      case 'error':
        this.chatModel.setBossConnection(
          'error',
          state.detail ? `实时连接失败：${state.detail}` : '实时连接失败',
        )
        break
    }
  }

  private async loadConversationSnapshot(): Promise<void> {
    this.chatModel.setBossSnapshot('loading', '正在自动读取已聊 HR 会话摘要…')

    try {
      await waitForBossSession()
      const page = await fetchBossConversationPage()
      const currentUserId = String(window._PAGE?.uid ?? window._PAGE?.userId ?? '')

      for (const conversation of page.items) {
        const sessionKey = `boss-chat:${conversation.id}`
        const subtitle = [conversation.companyName, conversation.jobName]
          .filter(Boolean)
          .join(' · ')
        const outgoing =
          Boolean(conversation.lastMessageFromId) &&
          conversation.lastMessageFromId === currentUserId
        const existingMeta = this.chatModel.sessions.get(sessionKey)
        let snapshotUnreadMeta: Pick<ChatSessionMeta, 'unreadCount' | 'unreadState'> = {}
        if (existingMeta?.unreadState) {
          snapshotUnreadMeta = {
            unreadCount: existingMeta.unreadCount,
            unreadState: existingMeta.unreadState,
          }
        } else if (outgoing && conversation.lastMessage) {
          snapshotUnreadMeta = { unreadCount: 0, unreadState: 'read' }
        } else if (conversation.unreadCount !== undefined) {
          snapshotUnreadMeta = {
            unreadCount: conversation.unreadCount,
            unreadState: conversation.unreadCount > 0 ? 'unread' : 'read',
          }
        }
        const lastIncomingMessageId =
          existingMeta?.lastIncomingMessageId ||
          (!outgoing && conversation.lastMessageId ? conversation.lastMessageId : undefined)
        const sessionMeta = {
          kind: 'boss' as const,
          title: conversation.name,
          subtitle: subtitle || 'BOSS 会话',
          avatar: conversation.avatar,
          readOnly: true,
          conversationId: conversation.id,
          friendId: conversation.friendId,
          friendSource: conversation.friendSource,
          encryptBossId: conversation.encryptBossId,
          encryptJobId: conversation.encryptJobId,
          securityId: conversation.securityId,
          jobLid: conversation.jobLid,
          companyName: conversation.companyName,
          jobName: conversation.jobName,
          historyStatus: 'idle' as const,
          historyMessage: '选择会话后读取最近聊天记录',
          historyMessageCount: 0,
          jobContextStatus: 'idle' as const,
          jobContextMessage: '选择会话后读取岗位信息',
          conversationHistoryComplete: false,
          ...snapshotUnreadMeta,
          ...(lastIncomingMessageId ? { lastIncomingMessageId } : {}),
        }

        // 快照按接口排序追加，首个会话仍保持为最近会话。
        this.chatModel.ensureSession(sessionKey, sessionMeta, 'back')
        if (this.pausedReplySessions.has(sessionKey)) {
          this.chatModel.setBossReplySession(sessionKey, 'paused', '当前会话正在等待人工恢复')
        }
        if (!conversation.lastMessage) continue

        this.chatModel.appendMessage(
          sessionKey,
          {
            id: conversation.lastMessageId
              ? `boss-ws-${conversation.lastMessageId}`
              : `boss-snapshot-${conversation.id}-${conversation.lastMessageAt}`,
            role: outgoing ? 'user' : 'assistant',
            uiRole: 'boss',
            side: outgoing ? 'right' : 'left',
            parts: [{ type: 'text', text: conversation.lastMessage }],
            bossDirection: outgoing ? 'outgoing' : 'incoming',
            bossSentAt: conversation.lastMessageAt,
            avatar: {
              src: outgoing ? this.userInfo.avatar : conversation.avatar,
              alt: outgoing ? this.userInfo.name : conversation.name,
            },
          },
          sessionMeta,
        )
      }

      this.chatModel.setBossSnapshot(
        'ready',
        `已自动读取 ${page.items.length} 个会话摘要；新消息由 WS 实时追加`,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      this.chatModel.setBossSnapshot('error', `会话摘要读取失败：${message}`)
      logger.error('自动读取 BOSS 会话摘要失败', error)
    }
  }

  private updateRealtimeUnread(message: BossRealtimeMessage): void {
    if (message.direction !== 'incoming' || !message.participantId) return

    const sessionKey = `boss-chat:${message.conversationId}`
    this.chatModel.ensureSession(
      sessionKey,
      {
        kind: 'boss',
        title: message.participantName || '未知招聘者',
        subtitle: message.participantCompany || 'BOSS 实时消息',
        avatar: message.participantAvatar,
        readOnly: true,
        conversationId: message.conversationId,
        friendId: message.participantId,
        friendSource: message.participantSource,
        securityId: message.securityId,
        companyName: message.participantCompany,
      },
      'front',
    )

    const current = this.chatModel.sessions.get(sessionKey)
    this.updateSessionMeta(sessionKey, {
      lastIncomingMessageId: message.id,
      ...(message.countsAsUnread
        ? {
            unreadCount: (current?.unreadCount || 0) + 1,
            unreadState: 'unread',
          }
        : {}),
    })
  }

  private handleRealtimeMessage(message: BossRealtimeMessage): void {
    const sessionKey = `boss-chat:${message.conversationId}`
    this.updateRealtimeUnread(message)
    if (message.jobContext && message.direction !== 'system' && message.participantId) {
      this.chatModel.ensureSession(
        sessionKey,
        {
          kind: 'boss',
          title: message.participantName || '未知招聘者',
          subtitle: message.participantCompany || 'BOSS 实时消息',
          avatar: message.participantAvatar,
          readOnly: true,
          conversationId: message.conversationId,
          friendId: message.participantId,
          friendSource: message.participantSource,
          securityId: message.securityId,
          companyName: message.participantCompany,
        },
        'front',
      )
      this.mergeSessionJobContext(sessionKey, message.jobContext)
    }

    if (
      message.direction === 'system' ||
      message.isOffline ||
      message.contentType !== 'text' ||
      !message.text
    ) {
      logger.debug('忽略非 MVP 范围的 BOSS WS 消息', {
        direction: message.direction,
        contentType: message.contentType,
        rawType: message.rawType,
        isOffline: message.isOffline,
      })
      return
    }

    const participantName = message.participantName || '未知招聘者'
    const outgoing = message.direction === 'outgoing'
    const added = this.chatModel.appendMessage(
      sessionKey,
      {
        id: `boss-ws-${message.id}`,
        role: outgoing ? 'user' : 'assistant',
        uiRole: 'boss',
        side: outgoing ? 'right' : 'left',
        parts: [{ type: 'text', text: message.text }],
        bossDirection: outgoing ? 'outgoing' : 'incoming',
        bossSentAt: message.sentAt,
        avatar: {
          src: outgoing ? this.userInfo.avatar : message.participantAvatar,
          alt: outgoing ? this.userInfo.name : participantName,
        },
      },
      {
        kind: 'boss',
        title: participantName,
        subtitle: message.participantCompany || 'BOSS 实时消息',
        avatar: message.participantAvatar,
        readOnly: true,
        conversationId: message.conversationId,
        friendId: message.participantId,
        friendSource: message.participantSource,
        securityId: message.securityId,
        companyName: message.participantCompany,
      },
    )

    if (added) {
      logger.info('已接收 BOSS WS 文本消息', {
        direction: message.direction,
      })
      if (!outgoing) void this.queueBossReplyMessage(message)
    }
  }

  private async loadPausedReplySessions(): Promise<void> {
    if (this.replyPausedSessionsLoaded) return
    try {
      const stored = await counter.storageGet<string[]>(BOSS_REPLY_PAUSED_SESSIONS_KEY, [])
      for (const sessionKey of stored) {
        if (typeof sessionKey === 'string' && sessionKey) this.pausedReplySessions.add(sessionKey)
      }
    } catch (error) {
      logger.error('读取 AI 回复暂停状态失败', error)
    } finally {
      this.replyPausedSessionsLoaded = true
    }
  }

  private async persistPausedReplySessions(): Promise<void> {
    try {
      await counter.storageSet(BOSS_REPLY_PAUSED_SESSIONS_KEY, [...this.pausedReplySessions])
    } catch (error) {
      logger.error('保存 AI 回复暂停状态失败', error)
    }
  }

  private async refreshBossReplyState(): Promise<void> {
    await this.loadPausedReplySessions()
    const config = this.conf.formData.aiReply
    if (!config.enable) {
      this.chatModel.setBossReply('disabled', 'AI 自动回复已停用')
      return
    }
    if (!config.model || !this.models.modelData.value.some((model) => model.key === config.model)) {
      this.chatModel.setBossReply('error', 'AI 自动回复已启用，但尚未选择可用模型')
      return
    }
    this.chatModel.setBossReply(
      'ready',
      config.mode === 'auto' ? 'AI 自动回复已启用' : 'AI 回复草稿模式已启用',
    )
  }

  private async queueBossReplyMessage(message: BossRealtimeMessage): Promise<void> {
    const sessionKey = `boss-chat:${message.conversationId}`
    this.replyDraftVersions.delete(sessionKey)
    await this.loadPausedReplySessions()

    if (!this.conf.formData.aiReply.enable) {
      this.chatModel.setBossReplySession(sessionKey, 'disabled', 'AI 自动回复未启用')
      return
    }

    const paused = this.pausedReplySessions.has(sessionKey)
    this.chatModel.setBossReplySession(
      sessionKey,
      paused ? 'paused' : 'queued',
      paused ? '当前会话已暂停；新消息将只通知人工' : '已收到 HR 新消息，等待 2.5 秒合并',
    )
    this.chatModel.setBossReply(
      paused ? 'paused' : 'queued',
      paused ? '暂停会话收到 HR 新消息' : '已收到 HR 新消息，等待合并',
    )
    this.replyBatcher.enqueue(message)
  }

  private updateSessionMeta(sessionKey: string, patch: Partial<ChatSessionMeta>): void {
    const current = this.chatModel.sessions.get(sessionKey)
    if (!current) return
    this.chatModel.ensureSession(
      sessionKey,
      {
        ...current,
        ...patch,
        kind: 'boss',
        title: patch.title || current.title,
      },
      'back',
    )
  }

  private mergeSessionJobContext(
    sessionKey: string,
    context: Partial<BossMessageJobContext>,
  ): void {
    const current = this.chatModel.sessions.get(sessionKey)
    if (!current) return

    const jobName = context.jobName?.trim() || current.jobName || ''
    const companyName = context.companyName?.trim() || current.companyName || ''
    const description = context.description?.trim() || current.jobDescription || ''
    const salary = context.salary?.trim() || current.jobSalary || ''
    const degree = context.degree?.trim() || current.jobDegree || ''
    const experience = context.experience?.trim() || current.jobExperience || ''
    const address = context.address?.trim() || current.jobAddress || ''
    const skills = context.skills?.length ? context.skills : current.jobSkills || []
    const hasSummary = Boolean(
      jobName || companyName || salary || degree || experience || address || skills.length,
    )
    const status = description
      ? 'ready'
      : current.jobContextStatus === 'ready'
        ? 'ready'
        : hasSummary
          ? 'partial'
          : current.jobContextStatus || 'idle'

    this.updateSessionMeta(sessionKey, {
      encryptJobId: context.encryptJobId?.trim() || current.encryptJobId,
      securityId: context.securityId?.trim() || current.securityId,
      jobLid: context.lid?.trim() || current.jobLid,
      jobName,
      companyName,
      jobSalary: salary,
      jobDegree: degree,
      jobExperience: experience,
      jobAddress: address,
      jobDescription: description,
      jobSkills: skills,
      jobContextStatus: status,
      jobContextMessage: description
        ? '已读取岗位 JD 正文'
        : hasSummary
          ? '已读取岗位摘要，暂未取得 JD 正文'
          : current.jobContextMessage,
    })
  }

  private async ensureSessionRelationContext(sessionKey: string): Promise<void> {
    const meta = this.chatModel.sessions.get(sessionKey)
    if (!meta?.encryptBossId || !meta.securityId) return

    const relation = await getBossData({
      encryptUserId: meta.encryptBossId,
      securityId: meta.securityId,
      bossSource: meta.friendSource,
    })
    const relationData = relation.data
    const relationJob = relation.job

    this.updateSessionMeta(sessionKey, {
      title: relationData.name || meta.title,
      friendId: relationData.bossId ? String(relationData.bossId) : meta.friendId,
      friendSource: relationData.bossSource ?? meta.friendSource,
      encryptBossId: relationData.encryptBossId || meta.encryptBossId,
      encryptJobId:
        relationData.encryptJobId || relationJob.encryptJobId || meta.encryptJobId,
      securityId: relationData.securityId || meta.securityId,
      jobLid: relationData.lid || relationJob.lid || meta.jobLid,
    })
    this.mergeSessionJobContext(sessionKey, {
      jobName: relationJob.jobName,
      companyName: relationJob.brandName || relationData.companyName,
      salary: relationJob.salaryDesc,
      degree: relationJob.degreeName,
      experience: relationJob.experienceName,
      address: relationJob.address || relationJob.locationName,
      description:
        relationJob.jobDescription || relationJob.postDescription || relationJob.description || '',
      skills: relationJob.skills || [],
      lid: relationData.lid || relationJob.lid || '',
      encryptJobId: relationData.encryptJobId || relationJob.encryptJobId || '',
      securityId: relationData.securityId || meta.securityId,
    })
  }

  private async loadSessionHistory(sessionKey: string): Promise<void> {
    const initialMeta = this.chatModel.sessions.get(sessionKey)
    if (!initialMeta) throw new Error('未找到当前 BOSS 会话')
    this.updateSessionMeta(sessionKey, {
      historyStatus: 'loading',
      historyMessage: '正在读取最近聊天记录…',
    })

    let rawMessages: Parameters<typeof parseBossChatProtocol>[0]['messages'] = []
    let maxMessageId = '0'
    let complete = false

    for (let page = 1; page <= BOSS_HISTORY_MAX_PAGES; page += 1) {
      const meta = this.chatModel.sessions.get(sessionKey) || initialMeta
      const history = await fetchBossConversationHistory(
        {
          encryptBossId: meta.encryptBossId || '',
          friendSource: meta.friendSource ?? 0,
          securityId: meta.securityId || '',
        },
        page,
        BOSS_HISTORY_PAGE_SIZE,
        maxMessageId,
      )
      rawMessages =
        page === 1
          ? history.messages
          : [...history.messages, ...(rawMessages || [])]
      if (!history.hasMore) {
        complete = true
        break
      }
      if (!history.minMessageId || history.minMessageId === maxMessageId) break
      maxMessageId = history.minMessageId
    }

    const currentUserId = String(window._PAGE?.uid ?? window._PAGE?.userId ?? '')
    const parsedMessages = parseBossChatProtocol(
      { messages: rawMessages || [] },
      currentUserId,
    ).sort((left, right) => left.sentAt - right.sentAt)

    for (const message of parsedMessages) {
      if (message.jobContext) this.mergeSessionJobContext(sessionKey, message.jobContext)
    }

    const visibleMessages: Message[] = parsedMessages
      .filter(
        (message) =>
          message.direction !== 'system' && message.contentType === 'text' && message.text,
      )
      .map((message) => {
        const outgoing = message.direction === 'outgoing'
        return {
          id: `boss-ws-${message.id}`,
          role: outgoing ? 'user' : 'assistant',
          uiRole: 'boss',
          side: outgoing ? 'right' : 'left',
          parts: [{ type: 'text', text: message.text }],
          bossDirection: outgoing ? 'outgoing' : 'incoming',
          bossSentAt: message.sentAt,
          avatar: {
            src: outgoing ? this.userInfo.avatar : message.participantAvatar,
            alt: outgoing ? this.userInfo.name : message.participantName || '招聘者',
          },
        }
      })

    const latestMeta = this.chatModel.sessions.get(sessionKey) || initialMeta
    const state = this.chatModel.ensureSession(sessionKey, latestMeta, 'back')
    const mergedMessages = new Map<string, Message>()
    for (const message of state.messages) mergedMessages.set(message.id, message)
    for (const message of visibleMessages) mergedMessages.set(message.id, message)
    state.messages = [...mergedMessages.values()].sort((left, right) => {
      const timeDifference = (left.bossSentAt || 0) - (right.bossSentAt || 0)
      return timeDifference || left.id.localeCompare(right.id)
    })

    const historyMessageCount = state.messages.filter((message) => message.uiRole === 'boss').length
    this.updateSessionMeta(sessionKey, {
      historyStatus: complete ? 'ready' : 'partial',
      historyMessage: complete
        ? `已读取全部 ${historyMessageCount} 条文本记录`
        : `已读取最近 ${historyMessageCount} 条文本记录，较早记录未加载`,
      historyMessageCount,
      conversationHistoryComplete: complete,
    })
  }

  override async loadBossSessionContext(sessionKey: string): Promise<void> {
    const meta = this.chatModel.sessions.get(sessionKey)
    if (!meta) throw new Error('未找到当前 BOSS 会话')
    const existingTask = this.sessionContextTasks.get(sessionKey)
    if (existingTask) return existingTask
    if (
      ['ready', 'partial'].includes(meta.historyStatus || '') &&
      ['ready', 'partial'].includes(meta.jobContextStatus || '')
    ) {
      return
    }

    const task = (async () => {
      try {
        await this.ensureSessionRelationContext(sessionKey)
      } catch (error) {
        logger.warn('补充 BOSS 会话关系与岗位摘要失败', error)
      }

      try {
        await this.loadSessionHistory(sessionKey)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        this.updateSessionMeta(sessionKey, {
          historyStatus: 'error',
          historyMessage: `聊天记录读取失败：${message}`,
          conversationHistoryComplete: false,
        })
        logger.warn('读取 BOSS 聊天记录失败', error)
      }

      try {
        await this.ensureSessionJobDetail(sessionKey)
      } catch (error) {
        const current = this.chatModel.sessions.get(sessionKey)
        const message = error instanceof Error ? error.message : String(error)
        this.updateSessionMeta(sessionKey, {
          jobContextStatus: current?.jobName ? 'partial' : 'error',
          jobContextMessage: current?.jobName
            ? `已读取岗位摘要，JD 正文读取失败：${message}`
            : `岗位信息读取失败：${message}`,
        })
        logger.warn('读取会话对应岗位 JD 失败', error)
      }
    })()

    this.sessionContextTasks.set(sessionKey, task)
    try {
      await task
    } finally {
      if (this.sessionContextTasks.get(sessionKey) === task) {
        this.sessionContextTasks.delete(sessionKey)
      }
    }
  }

  override async markBossSessionRead(sessionKey: string): Promise<void> {
    const meta = this.chatModel.sessions.get(sessionKey)
    if (!meta) return
    if (meta.unreadState === 'read' && (meta.unreadCount || 0) === 0) return

    this.updateSessionMeta(sessionKey, {
      unreadCount: 0,
      unreadState: 'read',
    })

    if (!meta.lastIncomingMessageId || !meta.friendId) return
    try {
      await this.geek.markRead(
        {
          uid: meta.friendId,
          friendSource: meta.friendSource ?? 0,
        },
        meta.lastIncomingMessageId,
      )
    } catch (error) {
      // 本地仍保持已读，连接恢复后新的入站消息会重新进入未读状态。
      logger.warn('发送 BOSS 已读回执失败', error)
    }
  }

  private getVisibleReplyMessages(sessionKey: string): BossReplyMessage[] {
    const state = this.chatModel.states.get(sessionKey)
    return (state?.messages ?? [])
      .slice(-24)
      .flatMap((item) => {
        const text = (item.parts ?? [])
          .map((part) => ('text' in part && typeof part.text === 'string' ? part.text : ''))
          .filter(Boolean)
          .join('\n')
          .trim()
        if (!text) return []

        return [
          {
            id: item.id,
            direction:
              item.bossDirection ?? (item.side === 'right' ? 'outgoing' : 'incoming'),
            text: text.slice(0, 4000),
            sentAt: item.bossSentAt ?? 0,
          } satisfies BossReplyMessage,
        ]
      })
  }

  private async ensureSessionJobDetail(sessionKey: string): Promise<void> {
    if (this.sessionJobDetails.has(sessionKey)) return
    const meta = this.chatModel.sessions.get(sessionKey)
    if (!meta) return
    if (meta.jobDescription?.trim()) {
      this.updateSessionMeta(sessionKey, {
        jobContextStatus: 'ready',
        jobContextMessage: '已从会话岗位卡片读取 JD 正文',
      })
      return
    }

    const workflow = meta.encryptJobId
      ? this.jobMaps.get(`boss::${meta.encryptJobId}`)
      : undefined
    const existing = workflow?.jobData
    if (existing?.jobDescription?.trim()) {
      this.mergeSessionJobContext(sessionKey, {
        jobName: existing.jobName || existing.positionName || '',
        companyName: existing.brand.name,
        salary: existing.salary || '',
        degree: existing.degreeName || '',
        experience: existing.experienceName || '',
        address: existing.address || existing.city || '',
        description: existing.jobDescription,
        skills: existing.skills || [],
        lid: workflow?.rawData?.jobitem?.lid || meta.jobLid || '',
        encryptJobId: meta.encryptJobId || '',
        securityId: workflow?.rawData?.jobitem?.securityId || meta.securityId || '',
      })
      return
    }

    const rawJob = workflow?.rawData?.jobitem
    const securityId = rawJob?.securityId || meta.securityId || ''
    let lid = rawJob?.lid || meta.jobLid || ''
    if (!securityId) throw new Error('当前会话缺少岗位详情所需的 securityId')

    this.updateSessionMeta(sessionKey, {
      jobContextStatus: 'loading',
      jobContextMessage: '正在读取岗位 JD…',
    })

    let detailError = ''
    try {
      const response = await getJobDetail({ securityId, lid: lid || undefined })
      if (response.code !== 0 || !response.zpData?.jobInfo) {
        throw new Error(response.message || '岗位详情接口未返回有效 JD')
      }
      this.sessionJobDetails.set(sessionKey, response.zpData)
      const detailJob = response.zpData.jobInfo
      this.mergeSessionJobContext(sessionKey, {
        jobName: detailJob.jobName,
        companyName: response.zpData.brandComInfo.brandName,
        salary: detailJob.salaryDesc,
        degree: detailJob.degreeName,
        experience: detailJob.experienceName,
        address: detailJob.address || detailJob.locationName,
        description: detailJob.postDescription,
        skills: detailJob.showSkills || existing?.skills || meta.jobSkills || [],
        lid: response.zpData.lid || lid,
        encryptJobId: detailJob.encryptId || meta.encryptJobId || '',
        securityId: response.zpData.securityId || securityId,
      })
      return
    } catch (error) {
      detailError = error instanceof Error ? error.message : String(error)
    }

    const baseResponse = await getChatJobBaseInfo({ securityId })
    if (baseResponse.code !== 0 || !baseResponse.zpData) {
      throw new Error(baseResponse.message || detailError || '岗位信息接口未返回有效数据')
    }
    const base = baseResponse.zpData
    lid = base.lid || lid
    this.mergeSessionJobContext(sessionKey, {
      jobName: base.jobName || '',
      companyName: base.brandName || base.companyName || '',
      salary: base.salaryDesc || '',
      degree: base.degreeName || '',
      experience: base.experienceName || '',
      address: base.address || base.locationName || '',
      description: base.jobDescription || base.postDescription || base.description || '',
      skills: base.skills || [],
      lid,
      encryptJobId: base.encryptJobId || meta.encryptJobId || '',
      securityId,
    })

    if (!this.chatModel.sessions.get(sessionKey)?.jobDescription && detailError) {
      throw new Error(detailError)
    }
  }

  private buildBossReplyContext(
    sessionKey: string,
    messages: BossRealtimeMessage[],
    trigger: BossReplyTrigger,
  ): {
    prompt: BossReplyPromptContext
    allowedEvidenceIds: Set<string>
    latestMessage: string
    latestMessageId: string
  } {
    const sessionMeta = this.chatModel.sessions.get(sessionKey)
    const workflow = sessionMeta?.encryptJobId
      ? this.jobMaps.get(`boss::${sessionMeta.encryptJobId}`)
      : undefined
    const job = workflow?.jobData
    const detail = this.sessionJobDetails.get(sessionKey)
    const detailJob = detail?.jobInfo
    const description =
      job?.jobDescription?.trim() ||
      detailJob?.postDescription?.trim() ||
      sessionMeta?.jobDescription?.trim() ||
      ''
    const jobName = job?.jobName || detailJob?.jobName || sessionMeta?.jobName || ''
    const companyName =
      job?.brand.name || detail?.brandComInfo.brandName || sessionMeta?.companyName || ''
    const allowedEvidenceIds = new Set<string>()
    const recentConversation = this.getVisibleReplyMessages(sessionKey)

    const recentConversationText = recentConversation.length
      ? recentConversation
          .map((item) => {
            const evidenceId = `message:${item.id}`
            allowedEvidenceIds.add(evidenceId)
            const rawTime = item.sentAt
              ? item.sentAt < 1_000_000_000_000
                ? item.sentAt * 1000
                : item.sentAt
              : 0
            const timeLabel = rawTime ? new Date(rawTime).toLocaleString('zh-CN') : '时间未知'
            return `[${evidenceId}] [${timeLabel}] ${item.direction === 'incoming' ? 'HR' : '我'}：${item.text}`
          })
          .join('\n')
      : '（当前未读取到聊天记录）'

    const jobLines = [
      jobName ? `岗位：${jobName}` : '',
      companyName ? `公司：${companyName}` : '',
      job?.salary || detailJob?.salaryDesc || sessionMeta?.jobSalary
        ? `薪资：${job?.salary || detailJob?.salaryDesc || sessionMeta?.jobSalary}`
        : '',
      job?.degreeName || detailJob?.degreeName || sessionMeta?.jobDegree
        ? `学历要求：${job?.degreeName || detailJob?.degreeName || sessionMeta?.jobDegree}`
        : '',
      job?.experienceName || detailJob?.experienceName || sessionMeta?.jobExperience
        ? `经验要求：${job?.experienceName || detailJob?.experienceName || sessionMeta?.jobExperience}`
        : '',
      job?.skills?.length || sessionMeta?.jobSkills?.length
        ? `技能：${(job?.skills || sessionMeta?.jobSkills || []).join('、')}`
        : '',
      detailJob?.address || sessionMeta?.jobAddress
        ? `地址：${detailJob?.address || sessionMeta?.jobAddress}`
        : '',
      jobName || companyName || description || sessionMeta?.jobSalary
        ? `岗位上下文：${description ? '包含 JD 正文' : '仅岗位摘要'}`
        : '',
      description ? `JD：${description.slice(0, 12000)}` : '',
    ].filter(Boolean)
    if (jobLines.length > 0) allowedEvidenceIds.add('job')

    const configuredKnowledge = Array.isArray(this.conf.formData.aiReply.knowledge)
      ? this.conf.formData.aiReply.knowledge
      : []
    const knowledgeLines = configuredKnowledge
      .filter(
        (item) =>
          item.enabled &&
          item.confirmed &&
          typeof item.id === 'string' &&
          item.id &&
          typeof item.content === 'string' &&
          item.content.trim(),
      )
      .slice(0, 50)
      .map((item) => {
        const evidenceId = `knowledge:${item.id}`
        allowedEvidenceIds.add(evidenceId)
        const keywords = Array.isArray(item.keywords)
          ? item.keywords.filter((keyword) => typeof keyword === 'string' && keyword).join('、')
          : ''
        const title = typeof item.title === 'string' ? item.title : ''
        return `[${evidenceId}] ${title || '未命名'}：${item.content.slice(0, 2000)}${keywords ? `（关键词：${keywords}）` : ''}`
      })

    const incomingMessages = messages.length
      ? messages
          .map((item) => {
            const evidenceId = `message:${item.id}`
            allowedEvidenceIds.add(evidenceId)
            return `[${evidenceId}] ${item.text.slice(0, 4000)}`
          })
          .join('\n')
      : trigger === 'follow_up'
        ? '（无新消息；本次由用户明确发起主动跟进）'
        : '（无；本次由用户主动选择当前会话发起）'
    const latestMessage =
      messages[messages.length - 1]?.text || recentConversation[recentConversation.length - 1]?.text || ''

    return {
      prompt: {
        trigger,
        triggerLabel:
          trigger === 'follow_up'
            ? '用户主动发起跟进'
            : trigger === 'manual'
              ? '用户主动处理已有会话'
              : 'HR 新消息',
        taskInstruction:
          trigger === 'follow_up'
            ? '根据岗位信息和最近聊天自然承接，生成一条推进沟通的主动跟进；不要重复已发送内容。若对方已明确拒绝、刚刚跟进过或上下文不足，则忽略或转人工。'
            : '判断最新 HR 内容是否需要回复；需要时只回答已确认的信息，并自然承接当前对话。',
        candidate: `${this.userInfo.name || '当前求职者'}（ID：${this.userInfo.id || '未知'}）`,
        recruiter: `${sessionMeta?.title || '未知招聘者'}${companyName ? ` · ${companyName}` : ''}`,
        job: jobLines.length ? `[job]\n${jobLines.join('\n')}` : '（未读取到对应岗位 JD）',
        incomingMessages,
        recentConversation: recentConversationText,
        knowledge: knowledgeLines.length ? knowledgeLines.join('\n') : '（尚未配置已确认知识）',
        availableEvidenceIds: [...allowedEvidenceIds].join('、') || '（无）',
        conversationHistoryComplete:
          sessionMeta?.historyMessage ||
          (sessionMeta?.conversationHistoryComplete ? '完整' : '不完整'),
        maxReplyLength: clampFiniteNumber(
          this.conf.formData.aiReply.maxReplyLength,
          20,
          1000,
          300,
        ),
      },
      allowedEvidenceIds,
      latestMessage,
      latestMessageId: recentConversation[recentConversation.length - 1]?.id || '',
    }
  }

  private async sendBossReplyNotifications(
    sessionKey: string,
    trigger: BossReplyTrigger,
    reason: string,
    latestMessage: string,
  ): Promise<void> {
    const config = this.conf.formData.aiReply
    const meta = this.chatModel.sessions.get(sessionKey)
    const payload: BossHumanHandoffNotification = {
      conversationId: meta?.conversationId || sessionKey,
      recruiterName: meta?.title || '未知招聘者',
      companyName: meta?.companyName || '',
      jobName: meta?.jobName || '',
      latestMessage,
      reason,
      trigger,
    }
    const tasks: Promise<unknown>[] = []

    if (config.browserNotification) {
      tasks.push(
        counter.notify({
          type: 'basic',
          iconUrl: '/icons/128.png',
          title: 'BossHelper 需要人工处理',
          message: `${payload.recruiterName}：${reason}`,
        }),
      )
    }
    if (config.feishuNotification) tasks.push(counter.notifyBossHumanHandoff(payload))

    const results = await Promise.allSettled(tasks)
    for (const result of results) {
      if (result.status === 'rejected') logger.error('发送人工接管通知失败', result.reason)
    }
  }

  private async handoffBossReply(
    sessionKey: string,
    trigger: BossReplyTrigger,
    reason: string,
    latestMessage: string,
    decision?: BossReplyDecision,
    status: 'awaiting_human' | 'error' = 'awaiting_human',
  ): Promise<void> {
    this.replyDraftVersions.delete(sessionKey)
    this.pausedReplySessions.add(sessionKey)
    await this.persistPausedReplySessions()
    const message = `本轮未回复，当前会话已暂停：${reason}`
    this.chatModel.setBossReplySession(sessionKey, status, message, decision)
    this.chatModel.setBossReply(status, message)
    await this.sendBossReplyNotifications(sessionKey, trigger, reason, latestMessage)
  }

  private async processBossReply(
    sessionKey: string,
    messages: BossRealtimeMessage[],
    trigger: BossReplyTrigger,
  ): Promise<void> {
    await this.loadPausedReplySessions()
    const config = this.conf.formData.aiReply
    const executionMode = config.mode === 'auto' ? 'auto' : 'draft'
    await this.loadBossSessionContext(sessionKey)
    const context = this.buildBossReplyContext(sessionKey, messages, trigger)

    if (!config.enable) {
      this.chatModel.setBossReplySession(sessionKey, 'disabled', 'AI 自动回复未启用')
      return
    }
    if (this.pausedReplySessions.has(sessionKey)) {
      const reason = '当前会话处于人工接管状态'
      this.chatModel.setBossReplySession(sessionKey, 'paused', `${reason}，没有自动回复`)
      await this.sendBossReplyNotifications(sessionKey, trigger, reason, context.latestMessage)
      return
    }
    if (trigger === 'follow_up' && this.getVisibleReplyMessages(sessionKey).length === 0) {
      await this.handoffBossReply(
        sessionKey,
        trigger,
        '未读取到可承接的聊天记录，无法安全生成主动跟进',
        context.latestMessage,
      )
      return
    }
    if (!this.chatModel.createAgent(config, 'boss')) {
      await this.handoffBossReply(
        sessionKey,
        trigger,
        'AI 模型尚未正确配置',
        context.latestMessage,
        undefined,
        'error',
      )
      return
    }

    this.chatModel.setBossReplySession(sessionKey, 'generating', '正在由插件本地 AI 判断')
    this.chatModel.setBossReply('generating', '正在分析 BOSS 会话')

    try {
      const rawDecision = await this.chatModel.generate('boss', { reply: context.prompt })
      const decision = validateBossReplyDecision(
        rawDecision,
        context.allowedEvidenceIds,
        context.prompt.maxReplyLength,
      )
      if (!this.conf.formData.aiReply.enable) {
        this.chatModel.setBossReplySession(sessionKey, 'disabled', 'AI 回复已停用，本轮结果未使用')
        await this.refreshBossReplyState()
        return
      }
      if (this.pausedReplySessions.has(sessionKey)) {
        this.chatModel.setBossReplySession(sessionKey, 'paused', '当前会话已暂停，本轮结果未使用')
        return
      }
      const latestAfterGeneration = this.getVisibleReplyMessages(sessionKey).at(-1)?.id || ''
      if (latestAfterGeneration !== context.latestMessageId) {
        await this.handoffBossReply(
          sessionKey,
          trigger,
          'AI 生成期间聊天内容已变化，旧结果已作废',
          this.getVisibleReplyMessages(sessionKey).at(-1)?.text || context.latestMessage,
          decision,
        )
        return
      }

      if (decision.action === 'ignore') {
        this.replyDraftVersions.delete(sessionKey)
        this.chatModel.setBossReplySession(
          sessionKey,
          'ignored',
          `AI 判断无需回复：${decision.reason}`,
          decision,
        )
        this.chatModel.setBossReply('ready', 'AI 判断当前消息无需回复')
        return
      }
      if (decision.action === 'need_human') {
        await this.handoffBossReply(
          sessionKey,
          trigger,
          decision.reason,
          context.latestMessage,
          decision,
        )
        return
      }

      if (executionMode !== 'auto') {
        this.replyDraftVersions.set(sessionKey, context.latestMessageId)
        this.chatModel.setBossReplySession(
          sessionKey,
          'draft',
          'AI 已生成回复草稿，未自动发送',
          decision,
        )
        this.chatModel.setBossReply('ready', 'AI 回复草稿已生成')
        if (config.browserNotification) {
          void counter
            .notify({
              type: 'basic',
              iconUrl: '/icons/128.png',
              title: 'BossHelper 回复草稿待确认',
              message: `${this.chatModel.sessions.get(sessionKey)?.title || 'HR'}：${decision.reply}`,
            })
            .catch((error) => logger.error('显示回复草稿通知失败', error))
        }
        return
      }

      const sendDelaySeconds = clampFiniteNumber(config.sendDelaySeconds, 0, 30, 2)
      if (sendDelaySeconds > 0) {
        this.chatModel.setBossReplySession(
          sessionKey,
          'generating',
          `AI 已通过校验，${sendDelaySeconds} 秒后发送`,
          decision,
        )
        await new Promise((resolve) => setTimeout(resolve, sendDelaySeconds * 1000))
      }
      if (!this.conf.formData.aiReply.enable || this.pausedReplySessions.has(sessionKey)) {
        this.chatModel.setBossReplySession(sessionKey, 'paused', '发送前已停用或暂停，未发送')
        return
      }
      if (this.conf.formData.aiReply.mode !== 'auto') {
        this.replyDraftVersions.set(sessionKey, context.latestMessageId)
        this.chatModel.setBossReplySession(
          sessionKey,
          'draft',
          '发送前已切换为草稿模式，结果未自动发送',
          decision,
        )
        this.chatModel.setBossReply('ready', 'AI 回复已转为草稿')
        return
      }
      const latestBeforeSend = this.getVisibleReplyMessages(sessionKey).at(-1)?.id || ''
      if (latestBeforeSend !== context.latestMessageId) {
        await this.handoffBossReply(
          sessionKey,
          trigger,
          '发送等待期间聊天内容已变化，旧回复未发送',
          this.getVisibleReplyMessages(sessionKey).at(-1)?.text || context.latestMessage,
          decision,
        )
        return
      }
      const currentContext = this.buildBossReplyContext(sessionKey, [], trigger)
      if (
        decision.evidenceIds.length === 0 ||
        decision.evidenceIds.some((id) => !currentContext.allowedEvidenceIds.has(id)) ||
        decision.reply.length > currentContext.prompt.maxReplyLength
      ) {
        await this.handoffBossReply(
          sessionKey,
          trigger,
          '发送前证据或回复限制已变化，旧结果未发送',
          currentContext.latestMessage,
          decision,
        )
        return
      }

      const meta = this.chatModel.sessions.get(sessionKey)
      if (!meta?.friendId || !meta.encryptBossId) {
        await this.handoffBossReply(
          sessionKey,
          trigger,
          '当前会话缺少 WS 发送所需的 HR 标识',
          context.latestMessage,
          decision,
          'error',
        )
        return
      }
      await this.geek.sendText(
        {
          uid: meta.friendId,
          friendSource: meta.friendSource ?? 0,
          encryptUid: meta.encryptBossId,
        },
        decision.reply,
      )
      this.chatModel.setBossReplySession(
        sessionKey,
        'sent',
        'AI 回复已通过 BOSS WS 发送',
        decision,
      )
      this.replyDraftVersions.delete(sessionKey)
      this.chatModel.setBossReply('ready', 'AI 回复已发送，等待 HR 新消息')
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      logger.error('BOSS 本地 AI 回复失败', error)
      await this.handoffBossReply(
        sessionKey,
        trigger,
        `AI 处理失败：${reason}`,
        context.latestMessage,
        undefined,
        'error',
      )
    }
  }

  private async enqueueBossReplyTask(
    sessionKey: string,
    messages: BossRealtimeMessage[],
    trigger: BossReplyTrigger,
  ): Promise<void> {
    const previous = this.replyTasks.get(sessionKey) ?? Promise.resolve()
    const task = previous.catch(() => undefined).then(() =>
      this.processBossReply(sessionKey, messages, trigger),
    )
    this.replyTasks.set(sessionKey, task)
    try {
      await task
    } finally {
      if (this.replyTasks.get(sessionKey) === task) this.replyTasks.delete(sessionKey)
    }
  }

  private async flushBossReplyMessages(messages: BossRealtimeMessage[]): Promise<void> {
    if (messages.length === 0) return
    const sessionKey = `boss-chat:${messages[messages.length - 1]!.conversationId}`
    await this.enqueueBossReplyTask(sessionKey, messages, 'incoming')
  }

  override async triggerBossAiReply(sessionKey: string): Promise<void> {
    if (!this.chatModel.sessions.has(sessionKey)) throw new Error('未找到当前 BOSS 会话')
    await this.loadPausedReplySessions()
    if (this.pausedReplySessions.has(sessionKey)) {
      throw new Error('当前会话已暂停，请先恢复 AI 回复')
    }
    await this.enqueueBossReplyTask(sessionKey, [], 'manual')
  }

  override async triggerBossAiFollowUp(sessionKey: string): Promise<void> {
    if (!this.chatModel.sessions.has(sessionKey)) throw new Error('未找到当前 BOSS 会话')
    await this.loadPausedReplySessions()
    if (this.pausedReplySessions.has(sessionKey)) {
      throw new Error('当前会话已暂停，请先恢复 AI 回复')
    }
    await this.enqueueBossReplyTask(sessionKey, [], 'follow_up')
  }

  override async pauseBossAiReply(sessionKey: string): Promise<void> {
    await this.loadPausedReplySessions()
    this.replyDraftVersions.delete(sessionKey)
    const conversationId = this.chatModel.sessions.get(sessionKey)?.conversationId
    if (conversationId) this.replyBatcher.clearSession(conversationId)
    this.pausedReplySessions.add(sessionKey)
    await this.persistPausedReplySessions()
    this.chatModel.setBossReplySession(sessionKey, 'paused', '已由用户暂停当前会话的 AI 回复')
  }

  override async resumeBossAiReply(sessionKey: string): Promise<void> {
    await this.loadPausedReplySessions()
    this.pausedReplySessions.delete(sessionKey)
    await this.persistPausedReplySessions()
    this.chatModel.setBossReplySession(sessionKey, 'ready', '当前会话已恢复 AI 回复')
    await this.refreshBossReplyState()
  }

  override async sendBossAiDraft(sessionKey: string): Promise<void> {
    const sessionState = this.chatModel.bossReplySessions.get(sessionKey)
    const reply = sessionState?.decision?.reply?.trim()
    if (sessionState?.status !== 'draft' || !reply) throw new Error('当前会话没有待发送草稿')
    if (!this.conf.formData.aiReply.enable) throw new Error('AI 回复已停用，未发送草稿')

    const currentLatestId = this.getVisibleReplyMessages(sessionKey).at(-1)?.id || ''
    if (currentLatestId !== this.replyDraftVersions.get(sessionKey)) {
      await this.handoffBossReply(
        sessionKey,
        'manual',
        '草稿生成后聊天内容已变化，旧草稿未发送',
        this.getVisibleReplyMessages(sessionKey).at(-1)?.text || '',
        sessionState.decision,
      )
      return
    }

    const currentContext = this.buildBossReplyContext(sessionKey, [], 'manual')
    const evidenceIds = sessionState.decision.evidenceIds
    if (
      evidenceIds.length === 0 ||
      evidenceIds.some((id) => !currentContext.allowedEvidenceIds.has(id)) ||
      reply.length > currentContext.prompt.maxReplyLength
    ) {
      await this.handoffBossReply(
        sessionKey,
        'manual',
        '草稿所依据的知识或回复限制已变化，旧草稿未发送',
        currentContext.latestMessage,
        sessionState.decision,
      )
      return
    }

    const meta = this.chatModel.sessions.get(sessionKey)
    if (!meta?.friendId || !meta.encryptBossId) {
      await this.handoffBossReply(
        sessionKey,
        'manual',
        '当前会话缺少 WS 发送所需的 HR 标识',
        this.getVisibleReplyMessages(sessionKey).at(-1)?.text || '',
        sessionState.decision,
        'error',
      )
      return
    }

    this.chatModel.setBossReplySession(
      sessionKey,
      'generating',
      '正在发送已人工确认的 AI 草稿',
      sessionState.decision,
    )
    try {
      await this.geek.sendText(
        {
          uid: meta.friendId,
          friendSource: meta.friendSource ?? 0,
          encryptUid: meta.encryptBossId,
        },
        reply,
      )
      this.replyDraftVersions.delete(sessionKey)
      this.chatModel.setBossReplySession(
        sessionKey,
        'sent',
        '已人工确认并通过 BOSS WS 发送草稿',
        sessionState.decision,
      )
      this.chatModel.setBossReply('ready', 'AI 回复草稿已发送')
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      await this.handoffBossReply(
        sessionKey,
        'manual',
        `草稿发送失败：${reason}`,
        this.getVisibleReplyMessages(sessionKey).at(-1)?.text || '',
        sessionState.decision,
        'error',
      )
    }
  }

  async onMount(path?: string) {
    if (!path) {
      path = this.rootVue.$route.path
    }

    try {
      if (await elmGetter.get('boss-helper-job', 3000)) {
        return
      }
    } catch {}

    if (BossHelperCtx.instance) {
      BossHelperCtx.instance.remove()
      BossHelperCtx.instance = null
    }
    // TODO: 移除menu, 可能导致nuxtui实例冲突
    // if (!document.querySelector('boss-helper-menu')) {
    //   const menuElement = document.createElement('boss-helper-menu')
    //   document.body.appendChild(menuElement)
    // }
    const elm = await elmGetter.get(
      '.job-search-wrapper,.job-recommend-main,.page-jobs .page-jobs-main',
    )

    const appElement = document.createElement('boss-helper-job')
    BossHelperCtx.instance = appElement
    elm.insertBefore(appElement, elm.firstChild)
    removeAd()

    await this._initPage()
    await this._initPageChange()
    await this._initJobDetail()
    await this._initClickJobCardAction()
    await this._initJobList()

    this.initNetConf()
    await this.refreshBossReplyState()
    const contentElm = elm.querySelector<HTMLDivElement>('.recommend-result-inner')
    this.geek = new GeekChatClientManager()
    this.geek.onStateChange((state) => this.handleChatSocketState(state))
    this.geek.onMessage((message) => this.handleRealtimeMessage(message))
    // 先固定会话排序，再连接 WS 接收离线未读增量，避免并发初始化打乱列表顺序。
    await this.loadConversationSnapshot()
    try {
      await this.geek.connect()
    } catch (error) {
      logger.error('初始化 BOSS 实时消息连接失败', error)
    }
    if (!this.replyConfigWatcher) {
      this.replyConfigWatcher = watch(
        () => [
          this.conf.formData.aiReply.enable,
          this.conf.formData.aiReply.model,
          this.conf.formData.aiReply.mode,
        ],
        () => void this.refreshBossReplyState(),
      )
    }
    watch(
      appearanceConf.value,
      (v) => {
        if (!contentElm) return
        contentElm.style.marginRight =
          v.leftChat && v.contentOffset != 25 ? `${v.contentOffset}%` : 'auto'
        contentElm.style.marginLeft =
          !v.leftChat && v.contentOffset != 25 ? `${v.contentOffset}%` : 'auto'
      },
      { immediate: true },
    )
  }
  getConfigItems() {
    const conf = useConf()
    return computed<[AlertItem[], (ConfigAccordionItem | false)[]]>(() => {
      return [
        [
          {
            type: 'alert',
            id: 'config-alert-1',
            showIcon: true,
            title: '首次配置前请先进入帮助模式查看说明',
            color: 'success',
            description:
              '所有配置项均提供说明，获取岗位滚动至约 150 条会自动停止，刷新页面或修改求职期望后可重新获取；如遇 Bug 或帮助内容不清晰，欢迎反馈并提出改进建议。',
          },
        ],
        [
          {
            label: '筛选配置',
            value: 'filter',
            items: [
              {
                type: 'alert',
                id: 'filter-config-alert-enable',
                title: '复选框打钩才会启用，别忘记打钩启用哦。保存也别忘了',
                description: '排除和包含可点击切换，混合模式适用性过低难以配置不会考虑开发',
                color: 'success',
                showIcon: true,
              },
              {
                type: 'div',
                class: 'grid grid-cols-2 gap-2 mt-2 w-full',

                items: [
                  {
                    type: 'select',
                    key: 'company',
                  },
                  {
                    type: 'select',
                    key: 'jobTitle',
                  },
                  {
                    type: 'select',
                    key: 'jobContent',
                  },
                  {
                    type: 'select',
                    key: 'hrPosition',
                  },
                  conf.configLevel.intermediate && {
                    type: 'select',
                    key: 'jobAddress',
                  },
                  {
                    type: 'div',
                  },
                ],
              },
              {
                type: 'div',
                class: 'flex gap-2 mt-3',
                items: [
                  conf.configLevel.intermediate && {
                    type: 'salaryRange',
                    key: 'salaryRange',
                  },
                  conf.configLevel.intermediate && {
                    type: 'companySizeRange',
                    key: 'companySizeRange',
                  },
                ],
              },
              {
                type: 'div',
                class: 'col-span-full flex flex-wrap gap-2 mt-3',
                items: [
                  conf.configLevel.intermediate && {
                    type: 'checkbox',
                    key: 'activityFilter',
                  },
                  {
                    type: 'checkbox',
                    key: 'goldHunterFilter',
                  },
                  {
                    type: 'checkbox',
                    key: 'friendStatus',
                  },
                  {
                    type: 'checkbox',
                    key: 'bossGoldMedalHr',
                  },
                  conf.configLevel.intermediate && {
                    type: 'checkbox-expire',
                    key: 'sameCompanyFilter',
                  },
                  conf.configLevel.intermediate && {
                    type: 'checkbox-expire',
                    key: 'sameHrFilter',
                  },
                ],
              },
            ],
          },
          conf.configLevel.intermediate && {
            label: '招呼语配置',
            value: 'greetings',
            items: [
              {
                type: 'alert',
                id: 'config-alert-2',
                showIcon: true,
                color: 'success',
                description: '使用自定义招呼语前 推荐禁用boss直聘自带招呼语',
                actions: [
                  {
                    label: '前往',
                    color: 'neutral',
                    variant: 'subtle',
                    onClick: () => {
                      window.open(
                        'https://www.zhipin.com/web/geek/notify-set?type=greetSet',
                        '_blank',
                      )
                    },
                  },
                ],
              },
              { type: 'customGreeting', key: 'customGreeting' },
            ],
          },
          {
            label: '外观配置',
            value: 'appearance',
            items: [{ type: 'appearance', key: 'appearance' }],
          },
          conf.configLevel.advanced && {
            label: '地址配置',
            value: 'address',
            items: [{ type: 'address', key: 'address' }],
          },
          conf.configLevel.intermediate && {
            label: '延迟配置',
            value: 'delay',
            items: [
              {
                type: 'div',
                class: 'grid grid-cols-2 gap-3',
                items: [
                  {
                    type: 'inputNumber',
                    key: 'delayDeliveryStarts',
                    fieldProps: {
                      label: '投递开始',
                      'data-help': '点击投递按钮会等待一段时间,默认值10s',
                    },
                    inputNumberProps: {
                      min: 1,
                      max: 99999,
                    },
                  },
                  {
                    type: 'inputNumber',
                    key: 'delayDeliveryInterval',
                    fieldProps: {
                      label: '投递间隔',
                      'data-help': '每个投递的间隔,太快易风控,默认值2s',
                    },
                    inputNumberProps: {
                      min: 1,
                      max: 99999,
                    },
                  },
                  {
                    type: 'inputNumber',
                    key: 'delayDeliveryPageNext',
                    fieldProps: {
                      label: '投递翻页',
                      'data-help': '投递完下一页之后等待的间隔,太快易风控,默认值60s',
                    },
                    inputNumberProps: {
                      min: 1,
                      max: 99999,
                    },
                  },
                  {
                    type: 'inputNumber',
                    key: 'delayMessageSending',
                    fieldProps: {
                      label: '消息发送',
                      'data-help': '在发送消息前允许等待一定的时间让用户来修改或手动发送,默认值2s',
                    },
                    inputNumberProps: {
                      min: 1,
                      max: 99999,
                      disable: true,
                    },
                  },
                ],
              },
            ],
          },
        ],
      ]
    })
  }
  override async onJobCardClick(key: string) {
    // const detail = await requestDetail({
    //   securityId: job.rawData.jobitem.securityId,
    //   lid: job.rawData.jobitem.encryptJobId,
    // }).then((r) => r.zpData)
    const job = this.jobMaps.get(key)
    if (!job) {
      throw new Error('未找到job数据')
    }
    if (isInitialized(job.rawData.detail)) {
      return
    }
    this._clickJobCardAction(job.rawData.jobitem)
    const detail = await new Promise<BossZpDetailData>((resolve, reject) => {
      setTimeout(() => {
        reject(new Error('bossZpDetailData获取超时'))
      }, 1000 * 60)
      const interval = setInterval(() => {
        if (this._jobDetail.value && this._jobDetail.value.lid === job.rawData.jobitem.lid) {
          resolve(this._jobDetail.value)
          clearInterval(interval)
        }
      }, 100)
    })

    job.rawData.detail = detail
    const targetJob = job.jobData
    targetJob.activeTime = detail.brandComInfo.activeTime
    targetJob.activeTimeStr = detail.bossInfo.activeTimeDesc
    targetJob.jobDescription = detail.jobInfo.postDescription
    targetJob.city = detail.jobInfo.locationName
    targetJob.address = detail.jobInfo.address
    targetJob.addressCoords = [detail.jobInfo.longitude, detail.jobInfo.latitude]

    targetJob.boss = {
      ...targetJob.boss,
      isOnline: detail.bossInfo.bossOnline,
      isCertificated: detail.bossInfo.certificated,
    }

    targetJob.brand = {
      ...targetJob.brand,
      labels: detail.brandComInfo.labels,
      introduce: detail.brandComInfo.introduce,
      stageName: detail.brandComInfo.stageName,
    }
    this.jobMaps.set(key, job)
  }
  async _initJobList() {
    await useHookVueData(
      '#wrap .page-job-wrapper,.job-recommend-main,.page-jobs-main',
      'jobList',
      this._jobList,
      (v) => {
        this.jobList.value = v.map((item) => {
          // const jobData = convertBossZpJobItemToJobData(item)
          // if (this.conf.formData.useCache.value) {
          //   const cacheCheck = checkJobCache(jobData.key)
          //   if (cacheCheck) {
          //     jobData.status = {
          //       status: cacheCheck.status,
          //       msg: `${cacheCheck.message} (缓存)`,
          //     }
          //   }
          // }
          const job = convertBossZpJobItemToJobData(item)

          let jobData = this._jobDataMap.get(job.key)
          if (jobData) {
            jobData = {
              ...jobData,
              jobitem: item,
            }
          } else {
            jobData = {
              jobitem: item,
              detail: createLazyObject('岗位详情获取'),
              boss: createLazyObject('Boss信息获取'),
            }
          }
          this._jobDataMap.set(job.key, jobData)

          return job
        })
        this.jobList.value.forEach((job) => {
          this.jobMaps.set(job.key, {
            jobData: job,
            rawData: this._jobDataMap.get(job.key)!,
            state: {},
          })
        })
      },
    )()
  }

  async _initPage() {
    await useHookVueData(
      '#wrap .page-job-wrapper,.job-recommend-main,.page-jobs-main',
      'pageVo',
      this._page,
    )()
    await useHookVueData(
      '#wrap .page-job-wrapper,.job-recommend-main,.page-jobs-main',
      'hasMore',
      this._pageHasMore,
    )()
  }

  async _initJobDetail() {
    await useHookVueData(
      '#wrap .page-job-wrapper,.job-recommend-main,.page-jobs-main',
      'jobDetail',
      this._jobDetail,
    )()
  }

  async _initPageChange() {
    let pc =
      location.href.includes('/web/geek/job-recommend') || location.href.includes('/web/geek/jobs')
        ? await initSearch()
        : await initChange()
    if (!pc) {
      throw new Error('pageChange is undefined')
    }
    this._pageChange = pc
  }

  async _initClickJobCardAction() {
    this._clickJobCardAction = await useHookVueFn(
      '#wrap .page-job-wrapper,.job-recommend-main,.page-jobs-main',
      'clickJobCardAction',
    )()
  }
}

// function shouldCaptureChatSocket(url: string | URL | undefined) {
//   return url != null && url.toString().includes('chatws')
// }

// function hookChatSocket() {
//   const NativeWebSocket = window.WebSocket
//   const HOOK_SYMBOL = Symbol('__IS_HOOKED__')

//   if (!(NativeWebSocket as any)[HOOK_SYMBOL]) {
//     window.WebSocket = new Proxy(NativeWebSocket, {
//       construct(target, args, newTarget) {
//         const socket = Reflect.construct(target, args, newTarget)

//         const [url] = args as [string | URL | undefined, string | string[] | undefined]

//         if (!shouldCaptureChatSocket(url)) {
//           return socket
//         }
//         BossHelperCtx.setSocket(socket)
//         socket.addEventListener('open', () => {
//           BossHelperCtx.setSocket(socket)
//         })
//         socket.addEventListener('close', () => {
//           BossHelperCtx.setSocket(null)
//         })

//         return socket
//       },
//     }) as typeof WebSocket

//     Object.defineProperty(window.WebSocket, HOOK_SYMBOL, {
//       value: true,
//       enumerable: false,
//       writable: false,
//       configurable: false,
//     })
//   }
// }

export default defineUnlistedScript(async () => {
  // hookChatSocket()

  const isChatPage = (path: string) =>
    path === '/web/geek/chat' || path.startsWith('/web/geek/chat/')

  if (isChatPage(window.location.pathname)) {
    await mountBossChatMvp()
    return
  }

  initCounter()
  const bossHelpCtx = await BossHelperCtx.new()

  bossHelpCtx.rootVue.$router.afterHooks.push(
    (to: {
      name: string
      meta: {
        notLogin: boolean
        wrapClassName: string
        scrollBehavior: string
        hideFooter: boolean
        headerV2: boolean
      }
      path: string
      hash: string
      query: {
        ka: string
      }
      params: {}
      fullPath: string
    }) => {
      // hookChatSocket()
      if (isChatPage(to.path)) {
        void mountBossChatMvp()
        return
      }
      unmountBossChatMvp()
      void bossHelpCtx.onMount(to.path)
    },
  )

  await run(bossHelpCtx)
})
