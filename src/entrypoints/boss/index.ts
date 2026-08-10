import { ref } from 'vue'

import { defineUnlistedScript } from '#imports'
import { appearanceConf, useConf } from '@/composables/conf'
import { createLazyObject, isInitialized, WorkflowData } from '@/composables/useApplying/type'
import { HelperContext, JobData } from '@/composables/useHelper'
import { AlertItem, ConfigAccordionItem, ResumeImageSendResult } from '@/composables/useHelper/type'
import { getRootVue, useHookVueData, useHookVueFn } from '@/composables/useVue'
import { run } from '@/index'
import { counter, initCounter } from '@/message'
import { FormDataInput } from '@/types/formData'
import { delayWithJitter } from '@/utils'
import elmGetter from '@/utils/elmGetter'
import { logger } from '@/utils/logger'
import { BOSS_HELPER_V2_DOM } from '@/utils/namespace'

import { GeekChatClientManager } from './chat'
import { BoosJobData, bossWorkflow } from './delivery'
import { uploadImage } from './requests'
import { BossZpDetailData, BossZpJobItemData } from './types'

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

  _page = ref({ page: 1, pageSize: 15 })
  _pageHasMore = ref(true)
  _jobDetail = ref<BossZpDetailData>()
  _pageChange = (_v: number) => {
    throw new Error('pageChange is undefined')
  }
  _clickJobCardAction = (_: BossZpJobItemData) => {}
  _jobList: Ref<BossZpJobItemData[]>
  _jobDataMap: Map<string, BoosJobData>
  /** 为文本和图片消息分配单调递增 clientMid，避免同毫秒重复消息标识。 */
  private messageSequence = Date.now()

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

  /** 为每条 BOSS 聊天消息分配单调递增的临时 ID。 */
  private nextClientMid(): number {
    this.messageSequence = Math.max(this.messageSequence + 1, Date.now())
    return this.messageSequence
  }

  /** 构造当前招聘者上下文；缺少稳定字段时立即 fail-closed。 */
  private getMessageStanza(data: WorkflowData<BoosJobData, {}>) {
    const boss = data.rawData.boss?.data
    const bossInfo = data.rawData.detail?.bossInfo
    const job = data.rawData.jobitem
    if (!boss?.bossId || !job?.encryptBossId || !bossInfo) {
      throw new Error('招聘者上下文不完整，已停止自动发送')
    }
    return {
      uid: Number(boss.bossId),
      friendSource: Number(bossInfo.bossSource ?? boss.bossSource ?? 0),
      encryptUid: job.encryptBossId,
      encryptGid: '',
      clientMid: this.nextClientMid(),
    }
  }

  /** 发布单条 MQTT 消息并等待确认；超时或失败不重发，避免重复触达招聘者。 */
  private async publishChatMessage(encoded: any, label: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      let settled = false
      const timer = window.setTimeout(() => {
        if (settled) return
        settled = true
        reject(new Error(`BOSS ${label}发送确认超时`))
      }, 10_000)
      // 聊天消息不能作为 MQTT retained message 留在 topic，避免页面重连后重复展示/触达。
      this.geek.client.publish('chat', encoded, { qos: 1, retain: false }, (error) => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        if (error) reject(new Error(`BOSS ${label}发送失败`))
        else resolve()
      })
    })
  }

  /**
   * 按用户显式开启的高风险开关按顺序发送文本/图片招呼语；关闭开关时绝不触发外部发送。
   * 发送使用仓库已有的 BOSS MQTT/protobuf 通道，不记录消息正文、图片、令牌或完整响应。
   */
  async sendMessage(data: WorkflowData<BoosJobData, {}>, msgs: FormDataInput['value']) {
    if (!this.conf.formData.autoDelivery.value) {
      throw new Error('自动投递未开启，招呼语保持人工确认')
    }
    if (!this.geek?.client || !this.geek.msgBuilder) {
      throw new Error('BOSS 聊天通道未就绪，已停止自动发送')
    }
    if (data.state.delivery?.greetingSent) {
      logger.info('跳过重复招呼发送', { jobKey: data.jobData.key })
      return
    }

    const items =
      typeof msgs === 'string'
        ? [{ type: 'text' as const, content: msgs }]
        : Array.isArray(msgs)
          ? msgs
          : []
    const hasContent = items.some(
      (item) =>
        (item.type === 'text' && Boolean(item.content.trim())) ||
        (item.type === 'image' && Boolean(item.image)),
    )
    if (!hasContent) {
      throw new Error('招呼语为空，已停止自动发送')
    }
    const securityId = data.rawData.boss?.data.securityId
    let sentAny = false
    for (const item of items) {
      let encoded: any
      let label = '招呼'
      if (item.type === 'text') {
        const text = item.content.trim()
        if (!text) continue
        const message = this.geek.msgBuilder.createTextMessage(this.getMessageStanza(data), {
          text,
        })
        encoded = this.geek.msgBuilder.encode(message)
      } else if (item.type === 'image') {
        if (!securityId) {
          throw new Error('招聘者会话安全标识缺失，无法发送招呼图片')
        }
        const stored = await counter.getImage(item.image)
        if (!stored.success) {
          throw new Error('招呼图片本机副本不存在，请重新上传')
        }
        const file = new File([new Uint8Array(stored.buffer).buffer], stored.name, {
          type: stored.type,
        })
        if (!file.type.startsWith('image/') || file.size > 2 * 1024 * 1024) {
          throw new Error('招呼图片格式不支持或超过2MiB')
        }
        const uploaded = await uploadImage(securityId, file)
        const message = this.geek.msgBuilder.createImageMessage(this.getMessageStanza(data), {
          content: { iid: uploaded.iid ?? 0, ...uploaded },
        })
        encoded = this.geek.msgBuilder.encode(message)
        label = '招呼图片'
      } else {
        throw new Error('招呼语包含不支持的消息类型')
      }

      // 使用消息等待范围，避免多条文本/图片以完全固定节奏发送。
      await delayWithJitter(
        this.conf.formData.delayRanges?.message ?? this.conf.formData.delayMessageSending,
      )
      await this.publishChatMessage(encoded, label)
      sentAny = true
    }
    if (!sentAny) {
      throw new Error('招呼语为空，已停止自动发送')
    }
    data.state.delivery = { ...(data.state.delivery ?? {}), greetingSent: true }
    logger.info('自动招呼发送成功', { jobKey: data.jobData.key })
  }

  /**
   * 招呼语成功后发送用户配置的图片简历；图片二进制从本机 IndexedDB 读取，失败返回安全摘要。
   * 该方法不读取或记录 Cookie、图片正文、上传响应或聊天内容。
   */
  async sendResumeImage(data: WorkflowData<BoosJobData, {}>): Promise<ResumeImageSendResult> {
    const config = this.conf.formData.resumeImage
    if (!config.enable) return { sent: false, reason: '图片简历功能未开启' }
    if (!this.conf.formData.autoDelivery.value) {
      return { sent: false, reason: '自动投递未开启，图片简历保持人工确认' }
    }
    if (data.state.delivery?.resumeImageSent) {
      return { sent: true, reason: '图片简历已发送' }
    }
    if (!config.image) {
      return { sent: false, reason: '未上传图片简历，请先在配置中上传', stop: true }
    }
    if (!this.geek?.client || !this.geek.msgBuilder) {
      return { sent: false, reason: 'BOSS 聊天通道未就绪', stop: true }
    }
    // 图片上传沿用 BOSS 详情接口返回的会话安全标识，避免把列表卡片标识误用于聊天上传。
    const securityId = data.rawData.boss?.data.securityId
    if (!securityId) {
      return { sent: false, reason: '岗位安全标识缺失，无法上传图片', stop: true }
    }

    try {
      const stored = await counter.getImage(config.image)
      if (!stored.success) {
        return { sent: false, reason: '图片简历本机副本不存在，请重新上传', stop: true }
      }
      const file = new File([new Uint8Array(stored.buffer).buffer], config.name || stored.name, {
        type: config.type || stored.type,
      })
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        return { sent: false, reason: '图片格式不受支持，请重新上传 PNG/JPEG/WebP', stop: true }
      }
      if (file.size > 2 * 1024 * 1024) {
        return { sent: false, reason: '图片超过 2 MiB，请压缩后重新上传', stop: true }
      }

      // 图片上传与消息发送是两个不可回滚的 BOSS 操作；发送失败后停止，不自动重试。
      const uploaded = await uploadImage(securityId, file)
      const image = this.geek.msgBuilder.createImageMessage(this.getMessageStanza(data), {
        // BOSS 现有图片消息示例使用 iid=0；上传接口不一定返回 iid，因此保持兼容占位。
        content: { iid: uploaded.iid ?? 0, ...uploaded },
      })
      // 图片简历沿用消息发送的有界等待；这里只控制消息节奏，不模拟点击、滚动或其他页面事件。
      await delayWithJitter(
        this.conf.formData.delayRanges?.message ?? this.conf.formData.delayMessageSending,
      )
      await this.publishChatMessage(this.geek.msgBuilder.encode(image), '图片简历')
      data.state.delivery = { ...(data.state.delivery ?? {}), resumeImageSent: true }
      logger.info('自动图片简历发送成功', { jobKey: data.jobData.key })
      return { sent: true }
    } catch {
      logger.error('自动图片简历发送失败', { jobKey: data.jobData.key })
      return { sent: false, reason: '图片简历发送失败，已停止后续岗位', stop: true }
    }
  }

  async onMount(path?: string) {
    if (!path) {
      path = this.rootVue.$route.path
    }

    try {
      if (await elmGetter.get(BOSS_HELPER_V2_DOM.job, 3000)) {
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

    const appElement = document.createElement(BOSS_HELPER_V2_DOM.job)
    BossHelperCtx.instance = appElement
    elm.insertBefore(appElement, elm.firstChild)
    removeAd()

    await this._initPage()
    await this._initPageChange()
    await this._initJobDetail()
    await this._initClickJobCardAction()
    await this._initJobList()

    this.initNetConf()
    const contentElm = elm.querySelector<HTMLDivElement>('.recommend-result-inner')
    this.geek = new GeekChatClientManager()
    await this.geek.connect()
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
                    type: 'checkbox',
                    key: 'sameCompanyFilter',
                  },
                  conf.configLevel.intermediate && {
                    type: 'checkbox',
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
              { type: 'checkbox', key: 'autoDelivery' },
              { type: 'resumeImage', key: 'resumeImage' },
              { type: 'greetingFallback', key: 'greetingFallback' },
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
                      'data-help': '点击投递按钮会在默认3秒附近有界随机等待（约2.4～3.6秒）',
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
                      'data-help': '每个投递会在默认5秒附近有界随机等待（约4～6秒）',
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
                      'data-help': '投递完下一页后会在默认60秒附近有界随机等待（约48～72秒）',
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
                      'data-help': '发送消息前会在默认2秒附近有界随机等待（约1.6～2.4秒）',
                    },
                    inputNumberProps: {
                      min: 1,
                      max: 99999,
                    },
                  },
                  { type: 'batchPause', key: 'batchPause' },
                ],
              },
            ],
          },
          {
            label: '诊断配置',
            value: 'diagnostics',
            items: [
              {
                type: 'alert',
                id: 'diagnostic-config-alert',
                showIcon: true,
                color: 'warning',
                description:
                  '详细诊断只记录阶段、耗时、超时配置和错误分类；即使开启，也不会记录 API 密钥、Cookie、Prompt、模型响应或完整聊天内容。',
              },
              { type: 'checkbox', key: 'diagnosticLogging' },
            ],
          },
        ],
      ]
    })
  }
  async onJobCardClick(key: string) {
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
    useHookVueData(
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

          // 每次扫描都写入幂等 seen 事件；事件 key 带日期，跨天不会漏计，重复刷新不会重复计数。
          void this.statistics.recordEvent('seen', job.key)

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
      bossHelpCtx.onMount(to.path)
    },
  )

  await run(bossHelpCtx)
})
