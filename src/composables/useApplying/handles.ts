import { useResume } from '@/composables/useResume'
import { counter } from '@/message'
import { renderTemplate } from '@/utils/ai'
import { HelperContext } from '~/composables/useHelper'
import type { JobData } from '~/composables/useHelper'

import { sameCompanyKey, sameHrKey } from '../../entrypoints/boss/requests'
import { defineTaskHandler, JobStatus, TaskContext, TaskResult } from './type'
import { parseFiltering, rangeMatch, rangeMatchFormat } from './utils'

export class DependencyMissingError extends Error {
  constructor(public taskId: string) {
    super(`Task dependency missing: ${taskId}`)
  }
}

export class HelperConfigError {
  constructor(
    public key: string,
    public message?: string,
  ) {}
}

// function chatBossMessage(_ctx: LogData, _msg: string) {
//   const _d = new Date()
//   // chatMessages.value.push({
//   //   id: d.getTime(),
//   //   role: 'boss',
//   //   content: msg,
//   //   date: [getCurDay(d), getCurTime(d)],
//   //   name: ctx.jobData.brandName,
//   //   avatar: ctx.jobData.brandLogo,
//   // })
// }

function amapHandler<C extends HelperContext<C, T, S>, T, S>(
  ctx: TaskContext<C, T, S>,
  id: string,
  distance: number,
  duration: number,
  amap?: { ok: boolean; distance: number; duration: number },
): TaskResult | void {
  if (!amap || amap.ok === false) {
    return {
      isSkip: true,
      reason: '高德地图未初始化',
    }
  }
  if (distance > 0 && amap.distance > distance * 1000) {
    return {
      isSkip: true,
      reason: `${id}距离超标: ${amap.distance / 1000} 设定: ${ctx.helper.conf.formData.amap.straightDistance}`,
    }
  }
  if (duration > 0 && amap.duration > duration * 60) {
    return {
      isSkip: true,
      reason: `${id}时间超标: ${amap.duration / 60} 设定: ${ctx.helper.conf.formData.amap.drivingDuration}`,
    }
  }
}

export const taskResult = {
  skip: (reason: string, status: JobStatus = 'warn'): TaskResult => ({
    isSkip: true,
    reason,
    status,
  }),
  error: (reason: string): TaskResult => ({
    isSkip: true,
    reason,
    status: 'error',
  }),
}

const duplicateSetCache = new Map<string, Promise<Set<string>>>()

function duplicateCacheKey(storageKey: string, uid: string) {
  return `${storageKey}:${uid}`
}

async function getDuplicateSet(storageKey: string, uid: string) {
  const cacheKey = duplicateCacheKey(storageKey, uid)
  let cached = duplicateSetCache.get(cacheKey)
  if (!cached) {
    cached = counter
      .storageGet<Record<string, string[]>>(storageKey, {})
      .then((data) => new Set(data[uid] ?? []))
    duplicateSetCache.set(cacheKey, cached)
  }
  return cached
}

export function companyDuplicateKey(job: JobData) {
  const value = job.brand.key || job.brand.name
  return value ? `company:${value.trim().toLowerCase()}` : null
}

export function hrDuplicateKey(job: JobData) {
  const value =
    job.boss.key ||
    job.boss.link ||
    [job.brand.key || job.brand.name, job.boss.name, job.boss.title].filter(Boolean).join(':')
  return value ? `hr:${value.trim().toLowerCase()}` : null
}

async function recordDuplicate(storageKey: string, uid: string, value: string | null) {
  if (!value) return

  const values = await getDuplicateSet(storageKey, uid)
  if (values.has(value)) return

  values.add(value)
  const stored = await counter.storageGet<Record<string, string[]>>(storageKey, {})
  await counter.storageSet(storageKey, {
    ...stored,
    [uid]: Array.from(values),
  })
}

export async function recordSuccessfulDelivery(
  uid: string,
  job: JobData,
  options: { company: boolean; hr: boolean },
) {
  const writes: Promise<void>[] = []
  if (options.company) {
    writes.push(recordDuplicate(sameCompanyKey, uid, companyDuplicateKey(job)))
  }
  if (options.hr) {
    writes.push(recordDuplicate(sameHrKey, uid, hrDuplicateKey(job)))
  }
  await Promise.all(writes)
}

export class TaskRegistry<C extends HelperContext<C, T, S>, T, S = {}> {
  ResumeJobDuplicate = defineTaskHandler<C, T, S>('简历岗位去重', () => {
    const resume = useResume()
    if (!resume.isAutoApplyActive()) return
    return async (_, { jobData }) => {
      if (resume.isDeliveredJob(jobData.key)) {
        return taskResult.skip('简历自动投递已处理过该岗位')
      }
    }
  })

  ResumePreferences = defineTaskHandler<C, T, S>('简历硬条件', () => {
    const resume = useResume()
    if (!resume.isAutoApplyActive()) return
    return async (_, { jobData }) => {
      const match = resume.matchJob(jobData)
      if (match?.hardMismatches.length) {
        return taskResult.skip(match.hardMismatches.join('；'))
      }
    }
  })

  ResumeMatch = defineTaskHandler<C, T, S>('简历匹配评分', () => {
    const resume = useResume()
    if (!resume.isAutoApplyActive()) return
    return async (_, { jobData }) => {
      const match = resume.matchJob(jobData)
      if (!match) return
      const threshold = resume.profile.value.preferences.matchThreshold
      if (match.score < threshold) {
        return taskResult.skip(`简历匹配 ${match.score} 分，低于阈值 ${threshold} 分`)
      }
      return { msg: `简历匹配 ${match.score} 分` }
    }
  })

  SameCompanyFilter = defineTaskHandler<C, T, S>(
    '重复沟通-相同公司',
    async (ctx) => {
      if (!ctx.helper.conf.formData.sameCompanyFilter.value) {
        return
      }
      const duplicateSet = await getDuplicateSet(sameCompanyKey, ctx.helper.uid)
      return {
        fn: async (_, { jobData }) => {
          const key = companyDuplicateKey(jobData)
          if (key && duplicateSet.has(key)) {
            return taskResult.skip(`相同公司已投递: ${jobData.brand.name}`)
          }
        },
      }
    },
    { label: '相同公司' },
  )

  SameHrFilter = defineTaskHandler<C, T, S>(
    '重复沟通-相同HR',
    async (ctx) => {
      if (!ctx.helper.conf.formData.sameHrFilter.value) {
        return
      }
      const duplicateSet = await getDuplicateSet(sameHrKey, ctx.helper.uid)

      return {
        fn: async (_, { jobData }) => {
          const key = hrDuplicateKey(jobData)
          if (key && duplicateSet.has(key)) {
            return taskResult.skip(`相同HR已投递: ${jobData.boss.name}`)
          }
        },
      }
    },
    { label: '相同HR' },
  )

  jobTitle = defineTaskHandler<C, T, S>('岗位名', (ctx) => {
    if (!ctx.helper.conf.formData.jobTitle.enable) {
      return
    }
    return async (_ctx, { jobData: data }) => {
      const text = data.jobName.toLowerCase()
      if (!text) return taskResult.skip('岗位名为空')
      for (const x of ctx.helper.conf.formData.jobTitle.value) {
        if (text.includes(x.toLowerCase())) {
          if (ctx.helper.conf.formData.jobTitle.include) {
            return
          }
          return {
            isSkip: true,
            reason: `岗位名含有排除关键词 [${x}]`,
          }
        }
      }
      if (ctx.helper.conf.formData.jobTitle.include) {
        return taskResult.skip('岗位名不包含关键词')
      }
    }
  })

  goldHunterFilter = defineTaskHandler<C, T, S>('猎头过滤', (ctx) => {
    if (!ctx.helper.conf.formData.goldHunterFilter.value) {
      return
    }
    return async (_ctx, { jobData: data }) => {
      if (data?.boss.isHeadhunter === true) {
        return {
          isSkip: true,
          reason: '猎头过滤',
        }
      }
    }
  })

  company = defineTaskHandler<C, T, S>('公司名', (ctx) => {
    if (!ctx.helper.conf.formData.company.enable) return
    return async (_ctx, { jobData: data }) => {
      const text = data.brand.name.toLowerCase()
      if (!text) return taskResult.skip('公司名为空')

      for (const x of ctx.helper.conf.formData.company.value) {
        if (!x) {
          continue
        }
        if (text.includes(x.toLowerCase())) {
          if (ctx.helper.conf.formData.company.include) {
            return
          }
          return {
            isSkip: true,
            reason: `公司名含有排除关键词 [${x}]`,
          }
        }
      }
      if (ctx.helper.conf.formData.company.include) {
        return taskResult.skip('公司名不包含关键词')
      }
    }
  })

  salaryRange = defineTaskHandler<C, T, S>('薪资范围', (ctx) => {
    if (!ctx.helper.conf.formData.salaryRange.enable) {
      return
    }
    const arr = [
      ['元/时', ctx.helper.conf.formData.salaryRange.advancedValue.H],
      ['元/天', ctx.helper.conf.formData.salaryRange.advancedValue.D],
      ['元/月', ctx.helper.conf.formData.salaryRange.advancedValue.M],
      ['K', ctx.helper.conf.formData.salaryRange.value],
    ] as const
    return async (_ctx, { jobData: data }) => {
      const text = data.salary
      for (const key of arr) {
        if (text.includes(key[0])) {
          if (!rangeMatch(text, key[1])) {
            return {
              isSkip: true,
              reason: `不匹配的薪资范围 ${text}, 预期: ${rangeMatchFormat(key[1], key[0])}`,
            }
          }
        }
      }
    }
  })

  companySizeRange = defineTaskHandler<C, T, S>('公司规模', (ctx) => {
    if (!ctx.helper.conf.formData.companySizeRange.enable) {
      return
    }
    return async (ctx, { jobData: data }) => {
      const text = data.brand.scale
      if (!rangeMatch(text, ctx.helper.conf.formData.companySizeRange.value)) {
        return taskResult.skip(
          `不匹配的公司规模 ${text}, 预期: ${rangeMatchFormat(ctx.helper.conf.formData.companySizeRange.value, '人')}`,
        )
      }
    }
  })
  jobContent = defineTaskHandler<C, T, S>('工作内容', (ctx) => {
    if (!ctx.helper.conf.formData.jobContent.enable) {
      return
    }
    return async (ctx, { jobData }) => {
      const content = jobData.jobDescription.toLowerCase()
      for (const x of ctx.helper.conf.formData.jobContent.value) {
        if (!x) {
          continue
        }
        const re = new RegExp(`(?<!(不|无).{0,5})${x.toLowerCase()}(?!系统|软件|工具|服务)`)
        if (content != null && re.test(content)) {
          if (ctx.helper.conf.formData.jobContent.include) {
            return
          }
          return {
            isSkip: true,
            reason: `工作内容含有排除关键词 [${x}]`,
          }
        }
      }
      if (ctx.helper.conf.formData.jobContent.include) {
        return taskResult.skip('工作内容中不包含关键词')
      }
    }
  })

  hrPosition = defineTaskHandler<C, T, S>('Hr职位', (ctx) => {
    if (!ctx.helper.conf.formData.hrPosition.enable) {
      return
    }
    return async (_, { jobData }) => {
      const content = jobData.boss.title?.trim().toLowerCase()
      for (const x of ctx.helper.conf.formData.hrPosition.value) {
        if (!x) {
          continue
        }
        if (content != null && content === x.trim().toLowerCase()) {
          if (ctx.helper.conf.formData.hrPosition.include) {
            return
          }
          return {
            isSkip: true,
            reason: `Hr职位在黑名单中 ${content}`,
          }
        }
      }
      if (ctx.helper.conf.formData.hrPosition.include) {
        return taskResult.skip(`Hr职位不在白名单中: ${content}`)
      }
    }
  })

  jobAddress = defineTaskHandler<C, T, S>('工作地址', (ctx) => {
    if (!ctx.helper.conf.formData.jobAddress.enable) {
      return
    }
    return async (_, { jobData }) => {
      if (ctx.helper.conf.formData.jobAddress.value.length === 0 || !jobData.address) {
        return
      }
      const content = jobData.address.toLowerCase()
      for (const x of ctx.helper.conf.formData.jobAddress.value) {
        if (!x) {
          continue
        }
        if (content.includes(x.toLowerCase())) {
          if (ctx.helper.conf.formData.jobAddress.include) {
            return
          }
          return {
            isSkip: true,
            reason: `工作地址含有排除关键词 [${x}]`,
          }
        }
      }
      return {
        isSkip: true,
        reason: `工作地址不包含关键词: ${content}`,
      }
    }
  })

  jobFriendStatus = defineTaskHandler<C, T, S>('好友状态', (ctx) => {
    if (!ctx.helper.conf.formData.friendStatus.value) {
      return
    }
    return async (_, { jobData }) => {
      if (jobData.boss?.isFriend === true) {
        return {
          isSkip: true,
          reason: '已经是好友了',
        }
      }
    }
  })

  aiFiltering = defineTaskHandler<C, T, S>(
    'AI筛选',
    (ctx) => {
      if (!ctx.helper.conf.formData.aiFiltering.enable) {
        return
      }
      if (
        !ctx.helper.chatModel.createAgent(ctx.helper.conf.formData.aiFiltering, 'filtering', {
          json: true,
        })
      ) {
        throw new HelperConfigError('aiFiltering.model', 'AI筛选模型未配置')
      }
      return async (ctx, data) => {
        const content = await ctx.helper.chatModel
          .chat('filtering', data, { disableMessages: ctx.mode === 'simulate' })
          .then((r) => r.text)
        const { message, rating } = parseFiltering(content)
        if (rating < (ctx.helper.conf.formData.aiFiltering.score ?? 10)) {
          return taskResult.skip(message)
        }
      }
    },
    {
      state: 'ai',
      stateMsg: 'AI筛选中',
    },
  )

  activityFilter = defineTaskHandler<C, T, S>('活跃度过滤', (ctx) => {
    if (!ctx.helper.conf.formData.activityFilter.value) {
      return
    }
    return async (_, { jobData }) => {
      const activeText = jobData.activeTimeStr
      const activeTime = jobData.activeTime
      // TODO: 暂时先用文本匹配吧, activeTime 备用(没确认是否准确)
      if (!activeText && !activeTime) {
        return taskResult.skip(`无活跃内容,如果全失败请反馈`)
      } else if (!activeText && activeTime) {
        if (ctx.now.getTime() - activeTime >= 7 * 24 * 60 * 60 * 1000) {
          return {
            isSkip: true,
            reason: `不活跃 [${new Date(activeTime).toLocaleString()}]`,
          }
        }
      } else if (!activeText) {
        return taskResult.skip(`无活跃信息,如果全失败请反馈`)
      } else if (activeText.includes('月') || activeText.includes('年'))
        return taskResult.skip(`不活跃, [${activeText}]`)
    }
  })

  customGreeting = defineTaskHandler<C, T, S>(
    '自定义招呼',
    (ctx) => {
      if (!ctx.helper.conf.formData.customGreeting.enable) {
        return
      }
      return async (ctx, data) => {
        // if (ctx.bossData == null) {
        //   const bossData = await requestBossData(ctx.jobData.card!)
        //   ctx.bossData = bossData
        // }
        let msg = ctx.helper.conf.formData.customGreeting.value
        if (ctx.helper.conf.formData.greetingVariable.value) {
          if (Array.isArray(msg)) {
            msg = msg.map((item) => {
              if (item.type === 'text') {
                return {
                  ...item,
                  content: renderTemplate(item.content, data),
                }
              } else {
                return item
              }
            })
          } else {
            msg = renderTemplate(msg, data)
          }
        }

        // ctx.message = msg

        // const buf = new Message({
        //   form_uid: uid.toString(),
        //   to_uid: ctx.bossData.data.bossId.toString(),
        //   to_name: ctx.bossData.data.encryptBossId, // encryptUserId
        //   friend_source: ctx.bossData.data.bossSource,
        //   content: msg,
        // })

        // await buf.send()

        await ctx.helper.sendMessage?.(data, msg)
      }
    },
    { label: '自定义招呼语' },
  )

  aiGreeting = defineTaskHandler<C, T, S>(
    'AI招呼',
    (ctx) => {
      if (!ctx.helper.conf.formData.aiGreeting.enable) {
        return
      }
      if (!ctx.helper.chatModel.createAgent(ctx.helper.conf.formData.aiGreeting, 'greetings')) {
        throw new HelperConfigError('aiGreeting.model', 'AI招呼模型未配置')
      }
      return async (ctx, data) => {
        const startedAt = Date.now()
        ctx.helper.logs.step(data.jobData, 'AI生成', 'info', '开始请求模型')
        let msg: string
        try {
          msg = await ctx.helper.chatModel.chat('greetings', data).then((r) => r.text)
          if (!msg.trim()) {
            throw new Error('AI模型未生成招呼语内容')
          }
          ctx.helper.logs.step(
            data.jobData,
            'AI生成',
            'success',
            `生成完成，共 ${msg.length} 个字符`,
            Date.now() - startedAt,
          )
        } catch (error) {
          ctx.helper.logs.step(
            data.jobData,
            'AI生成',
            'danger',
            error instanceof Error ? error.message : String(error),
            Date.now() - startedAt,
          )
          throw error
        }
        await ctx.helper.sendMessage?.(data, msg)
      }
    },
    { label: 'AI招呼语', state: 'ai', stateMsg: '生成招呼语中' },
  )

  amap = defineTaskHandler<C, T, S>('高德地图', (ctx) => {
    if (!ctx.helper.conf.formData.amap.enable) {
      return
    }
    return async (ctx, { jobData, state }) => {
      state.amap ??= {}

      if (!jobData.address) {
        return taskResult.skip('地址信息为空')
      }
      state.amap.geocode = await amapGeocode(jobData.address) // TODO: 直接使用经纬度
      if (!state.amap.geocode?.location) {
        return taskResult.skip('未获取到地址经纬度')
      }
      state.amap.distance = await amapDistance(state.amap.geocode.location)

      if (state.amap == null || state.amap.distance == null) {
        return {
          isSkip: true,
          reason: 'api数据异常',
        }
      }
      return [
        amapHandler(
          ctx,
          '直线',
          ctx.helper.conf.formData.amap.straightDistance,
          0,
          state.amap.distance.straight,
        ),
        amapHandler(
          ctx,
          '驾车',
          ctx.helper.conf.formData.amap.drivingDistance,
          ctx.helper.conf.formData.amap.drivingDuration,
          state.amap.distance.driving,
        ),
        amapHandler(
          ctx,
          '步行',
          ctx.helper.conf.formData.amap.walkingDistance,
          ctx.helper.conf.formData.amap.walkingDuration,
          state.amap.distance.walking,
        ),
      ]
    }
  })
}
