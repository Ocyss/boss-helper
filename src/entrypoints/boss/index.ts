import { ref } from 'vue'

import { defineUnlistedScript } from '#imports'
import { appearanceConf, useConf } from '@/composables/conf'
import { createLazyObject, isInitialized } from '@/composables/useApplying/type'
import type {
  PreflightCheck,
  PreflightReport,
  SimulationResult,
  WorkflowData,
} from '@/composables/useApplying/type'
import { HelperContext } from '@/composables/useHelper'
import type { JobData } from '@/composables/useHelper'
import type { AlertItem, ConfigAccordionItem } from '@/composables/useHelper/type'
import { getRootVue, useHookVueData, useHookVueFn } from '@/composables/useVue'
import { run } from '@/index'
import { counter } from '@/message'
import { FormDataInput } from '@/types/formData'
import elmGetter from '@/utils/elmGetter'
import { logger } from '@/utils/logger'

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
      key: item.encryptBossId,
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
      key: item.encryptBrandId,
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
    if (this.workflowRunning.value || this.preflightRunning.value || this.simulationRunning.value) {
      return
    }
    if (!this.workflow) {
      this.workflow = await bossWorkflow(this)
    }
    const report = await this.preflight()
    if (!report.ok) {
      await this.notification('运行前自检未通过，请查看检查结果', {
        toast: { color: 'error' },
      })
      return
    }
    await this.workflow.executeAll(this._jobDataMap)
  }

  async preflight(): Promise<PreflightReport> {
    const startedAt = Date.now()
    const checks: PreflightCheck[] = []
    const add = (key: string, label: string, status: PreflightCheck['status'], message: string) =>
      checks.push({ key, label, status, message })

    this.preflightRunning.value = true
    try {
      await this.statistics.updateStatistics()

      const token = window.Cookie?.get?.('bst')
      const userId = window._PAGE?.encryptUserId
      add(
        'login',
        '登录状态',
        token && userId ? 'success' : 'error',
        token && userId ? '已获取登录身份和请求令牌' : '登录信息不完整，请刷新页面或重新登录',
      )

      add(
        'jobs',
        '岗位数据',
        this.jobList.value.length > 0 ? 'success' : 'error',
        this.jobList.value.length > 0
          ? `当前页面已加载 ${this.jobList.value.length} 个岗位`
          : '当前页面没有可处理岗位',
      )

      const limit = this.conf.formData.deliveryLimit.value
      const delivered = this.statistics.todayData.success
      const limitValid = Number.isFinite(limit) && limit > 0 && limit <= 150
      add(
        'limit',
        '投递上限',
        !limitValid || delivered >= limit ? 'error' : 'success',
        !limitValid
          ? `投递上限无效: ${limit}`
          : delivered >= limit
            ? `今日已沟通 ${delivered} 次，达到设置上限 ${limit}`
            : `今日已沟通 ${delivered}/${limit}，剩余 ${limit - delivered} 次`,
      )

      if (!this.workflow) {
        this.workflow = await bossWorkflow(this)
      }
      await this.workflow.rebuild()
      const failedNodes = this.workflow.nodes.value.filter((node) => node.status === 'failed')
      add(
        'pipeline',
        '任务管线',
        failedNodes.length === 0 ? 'success' : 'error',
        failedNodes.length === 0
          ? `已启用 ${this.workflow.pipeline.value.length} 个步骤`
          : failedNodes
              .map((node) => {
                const message = (node.error as { message?: string } | undefined)?.message
                return `${node.label}: ${message ?? String(node.error)}`
              })
              .join('；'),
      )

      const customGreeting = this.conf.formData.customGreeting
      const aiGreeting = this.conf.formData.aiGreeting
      const greetingConflict = customGreeting.enable && aiGreeting.enable
      add(
        'greeting-mode',
        '招呼方式',
        greetingConflict ? 'error' : 'success',
        greetingConflict
          ? '自定义招呼和 AI 招呼不能同时启用，请选择一种'
          : aiGreeting.enable
            ? '使用 AI 招呼'
            : customGreeting.enable
              ? '使用自定义招呼'
              : '未启用自动招呼',
      )

      if (customGreeting.enable) {
        const messages = Array.isArray(customGreeting.value)
          ? customGreeting.value
          : [{ type: 'text' as const, content: customGreeting.value }]
        const valid = messages.some((message) =>
          message.type === 'text' ? Boolean(message.content.trim()) : Boolean(message.image),
        )
        add(
          'custom-greeting',
          '自定义招呼内容',
          valid ? 'success' : 'error',
          valid ? `已配置 ${messages.length} 条消息` : '招呼内容为空',
        )
      }

      const aiFeatures = [
        { key: 'ai-filtering', label: 'AI筛选', data: this.conf.formData.aiFiltering },
        { key: 'ai-greeting', label: 'AI招呼', data: this.conf.formData.aiGreeting },
      ].filter((item) => item.data.enable)
      const modelsToTest = new Map<string, string>()
      for (const feature of aiFeatures) {
        const promptValid = feature.data.prompt.some((item) => item.content.trim())
        const model = this.models.modelData.value.find((item) => item.key === feature.data.model)
        const modelValid = Boolean(
          model?.data?.base_url && model.data.api_key && model.data.model && feature.data.model,
        )
        add(
          `${feature.key}-config`,
          `${feature.label}配置`,
          promptValid && modelValid ? 'success' : 'error',
          !promptValid
            ? 'Prompt 为空'
            : !modelValid
              ? '模型、API 地址、API Key 或模型名称未完整配置'
              : `使用模型 ${model?.name}`,
        )
        if (promptValid && modelValid && feature.data.model) {
          modelsToTest.set(feature.data.model, model?.name ?? feature.data.model)
        }
      }
      if (aiFeatures.length === 0) {
        add('ai-config', 'AI配置', 'success', '未启用 AI 功能，无需检查模型')
      }

      for (const [modelKey, modelName] of modelsToTest) {
        try {
          await this.chatModel.testConnection(modelKey)
          add(`model-api-${modelKey}`, `${modelName} API`, 'success', '模型接口连接成功')
        } catch (error) {
          add(
            `model-api-${modelKey}`,
            `${modelName} API`,
            'error',
            error instanceof Error ? error.message : String(error),
          )
        }
      }

      const needsChat = customGreeting.enable || aiGreeting.enable
      if (needsChat && !this.geek?.client?.connected) {
        const deadline = Date.now() + 5000
        while (!this.geek?.client?.connected && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 250))
        }
      }
      add(
        'chat',
        '聊天通道',
        !needsChat || this.geek?.client?.connected ? 'success' : 'error',
        !needsChat
          ? '未启用自动招呼，无需连接聊天通道'
          : this.geek?.client?.connected
            ? '聊天通道已连接'
            : '聊天通道未连接，请刷新页面后重试',
      )

      if (this.conf.formData.amap.enable) {
        const amapValid = Boolean(this.conf.formData.amap.key && this.conf.formData.amap.origins)
        add(
          'amap',
          '高德地图 API',
          amapValid ? 'success' : 'error',
          amapValid ? 'Key 和起点已配置' : '缺少 Key 或起点坐标',
        )
      }
    } catch (error) {
      add('unexpected', '自检执行', 'error', error instanceof Error ? error.message : String(error))
    } finally {
      this.preflightRunning.value = false
    }

    const report: PreflightReport = {
      ok: checks.every((check) => check.status !== 'error'),
      checkedAt: Date.now(),
      durationMs: Date.now() - startedAt,
      checks,
    }
    this.preflightReport.value = report
    checks.forEach((check) => {
      this.logs.info('运行自检', `${check.label}：${check.message}`)
    })
    this.logs.info('运行自检', report.ok ? '全部检查通过' : '检查未通过，已阻止执行')
    return report
  }

  async simulate(): Promise<SimulationResult | null> {
    if (this.workflowRunning.value || this.preflightRunning.value || this.simulationRunning.value) {
      return null
    }
    if (!this.workflow) {
      this.workflow = await bossWorkflow(this)
    }

    const report = await this.preflight()
    if (!report.ok) {
      await this.notification('模拟筛选前自检未通过', { toast: { color: 'error' } })
      return null
    }

    this.simulationRunning.value = true
    try {
      const result = await this.workflow.simulate(this._jobDataMap)
      this.simulationResult.value = result
      await this.notification(
        `模拟完成：通过 ${result.passed}，过滤 ${result.filtered}，失败 ${result.failed}`,
        { toast: { color: result.failed > 0 ? 'warning' : 'success' } },
      )
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logs.info('模拟筛选', `执行失败：${message}`)
      await this.notification(`模拟筛选失败：${message}`, { toast: { color: 'error' } })
      return null
    } finally {
      this.simulationRunning.value = false
    }
  }

  async sendMessage(data: WorkflowData<BoosJobData, {}>, msgs: FormDataInput['value']) {
    logger.info('发送消息', { jobKey: data.jobData.key, msg: msgs })
    const startedAt = Date.now()

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
    this.logs.step(data.jobData, '消息发送', 'info', `准备发送 ${msgs.length} 条消息`)
    try {
      if (!this.geek.client?.connected) {
        throw new Error('聊天通道未连接')
      }
      for (const msg of msgs) {
        let m: ReturnType<GeekChatClientManager['msgBuilder']['createTextMessage']>
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
          m = this.geek.msgBuilder.createTextMessage(stanza, {
            text: msg.content,
          })
        } else {
          throw new Error('不支持的消息类型:' + msg['type'])
        }
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('消息发送确认超时')), 10000)
          this.geek.client.publish(
            'chat',
            this.geek.msgBuilder.encode(m),
            {
              qos: 1,
              retain: true,
            },
            (error) => {
              clearTimeout(timeout)
              if (error) {
                reject(error)
              } else {
                resolve()
              }
            },
          )
        })
        await new Promise((resolve) => setTimeout(resolve, 1500))
      }
      this.logs.step(
        data.jobData,
        '消息发送',
        'success',
        `已提交 ${msgs.length} 条消息到聊天通道`,
        Date.now() - startedAt,
      )
      this.statistics.recordSummary('greetingSuccess', data.jobData.key)
    } catch (error) {
      this.logs.step(
        data.jobData,
        '消息发送',
        'danger',
        error instanceof Error ? error.message : String(error),
        Date.now() - startedAt,
      )
      throw error
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
    const contentElm = elm.querySelector<HTMLDivElement>('.recommend-result-inner')
    this.geek = new GeekChatClientManager()
    await this.geek.connect()
    watch(
      appearanceConf.value,
      (v) => {
        if (!contentElm) return
        contentElm.style.marginRight =
          v.leftChat && v.contentOffset != 25 ? `${v.contentOffset}%` : 'unset'
        contentElm.style.marginLeft =
          !v.leftChat && v.contentOffset != 25 ? `${v.contentOffset}%` : 'unset'
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
            title: '进行配置前都请先阅读完整的帮助文档，再进行配置，如有bug请反馈',
            color: 'success',
            description:
              '滚动到底部，差不多150个岗位左右，也会自动停止, 刷新或者变更期望重新获取新的岗位即可。',
          },
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
                  window.open('https://www.zhipin.com/web/geek/notify-set?type=greetSet', '_blank')
                },
              },
            ],
          },
          {
            type: 'alert',
            id: 'config-alert-3',
            color: 'success',
            description:
              '所有配置选项皆有帮助提示，不懂用法请进入帮助模式进行查看，若是对帮助说明有疑问请反馈最好能给出改进意见。',
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
            items: [{ type: 'customGreeting', key: 'customGreeting' }],
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
                      'data-help':
                        '暂未实现 ,在发送消息前允许等待一定的时间让用户来修改或手动发送,默认值5s',
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
      void bossHelpCtx.onMount(to.path).catch((error) => {
        logger.error('页面切换初始化失败', error)
      })
    },
  )

  await run(bossHelpCtx)
})
