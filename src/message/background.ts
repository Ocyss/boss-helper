import type { Adapter, Message, OnMessage, SendMessage } from 'comctx'
import { defineProxy } from 'comctx'
import { openDB } from 'idb'

import type { Browser } from '#imports'
import { browser } from '#imports'
import type { ResponseType } from '@/utils/request'

export const userKey = 'local:conf-user'

const DB_NAME = 'ExtensionGlobalDB'
const STORE_NAME = 'images'
const CHAT_NOTIFICATION_ID_PREFIX = 'boss-helper-chat:'

type NotificationOptions = Browser.notifications.NotificationCreateOptions & {
  clickUrl?: string
}

function parseBossChatUrl(value: string) {
  try {
    const url = new URL(value)
    if (
      url.protocol !== 'https:' ||
      (url.hostname !== 'zhipin.com' && !url.hostname.endsWith('.zhipin.com'))
    ) {
      return null
    }
    return url.toString()
  } catch {
    return null
  }
}

function chatUrlFromNotificationId(id: string) {
  if (!id.startsWith(CHAT_NOTIFICATION_ID_PREFIX)) return null
  try {
    return parseBossChatUrl(decodeURIComponent(id.slice(CHAT_NOTIFICATION_ID_PREFIX.length)))
  } catch {
    return null
  }
}

async function focusChat(url: string) {
  const tabs = await browser.tabs.query({ url: ['*://zhipin.com/*', '*://*.zhipin.com/*'] })
  const tab = tabs[0]
  if (tab?.id != null) {
    try {
      await browser.tabs.update(tab.id, { active: true, url })
      if (tab.windowId != null) await browser.windows.update(tab.windowId, { focused: true })
      return
    } catch {
      // A stale tab must not turn a notification click into a no-op.
    }
  }
  await browser.tabs.create({ url })
}

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
  constructor() {
    browser.notifications.onClicked.addListener((id) => {
      const url = chatUrlFromNotificationId(id)
      if (!url) return
      void focusChat(url).catch(() => browser.tabs.create({ url }))
    })
  }

  async request(args: {
    url: string
    data: RequestInit
    timeout: number
    responseType: ResponseType
  }) {
    const signal = AbortSignal.timeout(args.timeout * 1000)

    const res = await fetch(args.url, {
      ...args.data,
      signal,
      mode: 'cors',
      credentials: 'include',
    }).then(async (res) => {
      if (!res.ok || res.status >= 400) {
        const errorText = await res.text()
        throw new Error(`状态码: ${res.status}: ${errorText}`)
      }

      const result = args.responseType === 'json' ? await res.json() : await res.text()

      return result
    })
    return res
  }

  async notify(args: NotificationOptions) {
    const clickUrl = args.clickUrl ? parseBossChatUrl(args.clickUrl) : null
    const options: Browser.notifications.NotificationCreateOptions = {
      type: args.type,
      iconUrl: args.iconUrl,
      title: args.title,
      message: args.message,
    }
    if (clickUrl) {
      return browser.notifications.create(
        `${CHAT_NOTIFICATION_ID_PREFIX}${encodeURIComponent(clickUrl)}`,
        options,
      )
    }
    return browser.notifications.create(options)
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
}

export class ProvideBackgroundAdapter implements Adapter<MessageMeta> {
  sendMessage: SendMessage<MessageMeta> = async (message) => {
    const tabs = await browser.tabs.query({ url: message.meta.url })
    tabs.map((tab) => void browser.tabs.sendMessage(tab.id!, message))
  }

  onMessage: OnMessage<MessageMeta> = (callback) => {
    const handler = (message?: Partial<Message<MessageMeta>>) => {
      callback(message)
    }
    browser.runtime.onMessage.addListener(handler)
    return () => browser.runtime.onMessage.removeListener(handler)
  }
}

export const [provideBackgroundCounter] = defineProxy(() => new BackgroundCounter(), {
  namespace: '__boss-helper-background__',
})
