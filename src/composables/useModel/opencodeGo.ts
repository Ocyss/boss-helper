export const OPENCODE_GO_BASE_URL = 'https://opencode.ai/zen/go/v1'

export type OpenCodeGoApi = 'responses' | 'chat' | 'messages'

/** 官方文档当前列出的 Go 模型，按日常用量优先排序。 */
export const OPENCODE_GO_MODEL_IDS = [
  'deepseek-v4-flash',
  'deepseek-v4-pro',
  'kimi-k2.7-code',
  'kimi-k2.6',
  'kimi-k3',
  'glm-5.3',
  'glm-5.2',
  'glm-5.1',
  'mimo-v2.5',
  'mimo-v2.5-pro',
  'hy3',
  'minimax-m3',
  'minimax-m2.7',
  'minimax-m2.5',
  'qwen3.8-max',
  'qwen3.7-max',
  'qwen3.7-plus',
  'qwen3.6-plus',
  'grok-4.5',
  'gpt-5.6-luna',
] as const

const OPENCODE_GO_RESPONSES_MODELS = new Set(['grok-4.5', 'gpt-5.6-luna'])

const OPENCODE_GO_MESSAGES_MODELS = new Set([
  'minimax-m3',
  'minimax-m2.7',
  'minimax-m2.5',
  'qwen3.8-max',
  'qwen3.7-max',
  'qwen3.7-plus',
  'qwen3.6-plus',
  'qwen3.5-plus',
])

export function isOpenCodeGoBaseUrl(value: string): boolean {
  try {
    const url = new URL(value.trim().replace(/\/+$/u, ''))
    return url.hostname === 'opencode.ai' && url.pathname === '/zen/go/v1'
  } catch {
    return false
  }
}

export function getOpenCodeGoApi(modelId: string): OpenCodeGoApi {
  const id = modelId.trim().toLowerCase()
  if (OPENCODE_GO_RESPONSES_MODELS.has(id) || id.startsWith('grok-') || id.startsWith('gpt-')) {
    return 'responses'
  }
  if (OPENCODE_GO_MESSAGES_MODELS.has(id) || id.startsWith('minimax-') || id.startsWith('qwen')) {
    return 'messages'
  }
  return 'chat'
}
