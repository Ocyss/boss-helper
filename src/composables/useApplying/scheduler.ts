import { delay } from '@/utils'

const CARD_CLICK_MIN_INTERVAL_MS = 2000
export const PREPARE_QUEUE_LIMIT = 12
export const AI_CONCURRENCY = 3
const RATE_LIMIT_BACKOFF_SECONDS = [30, 60, 120]

export function createSemaphore(max: number) {
  let active = 0
  const waiting: Array<() => void> = []

  return {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      if (active >= max) {
        await new Promise<void>((resolve) => waiting.push(resolve))
      }
      active++
      try {
        return await fn()
      } finally {
        active--
        waiting.shift()?.()
      }
    },
  }
}

export function createBoundedQueue<T>(max: number) {
  const items: T[] = []
  const waitTake: Array<(value: T | null) => void> = []
  const waitPush: Array<() => void> = []
  let closed = false

  return {
    get size() {
      return items.length
    },
    async push(item: T) {
      while (items.length >= max && !closed) {
        await new Promise<void>((resolve) => waitPush.push(resolve))
      }
      if (closed) return
      const taker = waitTake.shift()
      if (taker) {
        taker(item)
        return
      }
      items.push(item)
    },
    async take(): Promise<T | null> {
      if (items.length > 0) {
        const value = items.shift()!
        waitPush.shift()?.()
        return value
      }
      if (closed) return null
      return new Promise((resolve) => waitTake.push(resolve))
    },
    close() {
      closed = true
      while (waitTake.length) waitTake.shift()?.(null)
      while (waitPush.length) waitPush.shift()?.()
    },
  }
}

export function createCardClickGate(minIntervalMs = CARD_CLICK_MIN_INTERVAL_MS) {
  let lastClickAt = 0
  return async (isStop: () => boolean) => {
    if (lastClickAt > 0) {
      const waitMs = minIntervalMs - (Date.now() - lastClickAt)
      if (waitMs > 0) {
        await delay(waitMs / 1000, isStop)
      }
    }
    lastClickAt = Date.now()
  }
}

export function nextRateLimitBackoff(attempt: number): number {
  return RATE_LIMIT_BACKOFF_SECONDS[Math.min(attempt, RATE_LIMIT_BACKOFF_SECONDS.length - 1)]!
}

let processDeliveryLock = false

export async function withDeliveryLock(
  uid: string,
  run: () => Promise<void>,
  onBusy: () => void,
): Promise<void> {
  const name = `boss-helper:delivery:${uid || 'anon'}`
  const locks = globalThis.navigator?.locks
  if (locks?.request) {
    let acquired = false
    await locks.request(name, { ifAvailable: true }, async (lock) => {
      if (!lock) return
      acquired = true
      await run()
    })
    if (!acquired) onBusy()
    return
  }

  if (processDeliveryLock) {
    onBusy()
    return
  }
  processDeliveryLock = true
  try {
    await run()
  } finally {
    processDeliveryLock = false
  }
}
