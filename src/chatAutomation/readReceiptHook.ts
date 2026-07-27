import { isReadReceiptRequest, readReceiptBlockingSupported } from './readReceipt'

let enabled = false
let installed = false
let blockedCount = 0

export function setReadReceiptBlocking(value: boolean) {
  enabled = value && readReceiptBlockingSupported
}

export function getReadReceiptBlockCount() {
  return blockedCount
}

export function installReadReceiptHook() {
  if (installed || typeof window === 'undefined' || !readReceiptBlockingSupported) return
  installed = true
  const nativeFetch = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' || input instanceof URL ? input : input.url
    const body = init?.body
    if (enabled && isReadReceiptRequest({ url, body })) {
      blockedCount += 1
      return new Response('', { status: 204, statusText: 'No Content' })
    }
    return nativeFetch(input, init)
  }
}
