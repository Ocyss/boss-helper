import { AlertProps } from '@nuxt/ui'
import { Toast } from '@nuxt/ui/runtime/composables/useToast.js'

import { counter } from '@/message'

export interface NetConf {
  version: string
  version_description?: string
  notification: (NotificationAlert | NotificationNotification)[]
  store?: Record<string, [string, string, string]>
  price_info?: {
    signedKey: number
    account: number
    update_time: string
  }
  feedback: string
}

export interface NotificationAlert {
  key: string
  type: 'alert'
  data: AlertProps
}

export interface NotificationNotification {
  key: string
  type: 'notification'
  data: Partial<Toast> & {
    url?: string
    duration?: number
  }
}
const netNotificationMap = new Map<string, boolean>()

async function netNotification(
  item: NotificationAlert | NotificationNotification,
  now: number = 0,
) {
  if (now !== 0 && now < (await counter.storageGet(`local:netConf-${item.key}`, 0))) {
    return
  }
  const toast = useToast()
  if (netNotificationMap.has(item.key)) {
    return
  }
  netNotificationMap.set(item.key, true)
  if (item.type === 'notification') {
    void toast.add({
      ...item.data,
      duration: 0,
      'onUpdate:open': () => {
        void counter.storageSet(
          `local:netConf-${item.key}`,
          now + (item.data.duration ?? 86400) * 1000,
        )
      },
      onClick() {
        item.data.url ?? window.open(item.data.url)
      },
    })
  }
}

export async function initNetConf() {
  const response = await fetch('https://testingcf.jsdelivr.net/gh/Ocyss/boss-helper/net-conf.json')
  const data: NetConf = await response.json()
  const now = Date.now()
  for (const item of data.notification) {
    void netNotification(item, now)
  }
  return data
}
