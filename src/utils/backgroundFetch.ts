import { counter } from '@/message'

let seq = 0

function headersToObject(headers?: HeadersInit): Record<string, string> | undefined {
  if (!headers) return undefined
  if (headers instanceof Headers) return Object.fromEntries(headers.entries())
  if (Array.isArray(headers)) return Object.fromEntries(headers)
  return { ...headers }
}

/**
 * A fetch-compatible API executed in the background script.
 * Response bodies are returned as serializable bytes across extension message
 * boundaries, then exposed to providers as a normal Response stream.
 */
export function backgroundFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const requestId = `bgfetch-${Date.now()}-${seq++}`

  let url: string
  let mergedInit: RequestInit | undefined = init
  if (input instanceof Request) {
    url = input.url
    mergedInit = {
      method: input.method,
      headers: input.headers,
      credentials: input.credentials,
      mode: input.mode,
      ...init,
    }
  } else {
    url = input instanceof URL ? input.href : input
  }

  const signal = mergedInit?.signal
  if (signal?.aborted) {
    return Promise.reject(new DOMException('This operation was aborted', 'AbortError'))
  }

  const onAbort = () => {
    void counter.fetchStreamAbort(requestId).catch(() => {})
  }
  signal?.addEventListener('abort', onAbort)

  return counter
    .fetchStream({
      requestId,
      url,
      init: {
        method: mergedInit?.method,
        headers: headersToObject(mergedInit?.headers),
        body: typeof mergedInit?.body === 'string' ? mergedInit.body : undefined,
        credentials: mergedInit?.credentials ?? 'omit',
        // 后台通过扩展主机权限跨域，保留鉴权头并允许读取响应。
        mode: mergedInit?.mode ?? 'cors',
      },
    })
    .then((response) => {
      return new Response(new Uint8Array(response.body), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      })
    })
    .finally(() => {
      signal?.removeEventListener('abort', onAbort)
    })
}
