import { TaskRegistry, taskResult } from '@/composables/useApplying/handles'
import { defineTaskHandler, defineTaskWorkflow } from '@/composables/useApplying/type'
import { persistLog } from '@/utils/persistentLogs'

import type { BossHelperCtx } from '.'
import { getBossData, sendPublishReq } from './requests'
import type { BossZpJobItemData, BossZpDetailData, BossZpBossData } from './types'

export type BoosJobData = {
  jobitem: BossZpJobItemData
  detail: BossZpDetailData
  boss: BossZpBossData
  delivery?: unknown
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
  tasks.activityFilter({ deps: ['岗位详情获取'] }), // 活跃度过滤
  tasks.hrPosition({ deps: ['岗位详情获取'] }), // Hr职位筛选
  tasks.jobAddress({ deps: ['岗位详情获取'] }), // 工作地址筛选
  tasks.jobFriendStatus({ deps: ['岗位详情获取'] }), // 好友状态过滤
  tasks.jobContent({ deps: ['岗位详情获取'] }), // 工作内容筛选

  defineTaskHandler(
    '金牌面试官',
    (ctx) => {
      if (!ctx.helper.conf.formData.bossGoldMedalHr.value) {
        return
      }
      return async (_, { rawData }) => {
        if (
          rawData?.detail?.bossInfo?.avatarStickerUrl?.includes(
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
  tasks.customGreeting({ deps: ['岗位详情获取'] }),
  tasks.aiGreeting({ deps: ['岗位详情获取'] }),

  defineTaskHandler('岗位投递', () => ({
    fn: async (_, { rawData, jobData }) => {
      if (tasks.isDuplicateCompany(jobData)) {
        return taskResult.skip('相同公司已投递')
      }
      if (tasks.isDuplicateHr(jobData)) {
        return taskResult.skip('相同hr已投递')
      }
      await persistLog({
        level: 'info',
        title: '开始发送投递请求',
        job: {
          key: jobData.key,
          name: jobData.jobName,
          company: jobData.brand.name,
          link: jobData.link,
        },
        data: { job: jobData, jobItem: rawData.jobitem, jobDetail: rawData.detail },
      })
      const delivery = await sendPublishReq({
        securityId: rawData.jobitem.securityId,
        encryptJobId: rawData.jobitem.encryptJobId,
      })
      rawData.delivery = delivery
      tasks.markDelivered(jobData)
      await persistLog({
        level: 'success',
        title: '投递接口响应成功',
        message: '投递成功',
        job: {
          key: jobData.key,
          name: jobData.jobName,
          company: jobData.brand.name,
          link: jobData.link,
        },
        data: {
          request: {
            securityId: rawData.jobitem.securityId,
            encryptJobId: rawData.jobitem.encryptJobId,
          },
          response: delivery,
        },
      })
      return {
        status: 'success',
        msg: '投递成功',
      }
    },
  })), // 投递

  defineTaskHandler(
    'Boss信息获取',
    (ctx) => {
      if (
        !ctx.helper.conf.formData.aiGreeting.enable &&
        !ctx.helper.conf.formData.customGreeting.enable
      ) {
        return
      }
      return async (ctx, { rawData }) => {
        ctx.log.info('获取Boss信息', {
          securityId: rawData.jobitem.securityId,
          encryptJobId: rawData.jobitem.encryptJobId,
        })
        const bossData = await getBossData({
          securityId: rawData.jobitem.securityId,
          encryptUserId: ctx.helper.uid,
        })
        rawData.boss = bossData
      }
    },
    { deps: ['岗位投递'] },
  ),

  defineTaskHandler(
    '打招呼',
    (ctx) => {
      if (
        !ctx.helper.conf.formData.aiGreeting.enable &&
        !ctx.helper.conf.formData.customGreeting.enable
      ) {
        return
      }
      return async (ctx, data) => {
        const msg = data.state.pendingGreeting
        if (msg == null || msg === '') return
        await ctx.helper.sendMessage?.(data, msg)
      }
    },
    { deps: ['岗位投递', 'Boss信息获取'] },
  ),
)
