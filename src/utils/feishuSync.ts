import type { TaskResult, WorkflowData } from '@/composables/useApplying/type'
import { parseFiltering } from '@/composables/useApplying/utils'
import type { HelperContext } from '@/composables/useHelper'
import { counter } from '@/message'
import { logger } from '@/utils/logger'

interface FeishuConfig {
  enabled: boolean
  appId: string
  appSecret: string
  appToken: string
  tableIdBoss: string
}

/** 只保存可写模板字段，避免持有随翻页清理的工作流对象。 */
export function feishuJobRow<C extends HelperContext<C, T, S>, T, S>(
  helper: C,
  data: WorkflowData<T, S>,
  result?: TaskResult,
): Record<string, unknown> {
  const job = data.jobData
  const greeting = data.state.aiGreeting
  const messages = helper.chatModel.states.get(job.key)?.messages ?? []
  const filtering = [...messages].reverse().find((message) => message.uiRole === 'filtering')
  const text = filtering?.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('')
  let filter: ReturnType<typeof parseFiltering> | undefined
  if (text) {
    try {
      filter = parseFiltering(text)
    } catch {
      // 不完整或失败的 AI 响应不能冒充有效评分。
    }
  }
  const row: Record<string, unknown> = {
    key: job.key,
    公司唯一标识: job.companyId,
    HR唯一标识: job.hrId,
    使用账号: helper.accounts.currentAccount.value?.label ?? helper.accounts.activeAccount.value,
    使用预设: helper.conf.formDataPreset.value,
    岗位名: job.jobName,
    公司名: job.brand.name,
    HR: job.boss.name,
    职位简称: job.positionName,
    职位描述: job.jobDescription,
    薪资: job.salary,
    工作城市: job.city,
    工作地址: job.address,
    活跃状态: job.activeTimeStr,
    公司介绍: job.brand.introduce,
    HR职位: job.boss.title,
    经验要求: job.experienceName,
    学历要求: job.degreeName,
    公司规模: job.brand.scale,
    行业: job.brand.industry,
    融资阶段: job.brand.stageName,
    技能标签: job.showSkills,
    福利: job.welfareList,
    工作标签: job.jobLabels,
    技能要求: job.skills,
    公司标签: job.brand.labels.filter((label): label is string => typeof label === 'string'),
    活跃时间: job.activeTime,
    HR认证: job.boss.certificated,
    是否猎头: job.boss.isHeadhunter,
    是否好友: job.boss.isFriend,
    HR已验证: job.boss.isCertificated,
    工作地址坐标: job.addressCoords ? job.addressCoords.join(',') : undefined,
    AI筛选分数: filter?.rating,
    'AI筛选-加分项': filter?.data.positive?.reason.trim(),
    'AI筛选-扣分项': filter?.data.negative?.reason.trim(),
    AI招呼语: greeting?.greeting,
    'AI招呼语-原因': greeting?.reason,
    'AI招呼语-拒绝原因': greeting?.error,
    'AI招呼语-能力': greeting?.abilities,
    处理状态: result?.msg,
    '处理状态-类别': result?.status,
    '处理状态-原因': result?.reason,
  }
  // 不发送 undefined、附件 URL 或系统只读时间。深拷贝隔离后续响应式更新。
  return JSON.parse(JSON.stringify(row)) as Record<string, unknown>
}

export function createFeishuSync(onError?: (error: unknown) => void) {
  const keys = new Set<string>()
  const snapshots = new Map<string, Record<string, unknown>>()
  let processed = 0
  let requested = false
  let flight: Promise<void> | undefined

  const flush = (): Promise<void> => {
    requested = true
    if (flight) return flight
    flight = Promise.resolve().then(async () => {
      try {
        while (requested) {
          requested = false
          if (!keys.size) continue
          const config = await counter.storageGet<FeishuConfig>('local:feishu-config')
          if (!config?.enabled) break
          if (
            ![config.appId, config.appSecret, config.appToken, config.tableIdBoss].every(
              (value) => typeof value === 'string' && value.trim(),
            )
          )
            throw new Error('飞书同步配置不完整')
          const batch = [...keys].map((key) => [key, snapshots.get(key)!] as const)
          logger.info('飞书开始批量同步', { count: batch.length })
          const result = await counter.feishuUpsert(batch.map(([, row]) => row))
          logger.info('飞书批量同步完成', result)
          for (const [key, row] of batch) {
            // 同一 key 在请求期间可能产生新结果，旧请求成功不能删除新快照。
            if (snapshots.get(key) !== row) continue
            keys.delete(key)
            snapshots.delete(key)
          }
        }
      } catch (error) {
        logger.warn('飞书同步失败，保留待同步岗位以便重试', error)
        onError?.(error)
      } finally {
        flight = undefined
      }
    })
    return flight
  }

  const add = (row: Record<string, unknown>, count = true) => {
    const key = row.key
    if (typeof key !== 'string' || !key) return
    keys.add(key)
    snapshots.set(key, row)
    if (count && ++processed % 5 === 0) void flush()
  }

  return { add, flush }
}
