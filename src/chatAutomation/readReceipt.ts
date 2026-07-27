import type { ReadReceiptRequest } from './types'

export const readReceiptBlockingSupported = false

// No production read-receipt request has been verified for this extension yet.
// Keep this classifier intentionally closed so unrelated traffic is never blocked.
export function isReadReceiptRequest(request: ReadReceiptRequest): boolean {
  void request
  return false
}
