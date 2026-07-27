import { JobStatus } from '@/composables/useApplying/type'

/**
 * pipeline 处理分组类型
 */
export type ProcessorType = 'aiFiltering' | 'amap' | 'basic'

/**
 * Pipeline缓存项接口
 */
export interface PipelineCacheItem {
  /** 职位唯一标识符 */
  encryptJobId: string
  /** 职位名称 */
  jobName: string
  /** 品牌名称 */
  brandName: string
  /** Pipeline执行结果状态 */
  status: JobStatus
  /** 状态描述信息 */
  message: string
  /** 过期时间戳 (毫秒) */
  expireAt: number
  /** 创建时间戳 (毫秒) */
  createdAt: number
  /** 最后访问时间戳 (毫秒) */
  lastAccessed: number
  /** 缓存命中次数 */
  hitCount: number
  /** 缓存分组 */
  processorType: ProcessorType
}

/**
 * Pipeline缓存存储结构
 */
export interface PipelineCache {
  /** 缓存映射数据 */
  data: Record<string, PipelineCacheItem>
  /** 上次清理过期数据的时间戳 */
  lastCleanup: number
}

/**
 * Pipeline缓存配置
 */
export interface PipelineCacheConfig {
  /** 缓存过期天数，默认3天 */
  expireDays?: number
  /** 清理间隔毫秒数，默认6小时 */
  cleanupInterval?: number
  /** 存储键名 */
  storageKey?: string
  /** 最大缓存数量,默认为1000 */
  maxCacheSize?: number
  /** 缓存分组配置 */
  processorConfigs?: Record<ProcessorType, { expireTime: number }>
}
