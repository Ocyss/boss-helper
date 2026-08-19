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
import { persistLog } from '@/utils/persistentLogs'

import type { BossZpBossData, BossZpDetailData } from './types'

// const { userInfo } = useStore()
const toast = useToast()
export const sameCompanyKey = 'local:sameCompany'
export const sameHrKey = 'local:sameHr'

export async function getJobDetail(params: { securityId: string; lid: string }): Promise<{
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

    if (res.code !== 0) {
      logger.error(`投递失败`, res)
      await persistLog({
        level: 'error',
        title: '投递接口返回失败响应',
        message: res.message,
        job: {
          key: `boss::${data.encryptJobId}`,
          name: data.encryptJobId,
        },
        data: { request: data, response: res, retriesRemaining: retries },
      })
    }

    if (res.code === 1) {
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
    } else if (res.code !== 0) {
      throw new PublishError(`未知错误状态:${res.message}`)
    }
    return res
  } catch (e: any) {
    if (e instanceof BossHelperError) {
      throw e
    }
    await persistLog({
      level: 'warn',
      title: '投递请求异常，准备重试',
      message: e?.message ?? String(e),
      job: {
        key: `boss::${data.encryptJobId}`,
        name: data.encryptJobId,
      },
      data: { request: data, error: e, retriesRemaining: retries },
    })
    return sendPublishReq(data, e?.message as string, retries - 1)
  }
}

export async function getBossData(
  job: { encryptUserId: string; securityId: string },
  errorMsg?: string,
  retries = 3,
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
        return await getBossData(job, '非好友关系', retries - 1)
      }
      throw new GreetError(`状态错误:${res.message}`)
    }
    return res.zpData
  } catch (e: any) {
    if (e instanceof GreetError) {
      throw e
    }
    return getBossData(job, e?.message as string, retries - 1)
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
