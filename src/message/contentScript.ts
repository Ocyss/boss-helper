import type { StorageItemKey } from '#imports'
import type { Adapter, Message, OnMessage, SendMessage } from 'comctx'
import type { BackgroundCounter } from './background'
import { browser, storage } from '#imports'
import { defineProxy } from 'comctx'

export const [, injectBackgroundCounter] = defineProxy(() => ({}) as BackgroundCounter, {
  namespace: '__boss-helper-background__',
})

function genKey(key: string): StorageItemKey {
  const prefixes = ['local:', 'session:', 'sync:', 'managed:'] as const
  return prefixes.some(prefix => key.startsWith(prefix)) ? key as StorageItemKey : `sync:${key}`
}

export class ContentCounter implements BackgroundCounter {
  public background: BackgroundCounter
  constructor(background: BackgroundCounter) {
    this.background = background
  }

  async cookieInfo(...args: Parameters<BackgroundCounter['cookieInfo']>) {
    return this.background.cookieInfo(...args)
  }

  async cookieSwitch(...args: Parameters<BackgroundCounter['cookieSwitch']>) {
    return this.background.cookieSwitch(...args)
  }

  async cookieSave(...args: Parameters<BackgroundCounter['cookieSave']>) {
    return this.background.cookieSave(...args)
  }

  async cookieDelete(...args: Parameters<BackgroundCounter['cookieDelete']>) {
    return this.background.cookieDelete(...args)
  }

  async cookieClear(...args: Parameters<BackgroundCounter['cookieClear']>) {
    return this.background.cookieClear(...args)
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
    return browser.runtime.sendMessage(browser.runtime.id, { ...message, meta: { url: document.location.href } })
  }

  onMessage: OnMessage<MessageMeta> = (callback) => {
    const handler = (message?: Partial<Message<MessageMeta>>) => {
      callback(message)
    }
    browser.runtime.onMessage.addListener(handler)
    return () => browser.runtime.onMessage.removeListener(handler)
  }
}

export const [provideContentCounter] = defineProxy(() => new ContentCounter(injectBackgroundCounter(new InjectBackgroundAdapter())), {
  namespace: '__boss-helper-content__',
})

export class ProvideContentAdapter implements Adapter {
  sendMessage: SendMessage = (message) => {
    window.parent.postMessage(message, '*')
  }

  onMessage: OnMessage = (callback) => {
    const handler = (event: MessageEvent<Partial<Message<Record<string, any>>> | undefined>) => callback(event.data)
    window.parent.addEventListener('message', handler)
    return () => window.parent.removeEventListener('message', handler)
  }
}
