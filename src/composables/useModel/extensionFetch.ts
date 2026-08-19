import { counter } from '@/message'

const DEFAULT_TIMEOUT_MS = 600_000

function isExtensionContextInvalidated(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('Extension context invalidated')
}

export const extensionFetch: typeof fetch = async (input, init) => {
  const request = input instanceof Request ? input.clone() : new Request(input, init)
  if (init?.signal?.aborted) {
    throw init.signal.reason ?? new DOMException('The operation was aborted.', 'AbortError')
  }

  const headers: Record<string, string> = {}
  request.headers.forEach((value, key) => {
    headers[key] = value
  })

  const body =
    request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text()

  let result
  try {
    result = await counter.llmFetch({
      url: request.url,
      method: request.method,
      headers,
      body,
      timeoutMs: DEFAULT_TIMEOUT_MS,
    })
  } catch (error) {
    if (isExtensionContextInvalidated(error)) {
      throw new Error('扩展已热重载，请刷新 BOSS 页面后重试')
    }
    throw error
  }

  if (init?.signal?.aborted) {
    throw init.signal.reason ?? new DOMException('The operation was aborted.', 'AbortError')
  }

  return new Response(result.body, {
    status: result.status,
    statusText: result.statusText,
    headers: result.headers,
  })
}
