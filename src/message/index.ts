import type { StorageLikeAsync } from '@vueuse/core'
import { defineProxy } from 'comctx'

import { InjectBackgroundAdapter } from './background'
import type { BackgroundCounter } from './background'
import type { ContentCounter } from './contentScript'
import { ContentCounter as ExtensionCounter } from './contentScript'
import { ProvideContentScriptAdapter } from './contentScriptShare'

export const InjectAdapter = ProvideContentScriptAdapter

let _counter: ContentCounter | null = null

export function initCounter(
  script: HTMLScriptElement = document.currentScript as HTMLScriptElement,
) {
  const [, injectCounter] = defineProxy(() => ({}) as ContentCounter, {
    namespace: '__boss-helper-content__',
  })
  _counter = injectCounter(new InjectAdapter(script))
}

export function initExtensionCounter() {
  const [, injectBackground] = defineProxy(() => ({}) as BackgroundCounter, {
    namespace: '__boss-helper-background__',
  })
  _counter = new ExtensionCounter(injectBackground(new InjectBackgroundAdapter('popup')))
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
    return new Promise((resolve) => {
      const t = setInterval(() => {
        if (_counter) {
          void counter.storageGet(key).then((value) => {
            return resolve(value as never)
          })
          clearInterval(t)
        }
      }, 200)
    })
  },
  async setItem(key, value) {
    await counter.storageSet(key, value)
  },
  async removeItem(key) {
    await counter.storageRm(key)
  },
}
