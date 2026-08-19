import { ref } from 'vue'

import { defineUnlistedScript } from '#imports'
import { appearanceConf, useConf } from '@/composables/conf'
import { applyCachedJobResult } from '@/composables/useApplying'
import { buildFilterFingerprint } from '@/composables/useApplying/fingerprint'
import type { WorkflowData } from '@/composables/useApplying/type'
import { createLazyObject, isInitialized } from '@/composables/useApplying/type'
import type { JobData } from '@/composables/useHelper'
import { HelperContext } from '@/composables/useHelper'
import type { AlertItem, ConfigAccordionItem } from '@/composables/useHelper/type'
import { getRootVue, useHookVueData, useHookVueFn } from '@/composables/useVue'
import { run } from '@/index'
import { counter, initCounter } from '@/message'
import type { FormDataInput } from '@/types/formData'
import elmGetter from '@/utils/elmGetter'
import { logger } from '@/utils/logger'

import { GeekChatClientManager } from './chat'
import type { BoosJobData } from './delivery'
import { bossWorkflow } from './delivery'
import { uploadImage } from './requests'
import type { BossZpDetailData, BossZpJobItemData } from './types'

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

function waitJobListRefresh(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  if (predicate()) {
    return Promise.resolve(true)
  }
  const start = Date.now()
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer)
        resolve(true)
      } else if (Date.now() - start >= timeoutMs) {
        clearInterval(timer)
        resolve(false)
      }
    }, 200)
  })
}

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
    encryptJobId: item.encryptJobId,
    encryptBossId: item.encryptBossId,
    encryptBrandId: item.encryptBrandId,
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
  _searchJob?: (page?: number) => void
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

  async refreshJobSearch(delay: Promise<any>): Promise<boolean> {
    try {
      const oldLen = this._jobList.value.length
      const oldFirstJobId = this._jobList.value[0]?.encryptJobId ?? ''
      const oldPage = this._page.value.page
      const search = this._searchJob ?? this._pageChange
      search(1)
      await delay
      const refreshed = await waitJobListRefresh(() => {
        const pageReset = oldPage !== 1 && this._page.value.page === 1
        const listChanged =
          (this._jobList.value[0]?.encryptJobId ?? '') !== oldFirstJobId ||
          this._jobList.value.length !== oldLen
        return pageReset || listChanged
      }, 10000)
      if (!refreshed) {
        logger.error('重搜: 列表未刷新')
        return false
      }
      logger.info('重搜: 已回到第1页以获取新岗位')
      this.logs.info('重新搜索', '已回到第1页以获取新岗位')
      return true
    } catch (err) {
      logger.error('重搜: 失败', err)
      return false
    }
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
    await this.geek.connect()
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
                      'data-help': '点击投递按钮会等待一段时间,默认值3s',
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
                      'data-help':
                        '每次实际投递（friend/add）后的间隔,太快易风控,默认值5s。过滤跳过不等待此间隔。',
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
                      'data-help': '距上一次实际投递的最小翻页间隔,太快易风控,默认值60s',
                    },
                    inputNumberProps: {
                      min: 1,
                      max: 99999,
                    },
                  },
                  {
                    type: 'inputNumber',
                    key: 'refreshSearchEveryPages',
                    fieldProps: {
                      label: '重搜间隔',
                      'data-help':
                        '每处理完这么多页后重新搜索，回到第1页以捞到新岗位；已投过的会跳过。0 为关闭。默认5页。过小可能触发风控。',
                    },
                    inputNumberProps: {
                      min: 0,
                      max: 99,
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
        const fingerprint = buildFilterFingerprint(this.conf.formData)
        this.jobList.value.forEach((job) => {
          applyCachedJobResult(this, job, fingerprint)
          this.jobMaps.set(job.key, {
            jobData: job,
            rawData: this._jobDataMap.get(job.key)!,
            state: this.jobMaps.get(job.key)?.state ?? {},
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
    const isRecommend =
      location.href.includes('/web/geek/job-recommend') || location.href.includes('/web/geek/jobs')
    const pc = isRecommend ? await initSearch() : await initChange()
    if (!pc) {
      throw new Error('pageChange is undefined')
    }
    this._pageChange = pc
    this._searchJob = (await initSearch()) ?? pc
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
      void bossHelpCtx.onMount(to.path)
    },
  )

  await run(bossHelpCtx)
})
