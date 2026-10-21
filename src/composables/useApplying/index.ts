import { shallowRef, ref, reactive } from 'vue'

import { PipelineCacheManager } from '@/composables/usePipelineCache'
import type { PipelineCacheItem, ProcessorType } from '@/types/pipelineCache'

import type { HelperContext } from '../useHelper'
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

  const rebuild = async () => {
    const _ctx: TaskContext<C, T, S> = {
      helper,
      now: new Date(),
      index: 0,
      log: logger.withContext({ id: 'workflow-rebuild' }),
    }
    const taskMap = new Map<string, Task<C, T, S>>()
    const _resolvedHandlers = new Map<string, any>()
    const errors = new Map<string, any>()

    const rawTasks = items.flatMap((i) =>
      (typeof i === 'function' ? [i()] : Array.isArray(i) ? i : [i]).map((task) => ({
        ...task,
        before: [...task.before],
        after: [...task.after],
      })),
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
          if (result.before) task.before = [...task.before, ...result.before]
          if (result.after) task.after = [...task.after, ...result.after]
          if (result.onEnd) {
            const onEnd = task.onEnd
            task.onEnd = async (ctx) => {
              await onEnd?.(ctx)
              await result.onEnd?.(ctx)
            }
          }
        }
      } catch (e) {
        requiredIds.add(task.id)
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
      if (!t) throw new Error(`Missing dependency: ${id}`)
      requiredIds.add(id)
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
          return `${i.label}: ${
            i.error instanceof Error ? i.error.message : JSON.stringify(i.error)
          }`
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

  const manuallyFiltered = reactive(new Set<string>())
  let busy = false
  const usedTasks = new Set<string>()
  const markFiltered = (key: string) => {
    manuallyFiltered.add(key)
    helper.jobResultMaps.set(key, {
      status: 'warn',
      msg: '手动过滤',
      id: 'manualFilter',
      isSkip: true,
    })
  }
  const isBlocked = (key: string) => status.value === 'stop' || manuallyFiltered.has(key)

  const runJob = async (
    data: WorkflowData<T, S>,
    mode: 'auto' | 'filter' | 'delivery',
    index = 0,
  ) => {
    const key = data.jobData.key
    if (isBlocked(key)) return
    const wasReady = helper.jobResultMaps.get(key)?.status === 'ready'
    data.state = stateMaps.value.get(key) ?? data.state ?? {}
    stateMaps.value.set(key, data.state)
    helper.jobMaps.set(key, data)
    helper.currentJob.value = key
    helper.statistics.todayData.value.total++
    const log = logger.withContext({ id: 'workflow-execute', job_key: key })
    const completed = new Set<string>()
    const visiting = new Set<string>()
    let delivered = false
    const runTask = async (t: Task<C, T, S>): Promise<void> => {
      if (completed.has(t.id) || isBlocked(key)) return
      if (visiting.has(t.id)) throw new Error(`Cycle: ${t.id}`)
      visiting.add(t.id)
      for (const id of t.deps) {
        const dep = pipeline.value.find((task) => task.id === id)
        if (!dep) throw new Error(`Missing dependency: ${id}`)
        if (mode === 'filter' && dep.phase === 'delivery')
          throw new Error(`Filter depends on delivery: ${id}`)
        await runTask(dep)
        if (isBlocked(key)) return
      }
      const handler = resolvedHandlers.get(t.id)
      if (handler) {
        usedTasks.add(t.id)
        helper.jobResultMaps.set(key, {
          status: t.state ?? 'running',
          msg: t.stateMsg ?? '运行中',
        })
        for (const fn of [...t.before, handler, ...t.after]) {
          if (isBlocked(key)) return
          const ctx = {
            helper,
            now: new Date(),
            index,
            log: log.withContext({ task_id: t.id }),
          }
          let res: TaskResult | void
          try {
            res = meginResults(await fn(ctx, data))
          } catch (e) {
            if (!(e instanceof DependencyMissingError)) throw e
            const dep = pipeline.value.find((task) => task.id === e.taskId)
            if (!dep || (mode === 'filter' && dep.phase === 'delivery')) throw e
            await runTask(dep)
            if (isBlocked(key)) return
            res = meginResults(await fn(ctx, data))
          }
          if (isBlocked(key)) return
          if (res) {
            res.status ??= res.isSkip ? 'warn' : undefined
            res.msg ??= t.label ?? t.id
            helper.jobResultMaps.set(
              key,
              res.status === 'success' && !res.isSkip
                ? { ...res, status: 'running', msg: '投递处理中' }
                : res,
            )
            if (res.status) {
              const stats = helper.statistics.todayData.value.tasks
              stats[t.id] ??= {}
              stats[t.id]![res.status] = (stats[t.id]![res.status] ?? 0) + 1
            }
            if (res.isSkip || res.status === 'error') throw { workflowResult: res }
          }
        }
        if (t.phase === 'delivery') delivered = true
      }
      visiting.delete(t.id)
      completed.add(t.id)
    }
    try {
      if (mode !== 'delivery' && !wasReady) {
        for (const t of pipeline.value.filter((t) => t.phase !== 'delivery')) await runTask(t)
      }
      if (isBlocked(key)) return
      if (mode === 'filter') {
        helper.jobResultMaps.set(key, { status: 'ready', msg: '待投递' })
        return
      }
      for (const t of pipeline.value.filter((t) => t.phase === 'delivery')) await runTask(t)
      if (!isBlocked(key) && !delivered) {
        helper.jobResultMaps.set(key, { status: 'ready', msg: '待投递' })
      }
      if (!isBlocked(key) && delivered) {
        helper.jobResultMaps.set(key, { status: 'success', msg: '投递成功' })
        helper.statistics.todayData.value.success++
      }
    } catch (e) {
      if (isBlocked(key)) return
      if (e && typeof e === 'object' && 'workflowResult' in e) return
      log.error('工作流任务执行失败', e)
      helper.jobResultMaps.set(key, {
        status: 'error',
        msg: '执行失败',
        reason: e instanceof Error ? e.message : String(e),
      })
    } finally {
      if (manuallyFiltered.has(key)) markFiltered(key)
      else if (status.value === 'stop')
        helper.jobResultMaps.set(key, { status: 'wait', msg: '已停止' })
    }
  }

  const withRun = async (fn: () => Promise<void>) => {
    if (busy) return false
    busy = true
    status.value = 'running'
    errorMessage.value = null
    usedTasks.clear()
    try {
      await rebuild()
      if (errorMessage.value) throw new Error(errorMessage.value)
      await fn()
      return true
    } catch (e) {
      status.value = 'error'
      errorMessage.value = e instanceof Error ? e.message : String(e)
      logger.error('工作流执行失败', e)
      return false
    } finally {
      for (const t of pipeline.value) {
        if (!usedTasks.has(t.id)) continue
        try {
          await t.onEnd?.({
            helper,
            now: new Date(),
            index: 0,
            log: logger.withContext({ id: 'workflow-end' }),
          })
        } catch (e) {
          logger.error('onEnd error', t.id, e)
        }
      }
      if (status.value === 'running') status.value = 'pending'
      busy = false
    }
  }
  const executeOne = (data: WorkflowData<T, S>, mode: 'delivery') =>
    withRun(() => runJob(data, mode))
  const execute = (data: WorkflowData<T, S>, index = 0) =>
    withRun(() => runJob(data, 'auto', index))
  const executeAll = (rawDataMap: Map<string, T>, mode: 'auto' | 'filter' = 'auto') =>
    withRun(async () => {
      const isStop = () => status.value === 'stop'
      await delay(helper.conf.formData.delayDeliveryStarts, isStop)
      while (!isStop()) {
        if (!helper.jobList.value.length) break
        for (const [index, jobData] of helper.jobList.value.entries()) {
          if (isStop()) break
          if (
            mode === 'auto' &&
            helper.statistics.todayData.value.success >= helper.conf.formData.deliveryLimit.value
          )
            return
          current.value = index + 1
          const jobStatus = helper.jobResultMaps.get(jobData.key)?.status
          if (
            manuallyFiltered.has(jobData.key) ||
            jobStatus === 'success' ||
            jobStatus === 'warn' ||
            (mode === 'filter' && jobStatus === 'ready')
          )
            continue
          const rawData = rawDataMap.get(jobData.key)
          if (!rawData) continue
          await runJob(
            { jobData, rawData, state: stateMaps.value.get(jobData.key) ?? {} },
            mode,
            index,
          )
          if (isStop()) break
          await delay(helper.conf.formData.delayDeliveryInterval, isStop)
        }
        if (isStop()) break
        if (
          mode === 'auto' &&
          helper.statistics.todayData.value.success >= helper.conf.formData.deliveryLimit.value
        )
          break
        const hasMore = await helper.loadMoreJob(
          delay(helper.conf.formData.delayDeliveryPageNext, isStop),
        )
        if (!hasMore) break
      }
    })
  const stop = () => {
    if (busy) status.value = 'stop'
  }
  const reset = () => {
    if (busy) return
    status.value = 'pending'
    helper.jobList.value.forEach((job) => {
      const v = helper.jobResultMaps.get(job.key)
      if (!v || v.status === 'success' || v.status === 'ready' || manuallyFiltered.has(job.key))
        return
      helper.jobResultMaps.set(job.key, { status: 'wait', msg: '等待中' })
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
    rebuild: async () => {
      if (busy) return
      busy = true
      try {
        await rebuild()
      } finally {
        busy = false
      }
    },
    execute,
    executeAll,
    executeOne,
    manuallyFiltered,
    markFiltered,
    stop,
    reset,
  }
}
