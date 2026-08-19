import type { Adapter, Message, OnMessage, SendMessage } from 'comctx'
import { openDB } from 'idb'

import type { Browser } from '#imports'
import { browser } from '#imports'
import type { ResponseType } from '@/utils/request'

import type { LlmFetchRequest, LlmFetchResponse } from './llmFetch'

export const userKey = 'local:conf-user'

const DB_NAME = 'ExtensionGlobalDB'
const STORE_NAME = 'images'

async function initDB() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    },
  })
}

export class BackgroundCounter {
  async request(args: {
    url: string
    data: RequestInit
    timeout: number
    responseType: ResponseType
  }) {
    console.log('request', args)
    const signal = AbortSignal.timeout(args.timeout * 1000)

    const res = await fetch(args.url, {
      ...args.data,
      signal,
      mode: 'cors',
      credentials: 'include',
    }).then(async (res) => {
      console.log('request res', res)

      if (!res.ok || res.status >= 400) {
        const errorText = await res.text()
        throw new Error(`状态码: ${res.status}: ${errorText}`)
      }

      const result = args.responseType === 'json' ? await res.json() : await res.text()

      return result
    })
    return res
  }

  async notify(args: Browser.notifications.NotificationCreateOptions) {
    await browser.notifications.create({
      type: args.type,
      iconUrl: args.iconUrl,
      title: args.title,
      message: args.message,
    })
    return true
  }

  async backgroundTest(type: 'success' | 'error') {
    if (type === 'error') {
      throw new Error(`background test error date: ${Date.now()}`)
    }
    return Date.now()
  }

  async fetch(...args: Parameters<typeof fetch>) {
    return await fetch(...args)
  }

  async llmFetch(args: LlmFetchRequest): Promise<LlmFetchResponse> {
    const signal = AbortSignal.timeout(args.timeoutMs ?? 600_000)
    const response = await fetch(args.url, {
      method: args.method,
      headers: args.headers,
      body: args.body,
      signal,
    })
    const headers: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      headers[key] = value
    })
    return {
      status: response.status,
      statusText: response.statusText,
      headers,
      body: await response.text(),
    }
  }
  async getImage(key: string): Promise<
    | { success: false }
    | {
        success: true
        name: string
        type: string
        buffer: number[]
      }
  > {
    const db = await initDB()
    const file: File | undefined = await db.get(STORE_NAME, key)
    if (!file) {
      return { success: false }
    }
    const arrayBuffer = await file.arrayBuffer()
    return {
      success: true,
      name: file.name,
      type: file.type,
      buffer: Array.from(new Uint8Array(arrayBuffer)),
    }
  }
  async setImage(opt: {
    name: string
    type: string
    buffer: number[]
  }): Promise<{ success: boolean; key: string }> {
    const db = await initDB()
    const file = new File([new Uint8Array(opt.buffer).buffer], opt.name, { type: opt.type })
    const key = `img-${await calculateFileMD5(file)}`
    await db.put(STORE_NAME, file, key)
    return { success: true, key }
  }
}

interface MessageMeta {
  url: string
  injector: 'content' | 'popup'
}

export class ProvideBackgroundAdapter implements Adapter<MessageMeta> {
  sendMessage: SendMessage<MessageMeta> = async (message) => {
    switch (message.meta.injector) {
      case 'content': {
        const tabs = await browser.tabs.query({ url: message.meta.url })
        void tabs.map((tab) => browser.tabs.sendMessage(tab.id!, message))
        break
      }
      case 'popup': {
        await browser.runtime.sendMessage(message).catch((error) => {
          if (error.message.includes('Receiving end does not exist')) {
            return
          }
          throw error
        })
        break
      }
    }
  }
  onMessage: OnMessage<MessageMeta> = (callback) => {
    const handler = (message?: Partial<Message<MessageMeta>>) => {
      if (!message?.meta) {
        return callback(message)
      }
      callback({
        ...message,
        meta: {
          ...message.meta,
          injector: message?.sender?.name as MessageMeta['injector'],
        },
      })
    }
    browser.runtime.onMessage.addListener(handler)
    return () => browser.runtime.onMessage.removeListener(handler)
  }
}

export class InjectBackgroundAdapter implements Adapter<MessageMeta> {
  constructor(public name: MessageMeta['injector'] = 'content') {}
  sendMessage: SendMessage<MessageMeta> = (message) => {
    void browser.runtime.sendMessage(browser.runtime.id, {
      ...message,
      meta: { url: document.location.href, injector: this.name },
    } satisfies Message<MessageMeta>)
  }
  onMessage: OnMessage<MessageMeta> = (callback) => {
    const handler = (message?: Partial<Message<MessageMeta>>) => {
      callback(message)
    }
    browser.runtime.onMessage.addListener(handler)
    return () => browser.runtime.onMessage.removeListener(handler)
  }
}
