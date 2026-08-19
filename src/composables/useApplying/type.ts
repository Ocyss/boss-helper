import type { ContextLogger } from 'devlog-ui'

import type { HelperContext, JobData } from '@/composables/useHelper'
import type { FormDataInput } from '@/types/formData'
import type { amapDistance, amapGeocode } from '@/utils/amap'

import type { DeliveryWorkflow } from '.'
import { useDeliveryWorkflow } from '.'
import { DependencyMissingError } from './handles'

export type Task<C extends HelperContext<C, T, S>, T, S> = {
  id: string
  task: TaskHandler<C, T, S>
  deps: string[]
  before: Handler<C, T, S>[]
  after: Handler<C, T, S>[]
  label?: string
  desc?: string
  state?: JobStatus
  stateMsg?: string
  onEnd?: (ctx: TaskContext<C, T, S>) => void | Promise<void>
}

export type TaskPipeline<C extends HelperContext<C, T, S>, T, S> = Array<Task<C, T, S>>

export type TaskContext<C extends HelperContext<C, T, S>, T = any, S = any> = {
  now: Date
  helper: C
  index: number
  log: ContextLogger
}

export const jobStatusList = [
  'pending',
  'wait',
  // running 状态区分请求中和AI处理
  'running',
  'request',
  'ai',
  // result状态区分成功、失败和警告
  'success',
  'warn',
  'error',
] as const

export type JobStatus = (typeof jobStatusList)[number]

export interface WorkflowState {
  amap?: {
    geocode?: Awaited<ReturnType<typeof amapGeocode>>
    distance?: Awaited<ReturnType<typeof amapDistance>>
  }
  pendingGreeting?: FormDataInput['value']
}

export interface WorkflowData<T, S> {
  jobData: JobData
  rawData: T
  state: WorkflowState & Partial<S>
}

export type TaskResult = {
  isSkip?: boolean
  reason?: string
  status?: JobStatus
  msg?: string
  isCache?: boolean
  id?: string
}

export type Handler<C extends HelperContext<C, T, S>, T, S> = (
  ctx: TaskContext<C, T, S>,
  data: WorkflowData<T, S>,
) => Promise<void | TaskResult | Array<TaskResult | void>>

export type TaskHandler<C extends HelperContext<C, T, S>, T, S> =
  | ((ctx: TaskContext<C, T, S>) => Promise<Handler<C, T, S> | void>)
  | ((ctx: TaskContext<C, T, S>) => Handler<C, T, S> | void)
  | ((ctx: TaskContext<C, T, S>) => {
      fn: Handler<C, T, S>
      before?: Handler<C, T, S>[]
      after?: Handler<C, T, S>[]
      onEnd?: (ctx: TaskContext<C, T, S>) => void | Promise<void>
    } | void)
  | ((ctx: TaskContext<C, T, S>) => Promise<{
      fn: Handler<C, T, S>
      before?: Handler<C, T, S>[]
      after?: Handler<C, T, S>[]
      onEnd?: (ctx: TaskContext<C, T, S>) => void | Promise<void>
    } | void>)

export function defineTaskHandler<C extends HelperContext<C, T, S>, T, S>(
  id: string,
  task: TaskHandler<C, T, S>,
  opt?: {
    before?: Handler<C, T, S>[]
    after?: Handler<C, T, S>[]
    deps?: string[]
    label?: string
    desc?: string
    state?: JobStatus
    stateMsg?: string
    onEnd?: (ctx: TaskContext<C, T, S>) => void | Promise<void>
  },
): (options?: {
  task?: TaskHandler<C, T, S>
  deps?: string[]
  before?: Handler<C, T, S>[]
  after?: Handler<C, T, S>[]
  label?: string
  desc?: string
  state?: JobStatus
  stateMsg?: string
  onEnd?: (ctx: TaskContext<C, T, S>) => void | Promise<void>
}) => Task<C, T, S> {
  return (options) => {
    const {
      task: t = task,
      deps: d = opt?.deps ?? [],
      before: b,
      after: a,
      label: l = opt?.label,
      desc: s = opt?.desc,
      state: st = opt?.state,
      stateMsg: sm = opt?.stateMsg,
      onEnd: oe = opt?.onEnd,
    } = options || {}
    return {
      id,
      task: t,
      deps: d,
      before: [...(b ?? []), ...(opt?.before ?? [])],
      after: [...(a ?? []), ...(opt?.after ?? [])],
      label: l,
      desc: s,
      state: st,
      stateMsg: sm,
      onEnd: oe,
    }
  }
}
export type TaskStatus =
  | 'active'
  | 'dependency_only'
  | 'shadowed'
  | 'failed'
  | 'skipped'
  | 'disabled'

export function defineTaskWorkflow<C extends HelperContext<C, T, S>, T, S = {}>(
  ...items: Array<Task<C, T, S> | TaskPipeline<C, T, S> | (() => Task<C, T, S>)>
): (ctx: C) => Promise<DeliveryWorkflow<C, T, S>> {
  const allDefinitions = items.flatMap((i) => (typeof i === 'function' ? i() : i))

  return async (_ctx: C) => useDeliveryWorkflow(allDefinitions, _ctx)
}
export function createLazyObject<T extends object>(taskId: string): T {
  let _data: T | undefined
  let _initialized = false

  return new Proxy({} as T, {
    get(target, prop, receiver) {
      if (prop === '__isProxy') return true
      if (prop === '__initialized') return _initialized

      if (typeof prop === 'symbol' || prop.startsWith('__v_')) {
        return undefined
      }
      if (!_initialized) {
        throw new DependencyMissingError(taskId)
      }
      return Reflect.get(_data!, prop, receiver)
    },
    set(target, prop, value) {
      if (!_data) {
        _data = {} as T
      }
      _data[prop as keyof T] = value
      _initialized = true
      return true
    },
    getOwnPropertyDescriptor(target, prop) {
      if (
        prop === '__isProxy' ||
        prop === '__initialized' ||
        (typeof prop === 'string' && prop.startsWith('__v_'))
      ) {
        return {
          configurable: true,
          enumerable: false,
          writable: false,
          value: prop === '__isProxy' ? true : prop === '__initialized' ? _initialized : undefined,
        }
      }
      return _initialized ? Reflect.getOwnPropertyDescriptor(_data!, prop) : undefined
    },
    ownKeys() {
      return _initialized ? Reflect.ownKeys(_data!) : []
    },
  })
}

export function isInitialized(val: any): boolean {
  if (val && typeof val === 'object' && val.__isProxy) {
    return !!val.__initialized
  }
  return true
}
