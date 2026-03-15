import type { StorageLikeAsync } from '@vueuse/core'
import type { Adapter, Message, OnMessage, SendMessage } from 'comctx'
import { defineProxy } from 'comctx'

import type { ContentCounter } from './contentScript'

export type { CookieInfo } from './background'
// export type * from './background'
// export type * from './contentScript'

export const [, injectCounter] = defineProxy(() => ({}) as ContentCounter, {
  namespace: '__boss-helper-content__',
})

export default class InjectAdapter implements Adapter {
  sendMessage: SendMessage = (message) => {
    window.postMessage(message, '*')
  }

  onMessage: OnMessage = (callback) => {
    const handler = (event: MessageEvent<Partial<Message<Record<string, any>>> | undefined>) =>
      callback(event.data)
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }
}

export const counter = injectCounter(new InjectAdapter())

export const ExtStorage: StorageLikeAsync = {
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
