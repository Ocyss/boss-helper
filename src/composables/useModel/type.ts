export type ModelProtocol = 'openai-compatible' | 'openai-responses' | 'anthropic-messages'

export interface ModelAdvanced {
  headers?: Record<string, string>
  body?: Record<string, unknown>
}

export interface ModelConfData {
  base_url: string
  api_key: string
  model: string
  protocol: ModelProtocol
  advanced: ModelAdvanced
  other?: {
    timeout?: number
  }
}

export interface ModelConf {
  key: string
  name: string
  color?: string
  data?: ModelConfData
}
