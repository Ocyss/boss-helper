import type { ContextLogger } from 'devlog-ui'
import { computed, ref, shallowRef } from 'vue'

import { PipelineCacheManager } from '@/composables/usePipelineCache'
import type { PipelineCacheItem, ProcessorType } from '@/types/pipelineCache'
import { delay } from '@/utils'
import { jsonClone } from '@/utils/deepmerge'
import { logger } from '@/utils/logger'
import { persistLog } from '@/utils/persistentLogs'

import type { HelperContext, JobData } from '../useHelper'
import { LimitError, RateLimitError } from './deliverError'
import { buildFilterFingerprint } from './fingerprint'
import { DependencyMissingError } from './handles'
import {
  AI_CONCURRENCY,
  PREPARE_QUEUE_LIMIT,
  createBoundedQueue,
  createCardClickGate,
  createSemaphore,
  nextRateLimitBackoff,
  withDeliveryLock,
} from './scheduler'
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

const COMMIT_TASK_IDS = new Set(['岗位投递', 'Boss信息获取', '打招呼'])
const AI_TASK_IDS = new Set(['AI筛选', '招呼语准备'])
const DETAIL_TASK_ID = '岗位详情获取'

let cacheManager: PipelineCacheManager | null = null

export function getCacheManager(): PipelineCacheManager {
  if (!cacheManager) {
    cacheManager = new PipelineCacheManager()
  }
  return cacheManager
}

export async function cachePipelineResult(
  key: string,
  jobName: string,
  brandName: string,
  status: JobStatus,
  message: string,
  processorType?: ProcessorType,
  filterFingerprint?: string,
): Promise<void> {
  const cacheManager = getCacheManager()
  await cacheManager.setCacheResult(
    key,
    jobName,
    brandName,
    status,
    message,
    processorType,
    filterFingerprint,
  )
}

export function checkJobCache(key: string): PipelineCacheItem | null {
  const cacheManager = getCacheManager()

  if (cacheManager.isValidCache(key)) {
    const cached = cacheManager.getCachedResult(key)
    return cached
  }
  return null
}

export function applyCachedJobResult(
  helper: HelperContext<any, any, any>,
  job: JobData,
  fingerprint: string,
): boolean {
  if (!helper.conf.formData.useCache.value) return false
  const cached = checkJobCache(job.key)
  if (!cached) return false
  if (cached.status === 'success') {
    helper.jobResultMaps.set(job.key, {
      status: 'success',
      msg: '投递成功',
      isCache: true,
      reason: cached.message,
    })
    return true
  }
  if (cached.status === 'warn' && cached.filterFingerprint === fingerprint) {
    helper.jobResultMaps.set(job.key, {
      status: 'warn',
      msg: '已过滤',
      isCache: true,
      isSkip: true,
      reason: cached.message,
    })
    return true
  }
  return false
}

function processorTypeOf(taskId?: string): ProcessorType {
  if (!taskId) return 'basic'
  if (taskId.includes('AI') || taskId.includes('分数')) return 'aiFiltering'
  if (taskId.includes('高德') || taskId.includes('地址')) return 'amap'
  return 'basic'
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

type SliceOutcome = {
  skipped: boolean
  error: boolean
  addAttempted: boolean
  taskId?: string
  message?: string
  reason?: string
}

function splitPrepareTasks<C extends HelperContext<C, T, S>, T, S>(tasks: Task<C, T, S>[]) {
  const list: Task<C, T, S>[] = []
  const detail: Task<C, T, S>[] = []
  const after: Task<C, T, S>[] = []
  const ai: Task<C, T, S>[] = []
  let seenDetail = false
  for (const task of tasks) {
    if (task.id === DETAIL_TASK_ID) {
      detail.push(task)
      seenDetail = true
      continue
    }
    if (AI_TASK_IDS.has(task.id)) {
      ai.push(task)
      continue
    }
    if (!seenDetail) list.push(task)
    else after.push(task)
  }
  return { list, detail, after, ai }
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

  const persistResult = async (
    data: WorkflowData<T, S>,
    result: { status: JobStatus; message: string; taskId?: string },
    fingerprint: string,
  ) => {
    if (!helper.conf.formData.useCache.value) return
    if (result.status !== 'success' && result.status !== 'warn') return
    await cachePipelineResult(
      data.jobData.key,
      data.jobData.jobName,
      data.jobData.brand.name,
      result.status,
      result.message,
      processorTypeOf(result.taskId),
      result.status === 'warn' ? fingerprint : undefined,
    )
  }

  const auditJob = (data: WorkflowData<T, S>) => ({
    key: data.jobData.key,
    name: data.jobData.jobName,
    company: data.jobData.brand.name,
    link: data.jobData.link,
  })

  const persistStartLog = (data: WorkflowData<T, S>) =>
    persistLog({
      level: 'info',
      title: '开始处理岗位',
      job: auditJob(data),
      data: {
        job: data.jobData,
        jobItem: (data.rawData as { jobitem?: unknown }).jobitem,
      },
    })

  const persistSkipLog = (data: WorkflowData<T, S>, outcome: SliceOutcome) =>
    persistLog({
      level: 'warn',
      title: '岗位已跳过',
      message: outcome.reason ?? outcome.message,
      job: auditJob(data),
      data: { job: data.jobData, rawData: data.rawData, result: outcome, state: data.state },
    })

  const persistSuccessLog = (data: WorkflowData<T, S>) =>
    persistLog({
      level: 'success',
      title: '岗位投递完成',
      message: '投递成功',
      job: auditJob(data),
      data: { job: data.jobData, rawData: data.rawData, state: data.state },
    })

  const executeSlice = async (
    tasks: Task<C, T, S>[],
    data: WorkflowData<T, S>,
    index: number,
    log: ContextLogger,
    clickGate?: () => Promise<void>,
  ): Promise<SliceOutcome> => {
    const isStop = () => status.value === 'stop'
    let addAttempted = false
    for (const t of tasks) {
      if (isStop()) {
        return { skipped: true, error: false, addAttempted }
      }
      helper.jobResultMaps.set(data.jobData.key, {
        status: t.state || 'running',
        msg: t.stateMsg || '运行中',
      })
      try {
        if (t.id === DETAIL_TASK_ID && clickGate) {
          await clickGate()
        }
        const res = await executeTask(t, data, index, log)
        await persistLog({
          level: res?.isSkip ? 'warn' : 'info',
          title: `岗位步骤完成：${t.label ?? t.id}`,
          message: res?.msg ?? res?.reason,
          job: auditJob(data),
          data: {
            task: { id: t.id, label: t.label, state: t.state, stateMsg: t.stateMsg },
            result: res,
            state: data.state,
          },
        })
        if (res != null) {
          res.id ??= t.id
          res.msg ??= t.label ?? t.id
          res.status ??= res.isSkip ? 'warn' : undefined
          helper.jobResultMaps.set(data.jobData.key, {
            ...(helper.jobResultMaps.get(data.jobData.key) ?? {}),
            ...res,
          })
          if (res.status) {
            helper.statistics.todayData.value.tasks[t.id] ??= {}
            helper.statistics.todayData.value.tasks[t.id]![res.status] ??= 0
            helper.statistics.todayData.value.tasks[t.id]![res.status]! += 1
          }
          if (t.id === '岗位投递' && !res.isSkip) {
            addAttempted = true
          }
          if (res.isSkip) {
            return {
              skipped: true,
              error: res.status === 'error',
              addAttempted,
              taskId: t.id,
              message: res.msg,
              reason: res.reason,
            }
          }
        } else if (t.id === '岗位投递') {
          addAttempted = true
        }
      } catch (e) {
        if (e instanceof RateLimitError || e instanceof LimitError) {
          throw e
        }
        const message = `报错/${t.label ?? t.id}`
        const reason = `任务${t.label ?? t.id}执行失败: ${e instanceof Error ? e.message : JSON.stringify(e)}`
        helper.jobResultMaps.set(data.jobData.key, {
          isSkip: true,
          id: t.id,
          status: 'error',
          reason,
          msg: message,
        })
        log.error(`任务${t.label ?? t.id}执行失败`, e)
        await persistLog({
          level: 'error',
          title: `岗位步骤失败：${t.label ?? t.id}`,
          message: e instanceof Error ? e.message : String(e),
          job: auditJob(data),
          data: { task: { id: t.id, label: t.label }, error: e, state: data.state },
        })
        await persistLog({
          level: 'error',
          title: '岗位处理失败',
          message: `任务${t.label ?? t.id}执行失败`,
          job: auditJob(data),
          data: {
            job: data.jobData,
            rawData: data.rawData,
            result: { status: 'error', reason, msg: message },
            state: data.state,
          },
        })
        return {
          skipped: true,
          error: true,
          addAttempted: t.id === '岗位投递' || addAttempted,
          taskId: t.id,
          message,
          reason,
        }
      }
    }
    return { skipped: false, error: false, addAttempted }
  }

  const hydratePageCache = (fingerprint: string) => {
    helper.jobList.value.forEach((job) => {
      applyCachedJobResult(helper, job, fingerprint)
      const v = helper.jobResultMaps.get(job.key)
      if (!v) {
        helper.jobResultMaps.set(job.key, { status: 'wait', msg: '等待中' })
        return
      }
      if (v.status === 'success' || v.status === 'warn') {
        return
      }
      v.status = 'wait'
      v.msg = '等待中'
      helper.jobResultMaps.set(job.key, v)
    })
  }

  const execute = async (data: WorkflowData<T, S>, index = 0) => {
    const fingerprint = buildFilterFingerprint(helper.conf.formData)
    const log = logger.withContext({
      id: 'workflow-execute',
      job_key: data.jobData.key,
      job_name: data.jobData.jobName,
    })
    await persistStartLog(data)
    helper.statistics.todayData.value.total++
    const prepareTasks = pipeline.value.filter((t) => !COMMIT_TASK_IDS.has(t.id))
    const commitTasks = pipeline.value.filter((t) => COMMIT_TASK_IDS.has(t.id))
    const prepared = await executeSlice(prepareTasks, data, index, log)
    if (prepared.skipped) {
      if (!prepared.error) {
        log.warn(`投递过滤: ${data.jobData.jobName}`, prepared.message, prepared.reason)
        await persistResult(
          data,
          {
            status: 'warn',
            message: prepared.reason || prepared.message || '已过滤',
            taskId: prepared.taskId,
          },
          fingerprint,
        )
        await persistSkipLog(data, prepared)
      }
      return
    }
    const committed = await executeSlice(commitTasks, data, index, log)
    if (committed.skipped) {
      if (!committed.error) {
        log.warn(`投递过滤: ${data.jobData.jobName}`, committed.message, committed.reason)
        await persistResult(
          data,
          {
            status: 'warn',
            message: committed.reason || committed.message || '已过滤',
            taskId: committed.taskId,
          },
          fingerprint,
        )
        await persistSkipLog(data, committed)
      }
      return
    }
    helper.jobResultMaps.set(data.jobData.key, {
      status: 'success',
      msg: '投递成功',
    })
    helper.statistics.todayData.value.success++
    await persistResult(
      data,
      { status: 'success', message: '投递成功', taskId: '岗位投递' },
      fingerprint,
    )
    await persistSuccessLog(data)
  }

  const executeAll = async (rawDataMap: Map<string, T>) => {
    await rebuild()

    let stepMsg = ''
    errorMessage.value = null
    const isStop = () => status.value === 'stop'

    const runLoop = async () => {
      status.value = 'running'
      const fingerprint = buildFilterFingerprint(helper.conf.formData)
      const prepareTasks = pipeline.value.filter((t) => !COMMIT_TASK_IDS.has(t.id))
      const commitTasks = pipeline.value.filter((t) => COMMIT_TASK_IDS.has(t.id))
      const { list, detail, after, ai } = splitPrepareTasks(prepareTasks)
      let lastAddAt = 0
      let pagesSinceRefresh = 0

      while (status.value === 'running') {
        if (helper.jobList.value.length === 0) {
          stepMsg = '没有职位可投递'
          break
        }
        hydratePageCache(fingerprint)
        await delay(helper.conf.formData.delayDeliveryStarts, isStop)
        if (isStop()) break

        const pageStartedAt = Date.now()
        const ready = createBoundedQueue<WorkflowData<T, S>>(PREPARE_QUEUE_LIMIT)
        const aiPool = createSemaphore(AI_CONCURRENCY)
        const clickGate = createCardClickGate()
        const inFlight: Promise<void>[] = []

        const producer = (async () => {
          try {
            for (const [index, jobData] of helper.jobList.value.entries()) {
              current.value = index + 1
              if (isStop()) break
              const jobStatus = helper.jobResultMaps.get(jobData.key)?.status
              if (jobStatus === 'success' || jobStatus === 'warn') {
                continue
              }
              const data: WorkflowData<T, S> = {
                jobData,
                rawData: rawDataMap.get(jobData.key)!,
                state: stateMaps.value.get(jobData.key) || {},
              }
              helper.jobMaps.set(jobData.key, data)
              const log = logger.withContext({
                id: 'workflow-prepare',
                job_key: data.jobData.key,
                job_name: data.jobData.jobName,
              })
              helper.statistics.todayData.value.total++
              await persistStartLog(data)

              const finishSkip = async (outcome: SliceOutcome) => {
                if (!outcome.error) {
                  log.warn(`投递过滤: ${data.jobData.jobName}`, outcome.message, outcome.reason)
                  await persistResult(
                    data,
                    {
                      status: 'warn',
                      message: outcome.reason || outcome.message || '已过滤',
                      taskId: outcome.taskId,
                    },
                    fingerprint,
                  )
                  await persistSkipLog(data, outcome)
                }
              }

              const listed = await executeSlice(list, data, index, log)
              if (listed.skipped) {
                await finishSkip(listed)
                continue
              }
              const detailed = await executeSlice([...detail, ...after], data, index, log, () =>
                clickGate(isStop),
              )
              if (detailed.skipped) {
                await finishSkip(detailed)
                continue
              }

              const enqueue = async () => {
                if (ai.length > 0) {
                  const aiOutcome = await executeSlice(ai, data, index, log)
                  if (aiOutcome.skipped) {
                    await finishSkip(aiOutcome)
                    return
                  }
                }
                if (isStop()) return
                helper.jobResultMaps.set(data.jobData.key, {
                  status: 'wait',
                  msg: '待投递',
                })
                await ready.push(data)
              }

              if (ai.length > 0) {
                inFlight.push(aiPool.run(enqueue))
              } else {
                await enqueue()
              }
            }
          } finally {
            try {
              await Promise.all(inFlight)
            } catch {
              // 个别 AI 任务失败已在 enqueue 内落成 error
            }
            ready.close()
          }
        })()

        const consumer = (async () => {
          try {
            while (!isStop()) {
              const data = await ready.take()
              if (!data) break
              helper.currentJob.value = data.jobData.key
              const log = logger.withContext({
                id: 'workflow-commit',
                job_key: data.jobData.key,
                job_name: data.jobData.jobName,
              })
              let addAttempted = false
              let retries = 0
              try {
                while (!isStop()) {
                  try {
                    const committed = await executeSlice(commitTasks, data, current.value, log)
                    addAttempted = committed.addAttempted
                    if (committed.skipped) {
                      if (!committed.error) {
                        log.warn(
                          `投递过滤: ${data.jobData.jobName}`,
                          committed.message,
                          committed.reason,
                        )
                        await persistResult(
                          data,
                          {
                            status: 'warn',
                            message: committed.reason || committed.message || '已过滤',
                            taskId: committed.taskId,
                          },
                          fingerprint,
                        )
                        await persistSkipLog(data, committed)
                      }
                    } else {
                      helper.jobResultMaps.set(data.jobData.key, {
                        status: 'success',
                        msg: '投递成功',
                      })
                      helper.statistics.todayData.value.success++
                      addAttempted = true
                      await persistResult(
                        data,
                        { status: 'success', message: '投递成功', taskId: '岗位投递' },
                        fingerprint,
                      )
                      await persistSuccessLog(data)
                    }
                    break
                  } catch (e) {
                    if (e instanceof LimitError) {
                      throw e
                    }
                    if (e instanceof RateLimitError) {
                      addAttempted = true
                      lastAddAt = Date.now()
                      await delay(nextRateLimitBackoff(retries), isStop)
                      retries++
                      if (retries > 5) {
                        helper.jobResultMaps.set(data.jobData.key, {
                          status: 'error',
                          msg: '操作频繁',
                          reason: e.message,
                          isSkip: true,
                        })
                        await persistLog({
                          level: 'error',
                          title: '岗位处理失败',
                          message: e.message || '操作频繁',
                          job: auditJob(data),
                          data: {
                            job: data.jobData,
                            rawData: data.rawData,
                            error: e,
                            state: data.state,
                          },
                        })
                        break
                      }
                      continue
                    }
                    throw e
                  }
                }
              } catch (e) {
                if (e instanceof LimitError) {
                  stepMsg = e.message || '达到投递限制'
                  status.value = 'stop'
                  return
                }
                throw e
              }

              if (
                helper.statistics.todayData.value.success >=
                helper.conf.formData.deliveryLimit.value
              ) {
                stepMsg = `投递达到数量限制`
                status.value = 'stop'
                return
              }
              if (addAttempted) {
                lastAddAt = Date.now()
                await delay(helper.conf.formData.delayDeliveryInterval, isStop)
              }
            }
          } finally {
            ready.close()
          }
        })()

        await Promise.all([producer, consumer])
        if (isStop()) break

        pagesSinceRefresh++
        const since = lastAddAt || pageStartedAt
        const remain = helper.conf.formData.delayDeliveryPageNext - (Date.now() - since) / 1000
        const wait = delay(Math.max(0, remain), isStop)
        const refreshEvery = helper.conf.formData.refreshSearchEveryPages
        let hasMore = false
        if (refreshEvery > 0 && pagesSinceRefresh >= refreshEvery) {
          hasMore = await helper.refreshJobSearch(wait)
          if (hasMore) {
            pagesSinceRefresh = 0
          } else {
            logger.warn('重搜失败，回退为普通翻页')
            hasMore = await helper.loadMoreJob(Promise.resolve())
          }
        } else {
          hasMore = await helper.loadMoreJob(wait)
        }
        if (!hasMore) {
          status.value = 'stop'
          stepMsg = '投递结束, 无法继续下一页'
          break
        }
      }
    }

    try {
      await withDeliveryLock(helper.uid, runLoop, () => {
        stepMsg = '其他标签页正在投递，已跳过本次启动'
        status.value = 'stop'
      })
    } catch (e) {
      logger.error('投递未知错误', e)
      stepMsg = `未知错误: ${e instanceof Error ? e.message : JSON.stringify(e)}`
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
