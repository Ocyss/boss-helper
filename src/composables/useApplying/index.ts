import type { ContextLogger } from 'devlog-ui'
import { shallowRef, ref } from 'vue'

import { PipelineCacheManager } from '@/composables/usePipelineCache'
import type { PipelineCacheItem, ProcessorType } from '@/types/pipelineCache'

import type { HelperContext } from '../useHelper'
import { LimitError, RateLimitError } from './deliverError'
import { DependencyMissingError } from './handles'
import type {
  Handler,
  JobStatus,
  Task,
  TaskContext,
  TaskPipeline,
  TaskResult,
  TaskStatus,
  WorkflowData,
} from './type'
import { jobStatusList } from './type'

// 全局缓存管理器实例
let cacheManager: PipelineCacheManager | null = null

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
  key: string,
  jobName: string,
  brandName: string,
  status: JobStatus,
  message: string,
  processorType?: ProcessorType,
): Promise<void> {
  const cacheManager = getCacheManager()
  await cacheManager.setCacheResult(key, jobName, brandName, status, message, processorType)
}

/**
 * 检查职位是否有有效缓存
 */
export function checkJobCache(key: string): PipelineCacheItem | null {
  const cacheManager = getCacheManager()

  if (cacheManager.isValidCache(key)) {
    const cached = cacheManager.getCachedResult(key)
    return cached
  }
  return null
}

export type DeliveryWorkflow<C extends HelperContext<C, T, S>, T, S> = Awaited<
  ReturnType<typeof useDeliveryWorkflow<C, T, S>>
>

function meginResults(res: void | TaskResult | Array<TaskResult | void>): TaskResult | void {
  if (!res) return
  if (Array.isArray(res)) {
    if (res.length === 0) return
    return res.reduce((acc: TaskResult, r) => {
      if (!r) return acc
      let mergedStatus = acc.status
      if (r.status) {
        const accStatusIndex = jobStatusList.indexOf(acc.status as any) ?? -1
        const rStatusIndex = jobStatusList.indexOf(r.status)
        if (rStatusIndex > accStatusIndex) {
          mergedStatus = r.status
        }
      }
      return {
        id: acc.id || r.id,
        isSkip: acc.isSkip || r.isSkip,
        reason: [acc.reason, r.reason].filter(Boolean).join('\n') || undefined,
        status: mergedStatus,
        msg: [acc.msg, r.msg].filter(Boolean).join('\n') || undefined,
        isCache: acc.isCache || r.isCache,
      }
    }, res[0] ?? {})
  }
  return res
}

const PIPELINE_QUEUE_CAPACITY = 10
const PREPARED_TTL_MS = 10 * 60_000

function randomDelaySeconds(min: number, max: number): number {
  const normalizedMin = Math.max(0, Math.floor(Number.isFinite(min) ? min : 0))
  const normalizedMax = Math.max(
    normalizedMin,
    Math.floor(Number.isFinite(max) ? max : normalizedMin),
  )
  return normalizedMin + Math.floor(Math.random() * (normalizedMax - normalizedMin + 1))
}

class WorkflowCancelledError extends Error {}
class PreparedStaleError extends Error {}

class Semaphore {
  private active = 0
  private readonly waiters: Array<() => void> = []

  constructor(private readonly limit: number) {}

  async run<T>(fn: () => Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) throw new WorkflowCancelledError('任务已取消')
    while (this.active >= this.limit) {
      if (signal.aborted) throw new WorkflowCancelledError('任务已取消')
      await new Promise<void>((resolve, reject) => {
        const wake = () => {
          signal.removeEventListener('abort', onAbort)
          resolve()
        }
        const onAbort = () => {
          signal.removeEventListener('abort', onAbort)
          const index = this.waiters.indexOf(wake)
          if (index >= 0) this.waiters.splice(index, 1)
          reject(new WorkflowCancelledError('任务已取消'))
        }
        signal.addEventListener('abort', onAbort, { once: true })
        this.waiters.push(wake)
      })
    }
    if (signal.aborted) throw new WorkflowCancelledError('任务已取消')
    this.active++
    try {
      return await fn()
    } finally {
      this.active--
      this.waiters.shift()?.()
    }
  }
}

function waitForRetry(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new WorkflowCancelledError('任务已取消'))
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new WorkflowCancelledError('任务已取消'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function hashSnapshot(value: unknown): string {
  let raw: string
  try {
    raw = JSON.stringify(value) ?? String(value)
  } catch {
    raw = String(value)
  }
  let hashA = 0x811c9dc5
  let hashB = 0x9e3779b9
  for (let index = 0; index < raw.length; index++) {
    const char = raw.charCodeAt(index)
    hashA = Math.imul(hashA ^ char, 0x01000193)
    hashB = Math.imul(hashB ^ char, 0x85ebca6b)
  }
  return `${(hashA >>> 0).toString(36)}-${(hashB >>> 0).toString(36)}`
}

function getJobSnapshot<T, S>(data: WorkflowData<T, S>): string {
  const item = (data.rawData as any)?.jobitem
  return hashSnapshot({
    key: data.jobData.key,
    securityId: item?.securityId ?? '',
    encryptJobId: item?.encryptJobId ?? '',
    encryptBossId: item?.encryptBossId ?? '',
  })
}

export async function useDeliveryWorkflow<C extends HelperContext<C, T, S>, T, S>(
  items: Array<Task<C, T, S> | TaskPipeline<C, T, S> | (() => Task<C, T, S>)>,
  helper: C,
) {
  const status = ref<'pending' | 'running' | 'stop' | 'error'>('pending')
  const current = ref(0)
  const total = computed(() => helper.jobList.value.length)
  const errorMessage = ref<string | null>(null)
  const pipeline = shallowRef<Task<C, T, S>[]>([])
  const nodes = shallowRef<
    Array<{
      id: string
      label: string
      status: TaskStatus
      deps: string[]
      error?: any
    }>
  >([])
  const stateMaps = ref(new Map<string, any>())
  const resolvedHandlers = new Map<string, Handler<C, T, S>>()
  const detailSemaphore = new Semaphore(1)
  const aiSemaphore = new Semaphore(PIPELINE_QUEUE_CAPACITY)
  const commitSemaphore = new Semaphore(1)
  let executeAllActive = false
  let executeActive = false
  let activeRunId = 0
  let activeController: AbortController | null = null
  let activePageSignature = ''
  let hasReadJobInRun = false

  type RunContext = {
    runId: number
    signal: AbortSignal
    pageSignature: string
    configFingerprint: string
  }

  type PreparedItem = {
    data: WorkflowData<T, S>
    index: number
    runId: number
    preparedAt: number
    expiresAt: number
    configFingerprint: string
    jobSnapshot: string
  }

  type PreparationSeed = {
    data: WorkflowData<T, S>
    index: number
    beforeConfig: string
    beforeJob: string
  }

  const currentPageSignature = () => hashSnapshot(helper.jobList.value.map((job) => job.key))
  const currentConfigFingerprint = () =>
    hashSnapshot({
      formData: helper.conf.formData,
      models: helper.models.modelData.value,
    })
  const withAccountDeliveryLock = async (
    onUnavailable: () => void | Promise<void>,
    task: () => Promise<void>,
  ): Promise<void> => {
    type BrowserLockManager = {
      request(
        name: string,
        options: { mode: 'exclusive'; ifAvailable: true },
        callback: (lock: object | null) => Promise<void>,
      ): Promise<void>
    }
    const lockManager =
      typeof navigator === 'undefined'
        ? undefined
        : (navigator as Navigator & { locks?: BrowserLockManager }).locks
    if (!lockManager) {
      logger.warn('当前浏览器不支持 Web Locks，跨标签页投递互斥已降级为当前实例互斥')
      return task()
    }

    const accountKey = hashSnapshot(helper.uid || 'unknown-account')
    return lockManager.request(
      `boss-helper:delivery:${accountKey}`,
      { mode: 'exclusive', ifAvailable: true },
      async (lock) => {
        if (lock) await task()
        else await onUnavailable()
      },
    )
  }
  const invalidateActiveRun = (reason: string) => {
    activeRunId++
    activeController?.abort(reason)
    activeController = null
    activePageSignature = ''
    hasReadJobInRun = false
  }
  const startPageRun = (rebuildFingerprint?: string): RunContext => {
    const configFingerprint = currentConfigFingerprint()
    if (rebuildFingerprint && configFingerprint !== rebuildFingerprint) {
      throw new WorkflowCancelledError('投递配置已变化，请重新点击开始以重建流程')
    }
    invalidateActiveRun('开始新一页准备')
    activeController = new AbortController()
    activePageSignature = currentPageSignature()
    return {
      runId: activeRunId,
      signal: activeController.signal,
      pageSignature: activePageSignature,
      configFingerprint,
    }
  }
  const assertRunActive = (run: RunContext) => {
    const pageChanged = Boolean(run.pageSignature && currentPageSignature() !== run.pageSignature)
    const configChanged = currentConfigFingerprint() !== run.configFingerprint
    if (
      run.signal.aborted ||
      run.runId !== activeRunId ||
      status.value !== 'running' ||
      pageChanged ||
      configChanged
    ) {
      if (!run.signal.aborted && (pageChanged || configChanged)) {
        invalidateActiveRun(pageChanged ? '页面岗位已变化' : '投递配置已变化')
      }
      const signalReason = typeof run.signal.reason === 'string' ? run.signal.reason : ''
      throw new WorkflowCancelledError(
        pageChanged
          ? '页面岗位已变化，已停止本轮投递'
          : configChanged
            ? '投递配置已变化，请重新点击开始以重建流程'
            : signalReason || '准备结果已失效',
      )
    }
  }

  const rebuild = async () => {
    const _ctx: TaskContext<C, T, S> = {
      helper,
      now: new Date(),
      index: 0,
      log: logger.withContext({ id: 'workflow-rebuild' }),
      runId: activeRunId,
      signal: new AbortController().signal,
    }
    const taskMap = new Map<string, Task<C, T, S>>()
    const _resolvedHandlers = new Map<string, any>()
    const errors = new Map<string, any>()

    const rawTasks = items.flatMap((i) =>
      typeof i === 'function' ? { ...i() } : Array.isArray(i) ? i : { ...i },
    )
    const requiredIds = new Set<string>()
    for (const task of rawTasks) {
      try {
        taskMap.set(task.id, task)
        const result = await task.task(_ctx)
        if (!result) continue

        requiredIds.add(task.id)
        task.deps.forEach((d) => requiredIds.add(d))

        if (typeof result === 'function') {
          _resolvedHandlers.set(task.id, result)
        } else {
          _resolvedHandlers.set(task.id, result.fn)
          if (result.before) task.before.push(...result.before)
          if (result.after) task.after.push(...result.after)
        }
      } catch (e) {
        errors.set(`${task.id}::${task.label}`, e)
        _resolvedHandlers.set(task.id, async () => {
          throw e
        })
      }
    }

    const _pipeline: Task<C, T, S>[] = []
    const visited = new Set<string>()
    const stack = new Set<string>()
    const sort = (id: string) => {
      if (stack.has(id)) throw new Error(`Cycle: ${id}`)
      if (visited.has(id)) return
      const t = taskMap.get(id)
      if (!t || !requiredIds.has(id)) return
      stack.add(id)
      t.deps.forEach(sort)
      stack.delete(id)
      visited.add(id)
      _pipeline.push(t)
    }
    Array.from(requiredIds).forEach(sort)

    pipeline.value = _pipeline
    resolvedHandlers.clear()
    _resolvedHandlers.forEach((v, k) => resolvedHandlers.set(k, v))

    nodes.value = rawTasks.map((t) => {
      const isLastDefinition = taskMap.get(t.id)?.task === t.task
      const isResolved = _resolvedHandlers.has(t.id)
      const error = errors.get(`${t.id}::${t.label}`)
      let nStatus: TaskStatus = 'disabled'
      if (!isLastDefinition) nStatus = 'shadowed'
      else if (error) nStatus = 'failed'
      else if (isResolved) nStatus = 'active'
      else if (requiredIds.has(t.id)) nStatus = 'dependency_only'

      return {
        id: t.id,
        label: t.label || t.id,
        status: nStatus,
        deps: t.deps,
        error,
      }
    })
    const errMsg = nodes.value
      .map((i) => {
        if (i.error) {
          return `${i.label}: ${i.error instanceof Error ? i.error.message : JSON.stringify(i.error)}`
        }
      })
      .filter(Boolean)
      .join('\n')
    if (errMsg) {
      logger.error('工作流构建错误, 请检查配置:', errMsg)
      alert(`工作流构建错误, 请检查配置:\n${errMsg}`)
      errorMessage.value = errMsg
    } else {
      logger.debug('Pipeline rebuilt', jsonClone(pipeline.value))
    }
  }

  const executeTask = async (
    task: Task<C, T, S>,
    data: WorkflowData<T, S>,
    index: number,
    log: ContextLogger,
    run: RunContext,
  ) => {
    const invoke = async () => {
      let res: TaskResult | void = undefined
      const handler = resolvedHandlers.get(task.id)
      if (!handler) return

      const fns = [...task.before, handler, ...task.after]
      const taskLog = log.withContext({ task_id: task.id })
      for (const fn of fns) {
        assertRunActive(run)
        try {
          res = meginResults(
            await fn(
              {
                helper,
                now: new Date(),
                index,
                log: taskLog,
                runId: run.runId,
                signal: run.signal,
              },
              data,
            ),
          )
          assertRunActive(run)
          if (res?.isSkip) break
        } catch (e) {
          if (e instanceof DependencyMissingError) {
            const dep = resolvedHandlers.get(e.taskId)
            if (dep) {
              await dep(
                {
                  helper,
                  now: new Date(),
                  index,
                  log: taskLog,
                  runId: run.runId,
                  signal: run.signal,
                },
                data,
              )
              res = meginResults(
                await fn(
                  {
                    helper,
                    now: new Date(),
                    index,
                    log: taskLog,
                    runId: run.runId,
                    signal: run.signal,
                  },
                  data,
                ),
              )
              assertRunActive(run)
              if (res?.isSkip) break
              continue
            }
          }
          throw e
        }
      }
      return res
    }

    const withRetry = async (maxRetries: number) => {
      for (let attempt = 0; ; attempt++) {
        try {
          return await invoke()
        } catch (e) {
          if (
            e instanceof WorkflowCancelledError ||
            e instanceof RateLimitError ||
            e instanceof LimitError ||
            attempt >= maxRetries
          ) {
            throw e
          }
          await waitForRetry(500 * 2 ** attempt + Math.round(Math.random() * 250), run.signal)
        }
      }
    }

    if (task.concurrency === 'boss-detail') {
      return detailSemaphore.run(async () => {
        if (hasReadJobInRun) {
          const readDelay = randomDelaySeconds(
            helper.conf.formData.delayJobReadIntervalMin,
            helper.conf.formData.delayJobReadIntervalMax,
          )
          helper.jobResultMaps.set(data.jobData.key, {
            status: 'request',
            msg: `${readDelay} 秒后读取 JD`,
          })
          await waitForRetry(readDelay * 1000, run.signal)
          assertRunActive(run)
        }
        hasReadJobInRun = true
        return withRetry(1)
      }, run.signal)
    }
    if (task.concurrency === 'ai') {
      return aiSemaphore.run(() => withRetry(2), run.signal)
    }
    return invoke()
  }

  type ExecutionOutcome = 'completed' | 'skipped' | 'failed'

  const executeTasks = async (
    tasks: Task<C, T, S>[],
    data: WorkflowData<T, S>,
    index: number,
    run: RunContext,
  ): Promise<ExecutionOutcome> => {
    const log = logger.withContext({
      id: 'workflow-execute',
      job_key: data.jobData.key,
      job_name: data.jobData.jobName,
    })
    for (const task of tasks) {
      let result: void | TaskResult
      try {
        assertRunActive(run)
        helper.jobResultMaps.set(data.jobData.key, {
          status: task.state || 'running',
          msg: task.stateMsg || '运行中',
        })
        result = await executeTask(task, data, index, log, run)
        if (result != null) {
          result.msg ??= task.label ?? task.id
          result.status ??= result.isSkip ? 'warn' : undefined
        }
      } catch (e) {
        if (e instanceof RateLimitError || e instanceof LimitError) throw e
        if (e instanceof WorkflowCancelledError) throw e
        if (run.signal.aborted) {
          throw new WorkflowCancelledError(
            typeof run.signal.reason === 'string' ? run.signal.reason : '准备结果已失效',
          )
        }
        result = {
          isSkip: true,
          status: 'error',
          reason: `任务${task.label ?? task.id}执行失败: ${e instanceof Error ? e.message : JSON.stringify(e)}`,
          msg: `报错/${task.label ?? task.id}`,
        }
        log.error(`任务${task.label ?? task.id}执行失败`, e)
      }

      if (result != null) {
        helper.jobResultMaps.set(data.jobData.key, {
          ...(helper.jobResultMaps.get(data.jobData.key) ?? {}),
          ...result,
        })
        if (result.status) {
          helper.statistics.todayData.value.tasks[task.id] ??= {}
          helper.statistics.todayData.value.tasks[task.id]![result.status] ??= 0
          helper.statistics.todayData.value.tasks[task.id]![result.status]! += 1
        }
        if (result.isSkip) {
          if (result.status !== 'error') {
            log.warn(`投递过滤: ${data.jobData.jobName}`, result.msg, result.reason)
          }
          return result.status === 'error' ? 'failed' : 'skipped'
        }
      }
    }
    return 'completed'
  }

  const startPreparation = (data: WorkflowData<T, S>, index: number): PreparationSeed => {
    helper.statistics.todayData.value.total++
    return {
      data,
      index,
      beforeConfig: currentConfigFingerprint(),
      beforeJob: getJobSnapshot(data),
    }
  }

  const finishPreparation = (seed: PreparationSeed, run: RunContext): PreparedItem | null => {
    const { data, index, beforeConfig, beforeJob } = seed
    assertRunActive(run)
    if (beforeConfig !== currentConfigFingerprint() || beforeJob !== getJobSnapshot(data)) {
      helper.jobResultMaps.set(data.jobData.key, {
        status: 'warn',
        msg: '准备结果失效',
        reason: '准备期间配置或岗位安全参数发生变化',
      })
      return null
    }

    const preparedAt = Date.now()
    data.state.preparation = {
      runId: run.runId,
      preparedAt,
      expiresAt: preparedAt + PREPARED_TTL_MS,
      configFingerprint: beforeConfig,
      jobSnapshot: beforeJob,
    }
    helper.jobResultMaps.set(data.jobData.key, {
      status: 'wait',
      msg: '准备完成，已进入串行投递队列',
    })
    return {
      data,
      index,
      runId: run.runId,
      preparedAt,
      expiresAt: preparedAt + PREPARED_TTL_MS,
      configFingerprint: beforeConfig,
      jobSnapshot: beforeJob,
    }
  }

  const prepareJob = async (
    data: WorkflowData<T, S>,
    index: number,
    run: RunContext,
  ): Promise<PreparedItem | null> => {
    const seed = startPreparation(data, index)
    const outcome = await executeTasks(
      pipeline.value.filter((task) => task.phase === 'prepare'),
      data,
      index,
      run,
    )
    return outcome === 'completed' ? finishPreparation(seed, run) : null
  }

  const readJobIntoProcessingQueue = async (
    data: WorkflowData<T, S>,
    index: number,
    run: RunContext,
  ): Promise<{ seed: PreparationSeed; tasks: Task<C, T, S>[] } | null> => {
    const prepareTasks = pipeline.value.filter((task) => task.phase === 'prepare')
    const detailTaskIndex = prepareTasks.findIndex((task) => task.concurrency === 'boss-detail')
    if (detailTaskIndex < 0) {
      throw new Error('工作流缺少串行岗位详情读取任务')
    }

    const seed = startPreparation(data, index)
    const outcome = await executeTasks(prepareTasks.slice(0, detailTaskIndex + 1), data, index, run)
    if (outcome !== 'completed') return null

    helper.jobResultMaps.set(data.jobData.key, {
      status: 'wait',
      msg: 'JD 已读取，进入并发处理队列',
    })
    return {
      seed,
      tasks: prepareTasks.slice(detailTaskIndex + 1),
    }
  }

  const processQueuedJob = async (
    queued: { seed: PreparationSeed; tasks: Task<C, T, S>[] },
    run: RunContext,
  ): Promise<PreparedItem | null> => {
    const { seed, tasks } = queued
    const outcome = await executeTasks(tasks, seed.data, seed.index, run)
    return outcome === 'completed' ? finishPreparation(seed, run) : null
  }

  const assertDeliveryLimit = () => {
    const limit = Number(helper.conf.formData.deliveryLimit.value)
    if (Number.isFinite(limit) && limit > 0 && helper.statistics.todayData.value.success >= limit) {
      throw new LimitError(`已达到设定投递上限 ${limit}`)
    }
  }

  const validatePrepared = (item: PreparedItem, rawDataMap: Map<string, T>, run: RunContext) => {
    assertRunActive(run)
    if (item.runId !== run.runId || item.expiresAt < Date.now()) {
      throw new PreparedStaleError('准备结果已过期')
    }
    if (item.configFingerprint !== currentConfigFingerprint()) {
      throw new PreparedStaleError('配置已变化，准备结果已作废')
    }
    const currentRawData = rawDataMap.get(item.data.jobData.key)
    if (!currentRawData) throw new PreparedStaleError('岗位已不在当前页面')
    const currentData = { ...item.data, rawData: currentRawData }
    if (item.jobSnapshot !== getJobSnapshot(currentData)) {
      throw new PreparedStaleError('岗位安全参数已变化')
    }
    if (!helper.jobList.value.some((job) => job.key === item.data.jobData.key)) {
      throw new PreparedStaleError('岗位已不在当前页面')
    }

    const delivery = item.data.state.delivery
    if (delivery?.friendAdded) return
    if (!delivery?.friendAdded && (currentRawData as any)?.jobitem?.contact) {
      throw new PreparedStaleError('岗位已沟通')
    }
    assertDeliveryLimit()
  }

  const commitPrepared = async (
    item: PreparedItem,
    rawDataMap: Map<string, T>,
    run: RunContext,
  ) => {
    return commitSemaphore.run(async () => {
      const isPreparedValid = () => {
        try {
          validatePrepared(item, rawDataMap, run)
          return true
        } catch (e) {
          if (e instanceof LimitError) throw e
          if (e instanceof WorkflowCancelledError) throw e
          helper.jobResultMaps.set(item.data.jobData.key, {
            status: 'warn',
            msg: '准备结果失效',
            reason: e instanceof Error ? e.message : String(e),
          })
          return false
        }
      }
      if (!isPreparedValid()) return

      const deliveryDelay = randomDelaySeconds(
        helper.conf.formData.delayDeliveryInterval,
        helper.conf.formData.delayDeliveryIntervalMax,
      )
      helper.jobResultMaps.set(item.data.jobData.key, {
        status: 'wait',
        msg: `准备完成，${deliveryDelay} 秒后串行投递`,
      })
      await waitForRetry(deliveryDelay * 1000, run.signal)
      assertRunActive(run)
      // 等待期间岗位、配置或投递上限可能变化，发送前必须重新复验。
      if (!isPreparedValid()) return

      // 流式准备可能乱序完成，进度只允许向前推进。
      current.value = Math.max(current.value, item.index + 1)
      helper.currentJob.value = item.data.jobData.key
      let outcome: ExecutionOutcome = 'failed'
      let cancellation: WorkflowCancelledError | null = null
      try {
        outcome = await executeTasks(
          pipeline.value.filter((task) => task.phase === 'commit'),
          item.data,
          item.index,
          run,
        )
      } catch (e) {
        if (e instanceof WorkflowCancelledError && item.data.state.delivery?.friendAdded) {
          cancellation = e
        } else {
          throw e
        }
      }
      const delivery = item.data.state.delivery

      if (delivery?.friendAdded && !delivery.counted) {
        helper.statistics.todayData.value.success++
        delivery.counted = true
      }

      if (outcome === 'completed' && !cancellation) {
        if (delivery) delivery.status = 'completed'
        helper.jobResultMaps.set(item.data.jobData.key, {
          status: 'success',
          msg: '投递成功',
        })
        if (helper.conf.formData.useCache.value) {
          try {
            await cachePipelineResult(
              item.data.jobData.key,
              item.data.jobData.jobName,
              item.data.jobData.brand?.name ?? '',
              'success',
              '投递成功',
            )
          } catch (e) {
            logger.warn('写入投递成功缓存失败', e)
          }
        }
      } else if (delivery?.friendAdded) {
        delivery.status = 'partial'
        const previous = helper.jobResultMaps.get(item.data.jobData.key)
        helper.jobResultMaps.set(item.data.jobData.key, {
          status: 'error',
          msg: '部分成功',
          reason: `friend/add 已成功，不会重复投递；后续步骤失败：${cancellation?.message ?? previous?.reason ?? previous?.msg ?? '未知错误'}`,
        })
      }

      if (cancellation) throw cancellation
    }, run.signal)
  }

  const executeUnlocked = async (data: WorkflowData<T, S>, index = 0) => {
    const restoreStatus = status.value
    try {
      if (status.value !== 'running') status.value = 'running'
      const run = startPageRun()
      const prepared = await prepareJob(data, index, run)
      if (prepared) {
        await commitPrepared(prepared, new Map([[data.jobData.key, data.rawData]]), run)
      }
    } finally {
      invalidateActiveRun('单岗位执行结束')
      status.value = restoreStatus
    }
  }

  const execute = async (data: WorkflowData<T, S>, index = 0) => {
    if (executeAllActive || executeActive) {
      throw new Error('投递任务正在运行，请勿重复启动')
    }
    executeActive = true
    try {
      await withAccountDeliveryLock(
        () => {
          throw new Error('同一 BOSS 账号正在其他标签页投递，请稍后再试')
        },
        () => executeUnlocked(data, index),
      )
    } finally {
      executeActive = false
    }
  }

  const executeAllUnlocked = async (rawDataMap: Map<string, T>) => {
    let stepMsg = ''
    errorMessage.value = null
    status.value = 'running'
    const isStop = () => status.value !== 'running'
    let rebuildFingerprint = ''

    try {
      await rebuild()
      rebuildFingerprint = currentConfigFingerprint()
      while (status.value === 'running') {
        if (helper.jobList.value.length === 0) {
          stepMsg = '没有职位可投递'
          break
        }
        helper.jobList.value.forEach((job) => {
          const v = helper.jobResultMaps.get(job.key)
          if (!v) {
            helper.jobResultMaps.set(job.key, { status: 'wait', msg: '等待中' })
            return
          } else if (v.status === 'success' || v.status === 'warn') {
            return
          }
          v.status = 'wait'
          v.msg = '等待中'
          helper.jobResultMaps.set(job.key, v)
        })

        const pageFingerprintBeforeDelay = currentPageSignature()
        // 保留原有的每页启动等待，准备并行不能缩短用户配置的页面间隔。
        await delay(helper.conf.formData.delayDeliveryStarts, isStop)
        if (isStop()) break
        if (currentPageSignature() !== pageFingerprintBeforeDelay) {
          throw new WorkflowCancelledError('页面岗位已变化，已停止本轮投递')
        }
        if (currentConfigFingerprint() !== rebuildFingerprint) {
          throw new WorkflowCancelledError('投递配置已变化，请重新点击开始以重建流程')
        }

        const run = startPageRun(rebuildFingerprint)
        current.value = 0
        const pageJobs = [...helper.jobList.value]
        const processingTasks = new Set<Promise<void>>()
        const deliveryTasks = new Set<Promise<void>>()
        let pageFailure: unknown
        const recordPageFailure = (error: unknown) => {
          if (pageFailure != null) return
          pageFailure = error
          if (!run.signal.aborted) {
            activeController?.abort(error instanceof Error ? error.message : String(error))
          }
        }
        const trackTask = (set: Set<Promise<void>>, promise: Promise<void>) => {
          set.add(promise)
          void promise.then(
            () => set.delete(promise),
            () => set.delete(promise),
          )
        }
        const drainPageTasks = async () => {
          while (processingTasks.size > 0) await Promise.all([...processingTasks])
          // 处理任务结束后不会再产生新的投递任务，此时可以安全排空投递队列。
          while (deliveryTasks.size > 0) await Promise.all([...deliveryTasks])
        }
        const startDelivery = (item: PreparedItem) => {
          const promise = (async () => {
            try {
              await commitPrepared(item, rawDataMap, run)
            } catch (error) {
              recordPageFailure(error)
            }
          })()
          trackTask(deliveryTasks, promise)
        }
        const startProcessing = (queued: { seed: PreparationSeed; tasks: Task<C, T, S>[] }) => {
          const promise = (async () => {
            try {
              const item = await processQueuedJob(queued, run)
              if (item) startDelivery(item)
            } catch (error) {
              recordPageFailure(error)
            }
          })()
          trackTask(processingTasks, promise)
        }

        try {
          for (let index = 0; index < pageJobs.length && status.value === 'running'; index++) {
            while (processingTasks.size >= PIPELINE_QUEUE_CAPACITY) {
              await Promise.race(processingTasks)
              if (pageFailure != null) throw pageFailure
              assertRunActive(run)
            }

            // 达到上限后不再继续读取 JD 或消耗模型请求。
            assertDeliveryLimit()
            const jobData = pageJobs[index]!
            const previousStatus = helper.jobResultMaps.get(jobData.key)?.status
            if (previousStatus === 'success' || previousStatus === 'warn') continue
            const rawData = rawDataMap.get(jobData.key)
            if (!rawData) {
              helper.jobResultMaps.set(jobData.key, {
                status: 'error',
                msg: '岗位原始数据不存在',
              })
              continue
            }

            const state = stateMaps.value.get(jobData.key) || {}
            stateMaps.value.set(jobData.key, state)
            const data = { jobData, rawData, state }
            helper.jobMaps.set(jobData.key, data)

            // 生产者必须等当前 JD 读取完成，才会继续随机等待并读取下一个岗位。
            const queued = await readJobIntoProcessingQueue(data, index, run)
            if (queued) startProcessing(queued)
            if (pageFailure != null) throw pageFailure
          }

          await drainPageTasks()
          if (pageFailure != null) throw pageFailure
          assertRunActive(run)
        } catch (error) {
          recordPageFailure(error)
          await drainPageTasks()
          throw pageFailure ?? error
        }
        if (isStop()) break
        invalidateActiveRun('当前页处理完成')
        const pageFingerprintBeforeNext = currentPageSignature()
        const hasMore = await helper.loadMoreJob(
          delay(helper.conf.formData.delayDeliveryPageNext, isStop),
        )
        if (!hasMore) {
          status.value = 'stop'
          stepMsg = '投递结束, 无法继续下一页'
          break
        }
        if (currentConfigFingerprint() !== rebuildFingerprint) {
          throw new WorkflowCancelledError('投递配置已变化，请重新点击开始以重建流程')
        }
        if (currentPageSignature() === pageFingerprintBeforeNext) {
          throw new WorkflowCancelledError('下一页岗位未发生变化，已停止本轮投递')
        }
      }
    } catch (e) {
      if (e instanceof RateLimitError || e instanceof LimitError) {
        invalidateActiveRun(e.message)
        status.value = 'error'
        stepMsg = e.message
      } else if (e instanceof WorkflowCancelledError) {
        stepMsg = status.value === 'stop' ? '投递已暂停' : e.message || '准备结果已失效'
      } else {
        logger.error('投递未知错误', e)
        stepMsg = `未知错误: ${e instanceof Error ? e.message : JSON.stringify(e)}`
      }
    } finally {
      if (!stepMsg) {
        stepMsg = '投递结束'
        status.value = 'pending'
      } else if (status.value !== 'stop') {
        status.value = 'error'
        errorMessage.value = stepMsg
      }
      void helper.notification(stepMsg)

      const now = new Date()
      for (const t of pipeline.value) {
        try {
          const controller = new AbortController()
          await t.onEnd?.({
            now,
            helper,
            index: 0,
            log: logger.withContext({ id: 'workflow-end' }),
            runId: activeRunId,
            signal: controller.signal,
          })
        } catch (e) {
          logger.error('onEnd error', t.id, e)
        }
      }
    }
  }

  const executeAll = async (rawDataMap: Map<string, T>) => {
    if (executeAllActive || executeActive) {
      void helper.notification('投递任务正在运行，请勿重复启动')
      return
    }
    executeAllActive = true
    try {
      await withAccountDeliveryLock(
        () => {
          void helper.notification('同一 BOSS 账号正在其他标签页投递，请稍后再试')
        },
        () => executeAllUnlocked(rawDataMap),
      )
    } finally {
      executeAllActive = false
    }
  }

  const stop = () => {
    status.value = 'stop'
    invalidateActiveRun('用户暂停')
  }
  const reset = () => {
    status.value = 'pending'
    helper.jobList.value.forEach((job) => {
      const v = helper.jobResultMaps.get(job.key)
      if (!v || v.status === 'success') {
        return
      }
      v.msg = '等待中'
      v.status = 'wait'
    })
  }

  return {
    items,
    status,
    current,
    total,
    errorMessage,
    pipeline,
    nodes,
    ctx: helper,
    stateMaps,
    rebuild,
    execute,
    executeAll,
    stop,
    reset,
  }
}
