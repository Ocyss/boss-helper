import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test'

import { computed, ref } from 'vue'

import type { WorkflowData, TaskResult } from '../src/composables/useApplying/type'

const log = {
  info: mock(() => {}),
  warn: mock(() => {}),
  error: mock(() => {}),
  debug: mock(() => {}),
  withContext: () => log,
}
const toast = { add: mock(() => {}) }
const config = {
  enabled: true,
  appId: 'app',
  appSecret: 'secret',
  appToken: 'token',
  tableIdBoss: 'table',
}
const storageGet = mock(async (_key: string) => config)
const feishuUpsert = mock(async (_rows: Record<string, unknown>[]) => ({ success: true }))

// Mock boundaries only: workflow execution, row snapshots and batching stay real.
mock.module('../src/message', () => ({ counter: { storageGet, feishuUpsert } }))
mock.module('../src/utils/logger', () => ({ logger: log }))
mock.module('../src/utils/ai', () => ({ parseGptJson: JSON.parse }))

mock.module('../src/composables/useApplying/handles', () => ({
  DependencyMissingError: class extends Error {
    constructor(public taskId: string) {
      super(taskId)
    }
  },
}))

const globals = {
  computed,
  logger: log,
  useToast: () => toast,
  delay: async () => {},
  jsonClone: (value: unknown) => JSON.parse(JSON.stringify(value)),
}
const descriptors = new Map(
  Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
)
Object.assign(globalThis, globals)
afterAll(() => {
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else Reflect.deleteProperty(globalThis, key)
  }
})

mock.module('@/message', () => ({ counter: { storageGet, feishuUpsert } }))
mock.module('@/utils/logger', () => ({ logger: log }))
mock.module('@/utils/ai', () => ({ parseGptJson: JSON.parse }))

const realApplyingUtils = await import('../src/composables/useApplying/utils')
mock.module('@/composables/useApplying/utils', () => realApplyingUtils)
const realFeishuSync = await import('../src/utils/feishuSync')
mock.module('@/utils/feishuSync', () => realFeishuSync)

const { useDeliveryWorkflow } = await import('../src/composables/useApplying/index')
type Data = WorkflowData<{ key: string }, Record<string, never>>
type Handler = (ctx: unknown, data: Data) => Promise<void | TaskResult | Array<TaskResult | void>>

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function fixture(
  count = 1,
  overrides: Partial<Record<'filter' | 'generate' | 'delivery', Handler>> = {},
) {
  const jobs = Array.from({ length: count }, (_, i) => ({
    key: `job-${i}`,
    companyId: `company-${i}`,
    hrId: `hr-${i}`,
    jobName: `工程师-${i}`,
    brand: { name: '测试公司', labels: ['技术'] },
    boss: { name: '测试HR' },
  }))
  const helper = {
    jobList: ref(jobs),
    jobMaps: new Map(),
    jobResultMaps: new Map<string, TaskResult>(),
    jobCache: {
      get: mock(async (_key: string, _expire: number): Promise<TaskResult | null> => null),
      set: mock(async (_key: string, _result: TaskResult) => {}),
    },
    currentJob: ref(''),
    statistics: { todayData: ref({ total: 0, success: 0, tasks: {} }) },
    accounts: {
      currentAccount: ref({ label: '测试账号', value: 'account-id' }),
      activeAccount: ref('account-id'),
    },
    conf: {
      formDataPreset: ref('测试预设'),
      formData: {
        aiGreeting: { enable: true },
        useCache: { value: false, expire: 60_000 },
        deliveryLimit: ref(100),
        delayDeliveryStarts: 0,
        delayDeliveryInterval: 0,
        delayDeliveryPageNext: 0,
      },
    },
    chatModel: { states: new Map() },
    loadMoreJob: mock(async () => false),
  }
  const handlers = {
    filter: mock(overrides.filter ?? (async () => {})),
    generate: mock(
      overrides.generate ??
        (async (_ctx, data) => {
          data.state.aiGreeting = { greeting: '您好，我对这个岗位很感兴趣', reason: '技能匹配' }
        }),
    ),
    delivery: mock(overrides.delivery ?? (async () => ({ status: 'success', msg: '投递成功' }))),
  }
  const tasks = (['filter', 'generate', 'delivery'] as const).map((phase) => ({
    id: phase,
    phase,
    deps: [],
    before: [],
    after: [] as Handler[],
    onDelivered: mock(async () => {}),
    task: () => handlers[phase],
  }))
  // The fixture intentionally implements only the HelperContext surface consumed here.
  const create = () => useDeliveryWorkflow(tasks as any, helper as any)
  return {
    helper,
    handlers,
    tasks,
    create,
    raw: new Map(jobs.map((job) => [job.key, { key: job.key }])),
  }
}

async function settleSync() {
  // flush() is intentionally fire-and-forget in production; drain its microtasks.
  for (let i = 0; i < 30; i++) await Promise.resolve()
}

beforeEach(() => {
  feishuUpsert.mockReset()
  feishuUpsert.mockImplementation(async () => ({ success: true }))
  storageGet.mockClear()
  toast.add.mockClear()
})

describe('真实 executeAll 的岗位结果缓存', () => {
  test('启用时缓存过滤阶段 warn isSkip，且不执行后续阶段', async () => {
    const result: TaskResult = { status: 'warn', isSkip: true, msg: '不匹配', reason: '技能不符' }
    const f = fixture(1, { filter: async () => result })
    f.helper.conf.formData.useCache.value = true
    const workflow = await f.create()
    expect(await workflow.executeAll(f.raw, 'auto')).toBe(true)
    expect(f.helper.jobCache.get).toHaveBeenCalledWith('job-0', 60_000)
    expect(f.helper.jobCache.set).toHaveBeenCalledTimes(1)
    expect(f.helper.jobCache.set).toHaveBeenCalledWith('job-0', result)
    expect(f.handlers.filter).toHaveBeenCalledTimes(1)
    expect(f.handlers.generate).not.toHaveBeenCalled()
    expect(f.handlers.delivery).not.toHaveBeenCalled()
    await settleSync()
  })

  test('启用时在投递成功后写入 success', async () => {
    const f = fixture()
    f.helper.conf.formData.useCache.value = true
    const workflow = await f.create()
    expect(await workflow.executeAll(f.raw, 'auto')).toBe(true)
    expect(f.handlers.delivery).toHaveBeenCalledTimes(1)
    expect(f.helper.jobCache.set).toHaveBeenCalledTimes(1)
    expect(f.helper.jobCache.set).toHaveBeenCalledWith('job-0', {
      status: 'success',
      msg: '投递成功',
    })
    await settleSync()
  })

  for (const outcome of ['throw', 'skip'] as const) {
    test(`投递成功后 after ${outcome} 保留成功结果且仅记录一次`, async () => {
      const f = fixture()
      f.helper.conf.formData.useCache.value = true
      const success = { status: 'success', msg: '投递成功' }
      const after = mock(async () => {
        expect(f.helper.jobCache.set).toHaveBeenCalledTimes(1)
        expect(f.helper.jobCache.set).toHaveBeenCalledWith('job-0', success)
        expect(f.helper.statistics.todayData.value.success).toBe(1)
        for (const task of f.tasks) expect(task.onDelivered).toHaveBeenCalledTimes(1)
        if (outcome === 'throw') throw new Error('招呼语发送失败')
        return { status: 'warn' as const, isSkip: true, msg: '招呼语跳过', reason: '后续条件不符' }
      })
      f.tasks.find((task) => task.phase === 'delivery')!.after.push(after)
      const workflow = await f.create()
      expect(await workflow.executeAll(f.raw, 'auto')).toBe(true)
      expect(after).toHaveBeenCalledTimes(1)
      expect(f.handlers.delivery).toHaveBeenCalledTimes(1)
      expect(f.helper.jobCache.set).toHaveBeenCalledTimes(1)
      expect(f.helper.jobCache.set).toHaveBeenCalledWith('job-0', success)
      expect(f.helper.statistics.todayData.value.success).toBe(1)
      for (const task of f.tasks) expect(task.onDelivered).toHaveBeenCalledTimes(1)
      expect(f.helper.jobResultMaps.get('job-0')).toMatchObject({
        status: 'success',
        msg: expect.stringContaining('后续处理失败'),
        reason: outcome === 'throw' ? '招呼语发送失败' : '后续条件不符',
      })
      expect(f.helper.jobResultMaps.get('job-0')?.isSkip).not.toBe(true)
      await settleSync()
    })
  }

  test('数组结果的首项消息和原因仅合并一次', async () => {
    const f = fixture(1, {
      filter: async () => [
        { status: 'warn', isSkip: true, msg: '首项消息', reason: '首项原因' },
        undefined,
        { status: 'warn', msg: '第二项消息', reason: '第二项原因' },
      ],
    })
    f.helper.conf.formData.useCache.value = true
    const workflow = await f.create()
    expect(await workflow.executeAll(f.raw, 'auto')).toBe(true)
    const result = {
      status: 'warn',
      isSkip: true,
      msg: '首项消息\n第二项消息',
      reason: '首项原因\n第二项原因',
    }
    expect(f.helper.jobResultMaps.get('job-0')).toMatchObject(result)
    expect(f.helper.jobCache.set).toHaveBeenCalledTimes(1)
    expect(f.helper.jobCache.set).toHaveBeenCalledWith('job-0', expect.objectContaining(result))
    expect(f.handlers.delivery).not.toHaveBeenCalled()
    await settleSync()
  })

  for (const outcome of ['error', 'throw'] as const) {
    test(`启用时不缓存 ${outcome} 失败结果`, async () => {
      const f = fixture(1, {
        filter: async () => {
          if (outcome === 'throw') throw new Error('筛选失败')
          return { status: 'error', isSkip: true, msg: '筛选失败' }
        },
      })
      f.helper.conf.formData.useCache.value = true
      const workflow = await f.create()
      expect(await workflow.executeAll(f.raw, 'auto')).toBe(true)
      expect(f.helper.jobCache.get).toHaveBeenCalledTimes(1)
      expect(f.helper.jobCache.set).not.toHaveBeenCalled()
      expect(f.helper.jobResultMaps.get('job-0')?.status).toBe('error')
      expect(f.handlers.delivery).not.toHaveBeenCalled()
      await settleSync()
    })
  }

  test('命中缓存后保留缓存结果并跳过所有执行阶段', async () => {
    const f = fixture()
    const cached: TaskResult = { status: 'warn', isSkip: true, isCache: true, msg: '已过滤' }
    f.helper.conf.formData.useCache.value = true
    f.helper.jobCache.get.mockResolvedValue(cached)
    const workflow = await f.create()
    expect(await workflow.executeAll(f.raw, 'auto')).toBe(true)
    expect(f.helper.jobCache.get).toHaveBeenCalledWith('job-0', 60_000)
    expect(f.helper.jobResultMaps.get('job-0')).toEqual(cached)
    for (const handler of Object.values(f.handlers)) expect(handler).not.toHaveBeenCalled()
    expect(f.helper.jobCache.set).not.toHaveBeenCalled()
    expect(f.helper.statistics.todayData.value.total).toBe(0)
    await settleSync()
  })

  for (const outcome of ['success', 'skip'] as const) {
    test(`禁用时 ${outcome} 正常执行且不读写缓存`, async () => {
      const f = fixture(
        1,
        outcome === 'skip'
          ? { filter: async () => ({ status: 'warn', isSkip: true, msg: '不匹配' }) }
          : {},
      )
      f.helper.jobCache.get.mockResolvedValue({ status: 'success', isCache: true })
      const workflow = await f.create()
      expect(await workflow.executeAll(f.raw, 'auto')).toBe(true)
      expect(f.handlers.filter).toHaveBeenCalledTimes(1)
      expect(f.handlers.delivery).toHaveBeenCalledTimes(outcome === 'success' ? 1 : 0)
      expect(f.helper.jobCache.get).not.toHaveBeenCalled()
      expect(f.helper.jobCache.set).not.toHaveBeenCalled()
      expect(f.helper.jobResultMaps.get('job-0')?.status).toBe(
        outcome === 'success' ? 'success' : 'warn',
      )
      await settleSync()
    })
  }
})

describe('真实 executeAll 的 runJob finally 飞书同步', () => {
  for (const mode of ['filter', 'generate', 'auto'] as const) {
    test(`${mode}: 同步最终状态和账号 label，并按模式执行阶段`, async () => {
      const f = fixture()
      const workflow = await f.create()
      expect(await workflow.executeAll(f.raw, mode)).toBe(true)
      await settleSync()
      expect(feishuUpsert).toHaveBeenCalledTimes(1)
      const row = feishuUpsert.mock.calls[0]![0][0]!
      expect(row).toMatchObject({
        key: 'job-0',
        使用账号: '测试账号',
        使用预设: '测试预设',
        '处理状态-类别': mode === 'auto' ? 'success' : 'ready',
        处理状态: mode === 'filter' ? '待投递' : mode === 'generate' ? '待确认发送' : '投递成功',
      })
      expect(f.handlers.filter).toHaveBeenCalledTimes(1)
      expect(f.handlers.generate).toHaveBeenCalledTimes(mode === 'filter' ? 0 : 1)
      expect(f.handlers.delivery).toHaveBeenCalledTimes(mode === 'auto' ? 1 : 0)
      if (mode !== 'filter') expect(row.AI招呼语).toBe('您好，我对这个岗位很感兴趣')
      expect(storageGet).toHaveBeenCalledWith('local:feishu-config')
      expect(workflow.busy.value).toBe(false)
    })

    test(`${mode}: 暂停中断挂起任务，finally 同步已停止且不执行下一岗位`, async () => {
      const entered = deferred<void>()
      const blocked = deferred<void>()
      const phase = mode === 'auto' ? 'delivery' : mode
      const f = fixture(2, {
        [phase]: async () => {
          entered.resolve()
          await blocked.promise
        },
      })
      const workflow = await f.create()
      const running = workflow.executeAll(f.raw, mode)
      await entered.promise
      expect(feishuUpsert).not.toHaveBeenCalled()
      workflow.stop()
      try {
        expect(await running).toBe(true)
        await settleSync()
        expect(workflow.status.value).toBe('stop')
        expect(workflow.busy.value).toBe(false)
        expect(feishuUpsert).toHaveBeenCalledTimes(1)
        expect(feishuUpsert.mock.calls[0]![0]).toMatchObject([
          { key: 'job-0', 处理状态: '已停止', '处理状态-类别': 'wait', 使用账号: '测试账号' },
        ])
        expect(f.helper.jobResultMaps.has('job-1')).toBe(false)
        expect(f.helper.loadMoreJob).not.toHaveBeenCalled()
        expect(f.helper.statistics.todayData.value.success).toBe(0)
      } finally {
        blocked.resolve()
        await settleSync()
      }
    }, 2000)
  }

  for (const outcome of ['skip', 'throw'] as const) {
    test(`${outcome}: 提前退出或异常仍从 finally 同步`, async () => {
      const f = fixture(1, {
        filter: async () => {
          if (outcome === 'throw') throw new Error('筛选请求失败')
          return { status: 'warn', msg: '不匹配', reason: '技能不符', isSkip: true }
        },
      })
      const workflow = await f.create()
      expect(await workflow.executeAll(f.raw, 'auto')).toBe(true)
      await settleSync()
      expect(feishuUpsert).toHaveBeenCalledTimes(1)
      expect(feishuUpsert.mock.calls[0]![0][0]).toMatchObject(
        outcome === 'throw'
          ? { '处理状态-类别': 'error', 处理状态: '执行失败', '处理状态-原因': '筛选请求失败' }
          : { '处理状态-类别': 'warn', 处理状态: '不匹配', '处理状态-原因': '技能不符' },
      )
      expect(f.handlers.delivery).not.toHaveBeenCalled()
    })
  }

  test('第 5 个岗位完成即发送，未满 5 条的尾批在结束时发送', async () => {
    const entered = deferred<void>()
    const release = deferred<void>()
    const f = fixture(6, {
      filter: async (_ctx, data) => {
        if (data.jobData.key === 'job-5') {
          entered.resolve()
          await release.promise
        }
      },
    })
    const workflow = await f.create()
    const running = workflow.executeAll(f.raw, 'filter')
    await entered.promise
    try {
      await settleSync()
      expect(feishuUpsert).toHaveBeenCalledTimes(1)
      expect(feishuUpsert.mock.calls[0]![0].map((row) => row.key)).toEqual([
        'job-0',
        'job-1',
        'job-2',
        'job-3',
        'job-4',
      ])
    } finally {
      release.resolve()
    }
    expect(await running).toBe(true)
    await settleSync()
    expect(feishuUpsert).toHaveBeenCalledTimes(2)
    expect(feishuUpsert.mock.calls[1]![0]).toMatchObject([{ key: 'job-5', 处理状态: '待投递' }])
  })

  test('同步失败触发 onError 提示且保留快照供 stop 重试', async () => {
    feishuUpsert.mockRejectedValue(new Error('飞书网络错误'))
    const f = fixture()
    const workflow = await f.create()
    expect(await workflow.executeAll(f.raw, 'generate')).toBe(true)
    await settleSync()
    expect(toast.add).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'feishu-sync-error',
        description: '飞书网络错误',
        color: 'error',
      }),
    )
    expect(workflow.status.value).toBe('pending')
    const failedRows = feishuUpsert.mock.calls[0]![0]
    const attempts = feishuUpsert.mock.calls.length
    feishuUpsert.mockResolvedValue({ success: true })
    workflow.stop()
    await settleSync()
    expect(feishuUpsert).toHaveBeenCalledTimes(attempts + 1)
    expect(feishuUpsert.mock.calls[attempts]![0]).toEqual(failedRows)
  })
})
