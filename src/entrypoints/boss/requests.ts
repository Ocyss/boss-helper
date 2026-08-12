// import axios from 'axios'

import {
  GreetError,
  BossHelperError,
  LimitError,
  PublishError,
  RateLimitError,
} from '@/composables/useApplying/deliverError'
import { calculateFileMD5 } from '@/utils/file'
import { logger } from '@/utils/logger'

import type { BossZpBossData, BossZpDetailData } from './types'

// const { userInfo } = useStore()
const toast = useToast()
export const sameCompanyKey = 'local:sameCompany'
export const sameHrKey = 'local:sameHr'

function requestAbortError(signal?: AbortSignal): Error {
  return signal?.reason instanceof Error ? signal.reason : new Error('请求已取消')
}

async function waitForRequestRetry(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw requestAbortError(signal)
  const waitMs = 500 + Math.round(Math.random() * 250)
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, waitMs)
    const onAbort = () => {
      clearTimeout(timer)
      reject(requestAbortError(signal))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export async function getJobDetail(params: { securityId: string; lid?: string }): Promise<{
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
  if (params.lid) url.searchParams.set('lid', params.lid)
  url.searchParams.set('_', String(Date.now()))

  return fetch(url.toString(), {
    headers: { Zp_token: token },
    signal: AbortSignal.timeout(5000),
  }).then((r) => r.json())
}

export interface BossChatJobBaseInfo {
  jobName?: string
  brandName?: string
  companyName?: string
  salaryDesc?: string
  degreeName?: string
  experienceName?: string
  address?: string
  locationName?: string
  jobDescription?: string
  postDescription?: string
  description?: string
  encryptJobId?: string
  lid?: string
  skills?: string[]
}

export async function getChatJobBaseInfo(params: { securityId: string }): Promise<{
  code: number
  message?: string
  zpData?: BossChatJobBaseInfo
}> {
  const token = window?.Cookie.get('bst')
  if (!token) throw new Error('没有获取到 BOSS 登录态')

  const url = new URL('https://www.zhipin.com/wapi/zpjob/job/base/info')
  url.searchParams.set('securityId', params.securityId)
  return fetch(url, {
    credentials: 'include',
    headers: { Zp_token: token },
    signal: AbortSignal.timeout(5000),
  }).then((response) => response.json())
}

export async function sendPublishReq(
  data: { securityId: string; encryptJobId: string },
  _errorMsg?: string,
  retries = 2,
  _params = {},
  signal?: AbortSignal,
) {
  if (retries === 0) {
    throw new PublishError(_errorMsg ?? '重试多次失败')
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
  let res: any
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { Zp_token: token },
      signal,
    })
    res = await response.json()
  } catch (e) {
    logger.error('投递请求结果不明确，停止自动重试', e)
    throw new PublishError(
      `投递请求结果不明确，已停止自动重试；请先检查会话列表再继续${e instanceof Error && e.message ? `：${e.message}` : ''}`,
      { cause: e },
    )
  }

  try {
    res.code !== 0 && logger.error(`投递失败`, res)

    if (res.code === 1) {
      const content = String(
        res?.zpData?.bizData?.chatRemindDialog?.content || res.message || '未知错误',
      )
      // 命中限额弹窗 → 立刻发送确认请求
      if (content.includes('您今天已与120位BOSS沟通')) {
        if (retries <= 1 || 'cid' in _params) throw new PublishError(content)
        try {
          const url = new URL('https://www.zhipin.com/wapi/zpCommon/actionLog/geek/chatremind.json')
          url.searchParams.set('ba', res.zpData.bizData.chatRemindDialog.ba)
          url.searchParams.set('action', 'addf-limit-popup-c')
          const response = await fetch(url, {
            method: 'POST',
            headers: { Zp_token: token },
            signal,
          })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
        } catch (e) {
          if (e instanceof BossHelperError) throw e
          logger.error('尝试确认投递限制失败', e)
          throw new PublishError(
            `120人限制确认请求结果不明确，已停止自动重试；请先检查会话列表再继续：${content}`,
            { cause: e },
          )
        }
        await waitForRequestRetry(signal)
        // 仅保留平台明确要求的 cid=1 业务重试；其传输或解析异常不会再次发送。
        return await sendPublishReq(data, undefined, retries - 1, { cid: 1 }, signal)
      } else if (content.includes('您今天已与150位BOSS沟通')) {
        throw new LimitError(content)
      } else if (content.includes('操作过于频繁')) {
        throw new RateLimitError(content)
      }

      throw new PublishError(content)
    } else if (res.code !== 0) {
      throw new PublishError(`未知错误状态:${res.message}`)
    }
    return res
  } catch (e: any) {
    if (e instanceof BossHelperError) {
      throw e
    }
    logger.error('投递响应处理异常，停止自动重试', e)
    throw new PublishError(
      `投递响应处理异常，已停止自动重试；请先检查会话列表再继续${e?.message ? `：${e.message}` : ''}`,
      { cause: e },
    )
  }
}

export async function getBossData(
  job: { encryptUserId: string; securityId: string; bossSource?: number },
  errorMsg?: string,
  retries = 2,
  signal?: AbortSignal,
): Promise<BossZpBossData> {
  if (retries === 0) {
    throw new GreetError(errorMsg ?? '重试多次失败')
  }
  const url = 'https://www.zhipin.com/wapi/zpchat/geek/getBossData'
  // userInfo.value?.token 不相等！
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
    body.append('bossSrc', String(job.bossSource ?? 0))

    const res: {
      code: number
      message: string
      zpData: BossZpBossData
    } = await fetch(url, {
      body: body,
      method: 'POST',
      headers: { Zp_token: token },
      signal,
    }).then((r) => r.json())

    if (res.code !== 0) {
      if (res.message === '非好友关系') {
        if (retries <= 1) throw new GreetError('状态错误:非好友关系')
        await waitForRequestRetry(signal)
        return await getBossData(job, '非好友关系', retries - 1, signal)
      }
      throw new GreetError(`状态错误:${res.message}`)
    }
    return res.zpData
  } catch (e: any) {
    if (e instanceof GreetError) {
      throw e
    }
    if (signal?.aborted) throw e
    if (retries <= 1) throw new GreetError(e?.message ?? errorMsg ?? '获取Boss信息失败')
    await waitForRequestRetry(signal)
    return getBossData(job, e?.message as string, retries - 1, signal)
  }
}

export async function uploadImage(securityId: string, file: File) {
  const toast = useToast()
  const token = window?.Cookie.get('bst')
  if (!token) {
    toast.add({
      title: '没有获取到token,请刷新重试',
      color: 'error',
    })
    throw new Error('没有获取到token')
  }

  const params = new URLSearchParams()
  params.append('fileMd5', await calculateFileMD5(file))
  params.append('fileSize', file.size.toString())
  params.append('source', 'chat_file')
  params.append('securityId', securityId)

  const quickRes: {
    code: number
    message: string
    zpData?: {
      metadata: {
        width: number
        height: number
        fileSize: number
        contentMd5: string
        originFilename: string
        aigcMetadataBO: {
          label: number
          contentProducer: any
          produceID: any
          reserveCode1: any
          contentPropagator: any
          propagateID: any
          reserveCode2: any
          aigcempty: boolean
          aigcnotEmpty: boolean
        }
      }
      url: string
      relativeUrl: string
      source: string
      tinyUrl: string
      relativeTinyUrl: string
      waterUrl: any
      relativeWaterUrl: any
      flagKey: any
      fileName: any
    }
  } = await fetch('https://www.zhipin.com/wapi/zpupload/quicklyUpload', {
    headers: {
      zp_token: token,
    },
    referrer: 'https://www.zhipin.com/web/geek/chat',
    body: params,
    method: 'POST',
  }).then((res) => res.json())
  if (quickRes.code === 0 && quickRes.zpData && quickRes.zpData.url) {
    return {
      tinyImage: {
        url: quickRes.zpData.tinyUrl,
        width: 200,
        height: 118,
      },
      originImage: {
        url: quickRes.zpData.url,
        width: quickRes.zpData.metadata.width,
        height: quickRes.zpData.metadata.height,
      },
    }
  }
  const body = new FormData()
  body.append('securityId', securityId)

  body.append('source', 'chat_file')
  body.append('file', file, file.name)

  const res: {
    code: number
    message: string
    zpData: {
      metadata: {
        width: number
        height: number
        fileSize: number
        contentMd5: string
        originFilename: string
        aigcMetadataBO: {
          label: number
          contentProducer: any
          produceID: any
          reserveCode1: any
          contentPropagator: any
          propagateID: any
          reserveCode2: any
          aigcnotEmpty: boolean
          aigcempty: boolean
        }
      }
      url: string
      relativeUrl: string
      source: string
      tinyUrl: string
      relativeTinyUrl: string
      waterUrl: any
      relativeWaterUrl: any
      flagKey: any
      fileName: any
    }
  } = await fetch('https://www.zhipin.com/wapi/zpupload/image/uploadSingle', {
    headers: {
      zp_token: token,
    },
    referrer: 'https://www.zhipin.com/web/geek/chat',
    body: body,
    method: 'POST',
  }).then((res) => res.json())
  if (res.code !== 0) {
    throw new Error('上传图片失败:' + res.message)
  }
  return {
    tinyImage: {
      url: res.zpData.tinyUrl,
      width: 200,
      height: 118,
    },
    originImage: {
      url: res.zpData.url,
      width: res.zpData.metadata.width,
      height: res.zpData.metadata.height,
    },
  }
}
