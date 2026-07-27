import type { Adapter, Message, OnMessage, SendMessage } from 'comctx'
import { defineProxy } from 'comctx'

import type { StorageItemKey } from '#imports'
import { browser, storage } from '#imports'

import type { BackgroundCounter } from './background'
export { ProvideContentAdapter } from './contentScriptShare'

export const [, injectBackgroundCounter] = defineProxy(() => ({}) as BackgroundCounter, {
  namespace: '__boss-helper-background__',
})

function genKey(key: string): StorageItemKey {
  const prefixes = ['local:', 'session:', 'sync:', 'managed:'] as const
  return prefixes.some((prefix) => key.startsWith(prefix)) ? (key as StorageItemKey) : `sync:${key}`
}

export class ContentCounter implements BackgroundCounter {
  public background: BackgroundCounter
  public routerHooks: Array<(path: string) => void> = []

  constructor(background: BackgroundCounter) {
    this.background = background
  }

  _addRouterHook(hook: (path: string) => void) {
    this.routerHooks.push(hook)
  }

  async callRouterHooks(path: string) {
    for (const hook of this.routerHooks) {
      try {
        hook(path)
      } catch (e) {
        console.error('调用路由hook失败', e)
      }
    }
  }

  async request(...args: Parameters<BackgroundCounter['request']>) {
    return this.background.request(...args)
  }

  async notify(...args: Parameters<BackgroundCounter['notify']>) {
    return this.background.notify(...args)
  }

  async backgroundTest(...args: Parameters<BackgroundCounter['backgroundTest']>) {
    return this.background.backgroundTest(...args)
  }

  async fetch(...args: Parameters<typeof fetch>) {
    return this.background.fetch(...args)
  }

  async getImage(...args: Parameters<BackgroundCounter['getImage']>) {
    return this.background.getImage(...args)
  }
  async setImage(...args: Parameters<BackgroundCounter['setImage']>) {
    return this.background.setImage(...args)
  }

  async storageGet<T>(key: string, defaultValue: T): Promise<T>
  async storageGet<T>(key: string): Promise<T | null>
  async storageGet<T>(key: string, defaultValue?: T): Promise<T | null> {
    return storage.getItem<T>(genKey(key), { fallback: defaultValue })
  }

  async storageSet<T>(key: string, value: T) {
    await storage.setItem(genKey(key), value)
    return true
  }

  async storageRm(key: string) {
    await storage.removeItem(genKey(key))
    return true
  }

  async contentScriptTest(type: 'success' | 'error') {
    if (type === 'error') {
      throw new Error(`test error date: ${Date.now()}`)
    }
    return Date.now()
  }
}

interface MessageMeta {
  url: string
}

export class InjectBackgroundAdapter implements Adapter<MessageMeta> {
  sendMessage: SendMessage<MessageMeta> = async (message) => {
    return browser.runtime.sendMessage(browser.runtime.id, {
      ...message,
      meta: { url: document.location.href },
    })
  }

  onMessage: OnMessage<MessageMeta> = (callback) => {
    const handler = (message?: Partial<Message<MessageMeta>>) => {
      callback(message)
    }
    browser.runtime.onMessage.addListener(handler)
    return () => browser.runtime.onMessage.removeListener(handler)
  }
}

export const [provideContentCounter] = defineProxy(
  () => new ContentCounter(injectBackgroundCounter(new InjectBackgroundAdapter())),
  {
    namespace: '__boss-helper-content__',
  },
)
