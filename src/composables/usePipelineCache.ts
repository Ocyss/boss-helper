import type { JobStatus } from '@/stores/jobs'
import type {
  PipelineCache,
  PipelineCacheConfig,
  PipelineCacheItem,
  ProcessorType,
} from '@/types/pipelineCache'
import { ElMessage } from 'element-plus'
import { ref } from 'vue'
import { counter } from '@/message'
import { jsonClone } from '@/utils/deepmerge'
import { logger } from '@/utils/logger'
// 默认处理器配置
const DEFAULT_PROCESSOR_CONFIGS: Record<ProcessorType, { expireTime: number }> = {
  aiFiltering: { expireTime: 7 * 24 * 60 * 60 * 1000 }, // 7天
  amap: { expireTime: 5 * 24 * 60 * 60 * 1000 }, // 5天
  basic: { expireTime: 3 * 24 * 60 * 60 * 1000 }, // 3天
}

/**
 * Pipeline缓存管理器
 */
export class PipelineCacheManager {
  private cache = ref<PipelineCache>({
    data: {},
    lastCleanup: Date.now(),
  })

  private config: Required<PipelineCacheConfig>

  constructor(config: PipelineCacheConfig = {}) {
    this.config = {
      expireDays: config.expireDays ?? 3,
      cleanupInterval: config.cleanupInterval ?? 6 * 60 * 60 * 1000, // 6小时
      storageKey: config.storageKey ?? 'local:pipeline-cache',
      maxCacheSize: config.maxCacheSize ?? 10000,
      processorConfigs: config.processorConfigs ?? DEFAULT_PROCESSOR_CONFIGS,
    }

    void this.initCache()
  }

  /**
   * 初始化缓存，从存储加载数据
   */
  private async initCache() {
    try {
      const cached = await counter.storageGet<PipelineCache>(this.config.storageKey)
      if (cached) {
        this.cache.value = cached
        logger.debug('缓存数据加载成功', {
          total: Object.keys(cached.data).length,
        })
      }
      // 检查是否需要清理过期数据
      await this.cleanupIfNeeded()
      await this.evictLRUIfNeeded()
    }
    catch (error) {
      logger.error('初始化缓存失败', error)
    }
  }

  /**
   * 根据消息内容推断处理器类型
   */
  private inferProcessorType(message: string): ProcessorType {
    if (message.includes('AI') || message.includes('分数')) {
      return 'aiFiltering'
    }
    if (message.includes('地址') || message.includes('距离') || message.includes('地图')) {
      return 'amap'
    }
    return 'basic'
  }

  /**
   * 检查缓存是否有效
   */
  isValidCache(encryptJobId: string): boolean {
    const item = this.cache.value.data[encryptJobId]
    if (!item)
      return false

    // 检查是否过期
    if (Date.now() > item.expireAt) {
      logger.debug('缓存已过期', { encryptJobId })
      return false
    }

    return true
  }

  /**
   * 获取缓存结果
   */
  getCachedResult(encryptJobId: string): PipelineCacheItem | null {
    const item = this.cache.value.data[encryptJobId]
    if (!item || Date.now() > item.expireAt) {
      if (item) {
        delete this.cache.value.data[encryptJobId]
        void this.saveCache()
      }
      return null
    }

    // 更新LRU信息
    item.lastAccessed = Date.now()
    item.hitCount++

    // logger.debug('当前职位缓存命中次数', {
    //   currentName: `${item.brandName} - ${item.jobName}`,
    //   count: item.hitCount,
    // })

    void this.saveCache()
    return item
  }

  /**
   * 设置缓存结果
   */
  async setCacheResult(
    encryptJobId: string,
    jobName: string,
    brandName: string,
    status: JobStatus,
    message: string,
    processorType?: ProcessorType,
  ): Promise<void> {
    if (status === 'error') {
      // 不缓存错误
      return
    }
    try {
      const now = Date.now()
      const inferredProcessorType = processorType || this.inferProcessorType(message)
      const processorConfig = this.config.processorConfigs[inferredProcessorType]
      const expireAt = now + processorConfig.expireTime

      const cacheItem: PipelineCacheItem = {
        encryptJobId,
        jobName,
        brandName,
        status,
        message,
        expireAt,
        createdAt: now,
        lastAccessed: now,
        hitCount: 0,
        processorType: inferredProcessorType,
      }

      this.cache.value.data[encryptJobId] = jsonClone(cacheItem)

      // logger.debug('缓存结果已保存', {
      //   encryptJobId,
      //   jobName,
      //   processorType: inferredProcessorType,
      // })

      await this.evictLRUIfNeeded()
      await this.saveCache()
    }
    catch (error) {
      logger.error('保存缓存结果失败', error)
    }
  }

  /**
   * 保存缓存到存储
   */
  private async saveCache(): Promise<void> {
    try {
      const cacheData = jsonClone(this.cache.value)
      await counter.storageSet(this.config.storageKey, cacheData)
    }
    catch (error) {
      logger.error('保存缓存到存储失败', error)
    }
  }

  /**
   * 清理过期数据
   */
  private async cleanupExpired(): Promise<void> {
    const now = Date.now()
    const data = this.cache.value.data
    let expiredCount = 0

    for (const [key, item] of Object.entries(data)) {
      if (now > item.expireAt) {
        delete data[key]
        expiredCount++
      }
    }

    if (expiredCount > 0) {
      this.cache.value.lastCleanup = now
      await this.saveCache()
      logger.info('清理过期缓存完成', { expiredCount })
    }
  }

  /**
   * LRU淘汰机制 - 当缓存数量超过最大限制时淘汰最少使用的缓存
   */
  private async evictLRUIfNeeded(): Promise<void> {
    const data = this.cache.value.data
    const cacheCount = Object.keys(data).length

    if (cacheCount <= this.config.maxCacheSize) {
      return
    }

    const evictCount = cacheCount - this.config.maxCacheSize
    const items = Object.values(data).sort((a, b) => a.lastAccessed - b.lastAccessed)

    for (let i = 0; i < evictCount; i++) {
      delete data[items[i].encryptJobId]
    }

    logger.info('LRU淘汰完成', { evicted: evictCount })
    await this.saveCache()
  }

  /**
   * 如果需要则清理过期数据
   */
  private async cleanupIfNeeded(): Promise<void> {
    const now = Date.now()
    if (now - this.cache.value.lastCleanup > this.config.cleanupInterval) {
      logger.debug('开始清理过期缓存')
      await this.cleanupExpired()
    }
  }

  /**
   * 清空所有缓存
   */
  async clearCache(): Promise<void> {
    this.cache.value.data = {}
    await this.saveCache()
    ElMessage.success('缓存已清空')
  }
}
