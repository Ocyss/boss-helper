import { beforeEach, expect, mock, test } from 'bun:test'

const upsert = mock(async (_rows: Record<string, unknown>[]) => ({ created: 5, updated: 0 }))
const config = {
  enabled: true,
  appId: 'id',
  appSecret: 'secret',
  appToken: 'app',
  tableIdBoss: 'table',
}
mock.module('@/message', () => ({
  counter: { storageGet: async () => config, feishuUpsert: upsert },
}))
mock.module('@/utils/logger', () => ({ logger: { info() {}, warn() {} } }))
mock.module('@/composables/useApplying/utils', () => ({ parseFiltering: () => undefined }))
const { createFeishuSync, feishuJobRow } = await import('../src/utils/feishuSync')

beforeEach(() => {
  upsert.mockClear()
  upsert.mockImplementation(async () => ({ created: 5, updated: 0 }))
})

test('maps the account to a single-select string, not an account object', () => {
  const helper = {
    accounts: {
      currentAccount: { value: { value: 'account-id', label: '测试账号' } },
      activeAccount: { value: 'account-id' },
    },
    conf: { formDataPreset: { value: 'default' } },
    chatModel: { states: new Map() },
  }
  const data = { state: {}, jobData: { key: 'job', boss: {}, brand: { labels: [] } } }
  const row = feishuJobRow(helper as never, data as never)
  expect(row['使用账号']).toBe('测试账号')
})

test('syncs every five processed jobs and flushes the remainder', async () => {
  const sync = createFeishuSync()
  for (let i = 0; i < 4; i++) sync.add({ key: String(i) })
  expect(upsert).not.toHaveBeenCalled()
  sync.add({ key: '4' })
  await sync.flush()
  expect(upsert).toHaveBeenCalledTimes(1)
  expect(upsert.mock.calls[0]![0]).toHaveLength(5)
  for (let i = 5; i < 10; i++) sync.add({ key: String(i) })
  await sync.flush()
  expect(upsert).toHaveBeenCalledTimes(2)
  sync.add({ key: '10' })
  await sync.flush()
  expect(upsert.mock.calls[2]![0]).toEqual([{ key: '10' }])
})

test('reports failures and retries retained keys using their latest snapshots', async () => {
  const onError = mock(() => {})
  const sync = createFeishuSync(onError)
  upsert.mockImplementationOnce(async () => {
    throw new Error('字段类型错误')
  })
  sync.add({ key: 'job', 处理状态: '筛选完成' })
  await sync.flush()
  expect(onError).toHaveBeenCalledTimes(1)
  sync.add({ key: 'job', 处理状态: '生成完成' })
  await sync.flush()
  expect(upsert.mock.calls[1]![0]).toEqual([{ key: 'job', 处理状态: '生成完成' }])
  await sync.flush()
  expect(upsert).toHaveBeenCalledTimes(2)
})

test('keeps a newer snapshot added while a request is in flight', async () => {
  let finish!: () => void
  upsert.mockImplementationOnce(async () => {
    await new Promise<void>((resolve) => {
      finish = resolve
    })
    return { created: 1, updated: 0 }
  })
  const sync = createFeishuSync()
  sync.add({ key: 'job', version: 1 })
  const flight = sync.flush()
  await new Promise((resolve) => setTimeout(resolve, 0))
  sync.add({ key: 'job', version: 2 })
  void sync.flush()
  finish()
  await flight
  expect(upsert.mock.calls[1]![0]).toEqual([{ key: 'job', version: 2 }])
})
