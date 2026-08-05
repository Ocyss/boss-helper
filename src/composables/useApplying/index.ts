import { shallowRef, ref } from 'vue'

import { PipelineCacheManager } from '@/composables/usePipelineCache'
import type { PipelineCacheItem, ProcessorType } from '@/types/pipelineCache'
import { delayWithJitter } from '@/utils'

import { HelperContext } from '../useHelper'
import { RateLimitError } from './deliverError'
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
        aiScore: r.aiScore ?? acc.aiScore,
        draft: r.draft ?? acc.draft,
        updatedAt: r.updatedAt ?? acc.updatedAt,
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
  // 连续失败时采用指数退避并在达到阈值后停止，避免无意义地重复请求。
  let consecutiveErrors = 0
  let cooldownUntil = 0
  const filterTaskIds = new Set([
    '已沟通',
    '重复沟通-相同公司',
    '重复沟通-相同HR',
    '岗位名',
    '公司名',
    '薪资范围',
    '公司规模',
    '猎头过滤',
    '活跃度过滤',
    'Hr职位',
    '工作地址',
    '好友状态',
    '工作内容',
    '金牌面试官',
    '高德地图',
    'AI筛选',
  ])

  const rebuild = async () => {
    const _ctx: TaskContext<C, T, S> = { helper, now: new Date() }
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

  const executeTask = async (task: Task<C, T, S>, data: WorkflowData<T, S>) => {
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
              },
              data,
            )
            res = meginResults(
              await fn(
                {
                  helper,
                  now: new Date(),
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
    try {
      let skipPipeline = false
      for (const t of pipeline.value) {
        let res: void | TaskResult = undefined
        try {
          if (isStop()) break
          helper.jobResultMaps.set(data.jobData.key, {
            id: t.id,
            status: t.state || 'running',
            msg: t.stateMsg || '运行中',
            updatedAt: new Date().toISOString(),
          })
          // 到达岗位投递节点即代表通过筛选；投递失败仍应保留 eligible 统计。
          if (t.id === '岗位投递') {
            void helper.statistics.recordEvent('eligible', data.jobData.key)
          }
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
            reason: `任务${t.label ?? t.id}执行失败: ${e instanceof Error ? e.message : e}`,
            msg: `报错/${t.label ?? t.id}`,
          }
          logger.error(`任务${t.label ?? t.id}执行失败`, e)
          const errorText = e instanceof Error ? e.message : String(e)
          void helper.statistics.recordEvent(
            e instanceof RateLimitError || errorText.includes('操作过于频繁')
              ? 'rate_limited'
              : 'error',
            `${data.jobData.key}:${t.id}`,
          )
          helper.logs.info(`${data.jobData.jobName} · ${t.label ?? t.id}`, errorText.slice(0, 240))
          consecutiveErrors += 1
          const cooldownMs = Math.min(60_000, 5_000 * 2 ** Math.max(0, consecutiveErrors - 1))
          cooldownUntil = Date.now() + cooldownMs
          helper.logs.info(
            `${data.jobData.jobName} · 连续错误`,
            `已进入${Math.ceil(cooldownMs / 1000)}秒冷却（第${consecutiveErrors}次）`,
          )
          // 登录失效、限流和验证码提示都立即停止后续任务，避免重复请求。
          if (
            e instanceof RateLimitError ||
            errorText.includes('操作过于频繁') ||
            /登录|token|验证码/i.test(errorText)
          ) {
            status.value = 'stop'
          }
          if (consecutiveErrors >= 3) {
            status.value = 'stop'
            helper.logs.info(
              `${data.jobData.jobName} · 连续错误`,
              '连续错误达到3次，已停止后续岗位',
            )
          }
          skipPipeline = true
          break
        } finally {
          if (res != null) {
            helper.jobResultMaps.set(data.jobData.key, {
              ...(helper.jobResultMaps.get(data.jobData.key) ?? {}),
              ...res,
              updatedAt: new Date().toISOString(),
            })
            if (res.status) {
              helper.statistics.todayData.tasks[t.id] ??= {}
              helper.statistics.todayData.tasks[t.id][res.status] ??= 0
              helper.statistics.todayData.tasks[t.id][res.status] += 1
            }
            const resultMessage = res.reason ?? res.msg
            if (res.isSkip && resultMessage) {
              helper.logs.info(
                `${data.jobData.jobName} · ${t.label ?? t.id}`,
                resultMessage.slice(0, 240),
              )
              if (filterTaskIds.has(t.id)) {
                void helper.statistics.recordEvent(
                  t.id.startsWith('重复沟通')
                    ? 'duplicate'
                    : t.id === '活跃度过滤'
                      ? 'activity_filter'
                      : 'filtered',
                  `${data.jobData.key}:${t.id}`,
                )
              }
            }
            if (t.id === '岗位投递' && res.status === 'success') {
              void helper.statistics.recordEvent('publish_success', data.jobData.key)
            }
            if (t.label === '打招呼' && res.status === 'success') {
              void helper.statistics.recordEvent('greeting_success', `${data.jobData.key}:${t.id}`)
            }
          }
        }
      }
      if (!skipPipeline) {
        consecutiveErrors = 0
        const existingResult = helper.jobResultMaps.get(data.jobData.key)
        helper.jobResultMaps.set(data.jobData.key, {
          ...existingResult,
          status: 'success',
          // 投递成功后继续展示草稿，但明确提示用户仍需人工发送。
          msg: existingResult?.draft ? '投递成功；招呼草稿已生成（未发送）' : '投递成功',
          updatedAt: new Date().toISOString(),
        })
        helper.logs.info(data.jobData.jobName, '投递流程完成')
      }
    } catch (e) {
      consecutiveErrors += 1
      const cooldownMs = Math.min(60_000, 5_000 * 2 ** Math.max(0, consecutiveErrors - 1))
      cooldownUntil = Date.now() + cooldownMs
      helper.logs.info(
        `${data.jobData.jobName} · 连续错误`,
        `已进入${Math.ceil(cooldownMs / 1000)}秒冷却（第${consecutiveErrors}次）`,
      )
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

        await delayWithJitter(
          helper.conf.formData.delayRanges?.starts ?? helper.conf.formData.delayDeliveryStarts,
          isStop,
        )

        for (const [index, jobData] of helper.jobList.value.entries()) {
          current.value = index + 1
          if (isStop()) break
          if (cooldownUntil > Date.now()) {
            await delayWithJitter((cooldownUntil - Date.now()) / 1000, isStop, 0)
          }
          if (helper.statistics.todayData.success >= helper.conf.formData.deliveryLimit.value) {
            stepMsg = '达到本地设置的每日投递上限'
            status.value = 'stop'
            break
          }
          const jobStatus = helper.jobResultMaps.get(jobData.key)?.status
          if (jobStatus === 'success' || jobStatus === 'warn') {
            continue
          }
          const data = {
            jobData,
            rawData: rawDataMap.get(jobData.key)!,
            state: stateMaps.value.get(jobData.key) || {},
          }
          helper.jobMaps.set(jobData.key, data)
          helper.currentJob.value = jobData.key
          await execute(data)
          await delayWithJitter(
            helper.conf.formData.delayRanges?.interval ??
              helper.conf.formData.delayDeliveryInterval,
            isStop,
          )
        }
        if (isStop()) break
        const hasMore = await helper.loadMoreJob(
          delayWithJitter(
            helper.conf.formData.delayRanges?.pageNext ??
              helper.conf.formData.delayDeliveryPageNext,
            isStop,
          ),
        )
        if (!hasMore) {
          status.value = 'stop'
          stepMsg = '投递结束, 无法继续下一页'
          break
        }
      }
    } catch (e) {
      logger.error(e)
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
