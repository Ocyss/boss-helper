import { TaskRegistry, taskResult } from '@/composables/useApplying/handles'
import { defineTaskHandler, defineTaskWorkflow } from '@/composables/useApplying/type'
import { validateAiGreetingText } from '@/utils/aiGreeting'

import type { BossHelperCtx } from '.'
import { getBossData, sendPublishReq } from './requests'
import type { BossZpJobItemData, BossZpDetailData, BossZpBossData } from './types'

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
      concurrency: 'boss-detail',
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

  tasks.customGreeting({ deps: ['岗位详情获取'] }), // 纯准备自定义招呼语
  tasks.aiGreeting({ deps: ['岗位详情获取'] }), // 纯准备AI招呼语

  tasks.deliveryRevalidation(), // 提交前重新检查已沟通和去重状态
  defineTaskHandler(
    '招呼语发送校验',
    () =>
      async (_, { state }) => {
        if (state.preparedGreetingSource === 'ai') {
          state.preparedGreeting = validateAiGreetingText(state.preparedGreeting)
        }
      },
    { phase: 'commit' },
  ),

  defineTaskHandler(
    '岗位投递',
    () =>
      async (ctx, { jobData, rawData, state }) => {
        state.delivery ??= {
          friendAddAttempted: false,
          friendAdded: false,
          greetingSent: false,
          counted: false,
          status: 'pending',
        }
        if (state.delivery.friendAdded) return

        state.delivery.friendAddAttempted = true
        await sendPublishReq(
          {
            securityId: rawData.jobitem.securityId,
            encryptJobId: rawData.jobitem.encryptJobId,
          },
          undefined,
          2,
          {},
          ctx.signal,
        )
        state.delivery.friendAdded = true
        state.delivery.status = 'friend_added'
        // friend/add 成功后立即更新快照，任何后续失败都不得重复调用。
        rawData.jobitem.contact = true
        // 去重落盘与 friend/add 成功紧邻执行，不受后续 run 失效检查打断。
        await tasks.recordSuccessfulDelivery(ctx, { jobData, rawData })
        return {
          status: 'success',
          msg: '投递成功',
        }
      },
    { deps: ['投递前复验', '招呼语发送校验'], phase: 'commit' },
  ), // 严格串行投递

  defineTaskHandler(
    'Boss信息获取',
    () =>
      async (ctx, { rawData, state }) => {
        if (!state.delivery?.friendAdded) return
        ctx.log.info('获取Boss信息', {
          securityId: rawData.jobitem.securityId,
          encryptJobId: rawData.jobitem.encryptJobId,
        })
        const bossData = await getBossData(
          {
            securityId: rawData.jobitem.securityId,
            encryptUserId: rawData.jobitem.encryptBossId,
            bossSource: rawData.detail.bossInfo.bossSource,
          },
          undefined,
          2,
          ctx.signal,
        )
        rawData.boss = bossData
      },
    { deps: ['岗位投递'], phase: 'commit' },
  ), // Boss信息获取

  defineTaskHandler(
    '发送招呼语',
    () => async (ctx, data) => {
      if (!data.state.delivery?.friendAdded) return
      if (data.state.preparedGreeting == null) return
      if (data.state.preparedGreetingSource === 'ai') {
        data.state.preparedGreeting = validateAiGreetingText(data.state.preparedGreeting)
      }
      await ctx.helper.sendMessage(data, data.state.preparedGreeting)
      if (data.state.delivery) data.state.delivery.greetingSent = true
    },
    { deps: ['Boss信息获取', '招呼语准备'], phase: 'commit' },
  ),
)
