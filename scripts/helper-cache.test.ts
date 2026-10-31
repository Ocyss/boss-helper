import { expect, mock, test } from 'bun:test'

mock.module('@/message', () => ({ counter: {} }))
const { HelperCache } = await import('../src/composables/useHelper/cache')

type Entries = Record<string, number>
function storage() {
  const data = new Map<string, Entries>()
  return {
    data,
    storageGet: mock(
      async <T>(key: string, fallback: T): Promise<T> =>
        structuredClone(data.get(key) ?? fallback) as T,
    ),
    storageSet: mock(async (key: string, value: Entries) => {
      data.set(key, structuredClone(value))
    }),
  }
}

test('isolates plugin account slots and reuses memory when switching back', async () => {
  const adapter = storage()
  let account = 'slot/a:b'
  const cache = new HelperCache(() => account, adapter)
  await cache.add('company', 'company-id', 123)
  account = 'other'
  expect(await cache.has('company', 'company-id')).toBe(false)
  await cache.add('company', 'other-company', 456)
  await cache.save('company')
  account = 'slot/a:b'
  expect(await cache.has('company', 'company-id')).toBe(true)
  expect(await cache.has('company', 'other-company')).toBe(false)
  await cache.save('company')
  expect(adapter.data.get('company:slot%2Fa%3Ab')).toEqual({ 'company-id': 123 })
  expect(adapter.data.get('company:other')).toEqual({ 'other-company': 456 })
  expect(adapter.storageGet).toHaveBeenCalledTimes(2)
})

test('captures the slot before asynchronous loads for has, add and save', async () => {
  const adapter = storage()
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  adapter.storageGet.mockImplementation(async <T>(key: string, fallback: T): Promise<T> => {
    await gate
    return structuredClone(adapter.data.get(key) ?? fallback) as T
  })
  adapter.data.set('company:first', { existing: 100 })
  let account = 'first'
  const cache = new HelperCache(() => account, adapter)
  const has = cache.has('company', 'existing')
  const add = cache.add('company', 'added', 200)
  const save = cache.save('company')
  account = 'second'
  const other = cache.has('company', 'existing')
  release()
  expect(await has).toBe(true)
  await Promise.all([add, save])
  expect(await other).toBe(false)
  expect(adapter.data.get('company:first')).toEqual({ existing: 100, added: 200 })
  expect(adapter.data.has('company:second')).toBe(false)
  account = 'first'
  expect(await cache.has('company', 'added')).toBe(true)
  expect(adapter.storageGet).toHaveBeenCalledTimes(2)
})

test('loads and saves flat company and HR IDs without reading legacy keys', async () => {
  const adapter = storage()
  adapter.data.set('company:slot', { 'company-id': 123 })
  adapter.data.set('hr:slot', { 'hr-id': 456 })
  const cache = new HelperCache(() => 'slot', adapter)
  expect(await cache.has('company', 'company-id')).toBe(true)
  expect(await cache.has('hr', 'hr-id')).toBe(true)
  expect(await cache.has('company', 'hr-id')).toBe(false)
  await cache.add('hr', 'new-hr', 789)
  await cache.save('company')
  await cache.save('hr')
  expect(adapter.data.get('company:slot')).toEqual({ 'company-id': 123 })
  expect(adapter.data.get('hr:slot')).toEqual({ 'hr-id': 456, 'new-hr': 789 })
  expect(adapter.storageGet.mock.calls.map(([key]) => key)).toEqual(['company:slot', 'hr:slot'])
})

test('only removes expired entries on save with a positive expiry', async () => {
  const adapter = storage()
  const cache = new HelperCache(() => 'slot', adapter)
  await cache.add('hr', 'old', Date.now() - 10_000)
  await cache.add('hr', 'recent', Date.now())
  expect(await cache.has('hr', 'old')).toBe(true)
  await cache.save('hr', 0)
  expect(adapter.data.get('hr:slot')).toHaveProperty('old')
  await cache.save('hr', -1)
  expect(await cache.has('hr', 'old')).toBe(true)
  await cache.save('hr', 1000)
  expect(await cache.has('hr', 'old')).toBe(false)
  expect(Object.keys(adapter.data.get('hr:slot')!)).toEqual(['recent'])
})
