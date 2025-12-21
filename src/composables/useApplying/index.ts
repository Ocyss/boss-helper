import type { Handler, Pipeline, Step } from './type'
import type { JobStatus } from '@/stores/jobs'
import type { PipelineCacheItem, ProcessorType } from '@/types/pipelineCache'
import { PipelineCacheManager } from '@/composables/usePipelineCache'
import { JobAddressError, UnknownError } from '@/types/deliverError'
import { amapDistance, amapGeocode } from '@/utils/amap'
import { logger } from '@/utils/logger'
import { handles } from './handles'

export * from './utils'

// 全局缓存管理器实例
let cacheManager: PipelineCacheManager | null = null

function compilePipeline(pipeline: Pipeline, isNested = false): {
  before: Handler[]
  after: Handler[]
} {
  const result: {
    before: Handler[]
    after: Handler[]
  } = {
    before: [],
    after: [],
  }
  let guard: Step | undefined
  if (isNested) {
    const first = pipeline.shift()
    if (Array.isArray(first)) {
      throw new TypeError('PipelineGroup 第一项不能是数组')
    }
    guard = first
  }
  for (const h of pipeline) {
    if (h == null) {
      continue
    }
    if (Array.isArray(h)) {
      const { before, after } = compilePipeline(h, true)
      result.before.push(...before)
      result.after.push(...after)
    }
    else if (typeof h === 'function') {
      result.before.push(h)
    }
    else {
      h.fn && result.before.push(h.fn)
      h.after && result.after.push(h.after)
    }
  }
  if (guard) {
    if (typeof guard === 'function') {
      result.before.length > 0 && result.before.unshift(guard)
    }
    else {
      result.before.length > 0 && guard.fn && result.before.unshift(guard.fn)
      result.after.length > 0 && guard.after && result.after.unshift(guard.after)
    }
  }
  return result
}

export async function createHandle(): Promise<{
  before: Handler[]
  after: Handler[]
}> {
  const h = handles()
  const pipeline: Pipeline = [
    h.communicated(), // 已沟通过滤
    h.SameCompanyFilter(), // 相同公司过滤
    h.SameHrFilter(), // 相同hr过滤
    h.jobTitle(), // 岗位名筛选
    h.company(), // 公司名筛选
    h.salaryRange(), // 薪资筛选
    h.companySizeRange(), // 公司规模筛选
    h.goldHunterFilter(), // 猎头过滤
    [
      // Card卡片信息获取
      async (args) => {
        if (args.data.card == null) {
          if (await args.data.getCard() == null) {
            throw new UnknownError('Card 信息获取失败')
          }
        }
      },
      h.activityFilter(), // 活跃度过滤
      h.hrPosition(), // Hr职位筛选
      h.jobAddress(), // 工作地址筛选
      h.jobFriendStatus(), // 好友状态过滤
      h.jobContent(), // 工作内容筛选
      [
        // 高德地图
        async (args, ctx) => {
          ctx.amap ??= {}
          try {
            ctx.amap.geocode = await amapGeocode(args.data.card?.address ?? '')
            if (!ctx.amap.geocode?.location) {
              throw new JobAddressError('未获取到地址经纬度')
            }
            ctx.amap.distance = await amapDistance(ctx.amap.geocode.location)
          }
          catch (e) {
            logger.error('高德地图错误', e)
            throw new JobAddressError(`错误: ${e instanceof Error ? e.message : '未知'}`)
          }
        },
        h.amap(),
      ],
      h.aiFiltering(), // AI过滤
      h.greeting(), // 招呼语
    ],
  ]
  return compilePipeline(pipeline)
}

/**
 * 创建缓存实例
 */
export function getCacheManager(): PipelineCacheManager {
  if (!cacheManager) {
    cacheManager = new PipelineCacheManager()
  }
  return cacheManager
}

/**
 * 缓存Pipeline处理结果
 */
export async function cachePipelineResult(
  encryptJobId: string,
  jobName: string,
  brandName: string,
  status: JobStatus,
  message: string,
  processorType?: ProcessorType,
): Promise<void> {
  const cacheManager = getCacheManager()
  await cacheManager.setCacheResult(encryptJobId, jobName, brandName, status, message, processorType)
}

/**
 * 检查职位是否有有效缓存
 */
export function checkJobCache(encryptJobId: string): PipelineCacheItem | null {
  const cacheManager = getCacheManager()

  if (cacheManager.isValidCache(encryptJobId)) {
    const cached = cacheManager.getCachedResult(encryptJobId)
    return cached
  }
  return null
}
