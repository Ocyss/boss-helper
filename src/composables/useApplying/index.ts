import { ContextLogger } from 'devlog-ui'
import { shallowRef, ref } from 'vue'

import { PipelineCacheManager } from '@/composables/usePipelineCache'
import type { PipelineCacheItem, ProcessorType } from '@/types/pipelineCache'

import { HelperContext } from '../useHelper'
import { DependencyMissingError } from './handles'
import {
  Handler,
  JobStatus,
  jobStatusList,
  Task,
  TaskContext,
  TaskPipeline,
  TaskResult,
  TaskStatus,
  WorkflowData,
} from './type'

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

    const rawTasks = items.flatMap((i) => (typeof i === 'function' ? { ...i() } : { ...i }))
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
  ) => {
    let res: TaskResult | void = undefined
    const isStop = () => status.value === 'stop'
    const handler = resolvedHandlers.get(task.id)
    if (!handler || isStop()) return

    const fns = [...task.before, handler, ...task.after]
    log = log.withContext({ task_id: task.id })

    for (const fn of fns) {
      try {
        res = meginResults(
          await fn(
            {
              helper,
              now: new Date(),
              index,
              log,
            },
            data,
          ),
        )
        if (res?.isSkip || isStop()) break
      } catch (e) {
        if (e instanceof DependencyMissingError) {
          const dep = resolvedHandlers.get(e.taskId)
          if (dep) {
            await dep(
              {
                helper,
                now: new Date(),
                index,
                log,
              },
              data,
            )
            res = meginResults(
              await fn(
                {
                  helper,
                  now: new Date(),
                  index,
                  log,
                },
                data,
              ),
            )
            if (res?.isSkip || isStop()) break
            continue
          }
        }
        throw e
      }
    }
    return res
  }

  const execute = async (data: WorkflowData<T, S>, index = 0) => {
    const isStop = () => status.value === 'stop'
    helper.statistics.todayData.value.total++
    const log = logger.withContext({
      id: 'workflow-execute',
      job_key: data.jobData.key,
      job_name: data.jobData.jobName,
    })
    try {
      let skipPipeline = false
      let errorLog = false
      let delivered = false
      for (const t of pipeline.value) {
        let res: void | TaskResult = undefined
        try {
          if (isStop()) break
          helper.jobResultMaps.set(data.jobData.key, {
            status: t.state || 'running',
            msg: t.stateMsg || '运行中',
          })
          res = await executeTask(t, data, index, log)
          if (res != null) {
            res.msg ??= t.label ?? t.id
            res.status ??= res.isSkip ? 'warn' : undefined
            if (res.isSkip) {
              skipPipeline = true
              break
            }
          }
          if (t.id === '岗位投递') delivered = true
          if (isStop()) break
        } catch (e) {
          res = {
            isSkip: true,
            status: 'error',
            reason: `任务${t.label ?? t.id}执行失败: ${e instanceof Error ? e.message : e}`,
            msg: `报错/${t.label ?? t.id}`,
          }
          log.error(`任务${t.label ?? t.id}执行失败`, e)
          skipPipeline = true
          errorLog = true
          break
        } finally {
          if (res != null) {
            helper.jobResultMaps.set(data.jobData.key, {
              ...(helper.jobResultMaps.get(data.jobData.key) ?? {}),
              ...res,
            })
            if (res.status) {
              helper.statistics.todayData.value.tasks[t.id] ??= {}
              helper.statistics.todayData.value.tasks[t.id][res.status] ??= 0
              helper.statistics.todayData.value.tasks[t.id][res.status] += 1
            }
          }
        }
      }
      if (!skipPipeline) {
        helper.jobResultMaps.set(data.jobData.key, {
          status: 'success',
          msg: '投递成功',
        })
        helper.statistics.todayData.value.success++
      } else if (!errorLog) {
        const r = helper.jobResultMaps.get(data.jobData.key)
        log.warn(`投递过滤: ${data.jobData.jobName}`, r?.msg, r?.reason)
      }
      return delivered
    } catch (e) {
      status.value = 'error'
      throw e
    }
  }

  const executeAll = async (rawDataMap: Map<string, T>) => {
    await rebuild()

    let stepMsg = ''
    errorMessage.value = null
    status.value = 'running'
    const isStop = () => status.value === 'stop'

    try {
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

        await delay(helper.conf.formData.delayDeliveryStarts, isStop)

        for (const [index, jobData] of helper.jobList.value.entries()) {
          current.value = index + 1
          if (isStop()) break
          const status = helper.jobResultMaps.get(jobData.key)?.status
          if (status === 'success' || status === 'warn') {
            continue
          }
          const data = {
            jobData,
            rawData: rawDataMap.get(jobData.key)!,
            state: stateMaps.value.get(jobData.key) || {},
          }
          helper.jobMaps.set(jobData.key, data)
          helper.currentJob.value = jobData.key
          // 整卡处理完后, 仅实际投递过的卡片等待间隔, 避免高频投递被视为脚本;
          // 被过滤跳过的卡片(相同hr/已沟通/关键词等)不等待, 立即处理下一张
          const delivered = await execute(data, index)
          if (delivered) {
            await delay(helper.conf.formData.delayDeliveryInterval, isStop)
          }
        }
        if (isStop()) break
        const hasMore = await helper.loadMoreJob(
          delay(helper.conf.formData.delayDeliveryPageNext, isStop),
        )
        if (!hasMore) {
          status.value = 'stop'
          stepMsg = '投递结束, 无法继续下一页'
          break
        }
      }
    } catch (e) {
      logger.error('投递未知错误', e)
      stepMsg = `未知错误: ${e}`
    } finally {
      if (!stepMsg) {
        stepMsg = '投递结束'
        status.value = 'pending'
      } else if (status.value !== 'stop') {
        status.value = 'error'
        errorMessage.value = stepMsg
      }
      helper.notification(stepMsg)

      const now = new Date()
      for (const t of pipeline.value) {
        try {
          await t.onEnd?.({
            now,
            helper,
            index: 0,
            log: logger.withContext({ id: 'workflow-end' }),
          })
        } catch (e) {
          logger.error('onEnd error', t.id, e)
        }
      }
    }
  }

  const stop = () => (status.value = 'stop')
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
