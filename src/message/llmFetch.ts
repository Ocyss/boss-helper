export interface LlmFetchRequest {
  url: string
  method: string
  headers?: Record<string, string>
  body?: string
  timeoutMs?: number
}

export interface LlmFetchResponse {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
}
