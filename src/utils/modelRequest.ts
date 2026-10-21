import type { ModelAdvanced } from '@/composables/useModel/type'

import { backgroundFetch } from './backgroundFetch'
import deepmerge, { isPlainObject } from './deepmerge'

/** Apply overrides after the provider has serialized its protocol-specific request. */
export function createAdvancedFetch(
  advanced: ModelAdvanced = {},
  transport: typeof fetch = backgroundFetch,
): typeof fetch {
  return async (input, init) => {
    const headers = new Headers(input instanceof Request ? input.headers : undefined)
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value))
    if (isPlainObject(advanced.headers)) {
      new Headers(advanced.headers).forEach((value, key) => headers.set(key, value))
    }
    let body = init?.body
    if (isPlainObject(advanced.body)) {
      const serialized = body ?? (input instanceof Request ? await input.clone().text() : undefined)
      const original: unknown =
        typeof serialized === 'string' && serialized ? JSON.parse(serialized) : {}
      if (!isPlainObject(original)) throw new Error('模型请求体必须是 JSON 对象')
      body = JSON.stringify(deepmerge(original, advanced.body))
    }
    return transport(input, {
      ...init,
      headers,
      ...(body === undefined ? {} : { body }),
    })
  }
}
