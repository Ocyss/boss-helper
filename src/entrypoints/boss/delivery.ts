import { TaskRegistry, taskResult } from '@/composables/useApplying/handles'
import { defineTaskHandler, defineTaskWorkflow } from '@/composables/useApplying/type'

import { BossHelperCtx } from '.'
import { BossZpJobItemData, BossZpDetailData } from './types'

export type BoosJobData = {
  jobitem: BossZpJobItemData
  detail: BossZpDetailData
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
      // const detail = await requestDetail({
      //   securityId: job.rawData.jobitem.securityId,
      //   lid: job.rawData.jobitem.encryptJobId,
      // }).then((r) => r.zpData)

      ctx.helper._clickJobCardAction(job.rawData.jobitem)
      const detail = await new Promise<BossZpDetailData>((resolve, reject) => {
        setTimeout(() => {
          reject(new Error('bossZpDetailData获取超时'))
        }, 1000 * 60)
        const interval = setInterval(() => {
          if (
            ctx.helper._jobDetail.value &&
            ctx.helper._jobDetail.value.lid === job.rawData.jobitem.lid
          ) {
            resolve(ctx.helper._jobDetail.value)
            clearInterval(interval)
          }
        }, 100)
      })

      job.rawData.detail = detail
      job.jobData = {
        ...job.jobData,
        activeTime: detail.brandComInfo.activeTime,
        activeTimeStr: detail.bossInfo.activeTimeDesc,
        jobDescription: detail.jobInfo.postDescription,
        city: detail.jobInfo.locationName,
        address: detail.jobInfo.address,
        addressCoords: [detail.jobInfo.longitude, detail.jobInfo.latitude],
        boss: {
          ...job.jobData.boss,
          isOnline: detail.bossInfo.bossOnline,
          isCertificated: detail.bossInfo.certificated,
        },
        brand: {
          ...job.jobData.brand,
          labels: detail.brandComInfo.labels,
          introduce: detail.brandComInfo.introduce,
          stageName: detail.brandComInfo.stageName,
        },
      }
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

  tasks.amap({ deps: ['岗位详情获取'] }), // 高德地图
  tasks.aiFiltering({ deps: ['岗位详情获取'] }), // AI过滤

  // ===========================================================================
  // 岗位投递 - 向 BOSS 发送简历投递请求
  // 调用 sendPublishReq（POST /wapi/zpgeek/friend/add.json）完成投递，
  // 投递后 BOSS 后端建立求职者与 HR 的好友关系，后续才能发招呼语。
  // 注意: 之前该步骤被注释（只打了日志），导致投递从未实际执行，
  //       筛选用招呼语也因为好友关系未建立而发送失败。
  //       恢复真实 API 调用后，整个"筛选→投递→发消息"流程才能跑通。
  // ===========================================================================
  defineTaskHandler('岗位投递', () => async (_, { rawData }) => {
    const { sendPublishReq } = await import('./requests')
    await sendPublishReq({
      securityId: rawData.jobitem.securityId,
      encryptJobId: rawData.jobitem.encryptJobId,
    })
    return {
      status: 'success',
      msg: '投递成功',
    }
  }), // 投递

  tasks.customGreeting({ deps: ['岗位详情获取', '岗位投递'] }), // 自定义招呼语
  tasks.aiGreeting({ deps: ['岗位详情获取', '岗位投递'] }), // AI招呼语
)
