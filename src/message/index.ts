import type { StorageLikeAsync } from '@vueuse/core'
import { defineProxy } from 'comctx'

import { BOSS_HELPER_V2_CONTENT_NAMESPACE } from '@/utils/namespace'

import { type ContentCounter } from './contentScript'
import { ProvideContentScriptAdapter } from './contentScriptShare'

export const InjectAdapter = ProvideContentScriptAdapter

let _counter: ContentCounter | null = null
let resolveCounterReady: () => void = () => undefined
const counterReady = new Promise<void>((resolve) => {
  resolveCounterReady = resolve
})

export function initCounter(
  script: HTMLScriptElement = document.currentScript as HTMLScriptElement,
) {
  const [, injectCounter] = defineProxy(() => ({}) as ContentCounter, {
    namespace: BOSS_HELPER_V2_CONTENT_NAMESPACE,
  })
  _counter = injectCounter(new InjectAdapter(script))
  // 让模块级 useStorageAsync 在 initCounter 之后继续读取真实本地配置。
  resolveCounterReady()
}

export const counter = new Proxy({} as ContentCounter, {
  get(_, key) {
    if (!_counter) {
      throw new Error(
        `Counter has not been initialized. Call initCounter() before using counter.${String(key)}`,
      )
    }

    const value = (_counter as any)[key]

    if (typeof value === 'function') {
      return value.bind(_counter)
    }

    return value
  },

  set(_, key, value) {
    if (!_counter) {
      throw new Error(
        `Counter has not been initialized. Call initCounter() before using counter.${String(key)}`,
      )
    }

    ;(_counter as any)[key] = value
    return true
  },
})

export const ExtStorage: StorageLikeAsync = {
  async getItem(key) {
    // WXT 的准备阶段没有页面 window，直接返回空值而不阻塞构建；运行时等待 content adapter。
    if (!_counter) {
      if (typeof window === 'undefined') return null
      await counterReady
    }
    return counter.storageGet(key)
  },
  async setItem(key, value) {
    if (!_counter) {
      if (typeof window === 'undefined') return
      await counterReady
    }
    await counter.storageSet(key, value)
  },
  async removeItem(key) {
    if (!_counter) {
      if (typeof window === 'undefined') return
      await counterReady
    }
    await counter.storageRm(key)
  },
}
