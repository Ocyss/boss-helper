import { shallowRef, ref } from 'vue'

import { PipelineCacheManager } from '@/composables/usePipelineCache'
import type { PipelineCacheItem, ProcessorType } from '@/types/pipelineCache'

import { HelperContext } from '../useHelper'
import { isFatalWorkflowError, LimitError } from './deliverError'
import { companyDuplicateKey, DependencyMissingError, hrDuplicateKey } from './handles'
import {
  Handler,
  JobStatus,
  jobStatusList,
  Task,
  TaskContext,
  TaskPipeline,
  TaskResult,
  TaskStatus,
  SimulationResult,
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
  if (!res) return {}
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

const repeatTaskIds = new Set(['已沟通', '重复沟通-相同公司', '重复沟通-相同HR'])

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
    const _ctx: TaskContext<C, T, S> = { helper, now: new Date() }
    const taskMap = new Map<string, Task<C, T, S>>()
    const _resolvedHandlers = new Map<string, any>()
    const errors = new Map<string, any>()

    const rawTasks = items.flatMap((item) => {
      const tasks = typeof item === 'function' ? [item()] : Array.isArray(item) ? item : [item]
      return tasks.map((task) => ({
        ...task,
        deps: [...task.deps],
        before: [...task.before],
        after: [...task.after],
      }))
    })
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
        errors.set(task.id, e)
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
      const error = errors.get(t.id)
      let nStatus: TaskStatus = 'disabled'
      if (error) nStatus = 'failed'
      else if (!isLastDefinition) nStatus = 'shadowed'
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
  }

  const executeTask = async (
    task: Task<C, T, S>,
    data: WorkflowData<T, S>,
    mode: 'run' | 'simulate' = 'run',
  ) => {
    let res: TaskResult | void = undefined
    const isStop = () => status.value === 'stop'
    const handler = resolvedHandlers.get(task.id)
    if (!handler || isStop()) return

    const fns = [...task.before, handler, ...task.after]
    for (const fn of fns) {
      try {
        res = meginResults(
          await fn(
            {
              helper,
              now: new Date(),
              mode,
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
                mode,
              },
              data,
            )
            res = meginResults(
              await fn(
                {
                  helper,
                  now: new Date(),
                  mode,
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

  const execute = async (data: WorkflowData<T, S>) => {
    const isStop = () => status.value === 'stop'
    const jobStartedAt = Date.now()
    helper.logs.step(data.jobData, '岗位处理', 'info', '开始处理')
    try {
      let skipPipeline = false
      for (const t of pipeline.value) {
        let res: void | TaskResult = undefined
        let taskStartedAt: number | null = null
        try {
          if (isStop()) break
          taskStartedAt = Date.now()
          helper.logs.step(data.jobData, t.label ?? t.id, 'info', '开始执行')
          helper.jobResultMaps.set(data.jobData.key, {
            status: t.state || 'running',
            msg: t.stateMsg || '运行中',
          })
          res = await executeTask(t, data)
          if (res != null) {
            res.msg ??= t.label ?? t.id
            res.status ??= res.isSkip ? 'warn' : undefined
            if (res.isSkip) {
              skipPipeline = true
              break
            }
          }
          if (isStop()) break
        } catch (e) {
          res = {
            isSkip: true,
            status: 'error',
            reason: `任务${t.label ?? t.id}执行失败: ${e instanceof Error ? e.message : String(e)}`,
            msg: `报错/${t.label ?? t.id}`,
          }
          logger.error(`任务${t.label ?? t.id}执行失败`, e)
          skipPipeline = true
          if (isFatalWorkflowError(e)) {
            throw e
          }
          break
        } finally {
          if (taskStartedAt != null) {
            const logState =
              res?.status === 'error' ? 'danger' : res?.isSkip ? 'warning' : 'success'
            helper.logs.step(
              data.jobData,
              t.label ?? t.id,
              logState,
              res?.reason ?? res?.msg ?? '执行完成',
              Date.now() - taskStartedAt,
            )
          }
          if (res != null) {
            helper.jobResultMaps.set(data.jobData.key, {
              ...(helper.jobResultMaps.get(data.jobData.key) ?? {}),
              ...res,
            })
            if (res.status) {
              helper.statistics.recordTask(data.jobData.key, t.id, res.status)

              if (t.id === '岗位投递' && res.status === 'success') {
                helper.statistics.recordSummary('success', data.jobData.key)
              }
              if (res.isSkip && repeatTaskIds.has(t.id)) {
                helper.statistics.recordSummary('repeat', data.jobData.key)
              }
              if (res.isSkip && t.id === '活跃度过滤') {
                helper.statistics.recordSummary('activityFilter', data.jobData.key)
              }
            }
          }
        }
      }
      if (!skipPipeline && !isStop()) {
        helper.jobResultMaps.set(data.jobData.key, {
          status: 'success',
          msg: '投递成功',
        })
        helper.logs.step(
          data.jobData,
          '岗位处理',
          'success',
          '全部步骤完成',
          Date.now() - jobStartedAt,
        )
      } else if (isStop()) {
        helper.jobResultMaps.set(data.jobData.key, {
          status: 'wait',
          msg: '已暂停，等待继续',
        })
        helper.logs.step(
          data.jobData,
          '岗位处理',
          'warning',
          '用户暂停，等待继续',
          Date.now() - jobStartedAt,
        )
      } else {
        const result = helper.jobResultMaps.get(data.jobData.key)
        helper.logs.step(
          data.jobData,
          '岗位处理',
          result?.status === 'error' ? 'danger' : 'warning',
          result?.reason ?? result?.msg ?? '流程提前结束',
          Date.now() - jobStartedAt,
        )
      }
    } catch (e) {
      status.value = 'error'
      helper.logs.step(
        data.jobData,
        '岗位处理',
        'danger',
        e instanceof Error ? e.message : String(e),
        Date.now() - jobStartedAt,
      )
      throw e
    } finally {
      helper.statistics.recordSummary('total', data.jobData.key)
    }
  }

  const executeAll = async (rawDataMap: Map<string, T>) => {
    await rebuild()

    let stepMsg = ''
    errorMessage.value = null
    status.value = 'running'
    const isStop = () => status.value === 'stop'
    helper.logs.info(
      '投递流程',
      `开始执行，当前页面 ${helper.jobList.value.length} 个岗位，启用 ${pipeline.value.length} 个步骤`,
    )

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
          const deliveryLimit = Math.min(helper.conf.formData.deliveryLimit.value, 150)
          if (helper.statistics.todayData.success >= deliveryLimit) {
            throw new LimitError(`已达到设置的今日沟通上限 ${deliveryLimit} 次`)
          }
          const data = {
            jobData,
            rawData: rawDataMap.get(jobData.key)!,
            state: stateMaps.value.get(jobData.key) || {},
          }
          helper.jobMaps.set(jobData.key, data)
          helper.currentJob.value = jobData.key
          await execute(data)
          await delay(helper.conf.formData.delayDeliveryInterval, isStop)
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
      logger.error(e)
      stepMsg = isFatalWorkflowError(e)
        ? `${e.name}: ${e.message}`
        : `未知错误: ${e instanceof Error ? e.message : String(e)}`
    } finally {
      if (!stepMsg) {
        stepMsg = '投递结束'
        status.value = 'pending'
      } else if (status.value !== 'stop') {
        status.value = 'error'
        errorMessage.value = stepMsg
      }
      helper.logs.info('投递流程', stepMsg)
      await helper.notification(stepMsg).catch((error) => {
        logger.error('投递结束通知失败', error)
      })
    }
  }

  const simulate = async (rawDataMap: Map<string, T>): Promise<SimulationResult> => {
    if (status.value === 'running') {
      throw new Error('投递流程运行中，无法同时模拟筛选')
    }

    await rebuild()
    const startedAt = Date.now()
    const jobs: SimulationResult['jobs'] = []
    const simulatedCompanies = new Set<string>()
    const simulatedHrs = new Set<string>()
    helper.logs.info('模拟筛选', `开始检查当前页面 ${helper.jobList.value.length} 个岗位`)

    for (const jobData of helper.jobList.value) {
      const rawData = rawDataMap.get(jobData.key)
      if (!rawData) {
        jobs.push({
          jobKey: jobData.key,
          jobName: jobData.jobName,
          status: 'failed',
          reason: '未找到岗位原始数据',
        })
        continue
      }

      const data: WorkflowData<T, S> = {
        jobData,
        rawData,
        state: {},
      }
      helper.jobMaps.set(jobData.key, data)
      helper.currentJob.value = jobData.key

      let result: SimulationResult['jobs'][number] = {
        jobKey: jobData.key,
        jobName: jobData.jobName,
        status: 'passed',
      }

      const companyKey = companyDuplicateKey(jobData)
      const hrKey = hrDuplicateKey(jobData)
      if (
        helper.conf.formData.sameCompanyFilter.value &&
        companyKey &&
        simulatedCompanies.has(companyKey)
      ) {
        result = {
          ...result,
          status: 'filtered',
          reason: `本次模拟中已有同公司岗位预计通过: ${jobData.brand.name}`,
        }
      } else if (helper.conf.formData.sameHrFilter.value && hrKey && simulatedHrs.has(hrKey)) {
        result = {
          ...result,
          status: 'filtered',
          reason: `本次模拟中已有同HR岗位预计通过: ${jobData.boss.name}`,
        }
      }
      if (result.status === 'filtered') {
        helper.logs.step(jobData, '模拟/去重过滤', 'warning', result.reason)
      }

      for (const task of result.status === 'passed' ? pipeline.value : []) {
        if (task.id === '岗位投递') break

        const taskStartedAt = Date.now()
        let taskResult: TaskResult | void
        helper.logs.step(jobData, `模拟/${task.label ?? task.id}`, 'info', '开始执行')
        try {
          taskResult = await executeTask(task, data, 'simulate')
          if (taskResult?.isSkip) {
            result = {
              jobKey: jobData.key,
              jobName: jobData.jobName,
              status: 'filtered',
              reason: taskResult.reason ?? taskResult.msg ?? task.label ?? task.id,
            }
          }
          helper.logs.step(
            jobData,
            `模拟/${task.label ?? task.id}`,
            taskResult?.isSkip ? 'warning' : 'success',
            taskResult?.reason ?? taskResult?.msg ?? '执行完成',
            Date.now() - taskStartedAt,
          )
        } catch (error) {
          result = {
            jobKey: jobData.key,
            jobName: jobData.jobName,
            status: 'failed',
            reason: error instanceof Error ? error.message : String(error),
          }
          helper.logs.step(
            jobData,
            `模拟/${task.label ?? task.id}`,
            'danger',
            result.reason,
            Date.now() - taskStartedAt,
          )
        }

        if (result.status !== 'passed') break
      }
      if (result.status === 'passed') {
        if (helper.conf.formData.sameCompanyFilter.value && companyKey) {
          simulatedCompanies.add(companyKey)
        }
        if (helper.conf.formData.sameHrFilter.value && hrKey) {
          simulatedHrs.add(hrKey)
        }
      }
      jobs.push(result)
    }

    const simulationResult: SimulationResult = {
      total: jobs.length,
      passed: jobs.filter((job) => job.status === 'passed').length,
      filtered: jobs.filter((job) => job.status === 'filtered').length,
      failed: jobs.filter((job) => job.status === 'failed').length,
      startedAt,
      durationMs: Date.now() - startedAt,
      jobs,
    }
    helper.logs.info(
      '模拟筛选',
      `完成：预计通过 ${simulationResult.passed}，过滤 ${simulationResult.filtered}，失败 ${simulationResult.failed}`,
    )
    return simulationResult
  }

  const stop = () => {
    status.value = 'stop'
    helper.logs.info('投递流程', '用户暂停')
  }
  const reset = () => {
    status.value = 'pending'
    helper.logs.info('投递流程', '重置已过滤岗位')
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
    simulate,
    stop,
    reset,
  }
}
