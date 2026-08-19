export type TokenUsageKind = 'aiFiltering' | 'aiGreeting'

export type TokenUsageWindow = 1 | 3 | 7

export interface TokenUsageRecord {
  id: string
  time: number
  kind: TokenUsageKind
  model: string
  modelName?: string
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  durationMs?: number
  jobTitle?: string
  jobKey?: string
}

export interface TokenUsageKindSummary {
  calls: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  avgDurationMs: number | null
}

export interface TokenUsageModelSummary extends TokenUsageKindSummary {
  model: string
  modelName: string
}

export interface TokenUsageSummary extends TokenUsageKindSummary {
  byKind: Record<TokenUsageKind, TokenUsageKindSummary>
  byModel: TokenUsageModelSummary[]
}

export interface TokenUsageExportPayload {
  exportedAt: string
  windowDays: TokenUsageWindow
  windowLabel: string
  windowStart: number
  windowEnd: number
  summary: TokenUsageSummary
  records: TokenUsageRecord[]
}
