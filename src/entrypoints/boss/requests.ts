// import axios from 'axios'

import {
  GreetError,
  BossHelperError,
  LimitError,
  PublishError,
  RateLimitError,
} from '@/composables/useApplying/deliverError'
import { logger } from '@/utils/logger'

import { BossZpBossData, BossZpDetailData } from './types'

// const { userInfo } = useStore()
const toast = useToast()
export const sameCompanyKey = 'local:sameCompany'
export const sameHrKey = 'local:sameHr'

export async function requestDetail(params: { securityId: string; lid: string }): Promise<{
  code: number
  message: string
  zpData: BossZpDetailData
}> {
  const token = window?.Cookie.get('bst')
  if (!token) {
    toast.add({
      title: '没有获取到token,请刷新重试',
      color: 'error',
    })
    throw new PublishError('没有获取到token')
  }
  const url = new URL('https://www.zhipin.com/wapi/zpgeek/job/detail.json')
  url.searchParams.set('securityId', params.securityId)
  url.searchParams.set('lid', params.lid)
  url.searchParams.set('_', String(Date.now()))

  return fetch(url.toString(), {
    headers: { Zp_token: token },
    signal: AbortSignal.timeout(5000),
  }).then((r) => r.json())
}

export async function sendPublishReq(
  data: { securityId: string; encryptJobId: string },
  errorMsg?: string,
  retries = 3,
  _params = {},
) {
  if (retries === 0) {
    throw new PublishError(errorMsg ?? '重试多次失败')
  }
  const url = new URL('https://www.zhipin.com/wapi/zpgeek/friend/add.json')
  Object.entries({
    securityId: data.securityId,
    jobId: data.encryptJobId,
    ..._params,
  }).forEach(([key, value]) => url.searchParams.append(key, String(value)))

  const token = window?.Cookie.get('bst')
  if (!token) {
    toast.add({
      title: '没有获取到token,请刷新重试',
      color: 'error',
    })
    throw new PublishError('没有获取到token')
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Zp_token: token },
    }).then((r) => r.json())

    // BOSS API 返回扁平结构 { code, message, zpData }，非嵌套的 { data: { code, ... } }
    // 注意: 之前代码写的是 res.data.code，与 API 返回结构不匹配，导致 TypeError 投递必失败
    if (res.code !== 0) {
      const content = String(
        res?.zpData?.bizData?.chatRemindDialog?.content || res.message || '未知错误',
      )
      // 命中限额弹窗 → 立刻发送确认请求
      if (content.includes('您今天已与120位BOSS沟通')) {
        try {
          const url = new URL('https://www.zhipin.com/wapi/zpCommon/actionLog/geek/chatremind.json')
          url.searchParams.set('ba', res.zpData.bizData.chatRemindDialog.ba)
          url.searchParams.set('action', 'addf-limit-popup-c')
          await fetch(url, {
            method: 'POST',
            headers: { Zp_token: token },
          })

          return sendPublishReq(data, undefined, retries, { cid: 1 })
        } catch (e) {
          logger.error('尝试确认投递限制失败', e)
          throw new PublishError(`投递限制确认失败]${content}`)
        }
      } else if (content.includes('您今天已与150位BOSS沟通')) {
        throw new LimitError(content)
      } else if (content.includes('操作过于频繁')) {
        throw new RateLimitError(content)
      }

      throw new PublishError(content)
    }
    return res
  } catch (e: any) {
    if (e instanceof BossHelperError) {
      throw e
    }
    return sendPublishReq(data, e?.message as string, retries - 1)
  }
}

export async function requestBossData(
  job: { encryptUserId: string; securityId: string },
  errorMsg?: string,
  retries = 3,
  // 遇到"非好友关系"时的重试间隔（毫秒），投递后 BOSS 后端需要时间建立好友关系
  // 之前没有此等待，3 次重试瞬间全失败，招呼语因此无法发送
  delayMs = 2000,
): Promise<BossZpBossData> {
  if (retries === 0) {
    throw new GreetError(errorMsg ?? '重试多次失败')
  }
  const url = 'https://www.zhipin.com/wapi/zpchat/geek/getBossData'
  const token = window?.Cookie.get('bst')
  if (!token) {
    toast.add({
      title: '没有获取到token,请刷新重试',
      color: 'error',
    })
    throw new GreetError('没有获取到token')
  }
  try {
    const body = new FormData()
    body.append('bossId', job.encryptUserId)
    body.append('securityId', job.securityId)
    body.append('bossSrc', '0')

    const res: {
      code: number
      message: string
      zpData: BossZpBossData
    } = await fetch(url, {
      body: body,
      method: 'POST',
      headers: { Zp_token: token },
    }).then((r) => r.json())

    if (res.code !== 0) {
      if (res.message === '非好友关系') {
        // 投递后后端可能需要时间建立好友关系, 等待后重试
        await new Promise((r) => setTimeout(r, delayMs))
        return await requestBossData(job, '非好友关系', retries - 1, delayMs)
      }
      throw new GreetError(`状态错误:${res.message}`)
    }
    return res.zpData
  } catch (e: any) {
    if (e instanceof GreetError) {
      throw e
    }
    return requestBossData(job, e?.message as string, retries - 1, delayMs)
  }
}
