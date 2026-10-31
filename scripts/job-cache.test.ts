import { expect, mock, test } from 'bun:test'

import type { TaskResult } from '../src/composables/useApplying/type'

mock.module('@/message', () => ({ counter: {} }))
const { JobResultCache } = await import('../src/composables/useHelper/jobCache')

type Entries = Record<string, { result: TaskResult; savedAt: number }>
function storage() {
  const data = new Map<string, Entries>()
  return {
    data,
    storageGet: mock(
      async <T>(key: string, fallback: T): Promise<T> =>
        structuredClone(data.get(key) ?? fallback) as T,
    ),
    storageSet: mock(async (key: string, value: Entries) => {
      await Promise.resolve()
      data.set(key, structuredClone(value))
    }),
  }
}
const success: TaskResult = { status: 'success', msg: 'passed' }

test('returns misses and cached success and skipped warning results', async () => {
  const adapter = storage()
  const cache = new JobResultCache(() => 'uid', adapter)
  expect(await cache.get('missing', 1000)).toBeNull()
  await cache.set('job', success)
  expect(await cache.get('job', 1000)).toEqual({ ...success, isCache: true })
  const warn: TaskResult = { status: 'warn', isSkip: true, reason: 'filtered' }
  await cache.set('skip', warn)
  expect(await cache.get('skip', 1000)).toEqual({ ...warn, isCache: true })
  expect(adapter.data.get('local:job-result-cache:uid')?.job?.savedAt).toBeNumber()
  expect(success.isCache).toBeUndefined()
})

test('expires in milliseconds, while zero means unlimited', async () => {
  const adapter = storage()
  adapter.data.set('local:job-result-cache:uid', {
    old: { result: success, savedAt: Date.now() - 10_000 },
  })
  const cache = new JobResultCache(() => 'uid', adapter)
  expect(await cache.get('old', 1000)).toBeNull()
  expect(await cache.get('old', 0)).toEqual({ ...success, isCache: true })
})

test('does not cache errors, ready, or unsupported success/warning combinations', async () => {
  const adapter = storage()
  const cache = new JobResultCache(() => 'uid', adapter)
  for (const result of [
    { status: 'error', isSkip: true },
    { status: 'ready' },
    { status: 'success', isSkip: true },
    { status: 'warn', isSkip: false },
    {},
  ] satisfies TaskResult[]) {
    await cache.set('job', result)
  }
  expect(adapter.storageSet).not.toHaveBeenCalled()
  expect(await cache.get('job', 0)).toBeNull()
})

test('isolates plugin account slots and captures the slot before async work', async () => {
  const adapter = storage()
  let account = 'a/b'
  const cache = new JobResultCache(() => account, adapter)
  const pending = cache.set('boss::job', success)
  account = 'other'
  await pending
  expect(await cache.get('boss::job', 0)).toBeNull()
  await cache.set('boss::job', { status: 'warn', isSkip: true })
  account = 'a/b'
  expect(await cache.get('boss::job', 0)).toEqual({ ...success, isCache: true })
  expect(adapter.data.get('local:job-result-cache:a%2Fb')?.['boss::job']).toBeDefined()
})

test('website uid changes do not change the plugin account cache slot', async () => {
  const adapter = storage()
  const pluginAccount = 'default'
  let websiteUid = 'website-a'
  const cache = new JobResultCache(() => pluginAccount, adapter)
  await cache.set('boss::job', success)
  websiteUid = 'website-b'
  expect(websiteUid).toBe('website-b')
  expect(await cache.get('boss::job', 0)).toEqual({ ...success, isCache: true })
  expect(adapter.data.has('local:job-result-cache:default')).toBe(true)
})

test('shares initialization and serializes concurrent writes across instances', async () => {
  const adapter = storage()
  adapter.data.set('local:job-result-cache:uid', {
    existing: { result: success, savedAt: Date.now() },
  })
  const first = new JobResultCache(() => 'uid', adapter)
  const second = new JobResultCache(() => 'uid', adapter)
  await Promise.all([
    first.get('existing', 0),
    second.get('existing', 0),
    first.set('one', success),
    second.set('two', success),
    first.set('three', success),
  ])
  expect(adapter.storageGet).toHaveBeenCalledTimes(1)
  expect(Object.keys(adapter.data.get('local:job-result-cache:uid')!)).toEqual([
    'existing',
    'one',
    'two',
    'three',
  ])
})

test('propagates load failures and retries initialization', async () => {
  const adapter = storage()
  adapter.storageGet.mockImplementationOnce(async () => {
    throw new Error('read failed')
  })
  const cache = new JobResultCache(() => 'uid', adapter)
  await expect(cache.get('job', 0)).rejects.toThrow('read failed')
  await cache.set('job', success)
  expect(await cache.get('job', 0)).toEqual({ ...success, isCache: true })
})

test('propagates write failures without poisoning the queue or publishing unsaved results', async () => {
  const adapter = storage()
  adapter.storageSet.mockImplementationOnce(async () => {
    throw new Error('write failed')
  })
  const cache = new JobResultCache(() => 'uid', adapter)
  await expect(cache.set('job', success)).rejects.toThrow('write failed')
  expect(await cache.get('job', 0)).toBeNull()
  await cache.set('job', success)
  expect(await cache.get('job', 0)).toEqual({ ...success, isCache: true })
})
