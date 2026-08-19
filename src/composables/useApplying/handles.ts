import type { HelperContext, JobData } from '@/composables/useHelper'
import { renderTemplate } from '@/utils/ai'
import { compactJobDescription, uniqueStringList } from '@/utils/compactJobDescription'

import { sameCompanyKey, sameHrKey } from '../../entrypoints/boss/requests'
import type { JobStatus, TaskContext, TaskResult } from './type'
import { defineTaskHandler } from './type'
import { loadSet, parseFiltering, rangeMatch, rangeMatchFormat, saveSet } from './utils'

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
    return taskResult.skip('高德地图未初始化')
  }
  if (distance > 0 && amap.distance > distance * 1000) {
    return taskResult.skip(
      `${id}距离超标: ${amap.distance / 1000} 设定: ${ctx.helper.conf.formData.amap.straightDistance}`,
    )
  }
  if (duration > 0 && amap.duration > duration * 60) {
    return taskResult.skip(
      `${id}时间超标: ${amap.duration / 60} 设定: ${ctx.helper.conf.formData.amap.drivingDuration}`,
    )
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

export class TaskRegistry<C extends HelperContext<C, T, S>, T, S = {}> {
  private companySet?: Map<string, number>
  private hrSet?: Map<string, number>

  isDuplicateCompany(jobData: Pick<JobData, 'encryptBrandId'>): boolean {
    const id = jobData.encryptBrandId
    return Boolean(id && this.companySet?.has(id))
  }

  isDuplicateHr(jobData: Pick<JobData, 'encryptBossId'>): boolean {
    const id = jobData.encryptBossId
    return Boolean(id && this.hrSet?.has(id))
  }

  markDelivered(jobData: Pick<JobData, 'encryptBrandId' | 'encryptBossId'>): void {
    const now = Date.now()
    if (jobData.encryptBrandId && this.companySet) {
      this.companySet.set(jobData.encryptBrandId, now)
    }
    if (jobData.encryptBossId && this.hrSet) {
      this.hrSet.set(jobData.encryptBossId, now)
    }
  }

  SameCompanyFilter = defineTaskHandler<C, T, S>(
    '重复沟通-相同公司',
    async (ctx) => {
      if (!ctx.helper.conf.formData.sameCompanyFilter.value) {
        this.companySet = undefined
        return
      }
      this.companySet = await loadSet(sameCompanyKey, ctx.helper.uid)
      return {
        fn: async (_, { jobData: data }) => {
          if (this.isDuplicateCompany(data)) {
            ctx.helper.statistics.todayData.value.repeat++
            return taskResult.skip('相同公司已投递')
          }
        },
        onEnd: async (ctx) => {
          if (!this.companySet) return
          await saveSet(
            sameCompanyKey,
            ctx.helper.uid,
            this.companySet,
            ctx.helper.conf.formData.sameCompanyFilter.expire,
          )
        },
      }
    },
    { label: '相同公司' },
  )

  SameHrFilter = defineTaskHandler<C, T, S>(
    '重复沟通-相同HR',
    async (ctx) => {
      if (!ctx.helper.conf.formData.sameHrFilter.value) {
        this.hrSet = undefined
        return
      }
      this.hrSet = await loadSet(sameHrKey, ctx.helper.uid)
      return {
        fn: async (_, { jobData: data }) => {
          if (this.isDuplicateHr(data)) {
            ctx.helper.statistics.todayData.value.repeat++
            return taskResult.skip('相同hr已投递')
          }
        },
        onEnd: async (ctx) => {
          if (!this.hrSet) return
          await saveSet(
            sameHrKey,
            ctx.helper.uid,
            this.hrSet,
            ctx.helper.conf.formData.sameHrFilter.expire,
          )
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
          return taskResult.skip(`岗位名含有排除关键词 [${x}]`)
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
        return taskResult.skip('猎头过滤')
      }
    }
  })

  company = defineTaskHandler<C, T, S>('公司名', (ctx) => {
    if (!ctx.helper.conf.formData.company.enable) return
    return async (_ctx, { jobData: data }) => {
      const text = data.brand.name
      if (!text) return taskResult.skip('公司名为空')

      for (const x of ctx.helper.conf.formData.company.value) {
        if (!x) {
          continue
        }
        if (text.includes(x)) {
          if (ctx.helper.conf.formData.company.include) {
            return
          }
          return taskResult.skip(`公司名含有排除关键词 [${x}]`)
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
            return taskResult.skip(
              `不匹配的薪资范围 ${text}, 预期: ${rangeMatchFormat(key[1], key[0])}`,
            )
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
          return taskResult.skip(`工作内容含有排除关键词 [${x}]`)
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
      const content = jobData.boss.title
      for (const x of ctx.helper.conf.formData.hrPosition.value) {
        if (!x) {
          continue
        }
        if (content != null && content.trim() === x) {
          if (ctx.helper.conf.formData.hrPosition.include) {
            return
          }
          return taskResult.skip(`Hr职位在黑名单中: ${content}`)
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
          return taskResult.skip(`工作地址含有排除关键词 [${x}]`)
        }
      }
      return taskResult.skip(`工作地址不包含关键词: ${content}`)
    }
  })

  jobFriendStatus = defineTaskHandler<C, T, S>('好友状态', (ctx) => {
    if (!ctx.helper.conf.formData.friendStatus.value) {
      return
    }
    return async (_, { jobData }) => {
      if (jobData.boss?.isFriend === true) {
        return taskResult.skip('已经是好友了')
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
        const compactJd = compactJobDescription(data.jobData.jobDescription, {
          noiseWords: ctx.helper.conf.formData.aiFiltering.compactJd?.noiseWords,
        })
        const content = await ctx.helper.chatModel
          .chat('filtering', {
            ...data,
            jobData: {
              ...data.jobData,
              jobDescription: compactJd || data.jobData.jobDescription,
              welfareList: uniqueStringList(data.jobData.welfareList),
            },
          })
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

      if (!activeText && !activeTime) {
        ctx.helper.statistics.todayData.value.activityFilter++
        return taskResult.skip(`无活跃内容,如果全失败请反馈`)
      } else if (!activeText && activeTime) {
        if (ctx.now.getTime() - activeTime >= 7 * 24 * 60 * 60 * 1000) {
          ctx.helper.statistics.todayData.value.activityFilter++
          return taskResult.skip(`不活跃 [${new Date(activeTime).toLocaleString()}]`)
        }
      } else if (!activeText) {
        ctx.helper.statistics.todayData.value.activityFilter++
        return taskResult.skip(`无活跃信息,如果全失败请反馈`)
      } else if (activeText.includes('月') || activeText.includes('年')) {
        ctx.helper.statistics.todayData.value.activityFilter++
        return taskResult.skip(`不活跃, [${activeText}]`)
      }
    }
  })

  customGreeting = defineTaskHandler<C, T, S>(
    '招呼语准备',
    (ctx) => {
      if (!ctx.helper.conf.formData.customGreeting.enable) {
        return
      }
      return async (ctx, data) => {
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
        data.state.pendingGreeting = msg
      }
    },
    { label: '自定义招呼语' },
  )

  aiGreeting = defineTaskHandler<C, T, S>(
    '招呼语准备',
    (ctx) => {
      if (!ctx.helper.conf.formData.aiGreeting.enable) {
        return
      }
      if (!ctx.helper.chatModel.createAgent(ctx.helper.conf.formData.aiGreeting, 'greetings')) {
        throw new HelperConfigError('aiGreeting.model', 'AI招呼模型未配置')
      }
      return async (ctx, data) => {
        const msg = await ctx.helper.chatModel.chat('greetings', data).then((r) => r.text)
        data.state.pendingGreeting = msg
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
        return taskResult.skip('api数据异常')
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
