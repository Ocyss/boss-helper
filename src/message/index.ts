import type { StorageLikeAsync } from '@vueuse/core'
import { defineProxy } from 'comctx'

import { jsonClone } from '@/utils/deepmerge'

import { type ContentCounter } from './contentScript'
import { ProvideContentAdapter } from './contentScriptShare'

// export type * from './background'
// export type * from './contentScript'

export const [, injectCounter] = defineProxy(() => ({}) as ContentCounter, {
  namespace: '__boss-helper-content__',
})

// export default class InjectAdapter implements Adapter {
//   sendMessage: SendMessage = (message) => {
//     window.postMessage(message, '*')
//   }

//   onMessage: OnMessage = (callback) => {
//     const handler = (event: MessageEvent<Partial<Message<Record<string, any>>> | undefined>) =>
//       callback(event.data)
//     window.addEventListener('message', handler)
//     return () => window.removeEventListener('message', handler)
//   }
// }

export const InjectAdapter = ProvideContentAdapter

const injectedCounter = import.meta.env.SSR
  ? ({} as ContentCounter)
  : injectCounter(new InjectAdapter())

const storageTimeout = 10000

function withStorageTimeout<T>(operation: string, promise: Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`浏览器存储${operation}超时，请重新加载扩展和当前页面`)),
      storageTimeout,
    )
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
  })
}

function storageGet<T>(key: string, defaultValue: T): Promise<T>
function storageGet<T>(key: string): Promise<T | null>
function storageGet<T>(key: string, defaultValue?: T): Promise<T | null> {
  const promise =
    defaultValue === undefined
      ? injectedCounter.storageGet<T>(key)
      : injectedCounter.storageGet(key, defaultValue)
  return withStorageTimeout(`读取(${key})`, promise)
}

function storageSet<T>(key: string, value: T): Promise<boolean> {
  const plainValue = value !== null && typeof value === 'object' ? jsonClone(value) : value
  return withStorageTimeout(`写入(${key})`, injectedCounter.storageSet(key, plainValue))
}

function storageRm(key: string): Promise<boolean> {
  return withStorageTimeout(`删除(${key})`, injectedCounter.storageRm(key))
}

export const counter = new Proxy(injectedCounter, {
  get(target, property, receiver) {
    if (property === 'storageGet') return storageGet
    if (property === 'storageSet') return storageSet
    if (property === 'storageRm') return storageRm
    return Reflect.get(target, property, receiver)
  },
})

export const ExtStorage: StorageLikeAsync = import.meta.env.SSR
  ? {
      async getItem() {
        return null
      },
      async setItem() {},
      async removeItem() {},
    }
  : {
      async getItem(key) {
        return counter.storageGet(key)
      },
      async setItem(key, value) {
        await counter.storageSet(key, value)
      },
      async removeItem(key) {
        await counter.storageRm(key)
      },
    }
