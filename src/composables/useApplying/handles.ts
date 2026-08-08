import { counter } from '@/message'
import { FormDataInput } from '@/types/formData'
import { renderTemplate } from '@/utils/ai'
import { HelperContext } from '~/composables/useHelper'

import { sameCompanyKey, sameHrKey } from '../../entrypoints/boss/requests'
import { defineTaskHandler, JobStatus, TaskContext, TaskResult, WorkflowData } from './type'
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

type GreetingSource = 'custom' | 'ai' | 'fallback'

type FallbackResolution = {
  enabled: boolean
  text?: string
  reason?: string
}

/** 判断招呼语是否满足自动发送的长度和句数约束。 */
function isValidGreetingText(text: string): boolean {
  const normalized = text.trim()
  const sentenceCount = normalized.split(/[。！？!?]+/u).filter(Boolean).length
  return Boolean(
    normalized && normalized !== '需人工判断' && normalized.length <= 150 && sentenceCount <= 3,
  )
}

/** 读取并渲染本地兜底文本；不会把错误、模型响应或聊天全文带入结果。 */
function resolveFallbackGreeting<C extends HelperContext<C, T, S>, T, S>(
  ctx: TaskContext<C, T, S>,
  data: WorkflowData<T, S>,
): FallbackResolution {
  const config = ctx.helper.conf.formData.greetingFallback
  if (!config?.enable) {
    return { enabled: false }
  }
  const raw = typeof config.value === 'string' ? config.value.trim() : ''
  if (!raw) {
    return { enabled: true, reason: '兜底招呼语为空' }
  }
  try {
    const rendered = ctx.helper.conf.formData.greetingVariable.value
      ? renderTemplate(raw, data)
      : raw
    const normalized = String(rendered ?? '').trim()
    if (!isValidGreetingText(normalized)) {
      return { enabled: true, reason: '兜底招呼语不符合长度或句数限制' }
    }
    return { enabled: true, text: normalized }
  } catch {
    return { enabled: true, reason: '兜底招呼语模板渲染失败' }
  }
}

/** 统一执行招呼语草稿/发送及可选图片简历发送，避免 AI 与自定义路径语义漂移。 */
async function deliverGreeting<C extends HelperContext<C, T, S>, T, S>(
  ctx: TaskContext<C, T, S>,
  data: WorkflowData<T, S>,
  greeting: FormDataInput['value'],
  source: GreetingSource,
  fallbackReason?: string,
): Promise<TaskResult> {
  const draft = Array.isArray(greeting)
    ? greeting
        .filter((item) => item.type === 'text')
        .map((item) => item.content.trim())
        .filter(Boolean)
        .join('\n')
        .trim()
    : String(greeting ?? '').trim()
  const hasImage =
    Array.isArray(greeting) && greeting.some((item) => item.type === 'image' && Boolean(item.image))
  if (!draft && !hasImage) {
    return taskResult.skip('招呼语为空，未生成草稿')
  }

  const label = source === 'fallback' ? '兜底招呼语' : source === 'ai' ? 'AI招呼语' : '自定义招呼语'
  const fallbackUsed = source === 'fallback'
  if (ctx.helper.conf.formData.autoDelivery.value) {
    // sendMessage 可能已经把文本/高级招呼图片发出；异常时不再尝试兜底，避免重复触达。
    await ctx.helper.sendMessage(data, greeting)
    if (ctx.helper.conf.formData.resumeImage.enable) {
      const resumeResult = await ctx.helper.sendResumeImage(data)
      if (!resumeResult.sent) {
        if (resumeResult.stop) ctx.helper.stop()
        return taskResult.skip(`${label}已发送；${resumeResult.reason ?? '图片简历未发送'}`, 'warn')
      }
      return {
        status: 'success',
        msg: `${label}和图片简历已自动发送`,
        reason: fallbackReason,
        draft: draft || undefined,
        fallbackUsed,
      }
    }
    return {
      status: 'success',
      msg: `${label}已自动发送`,
      reason: fallbackReason,
      draft: draft || undefined,
      fallbackUsed,
    }
  }
  return {
    status: 'success',
    msg: `${label}草稿已生成（未发送）`,
    reason: fallbackReason,
    draft: draft || undefined,
    fallbackUsed,
  }
}

export class TaskRegistry<C extends HelperContext<C, T, S>, T, S = {}> {
  SameCompanyFilter = defineTaskHandler<C, T, S>(
    '重复沟通-相同公司',
    async (ctx) => {
      if (!ctx.helper.conf.formData.sameCompanyFilter.value) {
        return
      }
      const someSet = new Set<string>()
      const data = await counter.storageGet<Record<string, string[]>>(sameCompanyKey, {})
      for (const id of data[ctx.helper.uid] ?? []) {
        someSet.add(id)
      }
      return {
        fn: async (_, { jobData: data }) => {
          if (data.key && someSet.has(data.key)) {
            return taskResult.skip('相同公司已投递')
          }
        },
        after: [
          async (ctx, { jobData: data }) => {
            if (!data.key) return
            someSet.add(data.key)
            if (someSet.size % 3 === 0) {
              const oldData = await counter.storageGet<Record<string, string[]>>(sameCompanyKey, {})
              await counter.storageSet(sameCompanyKey, {
                ...oldData,
                [ctx.helper.uid]: Array.from(someSet ?? []),
              })
            }
          },
        ],
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
      const someSet = new Set<string>()
      const data = await counter.storageGet<Record<string, string[]>>(sameHrKey, {})
      for (const id of data[ctx.helper.uid] ?? []) {
        someSet.add(id)
      }

      return {
        fn: async (_, { jobData: data }) => {
          if (data.key != null && someSet.has(data.key)) {
            return taskResult.skip('相同hr已投递')
          }
        },
        after: [
          async (ctx, { jobData: data }) => {
            if (!data.key) return
            someSet.add(data.key)
            if (someSet.size % 3 === 0) {
              const oldData = await counter.storageGet<Record<string, string[]>>(sameHrKey, {})
              await counter.storageSet(sameHrKey, {
                ...oldData,
                [ctx.helper.uid]: Array.from(someSet ?? []),
              })
            }
          },
        ],
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
      const content = jobData.boss.title
      for (const x of ctx.helper.conf.formData.hrPosition.value) {
        if (!x) {
          continue
        }
        if (content != null && content.trim() === x) {
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
        const content = await ctx.helper.chatModel.chat('filtering', data).then((r) => r.text)
        const { message, rating, veto } = parseFiltering(content)
        if (
          veto ||
          !Number.isFinite(rating) ||
          rating < (ctx.helper.conf.formData.aiFiltering.score ?? 10)
        ) {
          return {
            ...taskResult.skip(message),
            aiScore: Number.isFinite(rating) ? rating : undefined,
          }
        }
        return { aiScore: rating }
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
    '打招呼',
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

        // 关闭自动投递时保留草稿；开启后保留高级招呼语中的图片顺序并发送。
        const draft = Array.isArray(msg)
          ? msg
              .filter((item) => item.type === 'text')
              .map((item) => item.content.trim())
              .filter(Boolean)
              .join('\n')
              .trim()
          : String(msg ?? '').trim()
        const hasImage =
          Array.isArray(msg) && msg.some((item) => item.type === 'image' && Boolean(item.image))
        if (!draft && !hasImage) {
          const fallback = resolveFallbackGreeting(ctx, data)
          if (!fallback.text) {
            return taskResult.skip(
              fallback.enabled
                ? `自定义招呼语为空；${fallback.reason ?? '兜底招呼语不可用'}`
                : '自定义招呼语为空，未生成草稿',
            )
          }
          return deliverGreeting(
            ctx,
            data,
            fallback.text,
            'fallback',
            '自定义招呼语为空，已使用兜底招呼语',
          )
        }
        return deliverGreeting(ctx, data, msg, 'custom')
      }
    },
    { label: '自定义招呼语' },
  )

  aiGreeting = defineTaskHandler<C, T, S>(
    '打招呼',
    (ctx) => {
      if (!ctx.helper.conf.formData.aiGreeting.enable) {
        return
      }
      // 没有模型但已配置兜底文本时仍构建任务，让运行时生成兜底草稿/消息。
      const fallbackConfigured =
        ctx.helper.conf.formData.greetingFallback.enable &&
        Boolean(ctx.helper.conf.formData.greetingFallback.value.trim())
      let modelReady = false
      try {
        modelReady = ctx.helper.chatModel.createAgent(
          ctx.helper.conf.formData.aiGreeting,
          'greetings',
        )
      } catch {
        // 模型配置初始化异常也走同一套兜底逻辑，不把 provider 原始错误写入岗位正文。
        modelReady = false
      }
      if (!modelReady && !fallbackConfigured) {
        throw new HelperConfigError('aiGreeting.model', 'AI招呼模型未配置')
      }
      return async (ctx, data) => {
        // 模型初始化失败时不再调用 AI，直接走同一套兜底安全校验。
        if (!modelReady) {
          const fallback = resolveFallbackGreeting(ctx, data)
          if (!fallback.text) {
            return taskResult.skip(`AI模型未配置；${fallback.reason ?? '未配置兜底招呼语'}`)
          }
          return deliverGreeting(
            ctx,
            data,
            fallback.text,
            'fallback',
            'AI模型未配置或初始化失败，已使用兜底招呼语',
          )
        }

        let msg = ''
        try {
          msg = await ctx.helper.chatModel.chat('greetings', data).then((r) => r.text)
        } catch (error) {
          // AI 请求未产生外部 BOSS 消息时才允许切换兜底，避免消息确认丢失时重复发送。
          const fallback = resolveFallbackGreeting(ctx, data)
          if (!fallback.text) throw error
          return deliverGreeting(
            ctx,
            data,
            fallback.text,
            'fallback',
            'AI招呼语生成失败，已使用兜底招呼语',
          )
        }

        // AI 未返回合规非空招呼语时使用用户配置的兜底文本，否则保持 fail-closed。
        const normalized = typeof msg === 'string' ? msg.trim() : ''
        if (!isValidGreetingText(normalized)) {
          const fallback = resolveFallbackGreeting(ctx, data)
          if (!fallback.text) {
            return taskResult.skip(
              `AI招呼语无效；${fallback.enabled ? (fallback.reason ?? '兜底招呼语不可用') : '未配置兜底招呼语'}`,
            )
          }
          return deliverGreeting(
            ctx,
            data,
            fallback.text,
            'fallback',
            'AI招呼语无效，已使用兜底招呼语',
          )
        }
        return deliverGreeting(ctx, data, normalized, 'ai')
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
