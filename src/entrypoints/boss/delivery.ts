import { activityLog } from '@/composables/useActivityLog'
import {
  recordSuccessfulDelivery,
  TaskRegistry,
  taskResult,
} from '@/composables/useApplying/handles'
import { defineTaskHandler, defineTaskWorkflow } from '@/composables/useApplying/type'
import { useResume } from '@/composables/useResume'
import { logger } from '@/utils/logger'

import { BossHelperCtx } from '.'
import { getBossData, sendPublishReq } from './requests'
import { BossZpJobItemData, BossZpDetailData, BossZpBossData } from './types'

export type BoosJobData = {
  jobitem: BossZpJobItemData
  detail: BossZpDetailData
  boss: BossZpBossData
}

const tasks = new TaskRegistry<BossHelperCtx, BoosJobData>()

export const bossWorkflow = defineTaskWorkflow<BossHelperCtx, BoosJobData>(
  defineTaskHandler(
    '已沟通',
    async () => {
      return async (_, { rawData }) => {
        if (rawData.jobitem.contact) {
          return taskResult.skip('已沟通')
        }
      }
    },
    {
      desc: '已沟通过滤',
    },
  ), // 已沟通过滤
  tasks.SameCompanyFilter(), // 相同公司过滤
  tasks.SameHrFilter(), // 相同hr过滤
  tasks.BlacklistQuickFilter(), // 公司、HR、岗位等列表信息命中时不再请求详情
  tasks.jobTitle(), // 岗位名筛选
  tasks.company(), // 公司名筛选
  tasks.salaryRange(), // 薪资筛选
  tasks.companySizeRange(), // 公司规模筛选
  tasks.goldHunterFilter(), // 猎头过滤
  defineTaskHandler(
    '岗位详情获取',
    () => async (ctx, job) => {
      await ctx.helper.onJobCardClick(job.jobData.key)
    },
    {
      state: 'request',
      stateMsg: '获取岗位详情',
    },
  ), // 获取岗位详情
  tasks.BlacklistFilter({ deps: ['岗位详情获取'] }), // 黑白名单优先于后续详情筛选与风险评估
  tasks.activityFilter({ deps: ['岗位详情获取'] }), // 活跃度过滤
  tasks.hrPosition({ deps: ['岗位详情获取'] }), // Hr职位筛选
  tasks.jobAddress({ deps: ['岗位详情获取'] }), // 工作地址筛选
  tasks.jobFriendStatus({ deps: ['岗位详情获取'] }), // 好友状态过滤
  tasks.jobContent({ deps: ['岗位详情获取'] }), // 工作内容筛选
  tasks.CompanyRisk({ deps: ['岗位详情获取'] }), // 公司风险
  tasks.ResumeJobDuplicate({ deps: ['岗位详情获取'] }), // 简历岗位去重
  tasks.ResumeMatch({ deps: ['岗位详情获取'] }), // 简历匹配评分

  defineTaskHandler(
    '金牌面试官',
    (ctx) => {
      if (!ctx.helper.conf.formData.bossGoldMedalHr.value) {
        return
      }
      return async (_, { rawData }) => {
        if (
          rawData.detail.bossInfo.avatarStickerUrl.includes(
            '492b4ca74ee6ee7bfecf8d0d363780c68ad8b582857d894c8eae833b21840fb6',
          )
        ) {
          return taskResult.skip('金牌HR')
        }
      }
    },
    { deps: ['岗位详情获取'] },
  ), // 金牌面试官过滤

  tasks.amap({ deps: ['岗位详情获取'] }), // 高德地图
  tasks.aiFiltering({ deps: ['岗位详情获取'] }), // AI过滤

  defineTaskHandler('岗位投递', () => async (ctx, { rawData, jobData }) => {
    try {
      await sendPublishReq({
        securityId: rawData.jobitem.securityId,
        encryptJobId: rawData.jobitem.encryptJobId,
      })
    } catch (error) {
      activityLog.add({
        category: '投递',
        action: '提交岗位投递',
        status: 'error',
        message: '岗位投递未提交成功；请检查登录状态、网络和平台页面后重试。',
        detail: { job: jobData.jobName || jobData.positionName, company: jobData.brand.name },
      })
      throw error
    }
    activityLog.add({
      category: '投递',
      action: '提交岗位投递',
      status: 'success',
      message: '岗位投递请求已提交；请以平台页面的最终状态为准。',
      detail: { job: jobData.jobName || jobData.positionName, company: jobData.brand.name },
    })
    try {
      const resume = useResume()
      await resume.init()
      await Promise.all([
        recordSuccessfulDelivery(ctx.helper.uid, jobData, {
          company: ctx.helper.conf.formData.sameCompanyFilter.value,
          hr: ctx.helper.conf.formData.sameHrFilter.value,
        }),
        ...(resume.isMatchFilterEnabled() ? [resume.recordDeliveredJob(jobData.key)] : []),
      ])
    } catch (error) {
      logger.error('投递成功，但去重记录保存失败', error)
      ctx.helper.logs.step(
        jobData,
        '去重记录',
        'warning',
        error instanceof Error ? error.message : String(error),
      )
      activityLog.add({
        category: '投递',
        action: '保存去重记录',
        status: 'action_required',
        message:
          '岗位投递已提交，但本地去重记录未保存；下次可能再次遇到同一岗位，请检查浏览器存储权限。',
        detail: { job: jobData.jobName || jobData.positionName, company: jobData.brand.name },
      })
    }
    return {
      status: 'success',
      msg: '投递成功',
    }
  }), // 投递

  defineTaskHandler('Boss信息获取', () => async (ctx, { rawData }) => {
    // await sendPublishReq({
    //   securityId: rawData.jobitem.securityId,
    //   encryptJobId: rawData.jobitem.encryptJobId,
    // })
    logger.info('获取Boss信息', {
      securityId: rawData.jobitem.securityId,
      encryptJobId: rawData.jobitem.encryptJobId,
    })
    const bossData = await getBossData({
      securityId: rawData.jobitem.securityId,
      encryptUserId: ctx.helper.uid,
    })
    rawData.boss = bossData
  }), // Boss信息获取

  tasks.customGreeting({ deps: ['岗位详情获取', '岗位投递', 'Boss信息获取'] }), // 自定义招呼语
  tasks.aiGreeting({ deps: ['岗位详情获取', '岗位投递', 'Boss信息获取'] }), // AI招呼语
)
