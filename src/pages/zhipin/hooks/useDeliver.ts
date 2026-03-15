import { ElMessage } from 'element-plus'
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { cachePipelineResult, createHandle, sendPublishReq } from '@/composables/useApplying'
import { useCommon } from '@/composables/useCommon'
import { useStatistics } from '@/composables/useStatistics'
import { useConf } from '@/stores/conf'
import type { MyJobListData } from '@/stores/jobs'
import { jobList } from '@/stores/jobs'
import type { logData, logErr } from '@/stores/log'
import { useLog } from '@/stores/log'
import { BoosHelperError, LimitError, RateLimitError, UnknownError } from '@/types/deliverError'
import { delay, getCurDay, notification } from '@/utils'
import { logger } from '@/utils/logger'

export const useDeliver = defineStore('zhipin/deliver', () => {
  const total = ref(0)
  const current = ref(0)
  const currentData = ref<MyJobListData>()
  const log = useLog()
  const statistics = useStatistics()
  const common = useCommon()
  const conf = useConf()

  async function jobListHandle() {
    log.info('获取岗位', `本次获取到 ${jobList._list.value.length} 个`)
    total.value = jobList._list.value.length
    const chandle = await createHandle()
    jobList._list.value.forEach((v) => {
      switch (v.status.status) {
        case 'success':
        case 'warn':
          break
        case 'pending':
        case 'wait':
        case 'running':
        case 'error':
        default:
          v.status.setStatus('wait', '等待中')
      }
    })
    for (const [index, data] of jobList._list.value.entries()) {
      current.value = index
      if (common.deliverStop) {
        log.info('暂停投递', `剩余 ${jobList._list.value.length - index} 个未处理`)
        return
      }
      if (data.status.status !== 'wait') continue

      try {
        data.status.setStatus('running', '处理中')
        currentData.value = data
        const ctx: logData = { listData: data }
        try {
          for (const h of chandle.before) {
            await h({ data }, ctx)
          }
          await sendPublishReq(data)
          for (const h of chandle.after) {
            await h({ data }, ctx)
          }
          log.add(data, null, ctx, ctx.message)
          statistics.todayData.success++
          data.status.setStatus('success', '投递成功')
          logger.debug('投递成功', ctx)
          ctx.state = '成功'
          if (statistics.todayData.success >= conf.formData.deliveryLimit.value) {
            const msg = `投递到达上限 ${conf.formData.deliveryLimit.value}，已暂停投递`
            conf.formData.notification.value && (await notification(msg))
            ElMessage.info(msg)
            common.deliverStop = true
            return
          }
          const date = getCurDay()
          if (statistics.todayData.date !== date) {
            await statistics.updateStatistics({
              date,
              success: 0,
              total: 0,
              company: 0,
              jobTitle: 0,
              jobContent: 0,
              hrPosition: 0,
              salaryRange: 0,
              companySizeRange: 0,
              activityFilter: 0,
              goldHunterFilter: 0,
              repeat: 0,
              jobAddress: 0,
              amap: 0,
            })
          }
        } catch (e: any) {
          if (!(e instanceof BoosHelperError)) {
            // eslint-disable-next-line no-ex-assign
            e = new UnknownError(`预期外:${e.message}`, { cause: e })
          }
          data.status.setStatus(
            e.state === 'warning' ? 'warn' : 'error',
            (e.name as string) ?? '没有消息',
          )
          log.add(data, e as logErr, ctx)
          logger.warn('投递过滤', ctx)
          ctx.state = '过滤'
          ctx.err = e.message ?? ''

          if (e instanceof LimitError) {
            const msg = `投递到达boss上限 ${e.message}，已暂停投递`
            conf.formData.notification.value && (await notification(msg))
            ElMessage.error(msg)
            common.deliverStop = true
            return
          } else if (e instanceof RateLimitError) {
            conf.formData.delay.deliveryInterval += 3
            const msg = `触发boss速率限制,操作频繁, 建议增加投递间隔. 已临时增加3s间隔`
            conf.formData.notification.value && (await notification(msg))
            ElMessage.error(msg)
            await delay(30)
          }
        }
      } catch (e) {
        data.status.setStatus('error', '未知报错')
        logger.error('未知报错', e, data)
        conf.formData.notification.value && (await notification('未知报错'))
        ElMessage.error('未知报错')
      } finally {
        // 缓存Pipeline处理结果
        try {
          await cachePipelineResult(
            data.encryptJobId,
            data.jobName || '',
            data.brandName || '',
            data.status.status,
            data.status.msg || '处理完成',
          )
        } catch (cacheError) {
          logger.warn('缓存Pipeline结果失败', cacheError)
        }

        statistics.todayData.total++
        await delay(conf.formData.delay.deliveryInterval)
      }
    }
  }
  return {
    createHandle,
    jobListHandle,
    total,
    current,
    currentData,
  }
})
