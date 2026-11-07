import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test'

mock.module('#imports', () => ({ browser: {}, storage: {} }))
mock.module('idb', () => ({ openDB: mock() }))
const { BackgroundCounter } = await import('../src/message/background')
const background = new BackgroundCounter()

const fetchStream = mock((args: Parameters<typeof background.fetchStream>[0]) =>
  background.fetchStream(args),
)
mock.module('@/message', () => ({
  counter: { fetchStream, fetchStreamAbort: mock(async () => true) },
}))
const { backgroundFetch } = await import('../src/utils/backgroundFetch')
const { createAdvancedFetch } = await import('../src/utils/modelRequest')

const payload = JSON.stringify({ choices: [{ message: { content: 'ok' } }] })
const networkFetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) =>
  init?.mode === 'no-cors'
    ? Response.error()
    : new Response(payload, { headers: { 'content-type': 'application/json' } }),
)

beforeEach(() => {
  fetchStream.mockClear()
  networkFetch.mockClear()
  spyOn(globalThis, 'fetch').mockImplementation(networkFetch)
})

afterEach(() => mock.restore())

test('reports an unreadable background response without constructing an invalid Response', async () => {
  networkFetch.mockResolvedValueOnce(Response.error())
  await expect(backgroundFetch('https://gateway.example/v1/chat/completions')).rejects.toThrow(
    '无法读取响应（status: 0）',
  )
})

test('uses readable responses even when the caller explicitly requests no-cors', async () => {
  const response = await backgroundFetch('https://gateway.example/v1/chat/completions', {
    mode: 'no-cors',
  })
  expect(await response.json()).toEqual(JSON.parse(payload))
  expect(fetchStream.mock.calls[0]![0].init.mode).toBe('cors')
})

test('overrides no-cors passed directly to the background by an older content script', async () => {
  const response = await background.fetchStream({
    requestId: 'older-content-script',
    url: 'https://gateway.example/v1/chat/completions',
    init: { mode: 'no-cors' },
  })
  expect(response.status).toBe(200)
  expect(new TextDecoder().decode(new Uint8Array(response.body))).toBe(payload)
})

test('overrides no-cors inherited from a Request object', async () => {
  const response = await backgroundFetch(
    new Request('https://gateway.example/v1/chat/completions', { mode: 'no-cors' }),
  )
  expect(await response.text()).toBe(payload)
})

test('preserves provider authentication and advanced overrides through the background', async () => {
  const request = createAdvancedFetch({
    headers: { 'x-gateway': 'test-gateway' },
    body: { temperature: 0.2 },
  })
  const response = await request('https://gateway.example/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: 'Bearer test-key', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'test-model', stream: true }),
  })
  expect(await response.text()).toBe(payload)
  const init = networkFetch.mock.calls[0]![1]!
  expect(init.mode).toBe('cors')
  expect(init.credentials).toBe('omit')
  expect(new Headers(init.headers).get('authorization')).toBe('Bearer test-key')
  expect(new Headers(init.headers).get('x-gateway')).toBe('test-gateway')
  expect(init.body).toBe(JSON.stringify({ model: 'test-model', stream: true, temperature: 0.2 }))
})

test.each([401, 429, 500])(
  'preserves HTTP %i and its error body for the provider',
  async (status) => {
    networkFetch.mockResolvedValueOnce(new Response('{"error":"provider error"}', { status }))
    const response = await backgroundFetch('https://gateway.example/v1/chat/completions')
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ error: 'provider error' })
  },
)

test('propagates fetch failures without turning them into Response constructor errors', async () => {
  const error = new TypeError('Failed to fetch')
  networkFetch.mockRejectedValueOnce(error)
  await expect(backgroundFetch('https://gateway.example/v1/chat/completions')).rejects.toBe(error)
})
