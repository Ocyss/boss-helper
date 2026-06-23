// =============================================================================
// BossHelper 扩展主入口 - content script (MAIN world)
// 运行在 BOSS 直聘页面的主世界（非 isolated world），
// 负责注入插件 UI、拦截页面数据、管理投递工作流和招呼语发送
// =============================================================================

import { UserContent } from 'ai'
import { ref } from 'vue'

import { defineUnlistedScript } from '#imports'
import { appearanceConf } from '@/composables/conf'
import { createLazyObject, WorkflowData } from '@/composables/useApplying/type'
import { HelperContext } from '@/composables/useHelper'
import type { JobData } from '@/composables/useHelper'
import { getRootVue, useHookVueData, useHookVueFn } from '@/composables/useVue'
// 导入 protobuf Message 类，用于构造并发送 BOSS 聊天消息
import { Message } from '@/composables/useWebSocket/protobuf'
import { run } from '@/index'
import elmGetter from '@/utils/elmGetter'
import { logger } from '@/utils/logger'

import { BoosJobData, bossWorkflow } from './delivery'
// 导入 BOSS 数据获取 API，用于发送招呼语前获取 HR 的聊天信息（bossId/encryptBossId/bossSource）
import { requestBossData } from './requests'
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
    if (!ctx.uid) {
      useToast().add({
        color: 'error',
        title: '未获取到用户ID，可能会出现奇怪bug, 请尝试刷新页面或反馈',
      })
    }
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

  /**
   * 发送招呼语消息
   * 投递简历后调用，通过 BOSS 直聘的聊天通道向 HR 发送消息。
   * 流程: 获取岗位数据 → 调用 requestBossData 获取 HR 聊天信息 →
   *       构造 protobuf Message → 通过 WebSocket/postMessage 发送
   * 注意: 之前此方法只有 logger.info 日志，没有实际发送逻辑，
   *       此处补全为真实的消息发送实现。
   */
  async sendMessage(jobKey: string, msg: UserContent) {
    // 校验消息内容不为空
    const msgText = typeof msg === 'string' ? msg : ''
    if (!msgText.trim()) {
      logger.warn('发送消息: 内容为空', { jobKey })
      return
    }

    // 从岗位数据 Map 中查找对应的岗位
    const jobData = this._jobDataMap.get(jobKey)
    if (!jobData) {
      logger.error('发送消息: 未找到岗位数据', { jobKey })
      return
    }

    // 获取 HR 的标识参数（用于构造聊天请求）
    const encryptUserId = jobData.jobitem.encryptBossId
    const securityId = jobData.jobitem.securityId
    if (!encryptUserId || !securityId) {
      logger.error('发送消息: 岗位缺少必要参数', { encryptUserId, securityId })
      return
    }

    const toast = useToast()

    try {
      // 通过 BOSS API 获取 HR 的聊天信息（bossId, encryptBossId, bossSource）
      // 投递简历后 BOSS 后端建立好友关系需要时间，requestBossData 内部有重试等待机制
      const bossData = await requestBossData({ encryptUserId, securityId })
      if (!bossData?.data) {
        throw new Error('获取Boss数据失败')
      }

      // 获取当前求职者的用户 ID
      const uid = this.uid ?? window._PAGE?.encryptUserId
      if (!uid) throw new Error('未获取到当前用户ID')

      // 构造 protobuf 消息，通过 BOSS 的聊天通道发送
      const message = new Message({
        form_uid: uid,
        to_uid: String(bossData.data.bossId),
        to_name: bossData.data.encryptBossId,
        friend_source: bossData.data.bossSource,
        content: msgText,
      })

      // send() 内部有三级回退: postMessage(GeekChatBridge) → window.ChatWebsocket → 原始WebSocket
      await message.send()
      logger.info('发送消息: 成功', { jobKey })
    } catch (err: any) {
      const errMsg = err?.message || String(err)
      logger.error('发送消息失败', { jobKey, err: errMsg })
      toast.add({
        title: `招呼语发送失败: ${errMsg}`,
        color: 'error',
      })
    }
  }

  async onMount(path?: string) {
    if (!path) {
      path = this.rootVue.$route.path
    }
    // TODO: 移除menu, 可能导致nuxtui实例冲突
    // if (!document.querySelector('boss-helper-menu')) {
    //   const menuElement = document.createElement('boss-helper-menu')
    //   document.body.appendChild(menuElement)
    // }

    if (document.querySelector('boss-helper-job')) return

    const elm = await elmGetter.get(
      '.job-search-wrapper,.job-recommend-main,.page-jobs .page-jobs-main',
    )
    const appElement = document.createElement('boss-helper-job')

    elm.insertBefore(appElement, elm.firstChild)
    removeAd()

    await this._initPage()
    await this._initPageChange()
    await this._initJobDetail()
    await this._initClickJobCardAction()
    await this._initJobList()

    this.initNetConf()
    const contentElm = elm.querySelector<HTMLDivElement>('.recommend-result-inner')

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

export default defineUnlistedScript(async () => {
  //   document.documentElement.classList.toggle(
  //     "dark",
  //     GM_getValue("theme-dark", false)
  //   );

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
      bossHelpCtx.onMount(to.path)
    },
  )

  await run(bossHelpCtx)

  // ===========================================================================
  // 初始化 GeekChatCore 桥接
  // 在 BOSS 页面加载 GeekChatCore SDK（geek-chat-core.umd.min.js），
  // 用于通过 postMessage 跨隔离世界发送聊天消息。
  // 作为 protobuf Message.send() 的一级回退方案。
  // 注意: 之前从未调用 initGeekChatBridge()，导致 postMessage 发送方式始终超时，
  //       此处补上初始化调用。
  // ===========================================================================
  try {
    const { initGeekChatBridge } = await import('@/composables/useWebSocket/chatCore')
    initGeekChatBridge()
    logger.info('GeekChat桥接已初始化')
  } catch (e) {
    logger.warn('GeekChat桥接初始化失败', e)
  }
})
