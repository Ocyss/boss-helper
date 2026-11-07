import { shallowRef, ref, reactive } from 'vue'

import { createFeishuSync, feishuJobRow } from '@/utils/feishuSync'

import type { HelperContext } from '../useHelper'
import { DependencyMissingError } from './handles'
import type {
  Handler,
  Task,
  TaskContext,
  TaskPipeline,
  TaskResult,
  TaskStatus,
  WorkflowData,
  WorkflowMode,
} from './type'
import { jobStatusList } from './type'

export type DeliveryWorkflow<C extends HelperContext<C, T, S>, T, S> = Awaited<
  ReturnType<typeof useDeliveryWorkflow<C, T, S>>
>

/** 用户主动停止时中断正在执行的任务 */
class WorkflowStoppedError extends Error {
  constructor() {
    super('工作流已停止')
    this.name = 'WorkflowStoppedError'
  }
}

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
    }, {})
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
  const toast = useToast()
  const reportFeishuError = (error: unknown) => {
    toast.add({
      id: 'feishu-sync-error',
      title: '飞书同步失败，待同步记录已保留',
      description: error instanceof Error ? error.message : String(error),
      color: 'error',
    })
  }
  const feishuSync = createFeishuSync(reportFeishuError)
  const queueFeishu = (data: WorkflowData<T, S>, count = true) => {
    try {
      feishuSync.add(feishuJobRow(helper, data, helper.jobResultMaps.get(data.jobData.key)), count)
    } catch (error) {
      logger.warn('飞书岗位快照生成失败，不影响工作流', error)
      reportFeishuError(error)
    }
  }

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
          if (result.onDelivered) {
            const onDelivered = task.onDelivered
            task.onDelivered = async (ctx, data) => {
              await onDelivered?.(ctx, data)
              await result.onDelivered?.(ctx, data)
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
  const busy = ref(false)
  const lastMode = ref<WorkflowMode | null>(null)
  const drafts = reactive(new Map<string, string>())
  const usedTasks = new Set<string>()
  const markFiltered = (key: string) => {
    manuallyFiltered.add(key)
    helper.jobResultMaps.set(key, {
      status: 'warn',
      msg: '手动过滤',
      id: 'manualFilter',
      isSkip: true,
    })
    const data = helper.jobMaps.get(key)
    if (data) queueFeishu(data, false)
    if (!busy.value) void feishuSync.flush()
  }
  const isBlocked = (key: string) => status.value === 'stop' || manuallyFiltered.has(key)

  // 停止信号监听: 用于强制中断正在 await 的任务(如挂起的网络请求)
  const stopListeners = new Set<() => void>()
  const notifyStop = () => {
    for (const fn of [...stopListeners]) fn()
  }

  /**
   * 带看门狗的任务执行: 超时或用户停止时 reject, 避免 Promise 永不 settle 导致工作流卡死
   */
  const runGuarded = <R>(promise: Promise<R>, timeout: number, taskId: string): Promise<R> =>
    new Promise<R>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup()
        reject(new Error(`任务「${taskId}」执行超时(${Math.round(timeout / 1000)}s)`))
      }, timeout)
      const onStop = () => {
        cleanup()
        reject(new WorkflowStoppedError())
      }
      const cleanup = () => {
        clearTimeout(timer)
        stopListeners.delete(onStop)
      }
      stopListeners.add(onStop)
      promise.then(
        (v) => {
          cleanup()
          resolve(v)
        },
        (e) => {
          cleanup()
          reject(e)
        },
      )
    })

  /** 任务默认超时: AI 120s(模型默认超时60s+缓冲), 详情请求 70s, 投递阶段 90s, 其余 30s */
  const resolveTimeout = (t: Task<C, T, S>) =>
    t.timeout ??
    (t.state === 'ai'
      ? 120_000
      : t.state === 'request'
        ? 70_000
        : t.phase === 'delivery'
          ? 90_000
          : 30_000)

  const saveJobResult = async (key: string, result: TaskResult) => {
    if (!helper.conf.formData.useCache?.value) return
    try {
      await helper.jobCache.set(key, result)
    } catch (e) {
      logger.error('保存岗位缓存失败', e)
    }
  }

  const runJob = async (data: WorkflowData<T, S>, mode: WorkflowMode, index = 0) => {
    const key = data.jobData.key
    if (isBlocked(key)) return
    if (helper.conf.formData.useCache?.value && mode !== 'delivery') {
      try {
        const cached = await helper.jobCache.get(key, helper.conf.formData.useCache.expire)
        if (isBlocked(key)) return
        if (cached) {
          logger.info('命中岗位结果缓存，复用结果', { job_key: key, mode })
          helper.jobResultMaps.set(key, cached)
          queueFeishu(data)
          return
        }
      } catch (e) {
        logger.error('读取岗位缓存失败', e)
      }
    }
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
    const draft = drafts.get(key)
    if (draft !== undefined && mode !== 'filter') {
      data.state.aiGreeting = { ...data.state.aiGreeting, greeting: draft }
      completed.add('AI招呼语生成')
    }
    const canRun = (t: Task<C, T, S>) =>
      mode === 'filter'
        ? !t.phase || t.phase === 'filter'
        : mode !== 'generate' || t.phase !== 'delivery'
    const runTask = async (t: Task<C, T, S>): Promise<void> => {
      if (completed.has(t.id) || isBlocked(key)) return
      if (visiting.has(t.id)) throw new Error(`Cycle: ${t.id}`)
      visiting.add(t.id)
      for (const id of t.deps) {
        const dep = pipeline.value.find((task) => task.id === id)
        if (!dep) throw new Error(`Missing dependency: ${id}`)
        if (!canRun(dep)) throw new Error(`Filter depends on delivery: ${id}`)
        await runTask(dep)
        if (isBlocked(key)) return
      }
      const handler = resolvedHandlers.get(t.id)
      if (handler) {
        usedTasks.add(t.id)
        helper.jobResultMaps.set(key, {
          status: delivered ? 'success' : (t.state ?? 'running'),
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
          const taskTimeout = resolveTimeout(t)
          try {
            res = meginResults(await runGuarded(fn(ctx, data), taskTimeout, t.id))
          } catch (e) {
            if (e instanceof WorkflowStoppedError) throw e
            if (!(e instanceof DependencyMissingError)) throw e
            const dep = pipeline.value.find((task) => task.id === e.taskId)
            if (!dep || !canRun(dep)) throw e
            await runTask(dep)
            if (isBlocked(key)) return
            res = meginResults(await runGuarded(fn(ctx, data), taskTimeout, t.id))
          }
          if (isBlocked(key)) return
          if (res) {
            res.status ??= res.isSkip ? 'warn' : undefined
            res.msg ??= t.label ?? t.id
            if (
              !delivered &&
              t.phase === 'delivery' &&
              fn === handler &&
              res.status === 'success' &&
              !res.isSkip
            ) {
              delivered = true
              helper.jobResultMaps.set(key, { status: 'success', msg: '投递成功' })
              await saveJobResult(key, { status: 'success', msg: '投递成功' })
              drafts.delete(key)
              helper.statistics.todayData.value.success++
              for (const task of pipeline.value) {
                if (!task.onDelivered) continue
                try {
                  await task.onDelivered(
                    { helper, now: new Date(), index, log: log.withContext({ task_id: task.id }) },
                    data,
                  )
                } catch (e) {
                  log.error('onDelivered error', task.id, e)
                }
              }
            }
            helper.jobResultMaps.set(
              key,
              delivered
                ? { ...res, status: 'success', isSkip: false }
                : res.status === 'success' && !res.isSkip
                  ? { ...res, status: 'running', msg: '投递处理中' }
                  : res,
            )
            if (res.status) {
              const stats = helper.statistics.todayData.value.tasks
              stats[t.id] ??= {}
              stats[t.id]![res.status] = (stats[t.id]![res.status] ?? 0) + 1
            }
            if (res.isSkip || res.status === 'error') {
              if (
                !delivered &&
                (!t.phase || t.phase === 'filter') &&
                res.isSkip &&
                res.status === 'warn'
              ) {
                await saveJobResult(key, res)
              }
              throw { workflowResult: res }
            }
          }
        }
      }
      visiting.delete(t.id)
      completed.add(t.id)
    }
    try {
      if (mode !== 'delivery' && !wasReady) {
        for (const t of pipeline.value.filter((t) => !t.phase || t.phase === 'filter'))
          await runTask(t)
      }
      if (isBlocked(key)) return
      if (mode === 'filter') {
        helper.jobResultMaps.set(key, { status: 'ready', msg: '待投递' })
        return
      }
      for (const t of pipeline.value.filter((t) => t.phase === 'generate')) await runTask(t)
      if (isBlocked(key)) return
      if (mode === 'generate') {
        const greeting = data.state.aiGreeting?.greeting
        if (!greeting?.trim()) throw new Error('仅生成需要启用并配置 AI 招呼语')
        drafts.set(key, greeting)
        helper.jobResultMaps.set(key, { status: 'ready', msg: '待确认发送' })
        return
      }
      for (const t of pipeline.value.filter((t) => t.phase === 'delivery')) await runTask(t)
      if (!isBlocked(key) && !delivered) {
        helper.jobResultMaps.set(key, { status: 'ready', msg: '待投递' })
      }
      if (!isBlocked(key) && delivered) {
        helper.jobResultMaps.set(key, { status: 'success', msg: '投递成功' })
      }
    } catch (e) {
      if (isBlocked(key)) return
      if (e && typeof e === 'object' && 'workflowResult' in e) {
        if (delivered) {
          const result = e.workflowResult as TaskResult
          helper.jobResultMaps.set(key, {
            ...result,
            status: 'success',
            isSkip: false,
            msg: `投递成功，后续处理失败：${result.msg ?? ''}`,
          })
        }
        return
      }
      log.error('工作流任务执行失败', e)
      helper.jobResultMaps.set(key, {
        status: delivered ? 'success' : 'error',
        msg: delivered ? '投递成功，后续处理失败' : '执行失败',
        reason: e instanceof Error ? e.message : String(e),
      })
    } finally {
      if (manuallyFiltered.has(key)) markFiltered(key)
      else if (status.value === 'stop')
        helper.jobResultMaps.set(key, { status: 'wait', msg: '已停止' })
      queueFeishu(data)
      if (status.value === 'stop') void feishuSync.flush()
    }
  }

  const withRun = async (fn: () => Promise<void>) => {
    if (busy.value) return false
    busy.value = true
    status.value = 'running'
    errorMessage.value = null
    usedTasks.clear()
    void feishuSync.flush()
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
      void feishuSync.flush()
      if (status.value === 'running') status.value = 'pending'
      busy.value = false
    }
  }
  const executeOne = (data: WorkflowData<T, S>, mode: 'delivery') =>
    withRun(() => runJob(data, mode))
  const execute = (data: WorkflowData<T, S>, index = 0) =>
    withRun(() => runJob(data, 'auto', index))
  const executeAll = (rawDataMap: Map<string, T>, mode: WorkflowMode = 'auto') =>
    withRun(async () => {
      lastMode.value = mode
      if (mode === 'generate' && !helper.conf.formData.aiGreeting.enable)
        throw new Error('仅生成需要先启用并配置 AI 招呼语')
      if (mode === 'delivery') {
        const queue = helper.jobList.value.filter(
          (job) => helper.jobResultMaps.get(job.key)?.status === 'ready' && !drafts.has(job.key),
        )
        for (const job of queue) {
          if (
            status.value === 'stop' ||
            helper.statistics.todayData.value.success >= helper.conf.formData.deliveryLimit.value
          )
            break
          const data = helper.jobMaps.get(job.key)
          if (data) await runJob(data, 'delivery')
          await delay(helper.conf.formData.delayDeliveryInterval, () => status.value === 'stop')
        }
        return
      }
      const isStop = () => status.value === 'stop'
      await delay(helper.conf.formData.delayDeliveryStarts, isStop)
      const seenJobs = new Set<string>()
      let repeatedJobs = 0
      while (!isStop()) {
        const jobs = helper.jobList.value.slice()
        if (!jobs.length) break
        const hasNewJobs = jobs.some((job) => !seenJobs.has(job.key))
        repeatedJobs = hasNewJobs ? 0 : repeatedJobs + jobs.length
        for (const job of jobs) seenJobs.add(job.key)
        if (repeatedJobs >= 50) {
          log.warn('连续遇到至少 50 个重复岗位且没有新岗位，停止翻页')
          break
        }
        for (const [index, jobData] of jobs.entries()) {
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
            drafts.has(jobData.key) ||
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
        void feishuSync.flush()
        const hasMore = await helper.loadMoreJob(
          delay(helper.conf.formData.delayDeliveryPageNext, isStop),
        )
        if (!hasMore) break
      }
    })
  const stop = () => {
    if (busy.value) {
      status.value = 'stop'
      notifyStop()
    }
    void feishuSync.flush()
  }
  const reset = () => {
    if (busy.value) return
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
    busy,
    lastMode,
    drafts,
    status,
    current,
    total,
    errorMessage,
    pipeline,
    nodes,
    ctx: helper,
    stateMaps,
    rebuild: async () => {
      if (busy.value) return
      busy.value = true
      try {
        await rebuild()
      } finally {
        busy.value = false
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
