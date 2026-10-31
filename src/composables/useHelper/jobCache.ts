import { counter } from '@/message'

import type { TaskResult } from '../useApplying/type'

type Entries = Record<string, { result: TaskResult; savedAt: number }>

export interface JobCacheStorage {
  storageGet<T>(key: string, fallback: T): Promise<T>
  storageSet(key: string, value: Entries): Promise<unknown>
}

type Store = {
  entries?: Entries
  ready?: Promise<Entries>
  queue: Promise<unknown>
}

// Instances using the same adapter also share initialization and write ordering.
const stores = new WeakMap<JobCacheStorage, Map<string, Store>>()

export class JobResultCache {
  constructor(
    private getAccount: () => string,
    private storage: JobCacheStorage = counter,
  ) {}

  private store() {
    const key = `local:job-result-cache:${encodeURIComponent(this.getAccount())}`
    let accounts = stores.get(this.storage)
    if (!accounts) stores.set(this.storage, (accounts = new Map()))
    let state = accounts.get(key)
    if (!state) accounts.set(key, (state = { queue: Promise.resolve() }))
    return { key, state }
  }

  private load(key: string, state: Store): Promise<Entries> {
    if (state.entries) return Promise.resolve(state.entries)
    if (!state.ready) {
      state.ready = Promise.resolve()
        .then(() => this.storage.storageGet<Entries>(key, {}))
        .then((entries) => (state.entries = entries))
        .finally(() => {
          state.ready = undefined
        })
    }
    return state.ready
  }

  async get(key: string, expire: number): Promise<TaskResult | null> {
    const { key: storageKey, state } = this.store()
    await state.queue
    const entry = (await this.load(storageKey, state))[key]
    if (!entry || (expire > 0 && Date.now() - entry.savedAt >= expire)) return null
    return { ...entry.result, isCache: true }
  }

  async set(key: string, result: TaskResult): Promise<void> {
    if (
      !(result.status === 'success' && !result.isSkip) &&
      !(result.status === 'warn' && result.isSkip)
    )
      return

    const { key: storageKey, state } = this.store()
    const entry = { result: { ...result }, savedAt: Date.now() }
    const pending = state.queue.then(async () => {
      const entries = { ...(await this.load(storageKey, state)), [key]: entry }
      await this.storage.storageSet(storageKey, entries)
      state.entries = entries
    })
    state.queue = pending.catch(() => {})
    await pending
  }
}
